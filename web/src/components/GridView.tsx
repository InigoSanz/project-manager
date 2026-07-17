import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Project } from "@nebula/shared";

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
  return (
    <div className="h-full overflow-y-auto p-8 pt-24 max-sm:p-4 max-sm:pt-20 max-sm:pb-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
          >
            <Link
              to={`/project/${p.id}`}
              className="glass block rounded-2xl p-5 transition-all hover:border-white/25 hover:shadow-[0_0_30px_-8px_var(--color-glow)]"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate font-semibold text-white">{p.name}</h3>
                <div className="flex shrink-0 gap-1.5">
                  {p.git && (p.git.behind > 0 || p.git.conflicted > 0) && (
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300" title={p.git.conflicted > 0 ? "conflictos" : `${p.git.behind} commits por detrás`}>
                      ▲ atención
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
              <p className="mt-1 truncate text-xs text-slate-400">{p.path}</p>
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
                {p.tasks.open > 0 && <span className="text-sky-300">{p.tasks.open} tareas</span>}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
