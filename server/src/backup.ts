import fs from "node:fs";
import path from "node:path";
import { NEBULA_HOME } from "./config.js";
import type { DB } from "./db/index.js";

const BACKUP_DIR = path.join(NEBULA_HOME, "backups");
const KEEP = 7;

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Backup online-safe de la BD + copia del config. Conserva los 7 más recientes. */
export async function runBackup(db: DB): Promise<void> {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, `nebula-${stamp()}.db`);
    await db.backup(dest);
    try {
      fs.copyFileSync(path.join(NEBULA_HOME, "config.json"), path.join(BACKUP_DIR, `config-${stamp()}.json`));
    } catch {
      /* sin config aún */
    }
    // rotación por tipo de fichero
    for (const prefix of ["nebula-", "config-"]) {
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith(prefix))
        .sort()
        .reverse();
      for (const old of files.slice(KEEP)) {
        fs.rmSync(path.join(BACKUP_DIR, old), { force: true });
      }
    }
    console.log(`[backup] copia guardada en ${dest}`);
  } catch (err) {
    console.warn("[backup] falló (el daemon sigue):", (err as Error).message);
  }
}

/** Programa el backup: al arrancar y cada 24 h. */
export function scheduleBackups(db: DB): void {
  void runBackup(db);
  setInterval(() => void runBackup(db), 24 * 60 * 60 * 1000).unref();
}
