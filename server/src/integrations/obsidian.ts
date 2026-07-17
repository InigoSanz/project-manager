import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ObsidianNote } from "@nebula/shared";

const MAX_FILES_PER_VAULT = 5000;
const MAX_NOTES = 30;

interface Vault {
  name: string;
  path: string;
}

/** Vaults registrados en %APPDATA%/obsidian/obsidian.json. */
export function findVaults(): Vault[] {
  const cfg = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "obsidian",
    "obsidian.json",
  );
  try {
    const data = JSON.parse(fs.readFileSync(cfg, "utf8"));
    return Object.values<any>(data.vaults ?? {})
      .filter((v) => typeof v?.path === "string" && fs.existsSync(v.path))
      .map((v) => ({ name: path.basename(v.path), path: v.path }));
  } catch {
    return [];
  }
}

/**
 * Notas relacionadas con un proyecto: por nombre en el título/ruta de la nota
 * o mención [[...]]/texto del nombre del repo en su contenido (primeros KB).
 */
export function notesForProject(projectName: string): ObsidianNote[] {
  const needle = projectName.toLowerCase();
  const notes: ObsidianNote[] = [];
  for (const vault of findVaults()) {
    let count = 0;
    const stack = [vault.path];
    while (stack.length > 0 && notes.length < MAX_NOTES && count < MAX_FILES_PER_VAULT) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!e.name.endsWith(".md")) continue;
        count++;
        const rel = path.relative(vault.path, full);
        let matches = rel.toLowerCase().includes(needle);
        if (!matches) {
          try {
            const fd = fs.openSync(full, "r");
            const buf = Buffer.alloc(16 * 1024);
            const n = fs.readSync(fd, buf, 0, buf.length, 0);
            fs.closeSync(fd);
            matches = buf.toString("utf8", 0, n).toLowerCase().includes(needle);
          } catch {
            /* ilegible */
          }
        }
        if (matches) {
          const noExt = rel.slice(0, -3).replace(/\\/g, "/");
          notes.push({
            vault: vault.name,
            file: rel,
            title: path.basename(rel, ".md"),
            uri: `obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent(noExt)}`,
            mtime: fs.statSync(full).mtime.toISOString(),
          });
          if (notes.length >= MAX_NOTES) break;
        }
      }
    }
  }
  return notes.sort((a, b) => b.mtime.localeCompare(a.mtime));
}
