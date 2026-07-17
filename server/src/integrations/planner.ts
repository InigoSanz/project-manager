import fs from "node:fs";
import path from "node:path";
import { PublicClientApplication, type Configuration } from "@azure/msal-node";
import type { PlannerConfig, PlannerStatus } from "@nebula/shared";
import { NEBULA_HOME } from "../config.js";
import type { DB } from "../db/index.js";
import type { ProjectStore } from "../projects/store.js";

/** Client público de Microsoft Graph PowerShell (preconsentido en muchos tenants). */
const DEFAULT_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";
const SCOPES = ["Tasks.Read"];
const CACHE_PATH = path.join(NEBULA_HOME, "msal-cache.json");
const PLANNER_INBOX = "planner-inbox";

/** Persistencia sencilla del token cache de MSAL en ~/.nebula. */
const cachePlugin = {
  beforeCacheAccess: async (ctx: any) => {
    try {
      ctx.tokenCache.deserialize(fs.readFileSync(CACHE_PATH, "utf8"));
    } catch {
      /* primera vez */
    }
  },
  afterCacheAccess: async (ctx: any) => {
    if (ctx.cacheHasChanged) {
      try {
        fs.mkdirSync(NEBULA_HOME, { recursive: true });
        fs.writeFileSync(CACHE_PATH, ctx.tokenCache.serialize());
      } catch (err) {
        console.warn("[planner] no se pudo guardar el token cache:", (err as Error).message);
      }
    }
  },
};

interface GraphTask {
  id: string;
  title: string;
  percentComplete: number;
  planId: string | null;
  dueDateTime: string | null;
}

export class PlannerSync {
  status: PlannerStatus = {
    state: "none",
    user: null,
    error: null,
    userCode: null,
    verificationUri: null,
    lastSyncAt: null,
    taskCount: 0,
  };

  private pca: PublicClientApplication | null = null;
  private currentClientId: string | null = null;
  private connecting = false;

  constructor(
    private db: DB,
    private store: ProjectStore,
    private getConfig: () => PlannerConfig | undefined,
    private onTasksChanged: (projectId: string) => void,
  ) {}

  private app(): PublicClientApplication {
    const clientId = this.getConfig()?.clientId?.trim() || DEFAULT_CLIENT_ID;
    if (!this.pca || this.currentClientId !== clientId) {
      const config: Configuration = {
        auth: { clientId, authority: "https://login.microsoftonline.com/common" },
        cache: { cachePlugin },
      };
      this.pca = new PublicClientApplication(config);
      this.currentClientId = clientId;
    }
    return this.pca;
  }

  /** Token silencioso desde el cache; null si hay que iniciar sesión. */
  private async tokenSilent(): Promise<string | null> {
    try {
      const accounts = await this.app().getTokenCache().getAllAccounts();
      if (accounts.length === 0) return null;
      const result = await this.app().acquireTokenSilent({ account: accounts[0], scopes: SCOPES });
      this.status.user = result?.account?.username ?? this.status.user;
      return result?.accessToken ?? null;
    } catch {
      return null;
    }
  }

  /** Lanza el device code flow (no bloquea: el estado se consulta por polling). */
  startConnect(): void {
    if (this.connecting) return;
    this.connecting = true;
    this.status = { ...this.status, state: "pending", error: null, userCode: null, verificationUri: null };

    this.app()
      .acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (info) => {
          this.status.userCode = info.userCode;
          this.status.verificationUri = info.verificationUri;
        },
      })
      .then((result) => {
        this.status.state = "connected";
        this.status.user = result?.account?.username ?? null;
        this.status.userCode = null;
        this.status.verificationUri = null;
        void this.sync();
      })
      .catch((err: Error) => {
        this.status.state = "error";
        this.status.error = hintForAadError(err.message);
        this.status.userCode = null;
        this.status.verificationUri = null;
      })
      .finally(() => {
        this.connecting = false;
      });
  }

  disconnect(): void {
    try {
      fs.rmSync(CACHE_PATH, { force: true });
    } catch {
      /* ignore */
    }
    this.pca = null;
    this.status = { state: "none", user: null, error: null, userCode: null, verificationUri: null, lastSyncAt: null, taskCount: 0 };
  }

  /** Al arrancar: si hay cuenta cacheada, estado connected sin interacción. */
  async restore(): Promise<void> {
    const token = await this.tokenSilent();
    if (token) this.status.state = "connected";
  }

  async sync(): Promise<void> {
    if (this.status.state !== "connected") return;
    const token = await this.tokenSilent();
    if (!token) {
      this.status.state = "none"; // refresh token caducado → reconectar
      return;
    }

    let tasks: GraphTask[];
    const planNames = new Map<string, string>();
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me/planner/tasks?$top=100", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { value?: any[] };
      tasks = (data.value ?? []).map((t) => ({
        id: t.id,
        title: t.title ?? "(sin título)",
        percentComplete: t.percentComplete ?? 0,
        planId: t.planId ?? null,
        dueDateTime: t.dueDateTime ?? null,
      }));
      // nombres de planes (para mapear a repos por nombre)
      const planIds = [...new Set(tasks.map((t) => t.planId).filter(Boolean))] as string[];
      for (const planId of planIds.slice(0, 15)) {
        try {
          const pres = await fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
          });
          if (pres.ok) planNames.set(planId, ((await pres.json()) as any).title ?? "");
        } catch {
          /* plan inaccesible */
        }
      }
      this.status.error = null;
    } catch (err) {
      this.status.error = hintForAadError((err as Error).message);
      return;
    }

    const projects = this.store.allRows().map((r) => ({ ...r, name: path.basename(r.path).toLowerCase() }));
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const touched = new Set<string>();
    const upsert = this.db.prepare(
      `INSERT INTO tasks (id, project_id, title, notes, status, source, source_ref, created_at, updated_at)
       VALUES (@id, @projectId, @title, @notes, @status, 'planner', @sourceRef, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at`,
    );

    for (const t of tasks) {
      const planName = (t.planId && planNames.get(t.planId)) || "";
      const match = projects.find((p) => planName.toLowerCase().includes(p.name));
      const projectId = match?.id ?? PLANNER_INBOX;
      const status = t.percentComplete >= 100 ? "done" : t.percentComplete > 0 ? "doing" : "todo";
      seen.add(`planner:${t.id}`);
      touched.add(projectId);
      upsert.run({
        id: `planner:${t.id}`,
        projectId,
        title: t.title.slice(0, 200),
        notes: [planName && `Plan: ${planName}`, t.dueDateTime && `Vence: ${t.dueDateTime.slice(0, 10)}`]
          .filter(Boolean)
          .join(" · ") || null,
        status,
        sourceRef: t.id,
        now,
      });
    }

    const stale = this.db
      .prepare(`SELECT id, project_id FROM tasks WHERE source = 'planner' AND status IN ('todo','doing')`)
      .all() as Array<{ id: string; project_id: string }>;
    for (const row of stale) {
      if (!seen.has(row.id)) {
        this.db.prepare(`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?`).run(now, row.id);
        touched.add(row.project_id);
      }
    }

    this.status.lastSyncAt = now;
    this.status.taskCount = tasks.length;
    for (const id of touched) this.onTasksChanged(id);
  }
}

/** Errores AADSTS traducidos a una pista accionable. */
function hintForAadError(msg: string): string {
  if (msg.includes("AADSTS65001") || msg.includes("AADSTS90094")) {
    return `${msg}\n→ Tu tenant requiere consentimiento de administrador. Pide a un admin que registre una app con permiso delegado Tasks.Read y pega su client_id en Ajustes.`;
  }
  if (msg.includes("AADSTS7000218") || msg.includes("AADSTS700016")) {
    return `${msg}\n→ El client público está bloqueado en tu tenant. Registra una app propia (tipo "Public client") con Tasks.Read y pega su client_id en Ajustes.`;
  }
  if (msg.includes("expired_token") || msg.includes("AADSTS70016")) {
    return "El código de dispositivo caducó sin completarse. Vuelve a pulsar «Conectar Microsoft 365».";
  }
  return msg;
}
