import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { NEBULA_HOME } from "../config.js";

export type DB = Database.Database;

export function openDb(): DB {
  fs.mkdirSync(NEBULA_HOME, { recursive: true });
  const db = new Database(path.join(NEBULA_HOME, "nebula.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      present INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_scan_at TEXT,
      analysis TEXT,
      git TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT,
      first_prompt TEXT,
      started_at TEXT,
      ended_at TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      tool_use_count INTEGER NOT NULL DEFAULT 0,
      files_touched TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'done',
      source_path TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON agent_sessions(project_id, started_at);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      source TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);

    -- Cache incremental de parseo de ficheros de sesiones de agentes
    CREATE TABLE IF NOT EXISTS parse_cache (
      path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      meta TEXT
    );
  `);
  migrate(db);
  return db;
}

/** Migraciones aditivas idempotentes (ALTER TABLE si falta la columna). */
function migrate(db: Database.Database): void {
  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes("jira_key")) db.exec(`ALTER TABLE projects ADD COLUMN jira_key TEXT`);
  if (!cols.includes("jira_key_suggestion")) db.exec(`ALTER TABLE projects ADD COLUMN jira_key_suggestion TEXT`);

  const taskCols = (db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!taskCols.includes("external_meta")) db.exec(`ALTER TABLE tasks ADD COLUMN external_meta TEXT`);
}
