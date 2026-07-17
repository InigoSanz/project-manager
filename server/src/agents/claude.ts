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

const CLAUDE_PROJECTS = path.join(os.homedir(), ".claude", "projects");

/**
 * Claude Code guarda cada sesión como JSONL en
 * ~/.claude/projects/<ruta-slugificada>/<sessionId>.jsonl
 * Entradas relevantes: {type:"summary", summary}, {type:"user"|"assistant",
 * message, cwd, timestamp}, tool_use dentro de message.content.
 */
export class ClaudeProvider implements AgentProvider {
  readonly kind = "claude" as const;

  watchPaths(): string[] {
    return fs.existsSync(CLAUDE_PROJECTS) ? [CLAUDE_PROJECTS] : [];
  }

  async collect(projects: KnownProject[], cache?: SessionCache): Promise<AgentSession[]> {
    if (!fs.existsSync(CLAUDE_PROJECTS)) return [];
    const sessions: AgentSession[] = [];
    for (const dir of fs.readdirSync(CLAUDE_PROJECTS)) {
      const full = path.join(CLAUDE_PROJECTS, dir);
      let files: string[];
      try {
        files = fs.readdirSync(full).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of files) {
        const filePath = path.join(full, file);
        const session = await withCache(filePath, projects, cache, parseSessionFile);
        if (session) sessions.push(session);
      }
    }
    return sessions;
  }
}

export async function parseSessionFile(
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

  const sessionId = path.basename(filePath, ".jsonl");
  let cwd: string | null = null;
  let title: string | null = null;
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
      continue; // línea a medio escribir (sesión en vivo)
    }
    if (entry.cwd && !cwd) cwd = entry.cwd;
    if (entry.type === "summary" && typeof entry.summary === "string") {
      title = truncate(entry.summary, 120);
      continue;
    }
    if (typeof entry.timestamp === "string") {
      if (!startedAt) startedAt = entry.timestamp;
      endedAt = entry.timestamp;
    }
    if (entry.type === "user") {
      const content = entry.message?.content;
      messageCount++;
      if (!firstPrompt && entry.userType === "external") {
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .filter((c: any) => c.type === "text")
                  .map((c: any) => c.text)
                  .join(" ")
              : "";
        // ignorar salidas de comandos y mensajes sintéticos
        if (text && !text.startsWith("<") && !text.startsWith("Caveat:")) {
          firstPrompt = truncate(text);
        }
      }
    } else if (entry.type === "assistant") {
      messageCount++;
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use") {
            toolUseCount++;
            const fp = block.input?.file_path;
            if (typeof fp === "string" && ["Edit", "Write", "NotebookEdit"].includes(block.name)) {
              filesTouched.add(fp);
            }
          }
        }
      }
    }
  }

  if (messageCount === 0) return null;
  const project = matchProject(cwd, projects);
  if (!project) return null;

  return {
    id: `claude:${sessionId}`,
    agent: "claude",
    sessionId,
    projectId: project.id,
    title: title ?? (firstPrompt ? truncate(firstPrompt, 120) : null),
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
