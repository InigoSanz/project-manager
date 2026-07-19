import { useMemo } from "react";
import type { Project } from "@nebula/shared";
import { Icon } from "./Icon";

export interface Filters {
  tech: string | null;
  state: "all" | "dirty" | "behind" | "clean";
  activity: "all" | "week" | "stale";
  onlyFavorites: boolean;
  onlyWithTasks: boolean;
  showArchived: boolean;
}

export const EMPTY_FILTERS: Filters = {
  tech: null,
  state: "all",
  activity: "all",
  onlyFavorites: false,
  onlyWithTasks: false,
  showArchived: false,
};

export function isFiltering(f: Filters): boolean {
  return (
    f.tech !== null ||
    f.state !== "all" ||
    f.activity !== "all" ||
    f.onlyFavorites ||
    f.onlyWithTasks ||
    f.showArchived
  );
}

/** Aplica los filtros. Se usa igual para el mapa y para la cuadrícula. */
export function applyFilters(projects: Project[], f: Filters): Project[] {
  const weekAgo = Date.now() - 7 * 86_400_000;
  return projects.filter((p) => {
    if (!f.showArchived && p.archived) return false;
    if (f.onlyFavorites && !p.favorite) return false;
    if (f.onlyWithTasks && p.tasks.open + p.tasks.suggested === 0) return false;
    if (f.tech && !(p.analysis?.frameworks ?? []).includes(f.tech)) return false;

    if (f.state === "dirty" && (p.git?.clean ?? true)) return false;
    if (f.state === "behind" && !(p.git && p.git.behind > 0)) return false;
    if (f.state === "clean" && !(p.git?.clean ?? false)) return false;

    if (f.activity !== "all") {
      const last = p.analysis?.metrics.lastCommitAt;
      const recent = last ? Date.parse(last) > weekAgo : false;
      if (f.activity === "week" && !recent) return false;
      if (f.activity === "stale" && recent) return false;
    }
    return true;
  });
}

/** Barra de filtros compacta: una sola fila, sin menús anidados. */
export function ProjectFilters({
  projects,
  filters,
  onChange,
}: {
  projects: Project[];
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  // solo se ofrecen las tecnologías que existen de verdad, por frecuencia
  const techs = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of projects) {
      for (const f of p.analysis?.frameworks ?? []) count.set(f, (count.get(f) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [projects]);

  const set = (patch: Partial<Filters>): void => onChange({ ...filters, ...patch });
  const archivedCount = projects.filter((p) => p.archived).length;

  return (
    <div className="glass pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]">
      <select
        value={filters.tech ?? ""}
        onChange={(e) => set({ tech: e.target.value || null })}
        className="rounded-md bg-white/5 px-1.5 py-1 text-slate-300 focus:outline-none"
        title="Filtrar por tecnología"
      >
        <option value="" className="bg-slate-900">
          Tecnología
        </option>
        {techs.map(([t, n]) => (
          <option key={t} value={t} className="bg-slate-900">
            {t} ({n})
          </option>
        ))}
      </select>

      <select
        value={filters.state}
        onChange={(e) => set({ state: e.target.value as Filters["state"] })}
        className="rounded-md bg-white/5 px-1.5 py-1 text-slate-300 focus:outline-none"
        title="Filtrar por estado de git"
      >
        <option value="all" className="bg-slate-900">Estado git</option>
        <option value="dirty" className="bg-slate-900">Con cambios</option>
        <option value="behind" className="bg-slate-900">Por detrás</option>
        <option value="clean" className="bg-slate-900">Limpios</option>
      </select>

      <select
        value={filters.activity}
        onChange={(e) => set({ activity: e.target.value as Filters["activity"] })}
        className="rounded-md bg-white/5 px-1.5 py-1 text-slate-300 focus:outline-none"
        title="Filtrar por actividad reciente"
      >
        <option value="all" className="bg-slate-900">Actividad</option>
        <option value="week" className="bg-slate-900">Esta semana</option>
        <option value="stale" className="bg-slate-900">Dormidos</option>
      </select>

      <Toggle active={filters.onlyFavorites} onClick={() => set({ onlyFavorites: !filters.onlyFavorites })} title="Solo favoritos">
        <Icon name="star" size={11} />
      </Toggle>
      <Toggle active={filters.onlyWithTasks} onClick={() => set({ onlyWithTasks: !filters.onlyWithTasks })} title="Solo con tareas pendientes">
        <Icon name="check" size={11} />
      </Toggle>
      {archivedCount > 0 && (
        <Toggle
          active={filters.showArchived}
          onClick={() => set({ showArchived: !filters.showArchived })}
          title={`Mostrar los ${archivedCount} archivados`}
        >
          <Icon name="inbox" size={11} />
        </Toggle>
      )}

      {isFiltering(filters) && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="ml-1 rounded-md px-1.5 py-1 text-slate-400 hover:text-white"
          title="Quitar filtros"
        >
          <Icon name="close" size={11} />
        </button>
      )}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md px-2 py-1 transition-colors ${
        active ? "bg-accent/30 text-white" : "bg-white/5 text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
