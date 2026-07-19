import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { NebulaConfig, TaskStatus, TodayData, TodayTask } from "@nebula/shared";
import {
  getDetail,
  getFileDiff,
  gitCheckout,
  gitFetch,
  gitPull,
  searchLog,
} from "../git/index.js";
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
import { checkOrigin, MASKED_TOKEN, redactConfig, requireLoopback, sanitizeConfigPatch } from "../security.js";
import { openProject, remoteToBrowserUrl, type OpenTarget } from "../actions/open.js";
import type { RunManager } from "../runs/manager.js";
import type { NotesStore } from "../notes/store.js";
import type { GitHubSync } from "../integrations/github.js";

export interface ApiDeps {
  store: ProjectStore;
  scanner: Scanner;
  agents: AgentsManager;
  tasks: TaskStore;
  jira: JiraSync;
  planner: PlannerSync;
  runs: RunManager;
  notes: NotesStore;
  github: GitHubSync;
  getConfig: () => NebulaConfig;
  setConfig: (cfg: NebulaConfig) => void;
  onTasksChanged: (projectId: string) => void;
  /** dispara el write-back asíncrono a Jira/Planner al completar una tarea */
  onTaskCompleted: (task: import("@nebula/shared").TaskItem) => void;
}

export function registerRoutes(app: FastifyInstance, deps: ApiDeps): void {
  const { store, scanner } = deps;

  // Cortafuegos de origen: una web cualquiera no puede hablar con el daemon
  // (el navegador la deja salir, así que la comprobación tiene que ser aquí).
  app.addHook("onRequest", async (req, reply) => {
    if (!checkOrigin(req, deps.getConfig())) {
      return reply.code(403).send({ error: "origen no permitido" });
    }
  });

  app.get("/api/health", async () => ({ ok: true, name: "nebula" }));

  registerFsRoutes(app);

  app.get("/api/projects", async () => store.all());

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project) return reply.code(404).send({ error: "not found" });
    return project;
  });

  const OPEN_TARGETS: OpenTarget[] = ["editor", "terminal", "explorer", "remote"];

  // Abrir en el editor / terminal / explorador / navegador. Solo desde este
  // equipo: lanzar programas desde el móvil no tendría sentido y sería un
  // agujero. Recibe id de proyecto, nunca una ruta.
  app.post<{ Params: { id: string }; Body: { target?: string } }>(
    "/api/projects/:id/open",
    async (req, reply) => {
      if (!requireLoopback(req, reply)) return reply;
      const target = req.body?.target as OpenTarget | undefined;
      if (!target || !OPEN_TARGETS.includes(target)) {
        return reply.code(400).send({ error: "destino inválido" });
      }
      const project = store.get(req.params.id);
      if (!project) return reply.code(404).send({ error: "not found" });

      const cfg = deps.getConfig();
      const result = openProject(target, project.path, {
        editorCommand: cfg.editorCommand,
        browserCommand: cfg.browserCommand,
        remoteUrl: project.remoteUrl,
      });
      if (!result.ok) return reply.code(409).send({ error: result.error });
      return { ok: true, url: target === "remote" ? remoteToBrowserUrl(project.remoteUrl) : null };
    },
  );

  app.get<{ Params: { id: string } }>("/api/projects/:id/git", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project || !project.present) return reply.code(404).send({ error: "not found" });
    return getDetail(project.path);
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string; staged?: string } }>(
    "/api/projects/:id/git/diff",
    async (req, reply) => {
      const project = store.get(req.params.id);
      if (!project || !project.present) return reply.code(404).send({ error: "not found" });
      const file = req.query.path;
      if (!file) return reply.code(400).send({ error: "falta el fichero" });
      return getFileDiff(project.path, file, req.query.staged === "1");
    },
  );

  app.get<{ Params: { id: string }; Querystring: { q?: string } }>(
    "/api/projects/:id/git/log",
    async (req, reply) => {
      const project = store.get(req.params.id);
      if (!project || !project.present) return reply.code(404).send({ error: "not found" });
      return searchLog(project.path, req.query.q ?? "");
    },
  );

  // Operaciones que tocan el repositorio: solo desde este equipo.
  app.post<{ Params: { id: string; action: string }; Body: { branch?: string } }>(
    "/api/projects/:id/git/:action",
    async (req, reply) => {
      if (!requireLoopback(req, reply)) return reply;
      const project = store.get(req.params.id);
      if (!project || !project.present) return reply.code(404).send({ error: "not found" });

      let result;
      switch (req.params.action) {
        case "fetch":
          result = await gitFetch(project.path);
          break;
        case "pull":
          result = await gitPull(project.path);
          break;
        case "checkout": {
          const branch = req.body?.branch;
          if (!branch) return reply.code(400).send({ error: "falta la rama" });
          result = await gitCheckout(project.path, branch);
          break;
        }
        default:
          return reply.code(400).send({ error: "acción desconocida" });
      }
      // el estado en pantalla debe reflejar el cambio inmediatamente
      await scanner.refreshGit(project.path);
      if (!result.ok) return reply.code(409).send({ error: result.message });
      return result;
    },
  );

  // README del repo, para leerlo sin salir de Nebula
  app.get<{ Params: { id: string } }>("/api/projects/:id/readme", async (req, reply) => {
    const project = store.get(req.params.id);
    if (!project || !project.present) return reply.code(404).send({ error: "not found" });
    const file = project.analysis?.health?.readme;
    if (!file) return reply.code(204).send();
    try {
      const full = path.join(project.path, file);
      // el nombre viene de nuestro propio análisis, pero se comprueba igual
      if (!full.startsWith(project.path)) return reply.code(400).send({ error: "ruta inválida" });
      const body = fs.readFileSync(full, "utf8").slice(0, 200_000);
      return { file, body };
    } catch {
      return reply.code(204).send();
    }
  });

  // Bloc de notas propio (distinto de las notas de Obsidian, que son de lectura)
  app.get<{ Params: { id: string } }>("/api/projects/:id/scratchpad", async (req) => {
    return deps.notes.get(req.params.id);
  });

  app.put<{ Params: { id: string }; Body: { body?: string } }>(
    "/api/projects/:id/scratchpad",
    async (req, reply) => {
      const project = store.get(req.params.id);
      if (!project) return reply.code(404).send({ error: "not found" });
      if (typeof req.body?.body !== "string") return reply.code(400).send({ error: "cuerpo inválido" });
      return deps.notes.save(req.params.id, req.body.body.slice(0, 100_000));
    },
  );

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

  // ---------- Ejecución de scripts (solo desde este equipo) ----------

  app.get("/api/runs", async () => deps.runs.list());

  app.get<{ Params: { runId: string } }>("/api/runs/:runId", async (req, reply) => {
    const run = deps.runs.get(req.params.runId);
    if (!run) return reply.code(404).send({ error: "not found" });
    return run;
  });

  app.post<{ Params: { id: string }; Body: { script?: string } }>(
    "/api/projects/:id/runs",
    async (req, reply) => {
      if (!requireLoopback(req, reply)) return reply;
      const project = store.get(req.params.id);
      if (!project) return reply.code(404).send({ error: "not found" });

      const pkg = project.analysis?.pkg;
      const script = req.body?.script;
      // el script debe existir en el package.json: nunca se ejecuta texto libre
      if (!script || !pkg?.scripts.includes(script)) {
        return reply.code(400).send({ error: "script desconocido en este proyecto" });
      }

      const result = deps.runs.start({
        projectId: project.id,
        projectName: project.name,
        cwd: project.path,
        script,
        packageManager: pkg.packageManager,
      });
      if (!result.ok) return reply.code(409).send({ error: result.error });
      return result.info;
    },
  );

  app.post<{ Params: { runId: string } }>("/api/runs/:runId/stop", async (req, reply) => {
    if (!requireLoopback(req, reply)) return reply;
    if (!deps.runs.stop(req.params.runId)) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  // ---------- GitHub ----------

  app.get("/api/github/status", async () => deps.github.getStatus());

  app.get("/api/github/pulls", async () => deps.github.getPulls());

  app.post<{ Body: { token?: string } }>("/api/github/test", async (req, reply) => {
    const token = req.body?.token;
    if (!token) return reply.code(400).send({ error: "falta el token" });
    return deps.github.test({ token });
  });

  app.post("/api/github/sync", async () => {
    await deps.github.sync();
    return deps.github.getStatus();
  });

  app.get("/api/lan-info", async () => {
    const cfg = loadConfig();
    return { enabled: cfg.lanAccess, urls: lanUrls(cfg.port) };
  });

  app.get("/api/config", async () => redactConfig(loadConfig()));

  app.put<{ Body: Partial<NebulaConfig> }>("/api/config", async (req, reply) => {
    const parsed = sanitizeConfigPatch(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });

    const current = loadConfig();
    const patch = parsed.value;
    // el cliente reenvía el token enmascarado cuando no lo ha tocado: en ese
    // caso conservamos el real en vez de guardar los puntitos
    const jira = patch.integrations?.jira;
    if (jira && jira.token === MASKED_TOKEN) {
      patch.integrations = {
        ...patch.integrations,
        jira: { ...jira, token: current.integrations?.jira?.token ?? "" },
      };
    }

    const cfg = { ...current, ...patch };
    saveConfig(cfg);
    deps.setConfig(cfg);
    return redactConfig(cfg);
  });
}
