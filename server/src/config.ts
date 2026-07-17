import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { NebulaConfig } from "@nebula/shared";

export const NEBULA_HOME = path.join(os.homedir(), ".nebula");
const CONFIG_PATH = path.join(NEBULA_HOME, "config.json");

const DEFAULTS: NebulaConfig = {
  roots: [],
  scanDepth: 2,
  excludes: ["node_modules", ".git", "dist", "build", "out", "vendor", ".venv", "venv", "__pycache__", "target", "bin", "obj", ".next", ".nuxt", "coverage"],
  autoFetchMinutes: 0,
  port: 4816,
  lanAccess: false,
};

/**
 * Primera ejecución sin config: deduce raíces a partir de las sesiones de
 * Claude Code (los .jsonl de ~/.claude/projects contienen el cwd real).
 */
export function suggestRoots(): string[] {
  const roots = new Set<string>();
  const claudeProjects = path.join(os.homedir(), ".claude", "projects");
  try {
    for (const dir of fs.readdirSync(claudeProjects)) {
      const full = path.join(claudeProjects, dir);
      let files: string[];
      try {
        files = fs.readdirSync(full).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of files) {
        const cwd = extractCwd(path.join(full, file));
        if (cwd && fs.existsSync(cwd)) {
          roots.add(path.dirname(cwd));
          break;
        }
      }
    }
  } catch {
    /* sin Claude Code instalado */
  }
  return [...roots].filter((r) => fs.existsSync(r));
}

function extractCwd(jsonlPath: string): string | null {
  try {
    const fd = fs.openSync(jsonlPath, "r");
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    for (const line of buf.toString("utf8", 0, n).split("\n")) {
      try {
        const obj = JSON.parse(line);
        if (typeof obj.cwd === "string") return obj.cwd;
      } catch {
        /* línea parcial o corrupta */
      }
    }
  } catch {
    /* ignorar */
  }
  return null;
}

export function loadConfig(): NebulaConfig {
  fs.mkdirSync(NEBULA_HOME, { recursive: true });
  let raw: string | null = null;
  try {
    // tolerar BOM: PowerShell 5 y el Bloc de notas guardan UTF-8 con BOM
    raw = fs.readFileSync(CONFIG_PATH, "utf8").replace(/^﻿/, "");
  } catch {
    /* no existe: primera ejecución */
  }
  if (raw === null) {
    const cfg = { ...DEFAULTS, roots: suggestRoots() };
    saveConfig(cfg);
    return cfg;
  }
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    // config corrupta: NUNCA sobrescribirla (el usuario podría perder sus ajustes);
    // usar defaults en memoria y avisar
    console.warn(`[config] ~/.nebula/config.json ilegible (${(err as Error).message}) — usando valores por defecto`);
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg: NebulaConfig): void {
  fs.mkdirSync(NEBULA_HOME, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
