/** Contrato compartido entre el daemon (server) y la UI (web). */

// ---------- Proyectos ----------

export interface LanguageStat {
  /** Nombre del lenguaje, p. ej. "TypeScript" */
  name: string;
  /** Bytes de código de ese lenguaje */
  bytes: number;
  /** Porcentaje 0..1 sobre el total del repo */
  ratio: number;
  /** Color hex asociado (estilo linguist) */
  color: string;
}

export interface ProjectMetrics {
  fileCount: number;
  totalBytes: number;
  /** Commits por día de los últimos 30 días, índice 0 = hace 29 días, 29 = hoy */
  commitHistogram: number[];
  commitsLast30d: number;
  /** ISO date del primer commit (edad del repo) */
  firstCommitAt: string | null;
  lastCommitAt: string | null;
}

/** Datos del package.json que sirven para actuar (lanzar scripts, versión…). */
export interface PackageInfo {
  name: string | null;
  version: string | null;
  description: string | null;
  /** nombres de los scripts disponibles, en el orden del package.json */
  scripts: string[];
  /** gestor deducido del lockfile: pnpm | npm | yarn | bun */
  packageManager: "pnpm" | "npm" | "yarn" | "bun";
  /** el repo declara workspaces (monorepo) */
  monorepo: boolean;
}

/** Señales de salud del repo: lo que un desarrollador mira al llegar nuevo. */
export interface ProjectHealth {
  /** nombre del fichero README encontrado, o null */
  readme: string | null;
  license: string | null;
  /** ficheros de workflows de CI detectados (.github/workflows, etc.) */
  ci: string[];
  /** framework de tests detectado por dependencias/config */
  tests: string | null;
  /** hay un .env.example que documente la configuración */
  envExample: boolean;
  /** hay un .env real (nunca se lee su contenido) */
  envLocal: boolean;
}

export interface ProjectAnalysis {
  languages: LanguageStat[];
  /** Frameworks/tecnologías detectadas: "react", "fastify", "django"... */
  frameworks: string[];
  metrics: ProjectMetrics;
  /** Rasgos deterministas para el sistema visual */
  traits: ProjectTraits;
  /** package.json del repo; null si no es un proyecto Node */
  pkg?: PackageInfo | null;
  /** señales de salud del repositorio */
  health?: ProjectHealth;
}

/** Entrada del sistema de arte generativo. Determinista por repo. */
export interface ProjectTraits {
  /** Semilla estable derivada del nombre+path del repo */
  seed: number;
  /** 0..1 — tamaño/complejidad del código */
  complexity: number;
  /** 0..1 — actividad reciente (commits + sesiones de agentes) */
  energy: number;
  /** Colores hex dominantes por mezcla de lenguajes (1..4) */
  palette: string[];
  /** Familia visual según framework dominante */
  shape: "sphere" | "torus" | "crystal" | "cloud" | "rings";
}

export interface GitStatusSummary {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  clean: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string; // ISO
  refs: string[];
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
  lastCommitAt: string | null;
  subject: string | null;
}

/** Una línea de diff ya clasificada (el cliente no interpreta el formato). */
export interface GitDiffLine {
  kind: "hunk" | "add" | "del" | "context";
  text: string;
}

export interface GitFileDiff {
  path: string;
  staged: boolean;
  /** binario: no hay nada legible que mostrar */
  binary: boolean;
  /** se cortó por tamaño */
  truncated: boolean;
  lines: GitDiffLine[];
}

export interface GitDetail {
  status: GitStatusSummary;
  commits: GitCommit[];
  branches: GitBranch[];
  /** Ficheros modificados en el working tree: [estado, ruta] */
  changes: Array<{ state: string; path: string }>;
  remoteUrl: string | null;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  present: boolean;
  firstSeenAt: string;
  lastScanAt: string | null;
  analysis: ProjectAnalysis | null;
  git: GitStatusSummary | null;
  /** Resumen de agentes: sesiones totales y última actividad */
  agents: { total: number; lastActivityAt: string | null; byAgent: Record<string, number> };
  /** Nº de tareas abiertas (todo+doing) y sugeridas pendientes */
  tasks: { open: number; suggested: number };
  /** Clave de proyecto Jira asociada (ej. "PROJ"); null = sin asociar */
  jiraKey: string | null;
  /** Clave Jira propuesta por heurística, pendiente de confirmar */
  jiraKeySuggestion: string | null;
  /** URL del remoto `origin` tal cual la reporta git (puede ser SSH) */
  remoteUrl: string | null;
}

// ---------- Agentes ----------

export type AgentKind = "claude" | "codex" | "cursor" | "gemini" | "antigravity";

export interface AgentSession {
  /** `${agent}:${sessionId}` */
  id: string;
  agent: AgentKind;
  sessionId: string;
  projectId: string;
  title: string | null;
  firstPrompt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
  toolUseCount: number;
  filesTouched: string[];
  /** live = fichero creciendo recientemente */
  status: "live" | "done";
  sourcePath: string;
}

// ---------- Tareas ----------

export type TaskStatus = "suggested" | "todo" | "doing" | "done" | "dismissed";
export type TaskSource = "manual" | "agent" | "jira" | "planner" | "github";

export interface TaskItem {
  id: string;
  projectId: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  source: TaskSource;
  /** p.ej. id de AgentSession que la originó */
  sourceRef: string | null;
  createdAt: string;
  updatedAt: string;
  /** metadatos externos: { etag } de Planner, { syncError } si el write-back falló */
  externalMeta: { etag?: string; syncError?: string } | null;
  /** vencimiento en ISO YYYY-MM-DD; null = sin fecha */
  dueDate: string | null;
  /** 0 ninguna · 1 baja · 2 media · 3 alta */
  priority: 0 | 1 | 2 | 3;
}

/** Tarea agregada en la vista Hoy: incluye el nombre del proyecto. */
export interface TodayTask extends TaskItem {
  projectName: string | null;
}

export interface TodayData {
  doing: TodayTask[];
  todo: TodayTask[];
  suggested: TodayTask[];
  /** jira-inbox + planner-inbox + inbox personal */
  inbox: TodayTask[];
  /** repos que requieren atención git */
  attention: Array<{ projectId: string; name: string; reasons: string[] }>;
  /** sesiones de agentes en vivo ahora mismo */
  live: Array<{ projectId: string; projectName: string; agent: AgentKind; title: string | null }>;
}

// ---------- Integraciones ----------

export interface KnowledgeGraph {
  nodes: Array<{ id: string; label: string; type: string; group?: string }>;
  links: Array<{ source: string; target: string; type: string }>;
  generatedAt: string | null;
}

export interface ObsidianNote {
  vault: string;
  file: string; // ruta relativa en el vault
  title: string;
  /** obsidian://open?... */
  uri: string;
  mtime: string;
}

// ---------- Config ----------

export interface GitHubConfig {
  /** Personal Access Token (classic o fine-grained con acceso de lectura) */
  token: string;
}

export interface GitHubStatus {
  configured: boolean;
  ok: boolean;
  user: string | null;
  error: string | null;
  lastSyncAt: string | null;
  pullCount: number;
  issueCount: number;
}

/** Pull request abierta. No es una tarea: es un estado que se consulta. */
export interface PullRequest {
  id: number;
  number: number;
  title: string;
  url: string;
  /** `owner/repo` */
  repo: string;
  /** proyecto local al que corresponde, si se pudo emparejar por el remoto */
  projectId: string | null;
  draft: boolean;
  /** te han pedido revisarla */
  reviewRequested: boolean;
  /** la has abierto tú */
  mine: boolean;
  updatedAt: string;
}

export interface JiraConfig {
  mode: "cloud" | "server";
  /** https://miempresa.atlassian.net o URL del Jira on-premise */
  baseUrl: string;
  /** solo cloud: email de la cuenta Atlassian */
  email?: string;
  /** cloud: API token · server/DC: Personal Access Token */
  token: string;
  /** false = solo lectura: completar en Nebula no toca Jira (default true) */
  writeBack?: boolean;
}

export interface PlannerConfig {
  /** client_id de app registration propia; vacío = client público de Graph PowerShell */
  clientId?: string;
  /** false = solo lectura: completar en Nebula no toca Planner (default true) */
  writeBack?: boolean;
}

export interface NotificationEvents {
  /** issue/tarea externa nueva asignada a ti */
  newExternalTask: boolean;
  /** un agente termina una sesión con trabajo real */
  agentDone: boolean;
  /** aviso diario de tareas que vencen hoy */
  dueDigest: boolean;
}

export interface NebulaConfig {
  roots: string[];
  scanDepth: number;
  excludes: string[];
  /** minutos entre `git fetch` automáticos; 0 = desactivado */
  autoFetchMinutes: number;
  port: number;
  /** escuchar también en la red local (para abrir Nebula desde el móvil) */
  lanAccess: boolean;
  /** notificaciones nativas de Windows (tareas nuevas, agentes, vencimientos) */
  notifications: boolean;
  /** toggles finos por evento; ausente = todos activos */
  notificationEvents?: NotificationEvents;
  /** minutos entre syncs de Jira/Planner (default 10) */
  syncMinutes?: number;
  /** comando para abrir un proyecto en el editor (default "code") */
  editorCommand?: string;
  /** navegador para abrir el remoto; vacío = Chrome si está instalado */
  browserCommand?: string;
  integrations?: {
    jira?: JiraConfig;
    planner?: PlannerConfig;
    github?: GitHubConfig;
  };
}

export interface JiraStatus {
  configured: boolean;
  ok: boolean;
  /** quién soy (displayName) si la conexión funciona */
  user: string | null;
  error: string | null;
  lastSyncAt: string | null;
  issueCount: number;
}

export interface PlannerStatus {
  /** none = sin conectar; pending = device code en curso; connected */
  state: "none" | "pending" | "connected" | "error";
  user: string | null;
  error: string | null;
  /** solo en pending: código y URL a mostrar al usuario */
  userCode: string | null;
  verificationUri: string | null;
  lastSyncAt: string | null;
  taskCount: number;
}

// ---------- Eventos WebSocket ----------

// ---------- Ejecución de scripts ----------

export interface RunInfo {
  id: string;
  projectId: string;
  projectName: string;
  /** nombre del script del package.json */
  script: string;
  /** línea ejecutada, para mostrarla tal cual */
  command: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  /** URL local detectada en la salida (servidores de desarrollo) */
  url: string | null;
}

export interface RunOutputChunk {
  stream: "stdout" | "stderr";
  line: string;
}

export type WsEvent =
  | { type: "projects.changed"; projects: Project[] }
  | { type: "project.updated"; project: Project }
  | { type: "agent.activity"; projectId: string; session: AgentSession }
  | { type: "tasks.changed"; projectId: string }
  | { type: "scan.state"; scanning: boolean }
  | { type: "toast"; level: "success" | "error" | "info"; message: string; link?: string }
  | { type: "run.started"; run: RunInfo }
  | { type: "run.output"; runId: string; chunks: RunOutputChunk[] }
  | { type: "run.exited"; run: RunInfo };
