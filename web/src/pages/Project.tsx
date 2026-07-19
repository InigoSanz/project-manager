import { useMemo, useState } from "react";
import type { Project } from "@nebula/shared";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useNebula } from "../stores/nebula";
import { deriveDNA } from "../visuals/dna";
import { PixelPlanet } from "../components/PixelPlanet";
import { Icon } from "../components/Icon";
import { ProjectActions } from "../components/ProjectActions";
import { ScriptsPanel } from "../components/ScriptsPanel";
import { ReadmePanel } from "../components/ReadmePanel";
import { ScratchpadPanel } from "../components/ScratchpadPanel";
import { PullRequests } from "../components/PullRequests";
import { useIsSmallScreen, useIsTouch } from "../lib/device";
import { GitPanel } from "../components/GitPanel";
import { AgentTimeline } from "../components/AgentTimeline";
import { TaskBoard } from "../components/TaskBoard";
import { KnowledgeGraphPanel } from "../components/KnowledgeGraphPanel";
import { NotesPanel } from "../components/NotesPanel";

type Tab = "resumen" | "git" | "agentes" | "tareas" | "conocimiento";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "git", label: "Git" },
  { id: "tareas", label: "Tareas" },
  { id: "agentes", label: "Agentes" },
  { id: "conocimiento", label: "Conocimiento" },
];

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { projects, liveActivity } = useNebula();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTabState] = useState<Tab>(
    TABS.some((t) => t.id === initialTab) ? (initialTab as Tab) : "resumen",
  );
  // la pestaña activa vive en la URL: así se puede compartir y volver atrás
  const setTab = (next: Tab): void => {
    setTabState(next);
    setSearchParams({ tab: next }, { replace: true });
  };
  const touch = useIsTouch();
  const small = useIsSmallScreen();
  const project = projects.find((p) => p.id === id);
  const dna = useMemo(() => (project ? deriveDNA(project) : null), [project]);

  if (!project || !dna) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <p>Proyecto no encontrado.</p>
          <Link to="/" className="mt-2 inline-block text-indigo-300 hover:text-white">
            ← Volver al mapa
          </Link>
        </div>
      </div>
    );
  }

  const live = Date.now() - (liveActivity[project.id] ?? 0) < 60_000;
  const langs = project.analysis?.languages ?? [];
  const metrics = project.analysis?.metrics;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Hero con el planeta pixel-art */}
      <div className="relative h-[36%] shrink-0 overflow-hidden max-sm:h-[28%]">
        {/* resplandor de fondo con el color dominante del proyecto */}
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 60% 70% at 50% 58%, ${dna.colors[0]}2e, transparent 70%)` }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ y: [0, -7, 0] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
        >
          <PixelPlanet project={project} size={touch || small ? 170 : 250} live={live} animate />
        </motion.div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
          <div className="pointer-events-auto flex gap-2">
            <Link
              to="/"
              className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
            >
              <Icon name="arrowLeft" size={13} />
              Mapa
            </Link>
            <button
              onClick={() => window.dispatchEvent(new Event("nebula:open-today"))}
              className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
              title="Tu día (tecla T)"
            >
              <Icon name="today" size={13} />
              Hoy
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {live && (
              <span className="glass animate-pulse rounded-lg px-3 py-1.5 text-xs text-emerald-300">
                ● agente trabajando
              </span>
            )}
            {/* la salida de Nebula hacia el trabajo real */}
            <ProjectActions project={project} className="max-sm:hidden" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none absolute bottom-4 left-6 max-sm:right-4 max-sm:bottom-2 max-sm:left-4"
        >
          <h1 className="font-display text-3xl font-bold text-white drop-shadow-lg max-sm:text-xl">{project.name}</h1>
          <p className="mt-1 truncate text-xs text-slate-400">{project.path}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {project.git?.branch && (
              <span className="glass rounded-md px-2 py-0.5 text-[11px] text-slate-200">⎇ {project.git.branch}</span>
            )}
            {(project.analysis?.frameworks ?? []).map((f) => (
              <span key={f} className="glass rounded-md px-2 py-0.5 text-[11px] text-indigo-200">
                {f}
              </span>
            ))}
          </div>
        </motion.div>

        <div className="pointer-events-none absolute right-6 bottom-4 flex gap-6 text-right max-sm:hidden">
          <Stat label="ficheros" value={metrics?.fileCount ?? 0} />
          <Stat label="commits/30d" value={metrics?.commitsLast30d ?? 0} />
          <Stat label="sesiones IA" value={project.agents.total} />
        </div>
      </div>

      {/* Mezcla de lenguajes */}
      <div className="px-6 pt-3">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          {langs.map((l) => (
            <div key={l.name} style={{ width: `${l.ratio * 100}%`, background: l.color }} title={`${l.name} ${(l.ratio * 100).toFixed(1)}%`} />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          {langs.slice(0, 6).map((l) => (
            <span key={l.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.name} {(l.ratio * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      {/* Paneles */}
      <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6 max-sm:px-3 max-sm:pb-3">
        <nav className="mb-3 flex gap-1 max-sm:snap-x max-sm:overflow-x-auto max-sm:pb-1 max-sm:whitespace-nowrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg px-4 py-1.5 text-sm transition-colors max-sm:snap-start ${
                tab === t.id ? "bg-accent/25 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
              {t.id === "agentes" && project.agents.total > 0 && (
                <span className="ml-1.5 text-[10px] text-slate-500">{project.agents.total}</span>
              )}
              {t.id === "tareas" && project.tasks.open + project.tasks.suggested > 0 && (
                <span className="ml-1.5 text-[10px] text-sky-300">{project.tasks.open + project.tasks.suggested}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1">
          {tab === "resumen" && <SummaryTab project={project} />}
          {tab === "git" && <GitPanel project={project} />}
          {tab === "agentes" && <AgentTimeline project={project} />}
          {tab === "tareas" && <TaskBoard project={project} />}
          {tab === "conocimiento" && (
            <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-1 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col gap-4">
                <ScratchpadPanel project={project} />
                <NotesPanel project={project} />
              </div>
              <KnowledgeGraphPanel project={project} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Resumen: lo que necesitas saber y poder hacer nada más entrar. */
function SummaryTab({ project }: { project: Project }) {
  const pkg = project.analysis?.pkg;
  const health = project.analysis?.health;
  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-1 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Abrir</h3>
          <ProjectActions project={project} />
        </section>
        <ScriptsPanel project={project} />
      </div>
      <div className="space-y-4">
        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Ficha</h3>
          <dl className="space-y-2 text-xs">
            <Fact label="Ruta" value={project.path} mono />
            {pkg?.version && <Fact label="Versión" value={pkg.version} />}
            {pkg && <Fact label="Gestor" value={pkg.packageManager} />}
            {pkg?.monorepo && <Fact label="Estructura" value="Monorepo con workspaces" />}
            {project.remoteUrl && <Fact label="Remoto" value={project.remoteUrl} mono />}
            {pkg?.description && <Fact label="Descripción" value={pkg.description} />}
          </dl>
          {health && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
              <HealthChip ok={Boolean(health.readme)} label={health.readme ? "README" : "sin README"} />
              <HealthChip ok={Boolean(health.license)} label={health.license ? "Licencia" : "sin licencia"} />
              <HealthChip ok={health.ci.length > 0} label={health.ci.length > 0 ? `CI (${health.ci.length})` : "sin CI"} />
              <HealthChip ok={Boolean(health.tests)} label={health.tests ?? "sin tests"} />
              {health.envExample && <HealthChip ok label=".env.example" />}
              {health.envLocal && <HealthChip ok label=".env local" />}
            </div>
          )}
        </section>
        <PullRequests projectId={project.id} />
        <ReadmePanel project={project} />
      </div>
    </div>
  );
}

/** Señal de salud: verde si está, apagada si falta (nunca alarmista). */
function HealthChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[10px] ${
        ok ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500"
      }`}
    >
      {label}
    </span>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className={`min-w-0 flex-1 break-all text-slate-200 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-xl font-bold text-white">{value}</div>
      <div className="text-[10px] tracking-wider text-slate-400 uppercase">{label}</div>
    </div>
  );
}
