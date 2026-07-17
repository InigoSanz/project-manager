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
import { JiraSync, suggestJiraKey } from "./integrations/jira.js";
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

  const jira = new JiraSync(db, store, () => loadConfig().integrations?.jira, notifyTasksChanged);
  const planner = new PlannerSync(db, store, () => loadConfig().integrations?.planner, notifyTasksChanged);

  const agents = new AgentsManager(db, store, tasks, {
    onActivity: (projectId, session) => hub.broadcast({ type: "agent.activity", projectId, session }),
    onProjectUpdated: (id) => {
      const project = store.get(id);
      if (project) hub.broadcast({ type: "project.updated", project });
    },
    onTasksChanged: notifyTasksChanged,
  });

  const app = Fastify({ logger: { level: "warn" } });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/ws", { websocket: true }, (socket) => {
    hub.add(socket);
    socket.send(JSON.stringify({ type: "projects.changed", projects: store.all() }));
  });

  registerRoutes(app, {
    store,
    scanner,
    agents,
    tasks,
    jira,
    planner,
    onTasksChanged: notifyTasksChanged,
    getConfig: () => cfg,
    setConfig: (next) => {
      cfg = next;
      scanner.startWatching();
      void scanner.fullScan();
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
    await app.listen({ port: cfg.port, host: "127.0.0.1" });
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
    });

  // sync periódico de integraciones externas (10 min)
  setInterval(() => {
    void jira.sync();
    void planner.sync();
  }, 10 * 60_000).unref();

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
