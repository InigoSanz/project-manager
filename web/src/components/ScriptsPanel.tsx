import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "./Toast";
import { Icon } from "./Icon";

/**
 * Scripts del package.json, lanzables desde aquí con su salida en vivo.
 * El servidor solo acepta nombres que existan de verdad en el package.json.
 */
export function ScriptsPanel({ project }: { project: Project }) {
  const pkg = project.analysis?.pkg;
  const allRuns = useNebula((s) => s.runs);
  const runOutput = useNebula((s) => s.runOutput);
  const push = useToasts((s) => s.push);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const runs = useMemo(() => allRuns.filter((r) => r.projectId === project.id), [allRuns, project.id]);
  const liveByScript = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of runs) if (r.status === "running") map.set(r.script, r.id);
    return map;
  }, [runs]);

  // la consola sigue la salida
  const lines = openRunId ? (runOutput[openRunId] ?? []) : [];
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  if (!pkg || pkg.scripts.length === 0) {
    return (
      <section className="glass rounded-xl p-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Scripts</h3>
        <p className="text-xs text-slate-500">
          {pkg ? "Este package.json no declara scripts." : "Este proyecto no tiene package.json."}
        </p>
      </section>
    );
  }

  const start = async (script: string): Promise<void> => {
    const res = await fetch(`/api/projects/${project.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok) {
      push({ level: "error", message: body.error ?? "No se pudo lanzar el script." });
      return;
    }
    if (body.id) setOpenRunId(body.id);
  };

  const stop = async (runId: string): Promise<void> => {
    await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
  };

  const openRun = runs.find((r) => r.id === openRunId) ?? null;

  return (
    <section className="glass rounded-xl p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Scripts</h3>
        <span className="font-mono text-[10px] text-slate-600">{pkg.packageManager}</span>
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-slate-600">
        Solo se ejecutan los scripts que declara el package.json, y únicamente desde este equipo.
      </p>

      <ul className="space-y-1.5">
        {pkg.scripts.map((script) => {
          const runId = liveByScript.get(script);
          const running = Boolean(runId);
          return (
            <li key={script} className="flex items-center gap-2">
              <button
                onClick={() => (running ? void stop(runId!) : void start(script))}
                title={running ? "Detener" : `Ejecutar ${pkg.packageManager} run ${script}`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                  running
                    ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/35"
                    : "bg-white/5 text-slate-400 hover:bg-accent/25 hover:text-white"
                }`}
              >
                <Icon name={running ? "stop" : "play"} size={12} />
              </button>
              <button
                onClick={() => runId && setOpenRunId(runId)}
                disabled={!runId}
                className="min-w-0 flex-1 truncate text-left font-mono text-xs text-slate-200 disabled:cursor-default"
              >
                {script}
              </button>
              {running && <span className="animate-pulse text-[10px] text-emerald-300">● en marcha</span>}
            </li>
          );
        })}
      </ul>

      {openRun && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
            <span className="truncate font-mono text-[10px] text-slate-400">{openRun.command}</span>
            <div className="flex items-center gap-2">
              {openRun.url && (
                <a
                  href={openRun.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                >
                  <Icon name="external" size={10} />
                  {openRun.url.replace(/^https?:\/\//, "")}
                </a>
              )}
              {openRun.status !== "running" && (
                <span className={`text-[10px] ${openRun.exitCode === 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {openRun.exitCode === 0 ? "Terminado correctamente" : `Falló (código ${openRun.exitCode ?? "?"})`}
                </span>
              )}
              <button onClick={() => setOpenRunId(null)} className="text-slate-500 hover:text-white" title="Cerrar">
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
          <div ref={consoleRef} className="max-h-56 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
            {lines.length === 0 ? (
              <p className="text-slate-600">Esperando salida…</p>
            ) : (
              lines.map((l, i) => (
                <div key={i} className={l.stream === "stderr" ? "text-rose-300/90" : "text-slate-300"}>
                  {l.line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
