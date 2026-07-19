import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { FastifyInstance } from "fastify";
import { requireLoopback } from "../security.js";

interface FsEntry {
  name: string;
  path: string;
  /** este directorio es un repo git */
  isRepo: boolean;
  /** nº de repos git directamente dentro (1 nivel) */
  repoCount: number;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDir(dir: string): FsEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FsEntry[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.isSymbolicLink()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    let isRepo = false;
    let repoCount = 0;
    try {
      isRepo = fs.existsSync(path.join(full, ".git"));
      if (!isRepo) {
        // contar repos a 1 nivel (barato: solo readdir)
        for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
          if (sub.isDirectory() && fs.existsSync(path.join(full, sub.name, ".git"))) repoCount++;
          if (repoCount >= 20) break;
        }
      }
    } catch {
      /* sin permisos: se muestra igualmente */
    }
    out.push({ name: e.name, path: full, isRepo, repoCount });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Puntos de partida del explorador: unidades (win32) o / + accesos rápidos. */
function listRoots(): Array<{ name: string; path: string }> {
  const roots: Array<{ name: string; path: string }> = [];
  if (process.platform === "win32") {
    for (let c = 65; c <= 90; c++) {
      const drive = `${String.fromCharCode(c)}:\\`;
      if (fs.existsSync(drive)) roots.push({ name: drive.slice(0, 2), path: drive });
    }
  } else {
    roots.push({ name: "/", path: "/" });
  }
  const home = os.homedir();
  roots.push({ name: "🏠 Inicio", path: home });
  for (const [label, sub] of [
    ["Escritorio", "Desktop"],
    ["Documentos", "Documents"],
  ] as const) {
    const p = path.join(home, sub);
    if (isDir(p)) roots.push({ name: label, path: p });
  }
  return roots;
}

export function registerFsRoutes(app: FastifyInstance): void {
  // Explorar el disco es la razón de ser del selector de carpetas, así que no
  // se puede confinar a las raíces ya configuradas sin romperlo. La protección
  // es doble: el cortafuegos de origen (routes.ts) y exigir que la petición
  // venga de este mismo equipo — desde el móvil no se enumera nada.
  app.get("/api/fs/roots", async (req, reply) => {
    if (!requireLoopback(req, reply)) return reply;
    return listRoots();
  });

  app.get<{ Querystring: { path?: string } }>("/api/fs/list", async (req, reply) => {
    if (!requireLoopback(req, reply)) return reply;
    const target = req.query.path;
    if (!target || !path.isAbsolute(target) || !isDir(target)) {
      return reply.code(400).send({ error: "ruta inválida" });
    }
    const resolved = path.resolve(target);
    return {
      path: resolved,
      parent: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
      entries: listDir(resolved),
    };
  });
}
