import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";

/**
 * Utilidades comunes para leer el almacenamiento de IDEs basados en VSCode
 * (Cursor, Antigravity...): state.vscdb es SQLite con tablas clave/valor
 * (ItemTable, cursorDiskKV...) y cada workspace se mapea a su carpeta
 * mediante workspaceStorage/<hash>/workspace.json.
 */

/** Abre una BD sqlite de otra app sobre copia temporal de solo lectura. */
export function openCopy(dbPath: string): Database.Database | null {
  try {
    const tmp = path.join(os.tmpdir(), `nebula-${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(dbPath)}`);
    fs.copyFileSync(dbPath, tmp);
    const db = new Database(tmp, { readonly: true });
    (db as any).__tmpPath = tmp;
    return db;
  } catch {
    return null;
  }
}

export function closeCopy(db: Database.Database): void {
  const tmp = (db as any).__tmpPath as string | undefined;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  if (tmp) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function readKV(db: Database.Database, table: string, key: string): string | null {
  try {
    const row = db.prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key) as
      | { value: string | Buffer }
      | undefined;
    if (!row) return null;
    return typeof row.value === "string" ? row.value : row.value.toString("utf8");
  } catch {
    return null;
  }
}

/** Todas las filas clave/valor de las tablas KV que existan en la BD. */
export function scanKV(db: Database.Database, tables = ["ItemTable", "cursorDiskKV"]): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const table of tables) {
    try {
      const rows = db.prepare(`SELECT key, value FROM ${table}`).all() as Array<{ key: string; value: any }>;
      for (const r of rows) {
        out.push({
          key: String(r.key),
          value: typeof r.value === "string" ? r.value : Buffer.isBuffer(r.value) ? r.value.toString("utf8") : "",
        });
      }
    } catch {
      /* tabla inexistente */
    }
  }
  return out;
}

/** Carpeta abierta de un workspace: workspaceStorage/<hash>/workspace.json */
export function folderFromWorkspaceJson(wsDir: string): string | null {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(wsDir, "workspace.json"), "utf8"));
    const uri: string | undefined = meta.folder;
    if (!uri?.startsWith("file:///")) return null;
    return decodeURIComponent(uri.slice("file:///".length)).replace(/\//g, "\\");
  } catch {
    return null;
  }
}

export function toIso(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}
