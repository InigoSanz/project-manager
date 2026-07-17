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

export interface ProjectAnalysis {
  languages: LanguageStat[];
  /** Frameworks/tecnologías detectadas: "react", "fastify", "django"... */
  frameworks: string[];
  metrics: ProjectMetrics;
  /** Rasgos deterministas para el sistema visual */
  traits: ProjectTraits;
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
export type TaskSource = "manual" | "agent" | "email" | "jira" | "planner";

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

export interface JiraConfig {
  mode: "cloud" | "server";
  /** https://miempresa.atlassian.net o URL del Jira on-premise */
  baseUrl: string;
  /** solo cloud: email de la cuenta Atlassian */
  email?: string;
  /** cloud: API token · server/DC: Personal Access Token */
  token: string;
}

export interface PlannerConfig {
  /** client_id de app registration propia; vacío = client público de Graph PowerShell */
  clientId?: string;
}

export interface NebulaConfig {
  roots: string[];
  scanDepth: number;
  excludes: string[];
  /** minutos entre `git fetch` automáticos; 0 = desactivado */
  autoFetchMinutes: number;
  port: number;
  integrations?: {
    jira?: JiraConfig;
    planner?: PlannerConfig;
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

export type WsEvent =
  | { type: "projects.changed"; projects: Project[] }
  | { type: "project.updated"; project: Project }
  | { type: "agent.activity"; projectId: string; session: AgentSession }
  | { type: "tasks.changed"; projectId: string }
  | { type: "scan.state"; scanning: boolean };
