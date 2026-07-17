import type { FastifyInstance } from "fastify";
import type { NebulaConfig, TaskStatus, TodayData, TodayTask } from "@nebula/shared";
import { getDetail } from "../git/index.js";
import type { ProjectStore } from "../projects/store.js";
import type { Scanner } from "../scanner/index.js";
import type { AgentsManager } from "../agents/manager.js";
import type { TaskStore } from "../tasks/store.js";
import { loadConfig, saveConfig } from "../config.js";
import { registerFsRoutes } from "./fs.js";
import { readGraph } from "../integrations/graphify.js";
import { notesForProject } from "../integrations/obsidian.js";
import type { JiraSync } from "../integrations/jira.js";
import type { PlannerSync } from "../integrations/planner.js";
import { suggestJiraKey } from "../integrations/jira.js";
import { lanUrls } from "../lan.js";

export interface ApiDeps {
  store: ProjectStore;
  scanner: Scanner;
  agents: AgentsManager;
  tasks: TaskStore;
  jira: JiraSync;
  planner: PlannerSync;
  getConfig: () => NebulaConfig;
  setConfig: (cfg: NebulaConfig) => void;
  onTasksChanged: (projectId: string) => void;
  /** dispara el write-back asíncrono a Jira/Planner al completar una tarea */
  onTaskCompleted: (task: import("@nebula/shared").TaskItem) => void;
}

export function registerRoutes(app: FastifyInstance, deps: ApiDeps): void {
  const { store, scanner } = deps;

  app.get("/api/health", async () => ({ ok: true, name: "nebula" }));

  registerFsRoutes(app);

  app.get("/api/projects", async () => store.all());

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    return project;
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/git", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project || !project.present) return reply.code(404).send({ error: "not found" });
    return getDetail(project.path);
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/sessions", async (req, reply) => {
    const project = deps.store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    return deps.agents.sessionsFor(req.params.id);
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/tasks", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    return deps.tasks.list(req.params.id);
  });

  app.post<{
    Params: { id: string };
    Body: { title?: string; notes?: string; dueDate?: string | null; priority?: 0 | 1 | 2 | 3 };
  }>("/api/projects/:id/tasks", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    const title = req.body?.title?.trim();
    if (!title) return reply.code(400).send({ error: "title requerido" });
    const task = deps.tasks.create(req.params.id, title, req.body?.notes?.trim() || null, "manual", null, "todo", {
      dueDate: req.body?.dueDate ?? null,
      priority: req.body?.priority ?? 0,
    });
    deps.onTasksChanged(req.params.id);
    return task;
  });

  app.patch<{
    Params: { taskId: string };
    Body: {
      title?: string;
      notes?: string | null;
      status?: TaskStatus;
      projectId?: string;
      dueDate?: string | null;
      priority?: 0 | 1 | 2 | 3;
    };
  }>("/api/tasks/:taskId", async (req, reply) => {
    const allowed: TaskStatus[] = ["suggested", "todo", "doing", "done", "dismissed"];
    const body = req.body ?? {};
    if (body.status && !allowed.includes(body.status)) {
      return reply.code(400).send({ error: "status inválido" });
    }
    if (body.projectId !== undefined) {
      const validTarget = body.projectId === "inbox" || store.get(body.projectId)?.present;
      if (!validTarget) return reply.code(400).send({ error: "projectId inválido" });
    }
    const before = deps.tasks.get(req.params.taskId);
    if (!before) return reply.code(404).send({ error: "not found" });
    if (body.dueDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
      return reply.code(400).send({ error: "dueDate debe ser YYYY-MM-DD" });
    }
    if (body.priority !== undefined && ![0, 1, 2, 3].includes(body.priority)) {
      return reply.code(400).send({ error: "priority inválida" });
    }
    const task = deps.tasks.update(req.params.taskId, {
      title: body.title,
      notes: body.notes,
      status: body.status,
      projectId: body.projectId,
      dueDate: body.dueDate,
      priority: body.priority,
    });
    if (!task) return reply.code(404).send({ error: "not found" });
    if (before.projectId !== task.projectId) deps.onTasksChanged(before.projectId);
    deps.onTasksChanged(task.projectId);
    // write-back: cerrar en el sistema origen cuando se completa aquí
    if (body.status === "done" && before.status !== "done") {
      deps.onTaskCompleted(task);
    }
    return task;
  });

  app.delete<{ Params: { taskId: string } }>("/api/tasks/:taskId", async (req, reply) => {
    const removed = deps.tasks.remove(req.params.taskId);
    if (!removed) return reply.code(404).send({ error: "not found" });
    deps.onTasksChanged(removed.projectId);
    return { deleted: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/graph", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    const graph = readGraph(project.path);
    if (!graph) return reply.code(204).send();
    return graph;
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/notes", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    return notesForProject(project.name);
  });

  app.post("/api/scan", async () => {
    void scanner.fullScan();
    return { started: true };
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/refresh", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    await scanner.analyzeOne(project.path);
    return store.get(req.params.id);
  });

  // ---- Jira ----
  app.get("/api/jira/status", async () => deps.jira.status);

  app.post<{ Body: { mode?: string; baseUrl?: string; email?: string; token?: string } }>(
    "/api/jira/test",
    async (req, reply) => {
      const { baseUrl, token } = req.body ?? {};
      if (!baseUrl || !token) return reply.code(400).send({ error: "baseUrl y token requeridos" });
      const mode = req.body.mode === "server" ? "server" : "cloud";
      return deps.jira.test({ mode, baseUrl, email: req.body.email, token });
    },
  );

  app.post("/api/jira/sync", async () => {
    await deps.jira.sync();
    return deps.jira.status;
  });

  app.patch<{ Params: { id: string }; Body: { jiraKey?: string | null } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const project = store.get(req.params.id);
      if (!project) return reply.code(404).send({ error: "not found" });
      if (req.body && "jiraKey" in req.body) {
        const key = req.body.jiraKey?.trim().toUpperCase() || null;
        store.setJiraKey(req.params.id, key);
        store.setJiraKeySuggestion(req.params.id, null);
        void deps.jira.sync();
      }
      return store.get(req.params.id);
    },
  );

  app.post<{ Params: { id: string } }>("/api/projects/:id/jira-suggest", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    const suggestion = await suggestJiraKey(project.path);
    store.setJiraKeySuggestion(req.params.id, suggestion);
    return { suggestion };
  });

  // ---- Planner ----
  app.get("/api/planner/status", async () => deps.planner.status);

  app.post("/api/planner/connect", async () => {
    deps.planner.startConnect();
    // el device code tarda un instante en llegar del servidor de Microsoft
    for (let i = 0; i < 20 && !deps.planner.status.userCode && deps.planner.status.state === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    return deps.planner.status;
  });

  app.post("/api/planner/disconnect", async () => {
    deps.planner.disconnect();
    return deps.planner.status;
  });

  app.post("/api/planner/sync", async () => {
    await deps.planner.sync();
    return deps.planner.status;
  });

  // ---- Bandejas (tareas sin repo asociado) ----
  app.get("/api/inbox/tasks", async () => deps.tasks.inboxAll());

  app.post<{ Body: { title?: string; notes?: string; dueDate?: string | null; priority?: 0 | 1 | 2 | 3 } }>(
    "/api/inbox/tasks",
    async (req, reply) => {
      const title = req.body?.title?.trim();
      if (!title) return reply.code(400).send({ error: "title requerido" });
      const task = deps.tasks.create("inbox", title, req.body?.notes?.trim() || null, "manual", null, "todo", {
        dueDate: req.body?.dueDate ?? null,
        priority: req.body?.priority ?? 0,
      });
      deps.onTasksChanged("inbox");
      return task;
    },
  );

  app.get<{ Querystring: { q?: string } }>("/api/search/tasks", async (req) => {
    const q = req.query.q?.trim() ?? "";
    if (q.length < 2) return [];
    const nameById = new Map(store.all().map((p) => [p.id, p.name]));
    return deps.tasks.search(q).map((t) => ({ ...t, projectName: nameById.get(t.projectId) ?? null }));
  });

  // ---- Vista Hoy: agregado de todo lo accionable en una llamada ----
  app.get("/api/today", async (): Promise<TodayData> => {
    const projects = store.all();
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    const withName = (t: ReturnType<typeof deps.tasks.get> & object): TodayTask => ({
      ...(t as TodayTask),
      projectName: nameById.get((t as TodayTask).projectId) ?? null,
    });

    const attention = projects
      .filter((p) => p.git && (!p.git.clean || p.git.behind > 0 || p.git.conflicted > 0))
      .map((p) => {
        const reasons: string[] = [];
        const g = p.git!;
        if (g.conflicted > 0) reasons.push(`${g.conflicted} conflictos`);
        if (g.staged + g.unstaged > 0) reasons.push(`${g.staged + g.unstaged} cambios sin commit`);
        if (g.untracked > 0) reasons.push(`${g.untracked} ficheros nuevos`);
        if (g.behind > 0) reasons.push(`${g.behind} commits por detrás`);
        return { projectId: p.id, name: p.name, reasons };
      });

    const live = deps.agents.liveSessions().map((s) => ({
      projectId: s.projectId,
      projectName: nameById.get(s.projectId) ?? "?",
      agent: s.agent,
      title: s.title ?? s.firstPrompt,
    }));

    return {
      doing: deps.tasks.byStatus("doing").map(withName),
      todo: deps.tasks.byStatus("todo").map(withName),
      suggested: deps.tasks.byStatus("suggested").map(withName),
      inbox: deps.tasks.inboxAll().map(withName),
      attention,
      live,
    };
  });

  app.get("/api/lan-info", async () => {
    const cfg = loadConfig();
    return { enabled: cfg.lanAccess, urls: lanUrls(cfg.port) };
  });

  app.get("/api/config", async () => loadConfig());

  app.put<{ Body: Partial<NebulaConfig> }>("/api/config", async (req) => {
    const cfg = { ...loadConfig(), ...req.body };
    saveConfig(cfg);
    deps.setConfig(cfg);
    return cfg;
  });
}
