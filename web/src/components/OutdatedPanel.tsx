import { useEffect, useState } from "react";
import type { OutdatedReport, Project } from "@nebula/shared";
import { Icon } from "./Icon";
import { plural } from "../lib/plural";

/**
 * Dependencias desactualizadas. Solo informa — Nebula nunca actualiza nada.
 * Se lanza a mano porque consulta el registry y tarda.
 */
export function OutdatedPanel({ project }: { project: Project }) {
  const [report, setReport] = useState<OutdatedReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setReport(null);
    fetch(`/api/projects/${project.id}/outdated`)
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((d) => alive && setReport(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project.id]);

  if (!project.analysis?.pkg) return null;

  const run = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/outdated`, { method: "POST" });
      if (res.ok) setReport((await res.json()) as OutdatedReport);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="glass rounded-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Dependencias</h3>
        <button
          onClick={() => void run()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <Icon name="refresh" size={11} />
          {loading ? "Consultando…" : report ? "Volver a comprobar" : "Comprobar"}
        </button>
      </div>

      {!report ? (
        <p className="text-xs text-slate-500">
          Sin comprobar: consulta el registro de paquetes, así que tarda unos segundos.
        </p>
      ) : report.deps.length === 0 ? (
        <p className="text-xs text-emerald-300">Todo al día.</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-slate-500">
            {plural(report.deps.length, "dependencia desactualizada", "dependencias desactualizadas")}
            {report.deps.some((d) => d.major) && (
              <>
                {" · "}
                <span className="text-amber-300">
                  {report.deps.filter((d) => d.major).length} con salto de versión mayor
                </span>
              </>
            )}
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px]">
            {report.deps.map((d) => (
              <li key={d.name} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-slate-300">{d.name}</span>
                <span className="shrink-0 text-slate-500">{d.current ?? "—"}</span>
                <Icon name="chevronRight" size={9} className="shrink-0 text-slate-600" />
                <span className={`shrink-0 ${d.major ? "text-amber-300" : "text-emerald-300"}`}>{d.latest}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-600">
            Nebula solo informa: actualízalas tú desde la terminal.
          </p>
        </>
      )}
    </section>
  );
}
