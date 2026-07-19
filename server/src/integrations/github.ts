import type { GitHubConfig, GitHubStatus, PullRequest } from "@nebula/shared";
import type { DB } from "../db/index.js";
import type { ProjectStore } from "../projects/store.js";

/**
 * GitHub: trae tus pull requests, las revisiones que te han pedido y los issues
 * que tienes asignados.
 *
 * Los **issues sí son tareas** (van al tablero como los de Jira). Las **PRs no**:
 * son un estado, no algo que se marque como hecho a mano, así que viven aparte
 * y se muestran en Hoy y en la pestaña Git.
 *
 * El emparejamiento con repos usa la URL del remoto, mucho más fiable que las
 * heurísticas de Jira (clave en la rama) o Planner (subcadena del nombre).
 */

const API = "https://api.github.com";

interface SearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  updated_at: string;
  repository_url: string;
  pull_request?: { url: string };
  user?: { login: string };
}

async function gh<T>(cfg: GitHubConfig, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nebula",
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Token de GitHub inválido o caducado.");
    if (res.status === 403) throw new Error("GitHub ha limitado las peticiones (rate limit). Prueba en un rato.");
    throw new Error(`GitHub respondió ${res.status}`);
  }
  return (await res.json()) as T;
}

/** `https://api.github.com/repos/user/repo` → `user/repo` */
function repoFullName(repositoryUrl: string): string {
  return repositoryUrl.split("/repos/")[1] ?? "";
}

/** Normaliza cualquier forma de remoto a `owner/repo` para poder comparar. */
export function remoteToFullName(remote: string | null): string | null {
  if (!remote) return null;
  const clean = remote.trim().replace(/\.git$/, "");
  const m = clean.match(/github\.com[:/]([^/]+)\/([^/]+)$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

export class GitHubSync {
  private status: GitHubStatus = {
    configured: false,
    ok: false,
    user: null,
    error: null,
    lastSyncAt: null,
    pullCount: 0,
    issueCount: 0,
  };
  /** PRs en memoria: son estado volátil, se refrescan en cada sync */
  private pulls: PullRequest[] = [];

  constructor(
    private db: DB,
    private store: ProjectStore,
    private getConfig: () => GitHubConfig | undefined,
    private onTasksChanged: (projectId: string) => void,
  ) {}

  getStatus(): GitHubStatus {
    return { ...this.status };
  }

  getPulls(): PullRequest[] {
    return [...this.pulls];
  }

  /** Prueba unas credenciales sin guardarlas. */
  async test(cfg: GitHubConfig): Promise<GitHubStatus> {
    try {
      const me = await gh<{ login: string }>(cfg, "/user");
      return { ...this.status, configured: true, ok: true, user: me.login, error: null };
    } catch (err) {
      return { ...this.status, configured: true, ok: false, error: (err as Error).message };
    }
  }

  async sync(): Promise<void> {
    const cfg = this.getConfig();
    this.status.configured = Boolean(cfg?.token);
    if (!cfg?.token) return;

    let mine: SearchItem[];
    let review: SearchItem[];
    let issues: SearchItem[];
    try {
      if (!this.status.user) this.status.user = (await gh<{ login: string }>(cfg, "/user")).login;
      // la API de búsqueda ya filtra por "yo": no hace falta saber los repos
      [mine, review, issues] = await Promise.all([
        gh<{ items: SearchItem[] }>(cfg, `/search/issues?q=${encodeURIComponent("is:pr is:open author:@me")}&per_page=50`).then((r) => r.items),
        gh<{ items: SearchItem[] }>(cfg, `/search/issues?q=${encodeURIComponent("is:pr is:open review-requested:@me")}&per_page=50`).then((r) => r.items),
        gh<{ items: SearchItem[] }>(cfg, `/search/issues?q=${encodeURIComponent("is:issue is:open assignee:@me")}&per_page=50`).then((r) => r.items),
      ]);
      this.status.ok = true;
      this.status.error = null;
    } catch (err) {
      this.status.ok = false;
      this.status.error = (err as Error).message;
      return; // sin red o token roto: no tocamos nada de lo ya guardado
    }

    // índice remoto → proyecto, para colgar cada cosa de su repo
    const byRepo = new Map<string, string>();
    for (const p of this.store.all()) {
      const full = remoteToFullName(p.remoteUrl);
      if (full) byRepo.set(full, p.id);
    }

    // ---- Pull requests (estado en memoria, no tareas) ----
    const seenPulls = new Map<number, PullRequest>();
    const addPull = (item: SearchItem, reviewRequested: boolean): void => {
      const full = repoFullName(item.repository_url);
      const existing = seenPulls.get(item.id);
      if (existing) {
        existing.reviewRequested ||= reviewRequested;
        return;
      }
      seenPulls.set(item.id, {
        id: item.id,
        number: item.number,
        title: item.title,
        url: item.html_url,
        repo: full,
        projectId: byRepo.get(full.toLowerCase()) ?? null,
        draft: Boolean(item.draft),
        reviewRequested,
        mine: item.user?.login === this.status.user,
        updatedAt: item.updated_at,
      });
    };
    for (const item of mine) addPull(item, false);
    for (const item of review) addPull(item, true);
    this.pulls = [...seenPulls.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    this.status.pullCount = this.pulls.length;

    // ---- Issues asignados (sí son tareas) ----
    const inbox = "github-inbox";
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const touched = new Set<string>();

    const upsert = this.db.prepare(
      `INSERT INTO tasks (id, project_id, title, notes, status, source, source_ref, due_date, created_at, updated_at)
       VALUES (@id, @projectId, @title, NULL, 'todo', 'github', @sourceRef, NULL, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, project_id = excluded.project_id, updated_at = excluded.updated_at`,
    );

    for (const item of issues) {
      const full = repoFullName(item.repository_url);
      const projectId = byRepo.get(full.toLowerCase()) ?? inbox;
      const id = `github:${item.id}`;
      seen.add(id);
      touched.add(projectId);
      upsert.run({
        id,
        projectId,
        title: `#${item.number} · ${item.title}`.slice(0, 200),
        sourceRef: item.html_url,
        now,
      });
    }
    this.status.issueCount = issues.length;

    // issues que ya no están asignados o se cerraron → hechos
    const stale = this.db
      .prepare(`SELECT id, project_id FROM tasks WHERE source = 'github' AND status IN ('todo','doing')`)
      .all() as Array<{ id: string; project_id: string }>;
    for (const row of stale) {
      if (!seen.has(row.id)) {
        this.db.prepare(`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?`).run(now, row.id);
        touched.add(row.project_id);
      }
    }

    this.status.lastSyncAt = now;
    for (const projectId of touched) this.onTasksChanged(projectId);
  }
}
