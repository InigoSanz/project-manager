import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import type { AgentSession } from "@nebula/shared";
import {
  matchProject,
  statusFromMtime,
  truncate,
  withCache,
  type AgentProvider,
  type KnownProject,
  type SessionCache,
} from "./types.js";

const CODEX_SESSIONS = path.join(os.homedir(), ".codex", "sessions");

/**
 * Codex CLI guarda cada sesión como "rollout" JSONL en
 * ~/.codex/sessions/AAAA/MM/DD/rollout-<ts>-<uuid>.jsonl
 * Cada línea: {timestamp, type, payload}. Tipos relevantes:
 *  - session_meta: payload.id, payload.cwd
 *  - turn_context: payload.cwd
 *  - event_msg: payload.type === "user_message" (los token_count son ruido)
 *  - response_item: payload.type "message" (role user/assistant) o "function_call"
 */
export class CodexProvider implements AgentProvider {
  readonly kind = "codex" as const;

  watchPaths(): string[] {
    return fs.existsSync(CODEX_SESSIONS) ? [CODEX_SESSIONS] : [];
  }

  async collect(projects: KnownProject[], cache?: SessionCache): Promise<AgentSession[]> {
    if (!fs.existsSync(CODEX_SESSIONS)) return [];
    const sessions: AgentSession[] = [];
    for (const file of listRolloutFiles(CODEX_SESSIONS)) {
      const session = await withCache(file, projects, cache, parseRolloutFile);
      if (session) sessions.push(session);
    }
    return sessions;
  }
}

function listRolloutFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) out.push(full);
    }
  }
  return out;
}

export async function parseRolloutFile(
  filePath: string,
  projects: KnownProject[],
): Promise<AgentSession | null> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (stat.size === 0) return null;

  let sessionId = path.basename(filePath, ".jsonl").replace(/^rollout-/, "");
  let cwd: string | null = null;
  let firstPrompt: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let messageCount = 0;
  let toolUseCount = 0;
  const filesTouched = new Set<string>();

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = entry.payload ?? {};
    if (typeof entry.timestamp === "string") {
      if (!startedAt) startedAt = entry.timestamp;
      endedAt = entry.timestamp;
    }
    switch (entry.type) {
      case "session_meta":
        if (payload.id) sessionId = String(payload.id);
        if (payload.cwd) cwd = String(payload.cwd);
        break;
      case "turn_context":
        if (!cwd && payload.cwd) cwd = String(payload.cwd);
        break;
      case "event_msg":
        if (payload.type === "user_message") {
          messageCount++;
          if (!firstPrompt && typeof payload.message === "string") {
            firstPrompt = truncate(payload.message);
          }
        } else if (payload.type === "agent_message") {
          messageCount++;
        }
        break;
      case "response_item":
        if (payload.type === "message") {
          messageCount++;
          if (!firstPrompt && payload.role === "user" && Array.isArray(payload.content)) {
            const text = payload.content
              .filter((c: any) => typeof c?.text === "string")
              .map((c: any) => c.text)
              .join(" ");
            if (text && !text.startsWith("<")) firstPrompt = truncate(text);
          }
        } else if (payload.type === "function_call" || payload.type === "local_shell_call" || payload.type === "custom_tool_call") {
          toolUseCount++;
          extractPatchedFiles(payload, filesTouched);
        }
        break;
    }
  }

  if (messageCount === 0 && toolUseCount === 0) return null;
  const project = matchProject(cwd, projects);
  if (!project) return null;

  return {
    id: `codex:${sessionId}`,
    agent: "codex",
    sessionId,
    projectId: project.id,
    title: firstPrompt ? truncate(firstPrompt, 120) : null,
    firstPrompt,
    startedAt,
    endedAt,
    messageCount,
    toolUseCount,
    filesTouched: [...filesTouched].slice(0, 50),
    status: statusFromMtime(stat.mtimeMs),
    sourcePath: filePath,
  };
}

/** apply_patch lleva las rutas en el propio texto del parche. */
function extractPatchedFiles(payload: any, out: Set<string>): void {
  const args = typeof payload.arguments === "string" ? payload.arguments : JSON.stringify(payload.arguments ?? "");
  for (const m of args.matchAll(/\*{3} (?:Update|Add|Delete) File: ([^\\n"]+)/g)) {
    out.add(m[1].trim());
  }
}
