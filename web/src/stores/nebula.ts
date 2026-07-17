import { create } from "zustand";
import type { Project, WsEvent, NebulaConfig } from "@nebula/shared";
import { useToasts } from "../components/Toast";

interface NebulaState {
  projects: Project[];
  scanning: boolean;
  connected: boolean;
  config: NebulaConfig | null;
  /** proyectos con actividad de agente en los últimos segundos (pulso visual) */
  liveActivity: Record<string, number>;
  /** contador por proyecto: se incrementa con cada tasks.changed (para refetch) */
  tasksVersion: Record<string, number>;
  /** nº de cosas accionables en Hoy (doing+todo+suggested+inbox) para el badge */
  todayCount: number;
  init: () => void;
  rescan: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: (cfg: Partial<NebulaConfig>) => Promise<void>;
}

let ws: WebSocket | null = null;
let retryMs = 1000;

export const useNebula = create<NebulaState>((set, get) => ({
  projects: [],
  scanning: false,
  connected: false,
  config: null,
  liveActivity: {},
  tasksVersion: {},
  todayCount: 0,

  init: () => {
    if (ws) return;
    void fetch("/api/projects")
      .then((r) => r.json())
      .then((projects: Project[]) => set({ projects }))
      .catch(() => {});
    let todayTimer: ReturnType<typeof setTimeout> | null = null;
    void get().loadConfig();
    refreshTodayCount();
    connect();

    function refreshTodayCount(): void {
      if (todayTimer) clearTimeout(todayTimer);
      todayTimer = setTimeout(() => {
        void fetch("/api/today")
          .then((r) => r.json())
          .then((d: { doing: unknown[]; todo: unknown[]; suggested: unknown[]; inbox: unknown[] }) =>
            set({ todayCount: d.doing.length + d.todo.length + d.suggested.length + d.inbox.length }),
          )
          .catch(() => {});
      }, 400);
    }

    function connect(): void {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        retryMs = 1000;
        set({ connected: true });
      };
      ws.onclose = () => {
        set({ connected: false });
        ws = null;
        setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 15000);
      };
      ws.onmessage = (msg) => {
        const event: WsEvent = JSON.parse(msg.data);
        const s = get();
        switch (event.type) {
          case "projects.changed":
            set({ projects: event.projects });
            break;
          case "project.updated":
            set({
              projects: s.projects.some((p) => p.id === event.project.id)
                ? s.projects.map((p) => (p.id === event.project.id ? event.project : p))
                : [...s.projects, event.project],
            });
            break;
          case "agent.activity":
            set({ liveActivity: { ...s.liveActivity, [event.projectId]: Date.now() } });
            break;
          case "tasks.changed":
            set({
              tasksVersion: {
                ...s.tasksVersion,
                [event.projectId]: (s.tasksVersion[event.projectId] ?? 0) + 1,
              },
            });
            refreshTodayCount();
            break;
          case "toast":
            useToasts.getState().push({ level: event.level, message: event.message, link: event.link });
            break;
          case "scan.state":
            set({ scanning: event.scanning });
            break;
        }
      };
    }
  },

  rescan: async () => {
    await fetch("/api/scan", { method: "POST" });
  },

  loadConfig: async () => {
    const config = (await (await fetch("/api/config")).json()) as NebulaConfig;
    set({ config });
  },

  saveConfig: async (partial) => {
    const config = (await (
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      })
    ).json()) as NebulaConfig;
    set({ config });
  },
}));
