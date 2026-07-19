import { useEffect, useRef, useState } from "react";
import type { Project } from "@nebula/shared";
import { Icon } from "./Icon";

/**
 * Bloc de notas propio del proyecto, guardado en Nebula. Distinto de las notas
 * de Obsidian, que solo se leen. Autoguardado con debounce, como en Ajustes.
 */
export function ScratchpadPanel({ project }: { project: Project }) {
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    fetch(`/api/projects/${project.id}/scratchpad`)
      .then((r) => r.json())
      .then((d: { body: string }) => {
        if (!alive) return;
        setBody(d.body ?? "");
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [project.id]);

  const change = (value: string): void => {
    setBody(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void fetch(`/api/projects/${project.id}/scratchpad`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      }).then(() => {
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1800);
      });
    }, 600);
  };

  return (
    <section className="glass flex min-h-0 flex-col rounded-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Mis notas</h3>
        {saved && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-300">
            <Icon name="check" size={11} />
            Guardado
          </span>
        )}
      </div>
      <textarea
        value={body}
        onChange={(e) => change(e.target.value)}
        disabled={!loaded}
        placeholder="Ideas, pendientes, comandos que siempre se te olvidan…"
        className="min-h-40 flex-1 resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:ring-1 focus:ring-accent/60 focus:outline-none"
      />
    </section>
  );
}
