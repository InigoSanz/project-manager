import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type Database from "better-sqlite3";
import type { AgentSession } from "@nebula/shared";
import { LIVE_WINDOW_MS, matchProject, truncate, type AgentProvider, type KnownProject } from "./types.js";
import { closeCopy, folderFromWorkspaceJson, openCopy, readKV, toIso } from "./vscdb.js";

const CURSOR_USER = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Cursor", "User");
const CURSOR_CLI_CHATS = path.join(os.homedir(), ".cursor", "chats");

/**
 * Cursor guarda los chats en SQLite:
 *  - IDE: workspaceStorage/<hash>/state.vscdb (ItemTable, clave composer.composerData)
 *    + globalStorage/state.vscdb (cursorDiskKV, claves composerData:<id>)
 *    El mapeo hash → repo sale de workspaceStorage/<hash>/workspace.json.
 *  - CLI (cursor-agent): ~/.cursor/chats/<hash>/<chatId>/store.db
 * Se lee siempre sobre una copia temporal para no bloquear la BD si Cursor está abierto.
 */
export class CursorProvider implements AgentProvider {
  readonly kind = "cursor" as const;

  watchPaths(): string[] {
    const paths: string[] = [];
    const ws = path.join(CURSOR_USER, "workspaceStorage");
    if (fs.existsSync(ws)) paths.push(ws);
    if (fs.existsSync(CURSOR_CLI_CHATS)) paths.push(CURSOR_CLI_CHATS);
    return paths;
  }

  async collect(projects: KnownProject[]): Promise<AgentSession[]> {
    return [...collectFromIde(projects), ...collectFromCli(projects)];
  }
}

function collectFromIde(projects: KnownProject[]): AgentSession[] {
  const wsRoot = path.join(CURSOR_USER, "workspaceStorage");
  if (!fs.existsSync(wsRoot)) return [];
  const sessions: AgentSession[] = [];

  // BD global con el contenido de cada composer (mensajes)
  const globalDbPath = path.join(CURSOR_USER, "globalStorage", "state.vscdb");
  const globalDb = fs.existsSync(globalDbPath) ? openCopy(globalDbPath) : null;

  try {
    for (const hash of fs.readdirSync(wsRoot)) {
      const wsDir = path.join(wsRoot, hash);
      const folder = folderFromWorkspaceJson(wsDir);
      const project = matchProject(folder, projects);
      if (!project) continue;

      const stateDbPath = path.join(wsDir, "state.vscdb");
      if (!fs.existsSync(stateDbPath)) continue;
      const db = openCopy(stateDbPath);
      if (!db) continue;
      try {
        const raw = readKV(db, "ItemTable", "composer.composerData");
        if (!raw) continue;
        let composers: any[] = [];
        try {
          composers = JSON.parse(raw).allComposers ?? [];
        } catch {
          continue;
        }
        for (const c of composers) {
          if (!c?.composerId) continue;
          const detail = globalDb ? readComposerDetail(globalDb, String(c.composerId)) : null;
          const createdAt = toIso(c.createdAt);
          const updatedAt = toIso(c.lastUpdatedAt);
          sessions.push({
            id: `cursor:${c.composerId}`,
            agent: "cursor",
            sessionId: String(c.composerId),
            projectId: project.id,
            title: c.name ? truncate(String(c.name), 120) : null,
            firstPrompt: detail?.firstPrompt ?? null,
            startedAt: createdAt,
            endedAt: updatedAt,
            messageCount: detail?.messageCount ?? 0,
            toolUseCount: detail?.toolUseCount ?? 0,
            filesTouched: detail?.filesTouched ?? [],
            status:
              updatedAt && Date.now() - Date.parse(updatedAt) < LIVE_WINDOW_MS ? "live" : "done",
            sourcePath: stateDbPath,
          });
        }
      } finally {
        closeCopy(db);
      }
    }
  } catch {
    /* estructura inesperada: mejor vacío que romper */
  } finally {
    if (globalDb) closeCopy(globalDb);
  }
  return sessions;
}

function readComposerDetail(
  globalDb: Database.Database,
  composerId: string,
): { firstPrompt: string | null; messageCount: number; toolUseCount: number; filesTouched: string[] } | null {
  const raw = readKV(globalDb, "cursorDiskKV", `composerData:${composerId}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const conversation: any[] = data.conversation ?? [];
    let firstPrompt: string | null = null;
    let messageCount = 0;
    let toolUseCount = 0;
    const filesTouched = new Set<string>();
    for (const bubble of conversation) {
      // type 1 = usuario, 2 = asistente
      if (bubble?.type === 1 || bubble?.type === 2) messageCount++;
      if (bubble?.type === 1 && !firstPrompt && typeof bubble.text === "string" && bubble.text.trim()) {
        firstPrompt = truncate(bubble.text);
      }
      if (bubble?.toolFormerData || bubble?.capabilityType === 15) toolUseCount++;
      const files = bubble?.context?.fileSelections ?? [];
      for (const f of files) {
        const p = f?.uri?.fsPath ?? f?.uri?.path;
        if (typeof p === "string") filesTouched.add(p);
      }
    }
    return { firstPrompt, messageCount, toolUseCount, filesTouched: [...filesTouched].slice(0, 50) };
  } catch {
    return null;
  }
}

/** cursor-agent CLI: ~/.cursor/chats/<hash-workspace>/<chatId>/store.db */
function collectFromCli(projects: KnownProject[]): AgentSession[] {
  if (!fs.existsSync(CURSOR_CLI_CHATS)) return [];
  const sessions: AgentSession[] = [];
  try {
    for (const wsHash of fs.readdirSync(CURSOR_CLI_CHATS)) {
      const wsDir = path.join(CURSOR_CLI_CHATS, wsHash);
      let chatIds: string[];
      try {
        chatIds = fs.readdirSync(wsDir);
      } catch {
        continue;
      }
      for (const chatId of chatIds) {
        const dbPath = path.join(wsDir, chatId, "store.db");
        if (!fs.existsSync(dbPath)) continue;
        const session = parseCliChat(dbPath, chatId, projects);
        if (session) sessions.push(session);
      }
    }
  } catch {
    /* mejor vacío que romper */
  }
  return sessions;
}

function parseCliChat(dbPath: string, chatId: string, projects: KnownProject[]): AgentSession | null {
  const stat = fs.statSync(dbPath);
  const db = openCopy(dbPath);
  if (!db) return null;
  try {
    // esquema no documentado: buscar metadatos en tablas key/value conocidas
    let cwd: string | null = null;
    let title: string | null = null;
    let firstPrompt: string | null = null;
    let messageCount = 0;

    for (const table of ["meta", "kv", "ItemTable", "blobs"]) {
      try {
        const rows = db.prepare(`SELECT * FROM ${table} LIMIT 200`).all() as any[];
        for (const row of rows) {
          const text = Object.values(row)
            .map((v) => (typeof v === "string" ? v : Buffer.isBuffer(v) ? v.toString("utf8") : ""))
            .join(" ");
          if (!cwd) {
            const m = text.match(/"(?:cwd|workspacePath|rootPath)"\s*:\s*"([^"]+)"/);
            if (m) cwd = m[1].replace(/\\\\/g, "\\");
          }
          if (!title) {
            const m = text.match(/"(?:title|name)"\s*:\s*"([^"]{4,120})"/);
            if (m) title = m[1];
          }
          if (!firstPrompt) {
            const m = text.match(/"text"\s*:\s*"([^"]{4,400})"/);
            if (m) firstPrompt = truncate(m[1]);
          }
          messageCount += (text.match(/"role"\s*:\s*"(?:user|assistant)"/g) ?? []).length;
        }
      } catch {
        /* tabla inexistente */
      }
    }

    const project = matchProject(cwd, projects);
    if (!project) return null;
    return {
      id: `cursor:cli:${chatId}`,
      agent: "cursor",
      sessionId: chatId,
      projectId: project.id,
      title: title ? truncate(title, 120) : firstPrompt ? truncate(firstPrompt, 120) : null,
      firstPrompt,
      startedAt: toIso(stat.birthtimeMs),
      endedAt: toIso(stat.mtimeMs),
      messageCount,
      toolUseCount: 0,
      filesTouched: [],
      status: Date.now() - stat.mtimeMs < LIVE_WINDOW_MS ? "live" : "done",
      sourcePath: dbPath,
    };
  } catch {
    return null;
  } finally {
    closeCopy(db);
  }
}

