import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { Project } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { Icon } from "./Icon";

/** Métricas agregadas de todos los proyectos, calculadas sobre el store. */
function useStats(projects: Project[]) {
  return useMemo(() => {
    const present = projects.filter((p) => p.present && !p.archived);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const monthAgo = Date.now() - 30 * 86_400_000;

    const commits30d = present.reduce((n, p) => n + (p.analysis?.metrics.commitsLast30d ?? 0), 0);
    const dirty = present.filter((p) => p.git && !p.git.clean);
    const behind = present.filter((p) => p.git && p.git.behind > 0);
    const activeWeek = present.filter((p) => {
      const last = p.analysis?.metrics.lastCommitAt;
      return last ? Date.parse(last) > weekAgo : false;
    });
    const dormant = present.filter((p) => {
      const last = p.analysis?.metrics.lastCommitAt;
      return !last || Date.parse(last) < monthAgo;
    });
    const openTasks = present.reduce((n, p) => n + p.tasks.open, 0);
    const suggested = present.reduce((n, p) => n + p.tasks.suggested, 0);
    const agentSessions = present.reduce((n, p) => n + p.agents.total, 0);

    // reparto de lenguajes por bytes reales, no por número de repos
    const langBytes = new Map<string, { bytes: number; color: string }>();
    for (const p of present) {
      for (const l of p.analysis?.languages ?? []) {
        const prev = langBytes.get(l.name);
        langBytes.set(l.name, { bytes: (prev?.bytes ?? 0) + l.bytes, color: l.color });
      }
    }
    const totalBytes = [...langBytes.values()].reduce((n, l) => n + l.bytes, 0) || 1;
    const languages = [...langBytes.entries()]
      .map(([name, v]) => ({ name, ratio: v.bytes / totalBytes, color: v.color }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8);

    return { present, commits30d, dirty, behind, activeWeek, dormant, openTasks, suggested, agentSessions, languages };
  }, [projects]);
}

export function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useNebula((s) => s.projects);
  const s = useStats(projects);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[68] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            className="glass-raised max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Resumen global</h2>
              <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:text-white" title="Cerrar">
                <Icon name="close" size={15} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat value={s.present.length} label="proyectos" />
              <Stat value={s.commits30d} label="commits · 30 días" />
              <Stat value={s.activeWeek.length} label="activos esta semana" />
              <Stat value={s.agentSessions} label="sesiones de IA" />
            </div>

            <h3 className="mt-5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Qué reclama atención</h3>
            <div className="mt-2 space-y-1.5">
              <AttentionRow
                count={s.dirty.length}
                label="con cambios sin commitear"
                projects={s.dirty}
                onNavigate={onClose}
              />
              <AttentionRow count={s.behind.length} label="por detrás del remoto" projects={s.behind} onNavigate={onClose} />
              <AttentionRow
                count={s.dormant.length}
                label="sin tocar en más de un mes"
                projects={s.dormant}
                onNavigate={onClose}
              />
            </div>

            <h3 className="mt-5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Tareas</h3>
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className="text-slate-200">
                {s.openTasks} <span className="text-xs text-slate-500">abiertas</span>
              </span>
              <span className="text-slate-200">
                {s.suggested} <span className="text-xs text-slate-500">sugeridas por IA</span>
              </span>
              <Link to="/tareas" onClick={onClose} className="ml-auto text-xs text-accent hover:underline">
                Ver todas →
              </Link>
            </div>

            <h3 className="mt-5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Lenguajes en todo tu código
            </h3>
            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
              {s.languages.map((l) => (
                <div key={l.name} style={{ width: `${l.ratio * 100}%`, background: l.color }} title={l.name} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
              {s.languages.map((l) => (
                <span key={l.name} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.name} {(l.ratio * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="font-display text-2xl font-bold text-white">{value}</div>
      <div className="text-[10px] tracking-wider text-slate-400 uppercase">{label}</div>
    </div>
  );
}

/** Fila con el recuento y los primeros nombres, para poder saltar al proyecto. */
function AttentionRow({
  count,
  label,
  projects,
  onNavigate,
}: {
  count: number;
  label: string;
  projects: Project[];
  onNavigate: () => void;
}) {
  if (count === 0) {
    return (
      <p className="text-xs text-slate-600">
        <span className="text-emerald-400/70">✓</span> ninguno {label}
      </p>
    );
  }
  return (
    <p className="text-xs text-slate-300">
      <span className="font-semibold text-amber-300">{count}</span> {label}:{" "}
      {projects.slice(0, 4).map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link to={`/project/${p.id}`} onClick={onNavigate} className="text-slate-400 hover:text-accent">
            {p.name}
          </Link>
        </span>
      ))}
      {projects.length > 4 && <span className="text-slate-500"> y {projects.length - 4} más</span>}
    </p>
  );
}
