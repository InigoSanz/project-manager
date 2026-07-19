import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Project } from "@nebula/shared";
import { PixelPlanet } from "./PixelPlanet";
import { Icon } from "./Icon";
import { ProjectActions } from "./ProjectActions";
import { ArchiveButton, FavoriteButton } from "./ProjectFlags";
import { useNebula } from "../stores/nebula";
import { groupProjectsByRoot, ORPHAN_ZONE, zoneName } from "../pixel/roots";
import { zoneColor } from "../pixel/palette";

function LanguageBar({ project }: { project: Project }) {
  const langs = project.analysis?.languages ?? [];
  if (langs.length === 0) return null;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      {langs.slice(0, 6).map((l) => (
        <div key={l.name} style={{ width: `${l.ratio * 100}%`, background: l.color }} title={l.name} />
      ))}
    </div>
  );
}

export function GridView({ projects }: { projects: Project[] }) {
  const config = useNebula((s) => s.config);
  // mismas agrupación y colores que el mapa, para que ambas vistas se lean igual
  const zones = useMemo(
    () => [...groupProjectsByRoot(projects, config?.roots ?? []).entries()],
    [projects, config],
  );

  return (
    <div className="h-full overflow-y-auto p-8 pt-24 max-sm:p-4 max-sm:pt-20 max-sm:pb-28">
      <div className="mx-auto max-w-6xl space-y-8">
        {zones.map(([root, list]) => (
          <section key={root}>
            <header className="mb-3 flex items-center gap-2.5">
              <span
                className="h-3 w-3 shrink-0 rounded-[3px]"
                style={{ background: root === ORPHAN_ZONE ? "hsla(230 65% 62% / 1)" : zoneColor(root) }}
              />
              <h2
                className="text-xs font-semibold tracking-wider text-slate-300 uppercase"
                title={
                  root === ORPHAN_ZONE
                    ? "Proyectos cuya carpeta raíz ya no está en la configuración"
                    : root
                }
              >
                {root === ORPHAN_ZONE ? "Espacio profundo" : zoneName(root)}
              </h2>
              <span className="text-xs text-slate-500">{list.length}</span>
              {root !== ORPHAN_ZONE && (
                <span className="truncate font-mono text-[10px] text-slate-600" title={root}>
                  {root}
                </span>
              )}
            </header>
            <ProjectGrid projects={list} />
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectGrid({ projects }: { projects: Project[] }) {
  // los favoritos van primero: es lo que promete el botón de la estrella
  const sorted = [...projects].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
  );
  return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
          >
            <Link
              to={`/project/${p.id}`}
              className="glass group block rounded-2xl p-5 transition-all hover:border-white/25 hover:shadow-[0_0_30px_-8px_var(--color-glow)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <PixelPlanet project={p} size={34} animate={false} className="shrink-0" />
                  <h3 className="truncate font-semibold text-white">{p.name}</h3>
                  <FavoriteButton project={p} size={13} />
                  <ArchiveButton project={p} size={13} />
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {p.git && (p.git.behind > 0 || p.git.conflicted > 0) && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300"
                      title={
                        p.git.conflicted > 0
                          ? "Hay conflictos sin resolver"
                          : `${p.git.behind} commit${p.git.behind === 1 ? "" : "s"} por detrás del remoto`
                      }
                    >
                      <Icon name="flag" size={10} />
                      atención
                    </span>
                  )}
                  {p.git && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        p.git.clean ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {p.git.clean ? "limpio" : "cambios"}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 truncate pl-[46px] text-xs text-slate-400 max-sm:pl-0">{p.path}</p>
              <div className="mt-4">
                <LanguageBar project={p} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.analysis?.frameworks ?? []).slice(0, 5).map((f) => (
                  <span key={f} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
                {p.git?.branch && <span>⎇ {p.git.branch}</span>}
                <span>{p.analysis?.metrics.commitsLast30d ?? 0} commits/30d</span>
                {p.tasks.open > 0 && (
                  <span className="text-sky-300">
                    {p.tasks.open} tarea{p.tasks.open === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {/* acciones sobre la propia tarjeta, sin entrar al proyecto */}
              <ProjectActions project={p} compact className="mt-3 opacity-60 transition-opacity group-hover:opacity-100" />
            </Link>
          </motion.div>
        ))}
      </div>
  );
}
