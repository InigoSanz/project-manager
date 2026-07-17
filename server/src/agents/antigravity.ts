import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentSession } from "@nebula/shared";
import { LIVE_WINDOW_MS, matchProject, truncate, type AgentProvider, type KnownProject } from "./types.js";
import { closeCopy, folderFromWorkspaceJson, openCopy, scanKV, toIso } from "./vscdb.js";

const ANTIGRAVITY_USER = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
  "Antigravity",
  "User",
);
const ANTIGRAVITY_HOME = path.join(os.homedir(), ".antigravity");

/**
 * Google Antigravity es un fork de VSCode: el estado local vive en
 * %APPDATA%\Antigravity\User (workspaceStorage/<hash>/workspace.json +
 * state.vscdb, y globalStorage/state.vscdb). El esquema exacto de las
 * sesiones de agente no está documentado, así que la extracción es
 * defensiva: se buscan en las tablas KV estructuras JSON con pinta de
 * conversación/agente y se normalizan con lo que haya (id, título, fechas,
 * nº de mensajes). Además, si existe ~/.antigravity con JSON/JSONL de
 * sesiones CLI, se parsean de forma genérica por su campo cwd.
 */
export class AntigravityProvider implements AgentProvider {
  readonly kind = "antigravity" as const;

  watchPaths(): string[] {
    const paths: string[] = [];
    const ws = path.join(ANTIGRAVITY_USER, "workspaceStorage");
    if (fs.existsSync(ws)) paths.push(ws);
    if (fs.existsSync(ANTIGRAVITY_HOME)) paths.push(ANTIGRAVITY_HOME);
    return paths;
  }

  async collect(projects: KnownProject[]): Promise<AgentSession[]> {
    return [...collectFromIde(projects), ...collectFromHome(projects)];
  }
}

/** Claves KV que suelen contener datos de chats/agentes en forks de VSCode. */
const KEY_HINTS = ["chat", "agent", "cascade", "conversation", "composer", "session", "trajectory"];

function collectFromIde(projects: KnownProject[]): AgentSession[] {
  const wsRoot = path.join(ANTIGRAVITY_USER, "workspaceStorage");
  if (!fs.existsSync(wsRoot)) return [];
  const sessions: AgentSession[] = [];

  try {
    for (const hash of fs.readdirSync(wsRoot)) {
      const wsDir = path.join(wsRoot, hash);
      const folder = folderFromWorkspaceJson(wsDir);
      const project = matchProject(folder, projects);
      if (!project) continue;

      const stateDbPath = path.join(wsDir, "state.vscdb");
      if (!fs.existsSync(stateDbPath)) continue;
      const mtimeMs = fs.statSync(stateDbPath).mtimeMs;
      const db = openCopy(stateDbPath);
      if (!db) continue;
      try {
        for (const { key, value } of scanKV(db)) {
          const k = key.toLowerCase();
          if (!KEY_HINTS.some((h) => k.includes(h))) continue;
          for (const conv of extractConversations(value)) {
            sessions.push({
              id: `antigravity:${conv.id}`,
              agent: "antigravity",
              sessionId: conv.id,
              projectId: project.id,
              title: conv.title,
              firstPrompt: conv.firstPrompt,
              startedAt: conv.startedAt,
              endedAt: conv.endedAt ?? toIso(mtimeMs),
              messageCount: conv.messageCount,
              toolUseCount: conv.toolUseCount,
              filesTouched: [],
              status: Date.now() - mtimeMs < LIVE_WINDOW_MS ? "live" : "done",
              sourcePath: stateDbPath,
            });
          }
        }
      } finally {
        closeCopy(db);
      }
    }
  } catch {
    /* estructura inesperada: mejor vacío que romper */
  }
  // el mismo id puede aparecer bajo varias claves: deduplicar quedándonos con el más rico
  const byId = new Map<string, AgentSession>();
  for (const s of sessions) {
    const prev = byId.get(s.id);
    if (!prev || s.messageCount > prev.messageCount) byId.set(s.id, s);
  }
  return [...byId.values()];
}

interface ExtractedConv {
  id: string;
  title: string | null;
  firstPrompt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
  toolUseCount: number;
}

/** Busca objetos con pinta de conversación dentro de un valor KV JSON. */
function extractConversations(raw: string): ExtractedConv[] {
  if (!raw || raw.length < 20) return [];
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: ExtractedConv[] = [];
  const candidates: any[] = [];
  const visit = (node: any, depth: number): void => {
    if (!node || typeof node !== "object" || depth > 4) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 200)) visit(item, depth + 1);
      return;
    }
    const id = node.id ?? node.conversationId ?? node.sessionId ?? node.composerId ?? node.trajectoryId;
    const hasChatShape =
      id && (node.messages || node.conversation || node.turns || node.name || node.title || node.summary);
    if (hasChatShape) candidates.push(node);
    for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(data, 0);

  for (const c of candidates.slice(0, 100)) {
    const msgs: any[] = c.messages ?? c.conversation ?? c.turns ?? [];
    let firstPrompt: string | null = null;
    let toolUseCount = 0;
    for (const m of Array.isArray(msgs) ? msgs : []) {
      const role = m?.role ?? m?.type;
      const text = typeof m?.text === "string" ? m.text : typeof m?.content === "string" ? m.content : "";
      if (!firstPrompt && (role === "user" || role === 1) && text.trim()) firstPrompt = truncate(text);
      if (m?.toolCall || m?.toolCalls || m?.functionCall) toolUseCount++;
    }
    out.push({
      id: String(c.id ?? c.conversationId ?? c.sessionId ?? c.composerId ?? c.trajectoryId),
      title: c.title ?? c.name ?? c.summary ? truncate(String(c.title ?? c.name ?? c.summary), 120) : null,
      firstPrompt,
      startedAt: toIso(c.createdAt ?? c.startTime ?? c.created),
      endedAt: toIso(c.lastUpdatedAt ?? c.updatedAt ?? c.endTime),
      messageCount: Array.isArray(msgs) ? msgs.length : 0,
      toolUseCount,
    });
  }
  return out;
}

/** ~/.antigravity: posibles sesiones CLI en JSON/JSONL con campo cwd. */
function collectFromHome(projects: KnownProject[]): AgentSession[] {
  if (!fs.existsSync(ANTIGRAVITY_HOME)) return [];
  const sessions: AgentSession[] = [];
  const stack = [{ dir: ANTIGRAVITY_HOME, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 4) stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      if (!/\.(jsonl?|json)$/i.test(e.name)) continue;
      const session = parseHomeFile(full, projects);
      if (session) sessions.push(session);
    }
  }
  return sessions;
}

function parseHomeFile(filePath: string, projects: KnownProject[]): AgentSession | null {
  let stat: fs.Stats;
  let raw: string;
  try {
    stat = fs.statSync(filePath);
    if (stat.size === 0 || stat.size > 64 * 1024 * 1024) return null;
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const cwdMatch = raw.match(/"(?:cwd|workspacePath|projectPath|rootPath)"\s*:\s*"([^"]+)"/);
  const project = matchProject(cwdMatch ? cwdMatch[1].replace(/\\\\/g, "\\") : null, projects);
  if (!project) return null;

  const userMsgs = raw.match(/"role"\s*:\s*"user"/g)?.length ?? 0;
  const modelMsgs = raw.match(/"role"\s*:\s*"(?:model|assistant)"/g)?.length ?? 0;
  if (userMsgs + modelMsgs === 0) return null;
  const firstText = raw.match(/"(?:text|content|message)"\s*:\s*"([^"]{4,400})"/);
  const sessionId = path.basename(filePath).replace(/\.(jsonl?|json)$/i, "");

  return {
    id: `antigravity:cli:${sessionId}`,
    agent: "antigravity",
    sessionId,
    projectId: project.id,
    title: firstText ? truncate(firstText[1], 120) : null,
    firstPrompt: firstText ? truncate(firstText[1]) : null,
    startedAt: stat.birthtime.toISOString(),
    endedAt: stat.mtime.toISOString(),
    messageCount: userMsgs + modelMsgs,
    toolUseCount: raw.match(/"(?:toolCall|functionCall|tool_use)"/g)?.length ?? 0,
    filesTouched: [],
    status: Date.now() - stat.mtimeMs < LIVE_WINDOW_MS ? "live" : "done",
    sourcePath: filePath,
  };
}
