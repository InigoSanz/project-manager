import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { NebulaConfig } from "@nebula/shared";
import { analyzeProject } from "../analyzer/index.js";
import { getStatus, getRemoteUrl } from "../git/index.js";
import type { ProjectStore } from "../projects/store.js";

/** Busca directorios con .git bajo las raíces configuradas. */
export function discoverRepos(cfg: NebulaConfig): string[] {
  const repos: string[] = [];
  const seen = new Set<string>();
  for (const root of cfg.roots) {
    if (!fs.existsSync(root)) continue;
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    while (stack.length > 0) {
      const { dir, depth } = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      const isRepo = entries.some((e) => e.name === ".git");
      if (isRepo) {
        const norm = path.resolve(dir);
        if (!seen.has(norm.toLowerCase())) {
          seen.add(norm.toLowerCase());
          repos.push(norm);
        }
        continue; // no buscar repos anidados
      }
      if (depth >= cfg.scanDepth) continue;
      for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue;
        if (cfg.excludes.includes(e.name) || e.name.startsWith(".")) continue;
        stack.push({ dir: path.join(dir, e.name), depth: depth + 1 });
      }
    }
  }
  return repos;
}

export interface ScannerEvents {
  onProjectUpdated: (projectId: string) => void;
  onProjectsChanged: () => void;
  onScanState: (scanning: boolean) => void;
}

export class Scanner {
  private rootWatcher: FSWatcher | null = null;
  private gitWatcher: FSWatcher | null = null;
  private debounce = new Map<string, NodeJS.Timeout>();
  private analyzing = new Set<string>();

  constructor(
    private store: ProjectStore,
    private cfg: NebulaConfig,
    private events: ScannerEvents,
  ) {}

  /** Escaneo completo: descubre repos, analiza cada uno y actualiza la BD. */
  async fullScan(): Promise<void> {
    this.events.onScanState(true);
    try {
      const found = discoverRepos(this.cfg);
      const foundIds = new Set<string>();
      for (const repo of found) foundIds.add(this.store.upsert(repo));
      const missing = this.store.allRows().filter((r) => !foundIds.has(r.id));
      this.store.markMissing(missing.map((r) => r.id));

      // Analizar en serie (I/O bound, evita saturar el disco)
      for (const repo of found) {
        await this.analyzeOne(repo);
      }
      this.events.onProjectsChanged();
    } finally {
      this.events.onScanState(false);
    }
  }

  async analyzeOne(repoPath: string): Promise<void> {
    const id = this.store.upsert(repoPath);
    if (this.analyzing.has(id)) return;
    this.analyzing.add(id);
    try {
      const [analysis, git, remoteUrl] = await Promise.all([
        analyzeProject(repoPath, this.cfg.excludes, this.store.agentActivityScore(id)),
        getStatus(repoPath).catch(() => null),
        getRemoteUrl(repoPath).catch(() => null),
      ]);
      if (git) this.store.saveAnalysis(id, analysis, git);
      this.store.saveRemoteUrl(id, remoteUrl);
      this.events.onProjectUpdated(id);
    } catch (err) {
      console.error(`[scanner] error analizando ${repoPath}:`, err);
    } finally {
      this.analyzing.delete(id);
    }
  }

  /** Refresco barato: solo git status (para cambios del working tree). */
  async refreshGit(repoPath: string): Promise<void> {
    const id = this.store.upsert(repoPath);
    try {
      const git = await getStatus(repoPath);
      this.store.saveGit(id, git);
      this.events.onProjectUpdated(id);
    } catch {
      /* repo desaparecido o bloqueado */
    }
  }

  /** Watchers desatendidos: raíces (repos nuevos/borrados) + señales de .git. */
  startWatching(): void {
    this.stopWatching();

    // Detección de repos nuevos o eliminados en las raíces
    this.rootWatcher = chokidar.watch(this.cfg.roots.filter((r) => fs.existsSync(r)), {
      depth: this.cfg.scanDepth,
      ignoreInitial: true,
      persistent: true,
      ignorePermissionErrors: true,
      ignored: (p) => {
        const base = path.basename(p);
        return this.cfg.excludes.includes(base) || (base.startsWith(".") && base !== ".git");
      },
    });
    this.rootWatcher.on("error", (err) => console.warn("[scanner] watcher raíces:", (err as Error).message));
    this.rootWatcher.on("addDir", (p) => {
      if (path.basename(p) === ".git") {
        const repo = path.dirname(p);
        this.debounced(`new:${repo}`, async () => {
          await this.analyzeOne(repo);
          this.watchRepoGit(repo);
          this.events.onProjectsChanged();
        });
      }
    });
    this.rootWatcher.on("unlinkDir", (p) => {
      if (path.basename(p) === ".git") {
        this.debounced("rescan", () => this.fullScan());
      }
    });

    // Cambios en cada repo: working tree (con exclusiones) + señales de .git
    this.gitWatcher = chokidar.watch([], {
      persistent: true,
      ignoreInitial: true,
      ignorePermissionErrors: true,
      // los locks de git aparecen/desaparecen en ms; esperar a que se asienten
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      ignored: (p, stats) => this.shouldIgnoreRepoPath(p, stats),
    });
    this.gitWatcher.on("error", (err) => console.warn("[scanner] watcher git:", (err as Error).message));
    this.gitWatcher.on("all", (_event, p) => {
      const repo = this.repoForPath(p);
      if (!repo) return;
      this.debounced(`git:${repo}`, () => this.refreshGit(repo));
    });
    this.watchedRepos = [];
    for (const { path: repoPath } of this.store.allRows()) {
      this.watchRepoGit(repoPath);
    }
  }

  private watchedRepos: string[] = [];

  private watchRepoGit(repoPath: string): void {
    if (!this.gitWatcher) return;
    if (!fs.existsSync(path.join(repoPath, ".git"))) return;
    this.watchedRepos.push(path.resolve(repoPath));
    this.gitWatcher.add(repoPath);
  }

  /** Dentro de .git solo interesan HEAD, index y refs; fuera, aplicar excludes. */
  private shouldIgnoreRepoPath(p: string, stats?: fs.Stats): boolean {
    if (p.endsWith(".lock")) return true; // locks transitorios de git: jamás vigilarlos
    const marker = `${path.sep}.git${path.sep}`;
    const gitIdx = p.lastIndexOf(marker);
    if (gitIdx > 0) {
      const rel = p.slice(gitIdx + marker.length);
      return !(rel === "HEAD" || rel === "index" || rel === "refs" || rel.startsWith(`refs${path.sep}`));
    }
    const base = path.basename(p);
    if (base === ".git") return false; // el propio directorio .git sí se recorre
    if (this.cfg.excludes.includes(base)) return true;
    return base.startsWith(".") && (stats?.isDirectory() ?? false);
  }

  private repoForPath(p: string): string | null {
    const norm = path.resolve(p);
    for (const repo of this.watchedRepos) {
      if (norm === repo || norm.startsWith(repo + path.sep)) return repo;
    }
    return null;
  }

  private debounced(key: string, fn: () => void | Promise<void>, ms = 600): void {
    clearTimeout(this.debounce.get(key));
    this.debounce.set(
      key,
      setTimeout(() => {
        this.debounce.delete(key);
        void fn();
      }, ms),
    );
  }

  stopWatching(): void {
    void this.rootWatcher?.close();
    void this.gitWatcher?.close();
    this.rootWatcher = null;
    this.gitWatcher = null;
  }
}
