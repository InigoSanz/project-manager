import type { DB } from "../db/index.js";

export interface Scratchpad {
  body: string;
  updatedAt: string | null;
}

/**
 * Bloc de notas propio por proyecto. Es distinto de las notas de Obsidian
 * (`integrations/obsidian.ts`), que solo se leen del disco del usuario.
 */
export class NotesStore {
  constructor(private db: DB) {}

  get(projectId: string): Scratchpad {
    const row = this.db
      .prepare(`SELECT body, updated_at FROM project_notes WHERE project_id = ?`)
      .get(projectId) as { body: string; updated_at: string } | undefined;
    return { body: row?.body ?? "", updatedAt: row?.updated_at ?? null };
  }

  save(projectId: string, body: string): Scratchpad {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO project_notes (project_id, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .run(projectId, body, updatedAt);
    return { body, updatedAt };
  }
}
