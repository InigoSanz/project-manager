import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatusSummary, GitCommit, GitBranch, GitDetail } from "@nebula/shared";

const run = promisify(execFile);

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", repo, ...args], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
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

export async function getLog(repo: string, limit = 20): Promise<GitCommit[]> {
  const fmt = ["%H", "%h", "%s", "%an", "%aI", "%D"].join(LOG_SEP);
  let out: string;
  try {
    out = await git(repo, ["log", `--format=${fmt}`, `-${limit}`]);
  } catch {
    return []; // repo sin commits
  }
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
