import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { AgentSession, Project } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { Icon, type IconName } from "./Icon";

/** Identidad visual por agente: icono + etiqueta (nunca solo color). */
const AGENT_META: Record<string, { label: string; icon: IconName; chip: string }> = {
  claude: { label: "Claude Code", icon: "ai", chip: "bg-orange-500/15 text-orange-300" },
  codex: { label: "Codex CLI", icon: "terminal", chip: "bg-teal-500/15 text-teal-300" },
  cursor: { label: "Cursor", icon: "cube", chip: "bg-violet-500/15 text-violet-300" },
  gemini: { label: "Gemini CLI", icon: "star", chip: "bg-sky-500/15 text-sky-300" },
  antigravity: { label: "Antigravity", icon: "orbit", chip: "bg-blue-500/15 text-blue-300" },
};

function duration(s: AgentSession): string | null {
  if (!s.startedAt || !s.endedAt) return null;
  const mins = Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function AgentTimeline({ project }: { project: Project }) {
  const [sessions, setSessions] = useState<AgentSession[] | null>(null);
  const liveActivity = useNebula((s) => s.liveActivity);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${project.id}/sessions`)
      .then((r) => r.json())
      .then((s: AgentSession[]) => alive && setSessions(s))
      .catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
    // liveActivity cambia con cada evento agent.activity → refresco
  }, [project.id, project.agents.total, liveActivity[project.id]]);

  if (!sessions) return <p className="p-4 text-sm text-slate-500">Cargando sesiones…</p>;
  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-sm text-slate-500">
          <Icon name="ai" size={30} className="mx-auto text-slate-600" />
          <p className="mt-2">Sin sesiones de agentes en este proyecto.</p>
          <p className="mt-1 text-xs">
            Se detectan automáticamente: Claude Code, Codex CLI, Cursor, Gemini CLI y Antigravity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-1">
      <ol className="relative ml-3 space-y-3 border-l border-white/10 pl-5">
        {sessions.map((s, i) => {
          const meta = AGENT_META[s.agent] ?? {
            label: s.agent,
            icon: "dot" as IconName,
            chip: "bg-white/10 text-slate-300",
          };
          const live = s.status === "live";
          return (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.5) }}
              className="relative"
            >
              <span
                className={`absolute top-2 -left-[27px] h-3 w-3 rounded-full border-2 border-[#0c0e1d] ${
                  live ? "animate-pulse bg-emerald-400" : "bg-slate-600"
                }`}
              />
              <div className="glass rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}>
                    <Icon name={meta.icon} size={11} />
                    {meta.label}
                  </span>
                  {live && (
                    <span className="animate-pulse rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      ● en vivo
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-slate-500">
                    {s.startedAt &&
                      new Date(s.startedAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
                    {duration(s) && ` · ${duration(s)}`}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-100">{s.title ?? s.firstPrompt ?? "(sesión sin título)"}</p>
                {s.firstPrompt && s.title && s.firstPrompt !== s.title && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{s.firstPrompt}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>{s.messageCount} mensajes</span>
                  <span>{s.toolUseCount} herramientas</span>
                  {s.filesTouched.length > 0 && (
                    <span title={s.filesTouched.join("\n")}>{s.filesTouched.length} ficheros tocados</span>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
