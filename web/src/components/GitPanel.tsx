import { useEffect, useState } from "react";
import type { GitDetail, Project } from "@nebula/shared";

/** Sparkline de commits (serie única → un solo tono, barras finas, hueco 2px). */
function CommitSpark({ histogram }: { histogram: number[] }) {
  const max = Math.max(1, ...histogram);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex h-16 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {histogram.map((v, i) => {
          const daysAgo = histogram.length - 1 - i;
          return (
            <div
              key={i}
              className="group relative flex-1 cursor-default"
              onMouseEnter={() => setHover(i)}
            >
              <div
                className="w-full rounded-t-[3px] transition-colors"
                style={{
                  height: `${Math.max(v === 0 ? 4 : 10, (v / max) * 100)}%`,
                  background: hover === i ? "#a5b4fc" : v === 0 ? "#ffffff10" : "#7c8cff",
                  opacity: v === 0 ? 1 : 0.55 + (v / max) * 0.45,
                }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] whitespace-nowrap text-white shadow-lg ring-1 ring-white/10">
                  {v} commit{v === 1 ? "" : "s"} · {daysAgo === 0 ? "hoy" : `hace ${daysAgo}d`}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>hace 30 días</span>
        <span>hoy</span>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<string, string> = {
  M: "modificado",
  A: "añadido",
  D: "borrado",
  R: "renombrado",
  "??": "sin seguimiento",
  U: "conflicto",
};

export function GitPanel({ project }: { project: Project }) {
  const [detail, setDetail] = useState<GitDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${project.id}/git`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: GitDetail) => alive && setDetail(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // re-fetch cuando el estado git del proyecto cambia (evento WS actualiza project.git)
  }, [project.id, project.git]);

  if (error) return <p className="p-4 text-sm text-rose-300">No se pudo leer el estado git.</p>;
  if (!detail) return <p className="p-4 text-sm text-slate-500">Cargando git…</p>;

  const { status, commits, branches, changes } = detail;

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-1 lg:grid-cols-3">
      {/* Columna 1: estado + cambios */}
      <div className="space-y-4">
        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Estado</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-white/5 px-2 py-1 text-slate-200">⎇ {status.branch ?? "detached"}</span>
            {status.upstream && (
              <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">
                {status.upstream} {status.ahead > 0 && `↑${status.ahead}`} {status.behind > 0 && `↓${status.behind}`}
              </span>
            )}
            {status.clean ? (
              <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-300">✓ limpio</span>
            ) : (
              <>
                {status.staged > 0 && (
                  <span className="rounded-md bg-sky-500/15 px-2 py-1 text-sky-300">{status.staged} staged</span>
                )}
                {status.unstaged > 0 && (
                  <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-300">{status.unstaged} sin stage</span>
                )}
                {status.untracked > 0 && (
                  <span className="rounded-md bg-white/10 px-2 py-1 text-slate-300">{status.untracked} nuevos</span>
                )}
                {status.conflicted > 0 && (
                  <span className="rounded-md bg-rose-500/15 px-2 py-1 text-rose-300">⚠ {status.conflicted} conflictos</span>
                )}
              </>
            )}
          </div>
          {changes.length > 0 && (
            <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto text-xs">
              {changes.map((c) => (
                <li key={c.path} className="flex items-center gap-2 text-slate-300">
                  <span className="w-5 shrink-0 font-mono text-amber-400/90">{c.state}</span>
                  <span className="truncate" title={`${STATE_LABEL[c.state] ?? c.state}: ${c.path}`}>
                    {c.path}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Actividad · 30 días
          </h3>
          <CommitSpark histogram={project.analysis?.metrics.commitHistogram ?? []} />
        </section>

        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Ramas</h3>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {branches.map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-2 text-xs">
                <span className={`truncate ${b.isCurrent ? "font-semibold text-indigo-300" : "text-slate-300"}`}>
                  {b.isCurrent && "● "}
                  {b.name}
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">{b.lastCommitAt?.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Columnas 2-3: historial */}
      <section className="glass rounded-xl p-4 lg:col-span-2">
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Últimos commits</h3>
        <ul className="space-y-2 overflow-y-auto">
          {commits.map((c) => (
            <li key={c.hash} className="flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
              <code className="mt-0.5 shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                {c.shortHash}
              </code>
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-200" title={c.subject}>
                  {c.subject}
                </p>
                <p className="text-[11px] text-slate-500">
                  {c.author} · {new Date(c.date).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
                  {c.refs.length > 0 && <span className="ml-2 text-amber-300/80">{c.refs.join(" · ")}</span>}
                </p>
              </div>
            </li>
          ))}
          {commits.length === 0 && <li className="text-xs text-slate-500">Sin commits todavía.</li>}
        </ul>
      </section>
    </div>
  );
}
