import { useEffect, useRef, useState } from "react";
import type { KnowledgeGraph, Project } from "@nebula/shared";
import { Camera } from "../pixel/camera";
import { PixelEngine } from "../pixel/engine";
import { attachInput } from "../pixel/input";
import { GraphScene } from "../pixel/graph/graphScene";
import type { GraphNodePos } from "../pixel/graph/graphLayout";
import { Starfield } from "../pixel/starfield";
import { useIsSmallScreen, useIsTouch } from "../lib/device";

const VOID = "#04050d";

type LoadState = "loading" | "empty" | "ready";

/**
 * Mapa estelar del grafo de conocimiento (Graphify) en pixel-art 2D: cada nodo
 * es una estrella, cada comunidad una constelación con su nebulosa, y las
 * llamadas/imports líneas de luz. Misma cámara y gestos que el mapa de
 * proyectos. Reemplaza al antiguo force-graph 3D (three.js).
 */
export function KnowledgeGraphPanel({ project }: { project: Project }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [hover, setHover] = useState<GraphNodePos | null>(null);
  const setHoverRef = useRef(setHover);
  setHoverRef.current = setHover;

  const lite = useIsTouch() || useIsSmallScreen();

  // 1) cargar el grafo del proyecto
  useEffect(() => {
    let alive = true;
    setState("loading");
    setGraph(null);
    void (async () => {
      const res = await fetch(`/api/projects/${project.id}/graph`);
      if (!alive) return;
      if (res.status !== 200) {
        setState("empty");
        return;
      }
      const data: KnowledgeGraph = await res.json();
      if (!alive) return;
      setGraph(data);
      setState(data.nodes.length > 0 ? "ready" : "empty");
    })();
    return () => {
      alive = false;
    };
  }, [project.id]);

  // 2) montar el motor pixel cuando hay datos (imperativo, como PixelMap)
  useEffect(() => {
    if (state !== "ready" || !graph) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const camera = new Camera();
    const scene = new GraphScene(lite);
    const starfield = new Starfield(0x51a4, lite);
    scene.setData(graph);

    const dpr = lite ? 1 : Math.max(1, Math.round(window.devicePixelRatio || 1));
    let time = 0;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      camera.viewW = rect.width;
      camera.viewH = rect.height;
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // encuadre inicial: todo el grafo a la vista
    camera.fitBounds(scene.worldBounds(), 60, false);

    const positionTooltip = (): void => {
      const el = tooltipRef.current;
      if (!el) return;
      const id = scene.hoverId;
      const node = id ? scene.nodes.find((n) => n.id === id) : null;
      if (!node) {
        el.style.display = "none";
        return;
      }
      const s = camera.worldToScreen(node);
      el.style.display = "";
      el.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y - node.r * camera.zoom - 10)}px, 0)`;
    };

    const engine = new PixelEngine({
      update: (dt) => {
        time += dt;
        camera.update(dt);
        scene.update(dt);
      },
      render: () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = VOID;
        ctx.fillRect(0, 0, camera.viewW, camera.viewH);
        starfield.render(ctx, camera, time);
        const z = camera.zoom;
        ctx.setTransform(
          z * dpr,
          0,
          0,
          z * dpr,
          (camera.viewW / 2 - camera.x * z) * dpr,
          (camera.viewH / 2 - camera.y * z) * dpr,
        );
        scene.renderWorld(ctx, camera, time);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        scene.renderOverlay(ctx, camera);
        positionTooltip();
      },
    });

    // enfocar = iluminar el vecindario; lo dispara tanto el hover (ratón) como
    // el toque (táctil), con el mismo efecto para que el modelo sea predecible
    const focus = (hit: GraphNodePos | null): void => {
      scene.setFocus(hit ? hit.id : null);
      scene.hoverId = hit ? hit.id : null;
      canvas.style.cursor = hit ? "pointer" : "";
      setHoverRef.current((prev) => (prev?.id === (hit?.id ?? null) ? prev : hit));
    };

    const detachInput = attachInput(canvas, camera, {
      onTap: (world) => focus(scene.hitTest(world)),
      onDoubleTap: (world) => {
        const node = scene.hitTest(world);
        if (node) camera.animateTo({ x: node.x, y: node.y, zoom: 3 });
        else {
          const c = scene.communityAt(world);
          if (c) camera.fitBounds(scene.communityBounds(c), 40);
          else camera.fitBounds(scene.worldBounds(), 60);
        }
      },
      onHover: (world) => focus(world ? scene.hitTest(world) : null),
    });

    if (import.meta.env.DEV) {
      (window as unknown as { __graph?: unknown }).__graph = { camera, scene };
    }

    engine.start();
    return () => {
      engine.stop();
      detachInput();
      observer.disconnect();
    };
  }, [state, graph, lite]);

  if (state !== "ready") {
    return (
      <div className="glass relative h-full overflow-hidden rounded-2xl">
        <div className="absolute inset-0 flex items-center justify-center p-6">
          {state === "loading" ? (
            <p className="text-sm text-slate-500">Cargando grafo…</p>
          ) : (
            <EmptyState projectPath={project.path} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass relative h-full overflow-hidden rounded-2xl">
      <canvas ref={canvasRef} className="pixelated block h-full w-full touch-none select-none" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={tooltipRef} className="absolute top-0 left-0 will-change-transform" style={{ display: "none" }}>
          {hover && (
            <div className="glass -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap">
              <span className="font-medium text-slate-100">{hover.label}</span>
              <span className="ml-2 text-slate-400">
                {hover.type} · {hover.degree} conex.
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-slate-500">
        Pasa el ratón por una estrella para ver sus conexiones · doble clic para acercarte
      </div>
    </div>
  );
}

function EmptyState({ projectPath }: { projectPath: string }) {
  return (
    <div className="max-w-md text-center text-sm text-slate-400">
      <p className="text-3xl">✦</p>
      <p className="mt-3 text-slate-300">Este proyecto aún no tiene grafo de conocimiento.</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Genéralo con{" "}
        <a
          href="https://github.com/safishamsi/graphify"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-300 hover:underline"
        >
          Graphify
        </a>{" "}
        (100% local, sin conexión):
      </p>
      <code className="mt-2 block rounded-lg bg-black/40 p-2 text-left text-[11px] text-slate-300">
        uv tool install graphify
        <br />
        cd {projectPath}
        <br />
        graphify update .
      </code>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Nebula detectará <code className="text-indigo-300">graphify-out/graph.json</code> automáticamente. Añade{" "}
        <code className="text-indigo-300">graphify cluster-only .</code> para agrupar el grafo en constelaciones.
      </p>
    </div>
  );
}
