import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { JiraConfig, JiraStatus } from "@nebula/shared";
import type { DB } from "../db/index.js";
import type { ProjectStore } from "../projects/store.js";
import type { Notifier } from "../notify.js";

const run = promisify(execFile);
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]{1,9})-\d+\b/g;

interface JiraIssue {
  key: string;
  summary: string;
  statusCategory: "new" | "indeterminate" | "done";
  updated: string;
  dueDate: string | null;
}

function headers(cfg: JiraConfig): Record<string, string> {
  if (cfg.mode === "cloud") {
    const basic = Buffer.from(`${cfg.email ?? ""}:${cfg.token}`).toString("base64");
    return { Authorization: `Basic ${basic}`, Accept: "application/json" };
  }
  return { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" };
}

function base(cfg: JiraConfig): string {
  return cfg.baseUrl.replace(/\/+$/, "");
}

/** Comprueba credenciales: GET /myself. Devuelve displayName o lanza. */
export async function whoAmI(cfg: JiraConfig): Promise<string> {
  const api = cfg.mode === "cloud" ? "3" : "2";
  const res = await fetch(`${base(cfg)}/rest/api/${api}/myself`, {
    headers: headers(cfg),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const me = (await res.json()) as { displayName?: string; name?: string };
  return me.displayName ?? me.name ?? "conectado";
}

/** Issues abiertos asignados a mí. */
export async function fetchMyIssues(cfg: JiraConfig): Promise<JiraIssue[]> {
  const jql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
  const fields = "summary,status,updated,duedate";
  let url: string;
  if (cfg.mode === "cloud") {
    url = `${base(cfg)}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100`;
  } else {
    url = `${base(cfg)}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100`;
  }
  const res = await fetch(url, { headers: headers(cfg), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { issues?: any[] };
  return (data.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields?.summary ?? "(sin resumen)",
    statusCategory: (i.fields?.status?.statusCategory?.key ?? "new") as JiraIssue["statusCategory"],
    updated: i.fields?.updated ?? new Date().toISOString(),
    dueDate: i.fields?.duedate ?? null,
  }));
}

/**
 * Cierra un issue: busca entre sus transiciones disponibles la primera cuyo
 * destino es de categoría Done y la ejecuta.
 */
export async function transitionToDone(cfg: JiraConfig, issueKey: string): Promise<void> {
  const api = cfg.mode === "cloud" ? "3" : "2";
  const url = `${base(cfg)}/rest/api/${api}/issue/${encodeURIComponent(issueKey)}/transitions`;
  const res = await fetch(url, { headers: headers(cfg), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} al listar transiciones`);
  const data = (await res.json()) as { transitions?: Array<{ id: string; name: string; to?: { statusCategory?: { key?: string } } }> };
  const done = (data.transitions ?? []).find((t) => t.to?.statusCategory?.key === "done");
  if (!done) {
    throw new Error("el flujo de trabajo no permite cerrar el issue desde su estado actual");
  }
  const post = await fetch(url, {
    method: "POST",
    headers: { ...headers(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ transition: { id: done.id } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!post.ok) throw new Error(`HTTP ${post.status} al ejecutar la transición «${done.name}»`);
}

const STATUS_MAP: Record<JiraIssue["statusCategory"], "todo" | "doing" | "done"> = {
  new: "todo",
  indeterminate: "doing",
  done: "done",
};

export class JiraSync {
  status: JiraStatus = { configured: false, ok: false, user: null, error: null, lastSyncAt: null, issueCount: 0 };

  constructor(
    private db: DB,
    private store: ProjectStore,
    private getConfig: () => JiraConfig | undefined,
    private onTasksChanged: (projectId: string) => void,
    private notifier?: Notifier,
  ) {}

  async test(cfg: JiraConfig): Promise<JiraStatus> {
    try {
      const user = await whoAmI(cfg);
      return { ...this.status, configured: true, ok: true, user, error: null };
    } catch (err) {
      return { ...this.status, configured: true, ok: false, user: null, error: (err as Error).message };
    }
  }

  /** Sincroniza issues → tabla tasks (source jira). Silencioso si no hay config. */
  async sync(): Promise<void> {
    const cfg = this.getConfig();
    this.status.configured = Boolean(cfg?.baseUrl && cfg?.token);
    if (!cfg || !this.status.configured) return;

    let issues: JiraIssue[];
    try {
      if (!this.status.user) this.status.user = await whoAmI(cfg);
      issues = await fetchMyIssues(cfg);
      this.status.ok = true;
      this.status.error = null;
    } catch (err) {
      this.status.ok = false;
      this.status.error = (err as Error).message;
      return; // sin red o credenciales rotas: no tocar nada
    }

    const byJiraKey = this.store.byJiraKey();
    const globalInbox = "jira-inbox"; // proyecto virtual para issues sin repo asociado
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const touched = new Set<string>();

    const upsert = this.db.prepare(
      `INSERT INTO tasks (id, project_id, title, notes, status, source, source_ref, due_date, created_at, updated_at)
       VALUES (@id, @projectId, @title, @notes, @status, 'jira', @sourceRef, @dueDate, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, status = excluded.status, project_id = excluded.project_id,
         due_date = excluded.due_date, updated_at = excluded.updated_at`,
    );

    for (const issue of issues) {
      const projectKey = issue.key.split("-")[0].toUpperCase();
      const projectId = byJiraKey.get(projectKey) ?? globalInbox;
      seen.add(`jira:${issue.key}`);
      touched.add(projectId);
      upsert.run({
        id: `jira:${issue.key}`,
        projectId,
        title: `${issue.key} · ${issue.summary}`.slice(0, 200),
        notes: null,
        status: STATUS_MAP[issue.statusCategory],
        sourceRef: issue.key,
        dueDate: issue.dueDate,
        now,
      });
    }

    // issues que ya no están asignados/abiertos → done
    const stale = this.db
      .prepare(`SELECT id, project_id FROM tasks WHERE source = 'jira' AND status IN ('todo','doing')`)
      .all() as Array<{ id: string; project_id: string }>;
    for (const row of stale) {
      if (!seen.has(row.id)) {
        this.db.prepare(`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?`).run(now, row.id);
        touched.add(row.project_id);
      }
    }

    this.status.lastSyncAt = now;
    this.status.issueCount = issues.length;
    for (const id of touched) this.onTasksChanged(id);

    // notificar issues nuevos (el primer sync solo establece la línea base)
    if (this.notifier) {
      const ids = issues.map((i) => `seen:jira:${i.key}`);
      if (!this.notifier.hasBaseline("seen:jira:")) {
        this.notifier.baseline(ids);
      } else {
        for (const issue of issues) {
          this.notifier.send(`seen:jira:${issue.key}`, "◆ Nuevo issue de Jira", `${issue.key} · ${issue.summary}`);
        }
      }
    }
  }
}

/**
 * Heurística de clave Jira por repo: claves tipo ABC-123 en nombres de rama
 * y en los últimos 50 commits; la más frecuente se propone como sugerencia.
 */
export async function suggestJiraKey(repoPath: string): Promise<string | null> {
  const counts = new Map<string, number>();
  const feed = (text: string): void => {
    for (const m of text.matchAll(ISSUE_KEY_RE)) {
      const key = m[1].toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  };
  try {
    const { stdout: branches } = await run("git", ["-C", repoPath, "for-each-ref", "--format=%(refname:short)"], {
      windowsHide: true,
    });
    feed(branches);
  } catch {
    /* sin refs */
  }
  try {
    const { stdout: log } = await run("git", ["-C", repoPath, "log", "--format=%s", "-50"], { windowsHide: true });
    feed(log);
  } catch {
    /* sin commits */
  }
  let best: string | null = null;
  let bestCount = 1; // exigir al menos 2 apariciones
  for (const [key, n] of counts) {
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  return best;
}
