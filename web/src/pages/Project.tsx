import { useMemo, useState } from "react";
import type { Project } from "@nebula/shared";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useNebula } from "../stores/nebula";
import { deriveDNA } from "../visuals/dna";
import { PixelPlanet } from "../components/PixelPlanet";
import { Icon } from "../components/Icon";
import { ProjectActions } from "../components/ProjectActions";
import { ScriptsPanel } from "../components/ScriptsPanel";
import { ReadmePanel } from "../components/ReadmePanel";
import { ScratchpadPanel } from "../components/ScratchpadPanel";
import { PullRequests } from "../components/PullRequests";
import { ArchiveButton, FavoriteButton } from "../components/ProjectFlags";
import { OutdatedPanel } from "../components/OutdatedPanel";
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
      {/* Cabecera compacta: una franja, no un tercio de la pantalla */}
      <header className="shrink-0 border-b border-white/5 px-6 pt-4 pb-3 max-sm:px-3">
        {/* navegación + salida al trabajo real */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
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
          <div className="flex items-center gap-2">
            {live && (
              <span className="glass animate-pulse rounded-lg px-3 py-1.5 text-xs text-emerald-300 max-sm:hidden">
                ● agente trabajando
              </span>
            )}
            <ProjectActions project={project} className="max-sm:hidden" />
          </div>
        </div>

        {/* identidad: planeta pequeño en línea + nombre/ruta/rama + stats */}
        <div className="mt-3 flex items-center gap-3">
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 -z-10 rounded-full blur-lg"
              style={{ background: `${dna.colors[0]}55` }}
            />
            <PixelPlanet project={project} size={touch || small ? 46 : 58} live={live} animate />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white max-sm:text-lg">
              <span className="truncate">{project.name}</span>
              <FavoriteButton project={project} size={16} />
              <ArchiveButton project={project} size={16} />
              {live && (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-normal text-emerald-300 sm:hidden">
                  ● IA
                </span>
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="max-w-full truncate font-mono text-slate-500">{project.path}</span>
              {project.git?.branch && (
                <span className="glass rounded px-1.5 py-0.5 text-slate-200">⎇ {project.git.branch}</span>
              )}
              {(project.analysis?.frameworks ?? []).slice(0, 4).map((f) => (
                <span key={f} className="glass rounded px-1.5 py-0.5 text-indigo-200">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-4 text-right max-sm:gap-3">
            <Stat label="ficheros" value={metrics?.fileCount ?? 0} />
            <Stat label="commits" value={metrics?.commitsLast30d ?? 0} />
            <Stat label="IA" value={project.agents.total} />
          </div>
        </div>

        {/* mezcla de lenguajes, fina */}
        {langs.length > 0 && (
          <div className="mt-3">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              {langs.map((l) => (
                <div key={l.name} style={{ width: `${l.ratio * 100}%`, background: l.color }} title={`${l.name} ${(l.ratio * 100).toFixed(1)}%`} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 max-sm:hidden">
              {langs.slice(0, 6).map((l) => (
                <span key={l.name} className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                  {l.name} {(l.ratio * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

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
          {tab === "conocimiento" && <KnowledgeTab project={project} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Pestaña Conocimiento: el grafo estelar ocupa todo el ancho y las notas (bloc
 * propio + Obsidian) viven en un cajón lateral plegable, para dar aire a un
 * grafo denso sin perderlas de vista.
 */
function KnowledgeTab({ project }: { project: Project }) {
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <div className="relative flex h-full min-h-0 gap-4 p-1">
      <div className="min-w-0 flex-1">
        <KnowledgeGraphPanel project={project} />
      </div>
      {notesOpen ? (
        // en escritorio es un cajón lateral; en móvil, un panel superpuesto
        <aside className="flex w-[340px] min-w-0 shrink-0 flex-col gap-4 overflow-y-auto max-sm:absolute max-sm:inset-0 max-sm:z-20 max-sm:w-auto max-sm:rounded-xl max-sm:bg-[#04050d]/95 max-sm:p-3 max-sm:backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Notas</h3>
            <button
              onClick={() => setNotesOpen(false)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              <Icon name="chevronRight" size={13} />
              Ocultar
            </button>
          </div>
          <ScratchpadPanel project={project} />
          <NotesPanel project={project} />
        </aside>
      ) : (
        <button
          onClick={() => setNotesOpen(true)}
          className="glass absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          <Icon name="note" size={14} />
          Notas
        </button>
      )}
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
        <OutdatedPanel project={project} />
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
              <HealthChip
                ok={Boolean(health.readme)}
                label={health.readme ? "README" : "sin README"}
                title={health.readme ? `Documentación en ${health.readme}` : "No se ha encontrado ningún README"}
              />
              <HealthChip
                ok={Boolean(health.license)}
                label={health.license ? "Licencia" : "sin licencia"}
                title={health.license ? `Licencia en ${health.license}` : "No se ha encontrado fichero de licencia"}
              />
              <HealthChip
                ok={health.ci.length > 0}
                label={health.ci.length > 0 ? `CI (${health.ci.length})` : "sin CI"}
                title={
                  health.ci.length > 0
                    ? `Integración continua: ${health.ci.join(", ")}`
                    : "No se ha encontrado configuración de integración continua"
                }
              />
              <HealthChip
                ok={Boolean(health.tests)}
                label={health.tests ?? "sin tests"}
                title={
                  health.tests
                    ? `Framework de tests detectado: ${health.tests}`
                    : "No se ha detectado ningún framework de tests"
                }
              />
              {health.envExample && (
                <HealthChip ok label=".env.example" title="Hay una plantilla de variables de entorno" />
              )}
              {health.envLocal && (
                <HealthChip ok label=".env local" title="Hay un .env en el repo (Nebula nunca lee su contenido)" />
              )}
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
function HealthChip({ ok, label, title }: { ok: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className={`cursor-default rounded-md px-2 py-0.5 text-[10px] ${
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
      <div className="font-display text-lg leading-none font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[9px] tracking-wider text-slate-500 uppercase">{label}</div>
    </div>
  );
}
