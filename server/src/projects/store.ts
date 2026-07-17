import crypto from "node:crypto";
import path from "node:path";
import type { GitStatusSummary, Project, ProjectAnalysis } from "@nebula/shared";
import type { DB } from "../db/index.js";

export function projectId(repoPath: string): string {
  return crypto.createHash("sha1").update(repoPath.toLowerCase()).digest("hex").slice(0, 12);
}

interface ProjectRow {
  id: string;
  path: string;
  name: string;
  present: number;
  first_seen_at: string;
  last_scan_at: string | null;
  analysis: string | null;
  git: string | null;
  jira_key: string | null;
  jira_key_suggestion: string | null;
}

export class ProjectStore {
  constructor(private db: DB) {}

  upsert(repoPath: string): string {
    const id = projectId(repoPath);
    this.db
      .prepare(
        `INSERT INTO projects (id, path, name, present, first_seen_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(path) DO UPDATE SET present = 1`,
      )
      .run(id, repoPath, path.basename(repoPath), new Date().toISOString());
    return id;
  }

  markMissing(ids: string[]): void {
    if (ids.length === 0) return;
    const q = this.db.prepare(`UPDATE projects SET present = 0 WHERE id = ?`);
    for (const id of ids) q.run(id);
  }

  saveAnalysis(id: string, analysis: ProjectAnalysis, git: GitStatusSummary): void {
    this.db
      .prepare(`UPDATE projects SET analysis = ?, git = ?, last_scan_at = ? WHERE id = ?`)
      .run(JSON.stringify(analysis), JSON.stringify(git), new Date().toISOString(), id);
  }

  saveGit(id: string, git: GitStatusSummary): void {
    this.db.prepare(`UPDATE projects SET git = ? WHERE id = ?`).run(JSON.stringify(git), id);
  }

  private toProject(row: ProjectRow): Project {
    const agg = this.db
      .prepare(
        `SELECT COUNT(*) AS total, MAX(COALESCE(ended_at, started_at)) AS last
         FROM agent_sessions WHERE project_id = ?`,
      )
      .get(row.id) as { total: number; last: string | null };
    const byAgentRows = this.db
      .prepare(`SELECT agent, COUNT(*) AS n FROM agent_sessions WHERE project_id = ? GROUP BY agent`)
      .all(row.id) as Array<{ agent: string; n: number }>;
    const tasks = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status IN ('todo','doing') THEN 1 ELSE 0 END) AS open,
           SUM(CASE WHEN status = 'suggested' THEN 1 ELSE 0 END) AS suggested
         FROM tasks WHERE project_id = ?`,
      )
      .get(row.id) as { open: number | null; suggested: number | null };
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      present: row.present === 1,
      firstSeenAt: row.first_seen_at,
      lastScanAt: row.last_scan_at,
      analysis: row.analysis ? JSON.parse(row.analysis) : null,
      git: row.git ? JSON.parse(row.git) : null,
      agents: {
        total: agg.total,
        lastActivityAt: agg.last,
        byAgent: Object.fromEntries(byAgentRows.map((r) => [r.agent, r.n])),
      },
      tasks: { open: tasks.open ?? 0, suggested: tasks.suggested ?? 0 },
      jiraKey: row.jira_key,
      jiraKeySuggestion: row.jira_key_suggestion,
    };
  }

  setJiraKey(id: string, jiraKey: string | null): void {
    this.db.prepare(`UPDATE projects SET jira_key = ? WHERE id = ?`).run(jiraKey, id);
  }

  setJiraKeySuggestion(id: string, suggestion: string | null): void {
    this.db.prepare(`UPDATE projects SET jira_key_suggestion = ? WHERE id = ?`).run(suggestion, id);
  }

  /** id de proyecto por clave Jira asignada (case-insensitive). */
  byJiraKey(): Map<string, string> {
    const rows = this.db
      .prepare(`SELECT id, jira_key FROM projects WHERE present = 1 AND jira_key IS NOT NULL`)
      .all() as Array<{ id: string; jira_key: string }>;
    return new Map(rows.map((r) => [r.jira_key.toUpperCase(), r.id]));
  }

  get(id: string): Project | null {
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
    return row ? this.toProject(row) : null;
  }

  getByPath(repoPath: string): Project | null {
    return this.get(projectId(repoPath));
  }

  all(): Project[] {
    const rows = this.db.prepare(`SELECT * FROM projects WHERE present = 1 ORDER BY name`).all() as ProjectRow[];
    return rows.map((r) => this.toProject(r));
  }

  allRows(): Array<{ id: string; path: string }> {
    return this.db.prepare(`SELECT id, path FROM projects WHERE present = 1`).all() as Array<{
      id: string;
      path: string;
    }>;
  }
}
