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
  };
}

/** Bandejas virtuales (tareas sin repo asociado). */
export const INBOX_IDS = ["inbox", "jira-inbox", "planner-inbox"] as const;

export class TaskStore {
  constructor(private db: DB) {}

  list(projectId: string): TaskItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks WHERE project_id = ? AND status != 'dismissed'
         ORDER BY CASE status WHEN 'suggested' THEN 0 WHEN 'doing' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
                  updated_at DESC`,
      )
      .all(projectId) as TaskRow[];
    return rows.map(toTask);
  }

  create(projectId: string, title: string, notes: string | null, source: TaskItem["source"] = "manual", sourceRef: string | null = null, status: TaskStatus = "todo"): TaskItem {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, notes, status, source, source_ref, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, title, notes, status, source, sourceRef, now, now);
    return toTask(this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow);
  }

  update(
    id: string,
    patch: Partial<Pick<TaskItem, "title" | "notes" | "status" | "projectId">>,
  ): TaskItem | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
    if (!row) return null;
    const next = {
      title: patch.title ?? row.title,
      notes: patch.notes !== undefined ? patch.notes : row.notes,
      status: patch.status ?? row.status,
      projectId: patch.projectId ?? row.project_id,
    };
    this.db
      .prepare(`UPDATE tasks SET title = ?, notes = ?, status = ?, project_id = ?, updated_at = ? WHERE id = ?`)
      .run(next.title, next.notes, next.status, next.projectId, new Date().toISOString(), id);
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
    const notIn = excludeInbox ? `AND project_id NOT IN ('inbox','jira-inbox','planner-inbox')` : "";
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE status = ? ${notIn} ORDER BY updated_at DESC LIMIT ?`)
      .all(status, limit) as TaskRow[];
    return rows.map(toTask);
  }

  /** Tareas pendientes de todas las bandejas virtuales. */
  inboxAll(): TaskItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks WHERE project_id IN ('inbox','jira-inbox','planner-inbox')
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
    const exists = this.db.prepare(`SELECT 1 FROM tasks WHERE source_ref = ? LIMIT 1`);
    for (const s of sessions) {
      // umbral: la sesión hizo algo (herramientas o conversación sustancial)
      if (s.toolUseCount < 3 && s.messageCount < 6) continue;
      const title = s.title ?? s.firstPrompt;
      if (!title) continue;
      if (exists.get(s.id)) continue;
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
