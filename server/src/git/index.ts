import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  GitStatusSummary,
  GitCommit,
  GitBranch,
  GitDetail,
  GitDiffLine,
  GitFileDiff,
} from "@nebula/shared";

const run = promisify(execFile);

/**
 * Todo git pasa por aquí: `execFile` (sin shell, argumentos en array) para que
 * ni una rama ni una ruta puedan inyectar comandos. El timeout evita que un
 * `fetch` contra un remoto inalcanzable deje la promesa colgada para siempre.
 */
async function git(repo: string, args: string[], timeoutMs = 20_000): Promise<string> {
  const { stdout } = await run("git", ["-C", repo, ...args], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  return stdout;
}

export async function getStatus(repo: string): Promise<GitStatusSummary> {
  const out = await git(repo, ["status", "--porcelain=v2", "--branch"]);
  const s: GitStatusSummary = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    clean: true,
  };
  for (const line of out.split("\n")) {
    if (line.startsWith("# branch.head")) {
      const v = line.slice("# branch.head ".length).trim();
      s.branch = v === "(detached)" ? null : v;
    } else if (line.startsWith("# branch.upstream")) {
      s.upstream = line.slice("# branch.upstream ".length).trim();
    } else if (line.startsWith("# branch.ab")) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        s.ahead = Number(m[1]);
        s.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.split(" ")[1] ?? "..";
      if (xy[0] !== ".") s.staged++;
      if (xy[1] !== ".") s.unstaged++;
    } else if (line.startsWith("u ")) {
      s.conflicted++;
    } else if (line.startsWith("? ")) {
      s.untracked++;
    }
  }
  s.clean = s.staged + s.unstaged + s.untracked + s.conflicted === 0;
  return s;
}

const LOG_SEP = "\x1f"; // unit separator, no aparece en mensajes normales
const LOG_FORMAT = ["%H", "%h", "%s", "%an", "%aI", "%D"].join(LOG_SEP);

function parseLog(out: string): GitCommit[] {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, author, date, refs] = line.split(LOG_SEP);
      return {
        hash,
        shortHash,
        subject,
        author,
        date,
        refs: refs ? refs.split(", ").filter(Boolean) : [],
      };
    });
}

export async function getLog(repo: string, limit = 20): Promise<GitCommit[]> {
  try {
    return parseLog(await git(repo, ["log", `--format=${LOG_FORMAT}`, `-${limit}`]));
  } catch {
    return []; // repo sin commits
  }
}

export async function getBranches(repo: string): Promise<GitBranch[]> {
  const fmt = ["%(refname:short)", "%(HEAD)", "%(upstream:short)", "%(committerdate:iso-strict)", "%(subject)"].join(LOG_SEP);
  const out = await git(repo, ["for-each-ref", "refs/heads", `--format=${fmt}`, "--sort=-committerdate"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, head, upstream, date, subject] = line.split(LOG_SEP);
      return {
        name,
        isCurrent: head === "*",
        upstream: upstream || null,
        lastCommitAt: date || null,
        subject: subject || null,
      };
    });
}

export async function getChanges(repo: string): Promise<Array<{ state: string; path: string }>> {
  const out = await git(repo, ["status", "--porcelain"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ state: line.slice(0, 2).trim() || "??", path: line.slice(3).trim() }));
}

export async function getRemoteUrl(repo: string): Promise<string | null> {
  try {
    return (await git(repo, ["remote", "get-url", "origin"])).trim() || null;
  } catch {
    return null;
  }
}

export async function getDetail(repo: string): Promise<GitDetail> {
  const [status, commits, branches, changes, remoteUrl] = await Promise.all([
    getStatus(repo),
    getLog(repo, 30),
    getBranches(repo),
    getChanges(repo),
    getRemoteUrl(repo),
  ]);
  return { status, commits, branches, changes, remoteUrl };
}

/** Fechas ISO de commits de los últimos `days` días (para el histograma). */
export async function getCommitDates(repo: string, days = 30): Promise<string[]> {
  try {
    const out = await git(repo, ["log", `--since=${days} days ago`, "--format=%aI"]);
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function getFirstLastCommit(repo: string): Promise<{ first: string | null; last: string | null }> {
  try {
    const last = (await git(repo, ["log", "-1", "--format=%aI"])).trim() || null;
    const first = (await git(repo, ["log", "--reverse", "--format=%aI", "--max-parents=0", "-1"])).trim() || null;
    return { first, last };
  } catch {
    return { first: null, last: null };
  }
}

export async function fetchRemote(repo: string): Promise<void> {
  try {
    await git(repo, ["fetch", "--quiet"]);
  } catch {
    /* sin red o sin remote: silencioso, es una tarea de fondo */
  }
}

// ---------- Lectura ampliada ----------

const MAX_DIFF_LINES = 1500;

/**
 * Diff de un fichero concreto del working tree (o del índice con `staged`).
 * Se trocea en líneas ya clasificadas para que el cliente no tenga que
 * interpretar el formato unificado.
 */
export async function getFileDiff(repo: string, file: string, staged: boolean): Promise<GitFileDiff> {
  const args = ["diff", "--no-color"];
  if (staged) args.push("--cached");
  // `--` separa la ruta de las opciones: un fichero llamado "-f" no es opción
  args.push("--", file);

  let raw = "";
  try {
    raw = await git(repo, args);
  } catch {
    return { path: file, staged, binary: false, truncated: false, lines: [] };
  }

  // fichero nuevo sin seguimiento: git diff no dice nada, lo mostramos entero
  if (!raw.trim() && !staged) {
    try {
      raw = await git(repo, ["diff", "--no-color", "--no-index", "/dev/null", file]);
    } catch (err) {
      // --no-index sale con código 1 cuando hay diferencias: eso es lo normal
      const withStdout = err as { stdout?: string };
      raw = typeof withStdout.stdout === "string" ? withStdout.stdout : "";
    }
  }

  if (raw.includes("Binary files")) return { path: file, staged, binary: true, truncated: false, lines: [] };

  const all = raw.split("\n");
  const truncated = all.length > MAX_DIFF_LINES;
  const lines: GitDiffLine[] = [];
  for (const line of all.slice(0, MAX_DIFF_LINES)) {
    // las cabeceras del diff no aportan al lector, solo las secciones @@
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }
    if (line.startsWith("@@")) lines.push({ kind: "hunk", text: line });
    else if (line.startsWith("+")) lines.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) lines.push({ kind: "del", text: line.slice(1) });
    else lines.push({ kind: "context", text: line.startsWith(" ") ? line.slice(1) : line });
  }
  return { path: file, staged, binary: false, truncated, lines };
}

/**
 * Busca en el historial por mensaje **o** por contenido tocado. Ojo: pasar
 * `--grep` y `-S` juntos hace que git exija ambas (AND), así que se lanzan por
 * separado y se unen los resultados.
 */
export async function searchLog(repo: string, query: string, limit = 40): Promise<GitCommit[]> {
  const q = query.trim();
  if (!q) return getLog(repo, limit);

  const search = async (extra: string[]): Promise<GitCommit[]> => {
    try {
      return parseLog(await git(repo, ["log", `--format=${LOG_FORMAT}`, `-${limit}`, ...extra]));
    } catch {
      return [];
    }
  };
  const [byMessage, byContent] = await Promise.all([
    search(["--regexp-ignore-case", `--grep=${q}`]),
    search([`-S${q}`]),
  ]);

  const seen = new Set<string>();
  const merged: GitCommit[] = [];
  for (const c of [...byMessage, ...byContent]) {
    if (seen.has(c.hash)) continue;
    seen.add(c.hash);
    merged.push(c);
  }
  // el orden cronológico se pierde al concatenar: se restaura por fecha
  return merged.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

// ---------- Escritura (solo desde el propio equipo) ----------

export interface GitActionResult {
  ok: boolean;
  /** salida de git, para enseñarla tal cual cuando algo falla */
  message: string;
}

async function writeAction(repo: string, args: string[], timeoutMs = 60_000): Promise<GitActionResult> {
  try {
    const out = await git(repo, args, timeoutMs);
    return { ok: true, message: out.trim() || "Hecho." };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    return { ok: false, message: (e.stderr || e.stdout || e.message || "Error de git").trim() };
  }
}

export function gitFetch(repo: string): Promise<GitActionResult> {
  return writeAction(repo, ["fetch", "--all", "--prune"]);
}

export function gitPull(repo: string): Promise<GitActionResult> {
  // --ff-only: no inventamos merges automáticos; si diverge, que lo resuelva
  // el usuario en su editor
  return writeAction(repo, ["pull", "--ff-only"]);
}

export function gitCheckout(repo: string, branch: string): Promise<GitActionResult> {
  return writeAction(repo, ["checkout", branch], 30_000);
}
