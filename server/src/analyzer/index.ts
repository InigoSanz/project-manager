import fs from "node:fs";
import path from "node:path";
import type {
  LanguageStat,
  PackageInfo,
  ProjectAnalysis,
  ProjectHealth,
  ProjectMetrics,
  ProjectTraits,
} from "@nebula/shared";
import { EXT_TO_LANG, IGNORED_FILES } from "./languages.js";
import { getCommitDates, getFirstLastCommit } from "../git/index.js";

const MAX_FILES = 20_000; // corte de seguridad para repos gigantes

interface WalkResult {
  langBytes: Map<string, { bytes: number; color: string }>;
  fileCount: number;
  totalBytes: number;
}

function walk(repo: string, excludes: string[]): WalkResult {
  const res: WalkResult = { langBytes: new Map(), fileCount: 0, totalBytes: 0 };
  const excludeSet = new Set(excludes.map((e) => e.toLowerCase()));
  const stack = [repo];
  while (stack.length > 0 && res.fileCount < MAX_FILES) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!excludeSet.has(e.name.toLowerCase()) && !e.name.startsWith(".")) stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      res.fileCount++;
      if (IGNORED_FILES.has(e.name.toLowerCase())) continue;
      const lang = EXT_TO_LANG[path.extname(e.name).toLowerCase()];
      if (!lang) continue;
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      res.totalBytes += size;
      const cur = res.langBytes.get(lang.name) ?? { bytes: 0, color: lang.color };
      cur.bytes += size;
      res.langBytes.set(lang.name, cur);
    }
  }
  return res;
}

/** Heurísticas de frameworks a partir de manifiestos. */
/**
 * Lee el package.json para lo que sirve *actuar*: los scripts lanzables y con
 * qué gestor. El fichero ya se parseaba para detectar frameworks, pero todo
 * esto se descartaba.
 */
function readPackageInfo(repo: string): PackageInfo | null {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return null; // no es un proyecto Node
  }
  const lockfiles: Array<[string, PackageInfo["packageManager"]]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ];
  let packageManager: PackageInfo["packageManager"] = "npm";
  for (const [file, manager] of lockfiles) {
    if (fs.existsSync(path.join(repo, file))) {
      packageManager = manager;
      break;
    }
  }
  // `packageManager: "pnpm@9"` del propio package.json manda sobre el lockfile
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : null;
  if (declared === "pnpm" || declared === "npm" || declared === "yarn" || declared === "bun") {
    packageManager = declared;
  }

  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? Object.keys(pkg.scripts) : [];
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    name: str(pkg.name),
    version: str(pkg.version),
    description: str(pkg.description),
    scripts,
    packageManager,
    monorepo: Array.isArray(pkg.workspaces) || fs.existsSync(path.join(repo, "pnpm-workspace.yaml")),
  };
}

/**
 * Señales de salud del repo. Ojo: `walk` se salta los directorios que empiezan
 * por punto, así que `.github` hay que mirarlo explícitamente aquí.
 */
function detectHealth(repo: string): ProjectHealth {
  const firstExisting = (names: string[]): string | null =>
    names.find((n) => fs.existsSync(path.join(repo, n))) ?? null;

  const ci: string[] = [];
  const workflows = path.join(repo, ".github", "workflows");
  try {
    for (const f of fs.readdirSync(workflows)) {
      if (f.endsWith(".yml") || f.endsWith(".yaml")) ci.push(`.github/workflows/${f}`);
    }
  } catch {
    /* sin workflows de GitHub */
  }
  for (const f of [".gitlab-ci.yml", "azure-pipelines.yml", "Jenkinsfile", ".circleci/config.yml"]) {
    if (fs.existsSync(path.join(repo, f))) ci.push(f);
  }

  // el framework de tests se deduce de las dependencias o de su config
  let tests: string | null = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as Record<string, unknown>;
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<string, string>;
    for (const t of ["vitest", "jest", "mocha", "playwright", "@playwright/test", "cypress", "ava"]) {
      if (deps[t]) {
        tests = t.replace("@playwright/test", "playwright");
        break;
      }
    }
  } catch {
    /* sin package.json */
  }
  if (!tests) {
    if (fs.existsSync(path.join(repo, "pytest.ini")) || fs.existsSync(path.join(repo, "tests"))) tests = "pytest";
    else if (fs.existsSync(path.join(repo, "karma.conf.js"))) tests = "karma";
  }

  return {
    readme: firstExisting(["README.md", "README.MD", "readme.md", "README", "README.txt"]),
    license: firstExisting(["LICENSE", "LICENSE.md", "LICENCE", "COPYING"]),
    ci,
    tests,
    envExample: fs.existsSync(path.join(repo, ".env.example")) || fs.existsSync(path.join(repo, ".env.sample")),
    envLocal: fs.existsSync(path.join(repo, ".env")),
  };
}

function detectFrameworks(repo: string): string[] {
  const found = new Set<string>();
  const pkgPath = path.join(repo, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
    const map: Record<string, string> = {
      react: "react",
      "react-native": "react-native",
      next: "nextjs",
      vue: "vue",
      nuxt: "nuxt",
      svelte: "svelte",
      "@angular/core": "angular",
      astro: "astro",
      express: "express",
      fastify: "fastify",
      hono: "hono",
      nestjs: "nestjs",
      "@nestjs/core": "nestjs",
      electron: "electron",
      "@tauri-apps/api": "tauri",
      three: "threejs",
      vite: "vite",
      tailwindcss: "tailwind",
    };
    for (const [dep, tag] of Object.entries(map)) if (deps[dep]) found.add(tag);
  } catch {
    /* sin package.json */
  }
  const checks: Array<[string, string]> = [
    ["Cargo.toml", "rust-crate"],
    ["go.mod", "go-module"],
    ["pyproject.toml", "python"],
    ["requirements.txt", "python"],
    ["manage.py", "django"],
    ["pom.xml", "maven"],
    ["build.gradle", "gradle"],
    ["build.gradle.kts", "gradle"],
    ["Dockerfile", "docker"],
    ["docker-compose.yml", "docker"],
    ["serverless.yml", "serverless"],
  ];
  for (const [file, tag] of checks) {
    if (fs.existsSync(path.join(repo, file))) found.add(tag);
  }
  try {
    for (const f of fs.readdirSync(repo)) {
      if (f.endsWith(".csproj") || f.endsWith(".sln")) found.add("dotnet");
    }
  } catch {
    /* ignorar */
  }
  return [...found];
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SHAPE_BY_FRAMEWORK: Array<[string, ProjectTraits["shape"]]> = [
  ["react", "sphere"],
  ["nextjs", "sphere"],
  ["vue", "torus"],
  ["svelte", "torus"],
  ["angular", "crystal"],
  ["dotnet", "crystal"],
  ["rust-crate", "crystal"],
  ["python", "cloud"],
  ["django", "cloud"],
  ["go-module", "rings"],
  ["docker", "rings"],
];

function computeTraits(
  name: string,
  repoPath: string,
  languages: LanguageStat[],
  frameworks: string[],
  metrics: ProjectMetrics,
  agentActivityScore: number,
): ProjectTraits {
  const seed = hashString(`${name}::${repoPath}`);
  // complexity: escala logarítmica de ficheros+bytes, saturando en repos grandes
  const complexity = Math.min(1, Math.log10(1 + metrics.fileCount) / 4.5 + Math.log10(1 + metrics.totalBytes) / 20);
  // energy: commits recientes (peso 0.7) + actividad de agentes (0.3)
  const commitScore = Math.min(1, metrics.commitsLast30d / 40);
  const energy = Math.min(1, commitScore * 0.7 + agentActivityScore * 0.3);
  const palette = languages.slice(0, 4).map((l) => l.color);
  if (palette.length === 0) palette.push("#6366f1");
  let shape: ProjectTraits["shape"] = "sphere";
  for (const [fw, s] of SHAPE_BY_FRAMEWORK) {
    if (frameworks.includes(fw)) {
      shape = s;
      break;
    }
  }
  return { seed, complexity, energy, palette, shape };
}

export async function analyzeProject(
  repoPath: string,
  excludes: string[],
  agentActivityScore = 0,
): Promise<ProjectAnalysis> {
  const name = path.basename(repoPath);
  const { langBytes, fileCount, totalBytes } = walk(repoPath, excludes);

  const totalLangBytes = [...langBytes.values()].reduce((a, b) => a + b.bytes, 0) || 1;
  const languages: LanguageStat[] = [...langBytes.entries()]
    .map(([lang, { bytes, color }]) => ({ name: lang, bytes, ratio: bytes / totalLangBytes, color }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const frameworks = detectFrameworks(repoPath);

  const [dates, firstLast] = await Promise.all([getCommitDates(repoPath, 30), getFirstLastCommit(repoPath)]);
  const histogram = new Array<number>(30).fill(0);
  const now = Date.now();
  for (const d of dates) {
    const daysAgo = Math.floor((now - Date.parse(d)) / 86_400_000);
    if (daysAgo >= 0 && daysAgo < 30) histogram[29 - daysAgo]++;
  }
  const metrics: ProjectMetrics = {
    fileCount,
    totalBytes,
    commitHistogram: histogram,
    commitsLast30d: dates.length,
    firstCommitAt: firstLast.first,
    lastCommitAt: firstLast.last,
  };

  const traits = computeTraits(name, repoPath, languages, frameworks, metrics, agentActivityScore);
  return {
    languages,
    frameworks,
    metrics,
    traits,
    pkg: readPackageInfo(repoPath),
    health: detectHealth(repoPath),
  };
}
