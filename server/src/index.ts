import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { loadConfig } from "./config.js";
import { openDb } from "./db/index.js";
import { ProjectStore } from "./projects/store.js";
import { Scanner } from "./scanner/index.js";
import { WsHub } from "./ws/hub.js";
import { registerRoutes } from "./api/routes.js";
import { fetchRemote } from "./git/index.js";
import { AgentsManager } from "./agents/manager.js";
import { TaskStore } from "./tasks/store.js";
import { JiraSync, suggestJiraKey, transitionToDone } from "./integrations/jira.js";
import { lanUrls } from "./lan.js";
import { allowedOrigins } from "./security.js";
import { RunManager } from "./runs/manager.js";
import { NotesStore } from "./notes/store.js";
import { GitHubSync } from "./integrations/github.js";
import { scheduleBackups } from "./backup.js";
import { Notifier } from "./notify.js";
import { PlannerSync } from "./integrations/planner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIN_NODE_MAJOR = 24;

/** Daemon desatendido: un fallo puntual (watcher, parser…) no debe tumbarlo. */
function installSafetyNet(): void {
  process.on("uncaughtException", (err) => {
    console.error("[nebula] excepción no capturada (el daemon sigue):", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[nebula] promesa rechazada sin capturar (el daemon sigue):", reason);
  });
}

function checkNodeVersion(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE_MAJOR) {
    console.error(
      `Nebula necesita Node ${MIN_NODE_MAJOR}+ y estás usando ${process.versions.node}.\n` +
        `Instálalo con nvm ("nvm install ${MIN_NODE_MAJOR}" + "nvm use ${MIN_NODE_MAJOR}") o desde nodejs.org.`,
    );
    process.exit(1);
  }
}

/** true si en el puerto ya responde otro Nebula sano. */
async function isNebulaAlreadyRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { name?: string };
    return body?.name === "nebula";
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  checkNodeVersion();
  installSafetyNet();
  let cfg = loadConfig();
  const db = openDb();
  const store = new ProjectStore(db);
  const hub = new WsHub();

  const scanner = new Scanner(store, cfg, {
    onProjectUpdated: (id) => {
      const project = store.get(id);
      if (project) hub.broadcast({ type: "project.updated", project });
    },
    onProjectsChanged: () => hub.broadcast({ type: "projects.changed", projects: store.all() }),
    onScanState: (scanning) => hub.broadcast({ type: "scan.state", scanning }),
  });

  const tasks = new TaskStore(db);
  const notifyTasksChanged = (projectId: string): void => {
    hub.broadcast({ type: "tasks.changed", projectId });
    const project = store.get(projectId);
    if (project) hub.broadcast({ type: "project.updated", project });
  };

  const notifier = new Notifier(db, cfg.port);
  const jira = new JiraSync(db, store, () => loadConfig().integrations?.jira, notifyTasksChanged, notifier);
  const planner = new PlannerSync(db, store, () => loadConfig().integrations?.planner, notifyTasksChanged, notifier);
  const github = new GitHubSync(db, store, () => loadConfig().integrations?.github, notifyTasksChanged);

  const agents = new AgentsManager(
    db,
    store,
    tasks,
    {
      onActivity: (projectId, session) => hub.broadcast({ type: "agent.activity", projectId, session }),
      onProjectUpdated: (id) => {
        const project = store.get(id);
        if (project) hub.broadcast({ type: "project.updated", project });
      },
      onTasksChanged: notifyTasksChanged,
    },
    notifier,
  );

  const runs = new RunManager({
    onStarted: (run) => hub.broadcast({ type: "run.started", run }),
    onOutput: (runId, chunks) => hub.broadcast({ type: "run.output", runId, chunks }),
    onExited: (run) => hub.broadcast({ type: "run.exited", run }),
  });

  // sin esto, apagar el daemon dejaría vivos los `pnpm dev` que hubiera lanzado
  const shutdown = (): void => {
    runs.stopAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const app = Fastify({ logger: { level: "warn" } });
  // lista explícita en vez de `origin: true`: sin esto cualquier web abierta en
  // el navegador podría leer y escribir en el daemon (ver security.ts)
  await app.register(cors, {
    // sin cabeceras CORS para orígenes ajenos (el navegador bloquea la
    // respuesta); el rechazo explícito con 403 lo hace el hook de routes.ts,
    // así el error es limpio en vez de un 500 del plugin
    origin: (origin, cb) => cb(null, !origin || allowedOrigins(loadConfig()).includes(origin)),
  });
  await app.register(websocket);

  app.get("/ws", { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins(loadConfig()).includes(origin)) {
      socket.close();
      return;
    }
    hub.add(socket);
    socket.send(JSON.stringify({ type: "projects.changed", projects: store.all() }));
  });

  // write-back asíncrono al completar tareas externas desde Nebula
  const onTaskCompleted = (task: import("@nebula/shared").TaskItem): void => {
    if (task.source !== "jira" && task.source !== "planner") return;
    const integrations = loadConfig().integrations;
    // write-back desactivado en ajustes: completar aquí no toca el sistema origen
    if (task.source === "jira" && integrations?.jira?.writeBack === false) return;
    if (task.source === "planner" && integrations?.planner?.writeBack === false) return;
    void (async () => {
      const jiraCfg = integrations?.jira;
      try {
        if (task.source === "jira" && task.sourceRef) {
          if (!jiraCfg) throw new Error("Jira no está configurado");
          await transitionToDone(jiraCfg, task.sourceRef);
          hub.broadcast({
            type: "toast",
            level: "success",
            message: `${task.sourceRef} cerrado en Jira ✓`,
            link: `${jiraCfg.baseUrl.replace(/\/+$/, "")}/browse/${task.sourceRef}`,
          });
        } else if (task.source === "planner" && task.sourceRef) {
          await planner.completeTask(task.sourceRef);
          hub.broadcast({ type: "toast", level: "success", message: "Tarea completada en Planner ✓" });
        }
        tasks.setExternalMeta(task.id, { ...task.externalMeta, syncError: undefined });
      } catch (err) {
        const reason = (err as Error).message;
        tasks.setExternalMeta(task.id, { ...task.externalMeta, syncError: reason });
        hub.broadcast({
          type: "toast",
          level: "error",
          message:
            task.source === "jira"
              ? `No se pudo cerrar ${task.sourceRef} en Jira: ${reason}`
              : `No se pudo completar en Planner: ${reason}`,
          link:
            task.source === "jira" && jiraCfg
              ? `${jiraCfg.baseUrl.replace(/\/+$/, "")}/browse/${task.sourceRef}`
              : "https://tasks.office.com",
        });
      }
      notifyTasksChanged(task.projectId);
    })();
  };

  registerRoutes(app, {
    store,
    scanner,
    agents,
    tasks,
    jira,
    planner,
    runs,
    notes: new NotesStore(db),
    github,
    onTasksChanged: notifyTasksChanged,
    onProjectUpdated: (project) => hub.broadcast({ type: "project.updated", project }),
    onTaskCompleted,
    getConfig: () => cfg,
    setConfig: (next) => {
      // re-escanear solo si cambió lo que afecta al descubrimiento de repos;
      // los toggles del panel (writeBack, notificaciones…) no deben relanzar nada
      const scanChanged =
        JSON.stringify([cfg.roots, cfg.scanDepth, cfg.excludes]) !==
        JSON.stringify([next.roots, next.scanDepth, next.excludes]);
      cfg = next;
      if (scanChanged) {
        scanner.startWatching();
        void scanner.fullScan();
      }
    },
  });

  // En producción sirve la UI compilada (web/dist)
  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api") || req.raw.url?.startsWith("/ws")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html"); // SPA fallback
    });
  }

  try {
    await app.listen({ port: cfg.port, host: cfg.lanAccess ? "0.0.0.0" : "127.0.0.1" });
  } catch (err: any) {
    if (err?.code === "EADDRINUSE") {
      if (await isNebulaAlreadyRunning(cfg.port)) {
        console.log(`🌌 Nebula ya está corriendo en http://localhost:${cfg.port} — nada que hacer.`);
        process.exit(0);
      }
      console.error(
        `El puerto ${cfg.port} está ocupado por otra aplicación.\n` +
          `Cambia "port" en ~/.nebula/config.json y vuelve a arrancar.`,
      );
      process.exit(1);
    }
    throw err;
  }
  console.log(`🌌 Nebula escuchando en http://localhost:${cfg.port}`);
  if (cfg.lanAccess) {
    for (const url of lanUrls(cfg.port)) console.log(`   📱 En tu red local: ${url}`);
  }
  console.log(`   Raíces: ${cfg.roots.join(" | ") || "(ninguna — configúralas en la UI o ~/.nebula/config.json)"}`);

  // Modo desatendido: escaneo inicial + watchers + fetch periódico opcional
  void scanner
    .fullScan()
    .then(() => scanner.startWatching())
    .then(() => agents.refreshAll())
    .then(() => {
      agents.startWatching();
      hub.broadcast({ type: "projects.changed", projects: store.all() });
    })
    .then(async () => {
      // sugerir clave Jira a proyectos que no tienen ni clave ni sugerencia
      for (const p of store.all()) {
        if (!p.jiraKey && !p.jiraKeySuggestion) {
          const suggestion = await suggestJiraKey(p.path).catch(() => null);
          if (suggestion) store.setJiraKeySuggestion(p.id, suggestion);
        }
      }
      await planner.restore();
      await jira.sync();
      await planner.sync();
      await github.sync();
      notifier.dueTodayDigest(tasks.dueToday().length);
    });

  scheduleBackups(db);

  // sync periódico de integraciones externas + digest de vencimientos.
  // El tick es de 1 min y relee syncMinutes para que el ajuste aplique al vuelo.
  let lastSyncAt = Date.now();
  setInterval(() => {
    const minutes = Math.max(1, loadConfig().syncMinutes ?? 10);
    if (Date.now() - lastSyncAt < minutes * 60_000) return;
    lastSyncAt = Date.now();
    void jira.sync();
    void planner.sync();
    void github.sync();
    notifier.dueTodayDigest(tasks.dueToday().length);
  }, 60_000).unref();

  let lastFetchAt = 0;
  setInterval(() => {
    if (cfg.autoFetchMinutes <= 0) return;
    if (Date.now() - lastFetchAt < cfg.autoFetchMinutes * 60_000) return;
    lastFetchAt = Date.now();
    for (const { path: repo } of store.allRows()) void fetchRemote(repo);
  }, 60_000).unref();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
