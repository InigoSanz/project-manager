import fs from "node:fs";
import type { AgentSession } from "@nebula/shared";

export interface KnownProject {
  id: string;
  path: string;
}

/**
 * Caché incremental por fichero (mtime+size): evita re-parsear sesiones
 * que no han cambiado desde el último escaneo.
 */
export interface SessionCache {
  /** undefined = no está en caché; null = cacheado como "no mapeable". */
  get(sourcePath: string, mtimeMs: number, size: number): AgentSession | null | undefined;
  put(sourcePath: string, mtimeMs: number, size: number, session: AgentSession | null): void;
}

/** Parsea con caché mtime+size; recalcula el estado live/done al recuperar. */
export async function withCache(
  filePath: string,
  projects: KnownProject[],
  cache: SessionCache | undefined,
  parse: (filePath: string, projects: KnownProject[]) => Promise<AgentSession | null>,
): Promise<AgentSession | null> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (cache) {
    const hit = cache.get(filePath, stat.mtimeMs, stat.size);
    if (hit !== undefined) {
      if (hit) hit.status = statusFromMtime(stat.mtimeMs);
      return hit;
    }
  }
  const session = await parse(filePath, projects);
  cache?.put(filePath, stat.mtimeMs, stat.size, session);
  return session;
}

/**
 * Un proveedor de agente descubre sesiones en disco y las normaliza.
 * Si la herramienta no está instalada, devuelve [] sin error.
 */
export interface AgentProvider {
  readonly kind: AgentSession["agent"];
  /** Rutas a vigilar con chokidar para actividad en vivo (pueden no existir). */
  watchPaths(): string[];
  /** Recolecta todas las sesiones mapeables a los proyectos conocidos. */
  collect(projects: KnownProject[], cache?: SessionCache): Promise<AgentSession[]>;
}

/** Un fichero de sesión se considera "en vivo" si cambió hace < 2 min. */
export const LIVE_WINDOW_MS = 2 * 60 * 1000;

export function statusFromMtime(mtimeMs: number): AgentSession["status"] {
  return Date.now() - mtimeMs < LIVE_WINDOW_MS ? "live" : "done";
}

/** Empareja un cwd de sesión con el proyecto correspondiente (o subcarpeta). */
export function matchProject(cwd: string | null, projects: KnownProject[]): KnownProject | null {
  if (!cwd) return null;
  const norm = normalizeFsPath(cwd);
  let best: KnownProject | null = null;
  let bestLen = -1;
  for (const p of projects) {
    const pp = normalizeFsPath(p.path);
    if ((norm === pp || norm.startsWith(pp + "/")) && pp.length > bestLen) {
      best = p;
      bestLen = pp.length;
    }
  }
  return best;
}

/** Normaliza separadores y mayúsculas (solo win32 es case-insensitive). */
function normalizeFsPath(p: string): string {
  let out = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (process.platform === "win32") out = out.toLowerCase();
  return out;
}

export function truncate(s: string, max = 220): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}
