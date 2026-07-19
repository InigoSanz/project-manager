import { execFile } from "node:child_process";
import type { OutdatedDep, OutdatedReport } from "@nebula/shared";

/**
 * Informe de dependencias desactualizadas. Es caro (consulta el registry por
 * red), así que va **bajo demanda** y se cachea: nunca en cada escaneo.
 *
 * `npm`/`pnpm` son ficheros `.cmd` en Windows, así que hace falta shell; el
 * comando es fijo (no viene del cliente), así que no hay superficie de
 * inyección. `outdated` sale con código distinto de 0 cuando **sí** hay
 * desactualizadas, que es justo el caso normal: se ignora el código y se
 * interpreta la salida.
 */

const CACHE_MS = 30 * 60_000;
const cache = new Map<string, OutdatedReport>();

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
}

function runOutdated(cwd: string, manager: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      `${manager} outdated --json`,
      [],
      { cwd, shell: true, windowsHide: true, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
      (_err, stdout) => resolve(stdout || ""),
    );
  });
}

/** pnpm y npm devuelven formas distintas del mismo JSON. */
function parse(raw: string): OutdatedDep[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!json || typeof json !== "object") return [];
  const deps: OutdatedDep[] = [];
  for (const [name, value] of Object.entries(json as Record<string, NpmOutdatedEntry>)) {
    if (!value || typeof value !== "object") continue;
    const current = value.current ?? null;
    const latest = value.latest ?? value.wanted ?? null;
    if (!latest || current === latest) continue;
    // salto de major = posible ruptura; se marca para que se vea de un vistazo
    const major = Boolean(current && latest && current.split(".")[0] !== latest.split(".")[0]);
    deps.push({ name, current, wanted: value.wanted ?? null, latest, major });
  }
  return deps.sort((a, b) => Number(b.major) - Number(a.major) || a.name.localeCompare(b.name));
}

export async function outdatedReport(
  projectId: string,
  cwd: string,
  manager: string,
  force = false,
): Promise<OutdatedReport> {
  const hit = cache.get(projectId);
  if (!force && hit && Date.now() - Date.parse(hit.generatedAt) < CACHE_MS) return hit;

  const deps = parse(await runOutdated(cwd, manager));
  const report: OutdatedReport = { generatedAt: new Date().toISOString(), deps };
  cache.set(projectId, report);
  return report;
}

/** Informe ya calculado, sin lanzar nada. */
export function cachedReport(projectId: string): OutdatedReport | null {
  return cache.get(projectId) ?? null;
}
