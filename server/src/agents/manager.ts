import chokidar, { type FSWatcher } from "chokidar";
import type { AgentSession } from "@nebula/shared";
import type { DB } from "../db/index.js";
import type { ProjectStore } from "../projects/store.js";
import type { TaskStore } from "../tasks/store.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { CursorProvider } from "./cursor.js";
import { GeminiProvider } from "./gemini.js";
import { AntigravityProvider } from "./antigravity.js";
import type { AgentProvider, SessionCache } from "./types.js";

export interface AgentsEvents {
  onActivity: (projectId: string, session: AgentSession) => void;
  onProjectUpdated: (projectId: string) => void;
  onTasksChanged: (projectId: string) => void;
}

export class AgentsManager {
  private providers: AgentProvider[] = [
    new ClaudeProvider(),
    new CodexProvider(),
    new CursorProvider(),
    new GeminiProvider(),
    new AntigravityProvider(),
  ];
  private watcher: FSWatcher | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private cache: SessionCache;

  constructor(
    private db: DB,
    private store: ProjectStore,
    private tasks: TaskStore,
    private events: AgentsEvents,
  ) {
    this.cache = {
      get: (sourcePath, mtimeMs, size) => {
        const row = this.db
          .prepare(`SELECT mtime, size, meta FROM parse_cache WHERE path = ?`)
          .get(sourcePath) as { mtime: number; size: number; meta: string | null } | undefined;
        if (!row || row.mtime !== Math.floor(mtimeMs) || row.size !== size) return undefined;
        return row.meta ? (JSON.parse(row.meta) as AgentSession) : null;
      },
      put: (sourcePath, mtimeMs, size, session) => {
        this.db
          .prepare(
            `INSERT INTO parse_cache (path, mtime, size, meta) VALUES (?, ?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, size = excluded.size, meta = excluded.meta`,
          )
          .run(sourcePath, Math.floor(mtimeMs), size, session ? JSON.stringify(session) : null);
      },
    };
  }

  /** Recolecta las sesiones de todos los proveedores y sincroniza la BD. */
  async refreshAll(notify = false): Promise<void> {
    const projects = this.store.allRows();
    const prevLive = new Set(
      (this.db.prepare(`SELECT id FROM agent_sessions WHERE status = 'live'`).all() as Array<{ id: string }>).map(
        (r) => r.id,
      ),
    );
    const touchedProjects = new Set<string>();

    for (const provider of this.providers) {
      let sessions: AgentSession[] = [];
      try {
        sessions = await provider.collect(projects, this.cache);
      } catch (err) {
        console.error(`[agents] proveedor ${provider.kind} falló:`, err);
        continue;
      }
      const upsert = this.db.prepare(
        `INSERT INTO agent_sessions
           (id, agent, session_id, project_id, title, first_prompt, started_at, ended_at,
            message_count, tool_use_count, files_touched, status, source_path)
         VALUES (@id, @agent, @sessionId, @projectId, @title, @firstPrompt, @startedAt, @endedAt,
            @messageCount, @toolUseCount, @filesTouched, @status, @sourcePath)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, first_prompt = excluded.first_prompt,
           started_at = excluded.started_at, ended_at = excluded.ended_at,
           message_count = excluded.message_count, tool_use_count = excluded.tool_use_count,
           files_touched = excluded.files_touched, status = excluded.status`,
      );
      const tx = this.db.transaction((batch: AgentSession[]) => {
        for (const s of batch) {
          upsert.run({ ...s, filesTouched: JSON.stringify(s.filesTouched) });
        }
      });
      tx(sessions);

      // tareas sugeridas a partir de sesiones con trabajo real
      const suggested = this.tasks.suggestFromSessions(sessions.filter((s) => s.status === "done"));
      for (const projectId of suggested) {
        this.events.onTasksChanged(projectId);
        touchedProjects.add(projectId);
      }

      if (notify) {
        for (const s of sessions) {
          if (s.status === "live" && !prevLive.has(s.id)) {
            touchedProjects.add(s.projectId);
            this.events.onActivity(s.projectId, s);
          } else if (s.status === "live") {
            // sigue viva: refrescar pulso
            this.events.onActivity(s.projectId, s);
          }
        }
      }
    }

    // sesiones que dejaron de estar vivas
    this.db
      .prepare(`UPDATE agent_sessions SET status = 'done' WHERE status = 'live' AND ended_at < ?`)
      .run(new Date(Date.now() - 2 * 60 * 1000).toISOString());

    for (const id of touchedProjects) this.events.onProjectUpdated(id);
  }

  /** Sesiones en vivo ahora mismo (para la vista Hoy). */
  liveSessions(): AgentSession[] {
    const rows = this.db
      .prepare(`SELECT * FROM agent_sessions WHERE status = 'live' ORDER BY COALESCE(ended_at,'') DESC LIMIT 10`)
      .all() as any[];
    return rows.map((r) => this.rowToSession(r));
  }

  private rowToSession(r: any): AgentSession {
    return {
      id: r.id,
      agent: r.agent,
      sessionId: r.session_id,
      projectId: r.project_id,
      title: r.title,
      firstPrompt: r.first_prompt,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      messageCount: r.message_count,
      toolUseCount: r.tool_use_count,
      filesTouched: JSON.parse(r.files_touched ?? "[]"),
      status: r.status,
      sourcePath: r.source_path,
    };
  }

  sessionsFor(projectId: string): AgentSession[] {
    const rows = this.db
      .prepare(`SELECT * FROM agent_sessions WHERE project_id = ? ORDER BY COALESCE(started_at, '') DESC LIMIT 200`)
      .all(projectId) as any[];
    return rows.map((r) => this.rowToSession(r));
  }

  /** Vigila los directorios de sesiones para actividad en vivo. */
  startWatching(): void {
    this.stopWatching();
    const paths = this.providers.flatMap((p) => p.watchPaths());
    if (paths.length === 0) return;
    this.watcher = chokidar.watch(paths, {
      persistent: true,
      ignoreInitial: true,
      ignorePermissionErrors: true,
      depth: 6,
    });
    this.watcher.on("error", (err) => console.warn("[agents] watcher:", (err as Error).message));
    this.watcher.on("all", () => {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => {
        this.debounce = null;
        void this.refreshAll(true);
      }, 800);
    });
  }

  stopWatching(): void {
    void this.watcher?.close();
    this.watcher = null;
  }
}
