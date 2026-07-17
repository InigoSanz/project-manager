import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { AgentSession } from "@nebula/shared";
import {
  matchProject,
  statusFromMtime,
  truncate,
  type AgentProvider,
  type KnownProject,
  type SessionCache,
} from "./types.js";

const GEMINI_TMP = path.join(os.homedir(), ".gemini", "tmp");

/** Herramientas de Gemini CLI que escriben ficheros. */
const WRITE_TOOLS = new Set(["write_file", "replace", "edit", "create_file", "smart_edit"]);

/**
 * Gemini CLI guarda las sesiones en ~/.gemini/tmp/<hash-proyecto>/chats/
 * (el hash es sha256 de la ruta raíz del proyecto). Convive el formato JSON
 * clásico ({ messages: [...] } o checkpoint-*.json con array de turnos) y el
 * JSONL del ChatRecordingService ({type:"session_metadata"} + {type:"user"|"gemini"}).
 */
export class GeminiProvider implements AgentProvider {
  readonly kind = "gemini" as const;

  watchPaths(): string[] {
    return fs.existsSync(GEMINI_TMP) ? [GEMINI_TMP] : [];
  }

  async collect(projects: KnownProject[], cache?: SessionCache): Promise<AgentSession[]> {
    if (!fs.existsSync(GEMINI_TMP)) return [];
    const byHash = hashIndex(projects);
    const sessions: AgentSession[] = [];

    for (const hashDir of fs.readdirSync(GEMINI_TMP)) {
      const project = byHash.get(hashDir.toLowerCase()) ?? null;
      const chatsDir = path.join(GEMINI_TMP, hashDir, "chats");
      let files: string[];
      try {
        files = fs.readdirSync(chatsDir).filter((f) => f.endsWith(".json") || f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of files) {
        const filePath = path.join(chatsDir, file);
        const session = await withCacheGemini(filePath, project, projects, cache);
        if (session) sessions.push(session);
      }
    }
    return sessions;
  }
}

/** sha256 de la ruta del proyecto en sus variantes habituales de normalización. */
function hashIndex(projects: KnownProject[]): Map<string, KnownProject> {
  const map = new Map<string, KnownProject>();
  for (const p of projects) {
    const variants = new Set([
      p.path,
      p.path.replace(/\\/g, "/"),
      p.path.toLowerCase(),
      p.path.replace(/\\/g, "/").toLowerCase(),
    ]);
    for (const v of variants) {
      map.set(crypto.createHash("sha256").update(v).digest("hex").toLowerCase(), p);
    }
  }
  return map;
}

async function withCacheGemini(
  filePath: string,
  project: KnownProject | null,
  projects: KnownProject[],
  cache?: SessionCache,
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
  const session = parseGeminiSession(filePath, stat, project, projects);
  cache?.put(filePath, stat.mtimeMs, stat.size, session);
  return session;
}

export function parseGeminiSession(
  filePath: string,
  stat: fs.Stats,
  project: KnownProject | null,
  projects: KnownProject[],
): AgentSession | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (!raw.trim()) return null;

  interface Acc {
    sessionId: string | null;
    cwd: string | null;
    startedAt: string | null;
    endedAt: string | null;
    firstPrompt: string | null;
    messageCount: number;
    toolUseCount: number;
    filesTouched: Set<string>;
  }
  const acc: Acc = {
    sessionId: null,
    cwd: null,
    startedAt: null,
    endedAt: null,
    firstPrompt: null,
    messageCount: 0,
    toolUseCount: 0,
    filesTouched: new Set(),
  };

  const handleMessage = (m: any): void => {
    const role = m.role ?? m.type;
    const isUser = role === "user";
    const isModel = role === "model" || role === "gemini" || role === "assistant";
    if (!isUser && !isModel) return;
    acc.messageCount++;
    const ts = m.timestamp ?? m.time ?? null;
    if (typeof ts === "string") {
      if (!acc.startedAt) acc.startedAt = ts;
      acc.endedAt = ts;
    }
    const parts: any[] = Array.isArray(m.parts) ? m.parts : Array.isArray(m.content) ? m.content : [];
    let text = typeof m.content === "string" ? m.content : typeof m.text === "string" ? m.text : "";
    for (const part of parts) {
      if (typeof part?.text === "string") text += (text ? " " : "") + part.text;
      const fc = part?.functionCall ?? part?.toolCall;
      if (fc) {
        acc.toolUseCount++;
        const args = fc.args ?? fc.arguments ?? {};
        const fp = args.file_path ?? args.path ?? args.absolute_path;
        if (typeof fp === "string" && WRITE_TOOLS.has(String(fc.name ?? ""))) acc.filesTouched.add(fp);
      }
    }
    // formato JSONL nuevo: toolCalls al nivel del mensaje
    for (const tc of Array.isArray(m.toolCalls) ? m.toolCalls : []) {
      acc.toolUseCount++;
      const fp = tc?.args?.file_path ?? tc?.args?.path;
      if (typeof fp === "string" && WRITE_TOOLS.has(String(tc.name ?? ""))) acc.filesTouched.add(fp);
    }
    if (isUser && !acc.firstPrompt && text.trim() && !text.startsWith("<")) {
      acc.firstPrompt = truncate(text);
    }
  };

  const handleEntry = (entry: any): void => {
    if (!entry || typeof entry !== "object") return;
    if (entry.type === "session_metadata" || entry.sessionId || entry.projectHash) {
      acc.sessionId = acc.sessionId ?? entry.sessionId ?? entry.payload?.sessionId ?? null;
      const meta = entry.payload ?? entry;
      if (typeof meta.projectPath === "string") acc.cwd = meta.projectPath;
      if (typeof meta.cwd === "string") acc.cwd = meta.cwd;
      if (typeof meta.startTime === "string" && !acc.startedAt) acc.startedAt = meta.startTime;
      if (typeof meta.lastUpdated === "string") acc.endedAt = meta.lastUpdated;
    }
    if (Array.isArray(entry.messages)) {
      for (const m of entry.messages) handleMessage(m);
    } else if (entry.type || entry.role) {
      handleMessage(entry);
    }
  };

  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) for (const item of data) handleEntry(item);
    else handleEntry(data);
  } catch {
    // JSONL: una entrada por línea
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        handleEntry(JSON.parse(line));
      } catch {
        /* línea a medio escribir */
      }
    }
  }

  if (acc.messageCount === 0) return null;
  const matched = project ?? matchProject(acc.cwd, projects);
  if (!matched) return null;

  const sessionId = acc.sessionId ?? path.basename(filePath).replace(/\.(jsonl?|json)$/i, "");
  return {
    id: `gemini:${sessionId}`,
    agent: "gemini",
    sessionId,
    projectId: matched.id,
    title: acc.firstPrompt ? truncate(acc.firstPrompt, 120) : null,
    firstPrompt: acc.firstPrompt,
    startedAt: acc.startedAt ?? stat.birthtime.toISOString(),
    endedAt: acc.endedAt ?? stat.mtime.toISOString(),
    messageCount: acc.messageCount,
    toolUseCount: acc.toolUseCount,
    filesTouched: [...acc.filesTouched].slice(0, 50),
    status: statusFromMtime(stat.mtimeMs),
    sourcePath: filePath,
  };
}
