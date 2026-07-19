import crypto from "node:crypto";
import type { AgentSession, TaskItem, TaskStatus } from "@nebula/shared";
import type { DB } from "../db/index.js";

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  notes: string | null;
  status: string;
  source: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  external_meta: string | null;
  due_date: string | null;
  priority: number;
}

function toTask(r: TaskRow): TaskItem {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    notes: r.notes,
    status: r.status as TaskItem["status"],
    source: r.source as TaskItem["source"],
    sourceRef: r.source_ref,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    externalMeta: r.external_meta ? JSON.parse(r.external_meta) : null,
    dueDate: r.due_date,
    priority: (r.priority ?? 0) as TaskItem["priority"],
  };
}

/** Orden útil: prioridad alta primero, luego lo que antes vence, luego lo reciente. */
const USEFUL_ORDER = `priority DESC, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, updated_at DESC`;

/** Bandejas virtuales (tareas sin repo asociado). */
export const INBOX_IDS = ["inbox", "jira-inbox", "planner-inbox", "github-inbox"] as const;
/** Los mismos ids, listos para interpolar en un `IN (...)` de SQL. */
const INBOX_SQL = INBOX_IDS.map((id) => `'${id}'`).join(",");

export class TaskStore {
  constructor(private db: DB) {}

  list(projectId: string): TaskItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks WHERE project_id = ? AND status != 'dismissed'
         ORDER BY CASE status WHEN 'suggested' THEN 0 WHEN 'doing' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
                  ${USEFUL_ORDER}`,
      )
      .all(projectId) as TaskRow[];
    return rows.map(toTask);
  }

  /**
   * Listado transversal con filtros, para la vista «Todas las tareas».
   * Es lo que faltaba: hasta ahora solo existían los subconjuntos recortados
   * de Hoy y una búsqueda limitada a 15 resultados.
   */
  query(opts: {
    status?: TaskStatus[];
    projectId?: string;
    source?: string;
    priority?: number;
    /** "overdue" | "today" | "week" | "none" */
    due?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): { items: TaskItem[]; total: number } {
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.status?.length) {
      where.push(`status IN (${opts.status.map((_, i) => `@st${i}`).join(",")})`);
      opts.status.forEach((s, i) => (params[`st${i}`] = s));
    } else {
      where.push(`status != 'dismissed'`);
    }
    if (opts.projectId) {
      where.push(`project_id = @projectId`);
      params.projectId = opts.projectId;
    }
    if (opts.source) {
      where.push(`source = @source`);
      params.source = opts.source;
    }
    if (opts.priority !== undefined) {
      where.push(`priority = @priority`);
      params.priority = opts.priority;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (opts.due === "overdue") {
      where.push(`due_date IS NOT NULL AND due_date < @today`);
      params.today = today;
    } else if (opts.due === "today") {
      where.push(`due_date = @today`);
      params.today = today;
    } else if (opts.due === "week") {
      const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      where.push(`due_date IS NOT NULL AND due_date <= @week`);
      params.week = week;
    } else if (opts.due === "none") {
      where.push(`due_date IS NULL`);
    }
    if (opts.q?.trim()) {
      where.push(`(title LIKE @q OR notes LIKE @q)`);
      params.q = `%${opts.q.trim()}%`;
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM tasks ${clause}`).get(params) as { n: number }
    ).n;
    const rows = this.db
      .prepare(`SELECT * FROM tasks ${clause} ORDER BY ${USEFUL_ORDER} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: opts.limit ?? 100, offset: opts.offset ?? 0 }) as TaskRow[];
    return { items: rows.map(toTask), total };
  }

  /** Búsqueda para la palette: título y notas, sin descartadas. */
  search(q: string, limit = 15): TaskItem[] {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks WHERE status != 'dismissed' AND (title LIKE ? OR notes LIKE ?)
         ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END,
                  ${USEFUL_ORDER} LIMIT ?`,
      )
      .all(like, like, limit) as TaskRow[];
    return rows.map(toTask);
  }

  /** Tareas abiertas que vencen hoy o antes (para la notificación diaria). */
  dueToday(): TaskItem[] {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE status IN ('todo','doing') AND due_date IS NOT NULL AND due_date <= ?`)
      .all(today) as TaskRow[];
    return rows.map(toTask);
  }

  create(
    projectId: string,
    title: string,
    notes: string | null,
    source: TaskItem["source"] = "manual",
    sourceRef: string | null = null,
    status: TaskStatus = "todo",
    extras: { dueDate?: string | null; priority?: TaskItem["priority"] } = {},
  ): TaskItem {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, notes, status, source, source_ref, due_date, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, title, notes, status, source, sourceRef, extras.dueDate ?? null, extras.priority ?? 0, now, now);
    return toTask(this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow);
  }

  update(
    id: string,
    patch: Partial<Pick<TaskItem, "title" | "notes" | "status" | "projectId" | "dueDate" | "priority">>,
  ): TaskItem | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
    if (!row) return null;
    const next = {
      title: patch.title ?? row.title,
      notes: patch.notes !== undefined ? patch.notes : row.notes,
      status: patch.status ?? row.status,
      projectId: patch.projectId ?? row.project_id,
      dueDate: patch.dueDate !== undefined ? patch.dueDate : row.due_date,
      priority: patch.priority !== undefined ? patch.priority : row.priority,
    };
    this.db
      .prepare(
        `UPDATE tasks SET title = ?, notes = ?, status = ?, project_id = ?, due_date = ?, priority = ?, updated_at = ? WHERE id = ?`,
      )
      .run(next.title, next.notes, next.status, next.projectId, next.dueDate, next.priority, new Date().toISOString(), id);
    return toTask(this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow);
  }

  get(id: string): TaskItem | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
    return row ? toTask(row) : null;
  }

  setExternalMeta(id: string, meta: TaskItem["externalMeta"]): void {
    this.db.prepare(`UPDATE tasks SET external_meta = ? WHERE id = ?`).run(meta ? JSON.stringify(meta) : null, id);
  }

  /** Tareas por estado en TODOS los proyectos (para la vista Hoy). */
  byStatus(status: TaskStatus, excludeInbox = true, limit = 30): TaskItem[] {
    const notIn = excludeInbox ? `AND project_id NOT IN (${INBOX_SQL})` : "";
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE status = ? ${notIn} ORDER BY ${USEFUL_ORDER} LIMIT ?`)
      .all(status, limit) as TaskRow[];
    return rows.map(toTask);
  }

  /** Tareas pendientes de todas las bandejas virtuales. */
  inboxAll(): TaskItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks WHERE project_id IN (${INBOX_SQL})
         AND status IN ('todo','doing','suggested') ORDER BY updated_at DESC LIMIT 50`,
      )
      .all() as TaskRow[];
    return rows.map(toTask);
  }

  remove(id: string): TaskItem | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
    if (!row) return null;
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    return toTask(row);
  }

  /**
   * Deriva tareas sugeridas de sesiones de agentes: una por sesión con
   * suficiente entidad, si no existe ya (aunque se haya descartado).
   * Devuelve los projectId con sugerencias nuevas.
   */
  suggestFromSessions(sessions: AgentSession[]): Set<string> {
    const touched = new Set<string>();
    const existsRef = this.db.prepare(`SELECT 1 FROM tasks WHERE source_ref = ? LIMIT 1`);
    // dedup por título: una sesión reanudada llega con otro sessionId pero mismo
    // trabajo; sin esto salían dos sugeridas idénticas
    const existsTitle = this.db.prepare(
      `SELECT 1 FROM tasks WHERE project_id = ? AND source = 'agent' AND lower(title) = ? LIMIT 1`,
    );
    for (const s of sessions) {
      // umbral: la sesión hizo algo (herramientas o conversación sustancial)
      if (s.toolUseCount < 3 && s.messageCount < 6) continue;
      const title = cleanSuggestionTitle(s.title ?? s.firstPrompt);
      if (!title) continue;
      if (existsRef.get(s.id)) continue;
      if (existsTitle.get(s.projectId, title.slice(0, 160).toLowerCase())) continue;
      const notes = [
        s.firstPrompt && s.firstPrompt !== title ? s.firstPrompt : null,
        s.filesTouched.length > 0 ? `Ficheros: ${s.filesTouched.slice(0, 8).join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
      this.create(s.projectId, title.slice(0, 160), notes || null, "agent", s.id, "suggested");
      touched.add(s.projectId);
    }
    return touched;
  }
}

/** Órdenes triviales que no describen un trabajo: no valen como título. */
const TRIVIAL_TITLES = new Set([
  "resume", "continue", "continúa", "continua", "sigue", "go", "ok", "vale",
  "next", "y", "yes", "no", "sí", "si", "dale", "adelante",
]);

/**
 * Limpia el título candidato de una sugerencia. Prefiere que no haya sugerencia
 * a que la haya con un título sin señal (p. ej. «resume» o un primer prompt de
 * una sola palabra), que era justo lo que ensuciaba la lista.
 */
function cleanSuggestionTitle(raw: string | null): string | null {
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length < 8) return null;
  if (TRIVIAL_TITLES.has(clean.toLowerCase())) return null;
  return clean;
}
