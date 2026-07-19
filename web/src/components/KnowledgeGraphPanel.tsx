import { useEffect, useRef, useState } from "react";
import ForceGraph3D from "3d-force-graph";
import type { KnowledgeGraph, Project } from "@nebula/shared";

/** Colores por comunidad (identidad → tono fijo, con etiqueta textual en tooltip). */
const GROUP_COLORS = ["#7c8cff", "#5eead4", "#fbbf24", "#f472b6", "#a3e635", "#38bdf8", "#c084fc", "#fb923c"];

export function KnowledgeGraphPanel({ project }: { project: Project }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "empty" | "ready">("loading");

  useEffect(() => {
    let alive = true;
    let graph: InstanceType<typeof ForceGraph3D> | null = null;

    void (async () => {
      const res = await fetch(`/api/projects/${project.id}/graph`);
      if (!alive) return;
      if (res.status !== 200) {
        setState("empty");
        return;
      }
      const data: KnowledgeGraph = await res.json();
      if (!alive || !container.current) return;
      setState("ready");

      graph = new ForceGraph3D(container.current)
        .backgroundColor("#05060f")
        .graphData({ nodes: data.nodes as any, links: data.links as any })
        .nodeLabel((n: any) => `<div style="font-size:11px"><b>${n.label}</b><br/>${n.type}</div>`)
        .nodeColor((n: any) => GROUP_COLORS[Number(n.group ?? 0) % GROUP_COLORS.length])
        .nodeOpacity(0.85)
        .nodeRelSize(3)
        .linkColor(() => "#ffffff")
        .linkOpacity(0.12)
        .linkWidth(0)
        .width(container.current.clientWidth)
        .height(container.current.clientHeight);
    })();

    const onResize = (): void => {
      if (graph && container.current) {
        graph.width(container.current.clientWidth).height(container.current.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.removeEventListener("resize", onResize);
      graph?._destructor?.();
    };
  }, [project.id]);

  return (
    <div className="relative h-full">
      <div ref={container} className="glass h-full overflow-hidden rounded-2xl" />
      {state !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center">
          {state === "loading" ? (
            <p className="text-sm text-slate-500">Cargando grafo…</p>
          ) : (
            <div className="max-w-md text-center text-sm text-slate-400">
              <p className="text-3xl">🕸</p>
              <p className="mt-3 text-slate-300">Este proyecto aún no tiene grafo de conocimiento.</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Genera uno con{" "}
                <a
                  href="https://github.com/safishamsi/graphify"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-300 hover:underline"
                >
                  Graphify
                </a>
                :
                <code className="mt-2 block rounded-lg bg-black/40 p-2 text-left text-[11px] text-slate-300">
                  uv tool install graphify
                  <br />
                  cd {project.path}
                  <br />
                  graphify map
                </code>
                Nebula detectará <code className="text-indigo-300">graphify-out/graph.json</code> automáticamente.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
