import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project } from "@nebula/shared";
import { Camera } from "../pixel/camera";
import { PixelEngine } from "../pixel/engine";
import { attachInput } from "../pixel/input";
import { ParticleSystem } from "../pixel/particles";
import { SpaceScene, zoneBounds } from "../pixel/scene";
import { Starfield } from "../pixel/starfield";
import { useIsSmallScreen, useIsTouch } from "../lib/device";
import { useNebula } from "../stores/nebula";

const VOID = "#04050d";

/**
 * Mapa espacial pixel-art: canvas 2D con cámara pan/zoom y una zona por
 * carpeta raíz. El motor es imperativo y vive en un effect (cleanup total por
 * StrictMode); React solo empuja datos cuando cambian las props y pinta las
 * etiquetas DOM, cuya posición se actualiza por frame vía refs (sin setState).
 */
export function PixelMap({ projects }: { projects: Project[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const navigate = useNavigate();
  const config = useNebula((s) => s.config);
  const touch = useIsTouch();
  const small = useIsSmallScreen();
  const lite = touch || small;
  const [hoverId, setHoverId] = useState<string | null>(null);

  const roots = useMemo(() => config?.roots ?? [], [config]);
  const sceneRef = useRef<SpaceScene | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const didFitRef = useRef(false);

  // los handlers de input leen las props actuales sin reiniciar el motor
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const setHoverRef = useRef(setHoverId);
  setHoverRef.current = setHoverId;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const camera = new Camera();
    const scene = new SpaceScene(lite);
    const starfield = new Starfield(0x4e42, lite);
    const particles = new ParticleSystem(lite ? 60 : 200);
    cameraRef.current = camera;
    sceneRef.current = scene;
    didFitRef.current = false;

    // dpr entero: con 125% de escala de Windows los píxeles "bailan" si no
    const dpr = lite ? 1 : Math.max(1, Math.round(window.devicePixelRatio || 1));
    let time = 0;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      camera.viewW = rect.width;
      camera.viewH = rect.height;
      // el cambio de width resetea el estado del contexto: reafirmar siempre
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const positionLabels = (): void => {
      for (const node of scene.nodes) {
        const el = labelRefs.current.get(node.project.id);
        if (!el) continue;
        const s = camera.worldToScreen(node);
        const margin = 60;
        // el nombre aparece al acercarse lo bastante para que no se pise con el
        // del vecino; el planeta apuntado lo muestra siempre
        const inView =
          s.x > -margin && s.x < camera.viewW + margin && s.y > -margin && s.y < camera.viewH + margin;
        const visible = inView && (camera.zoom >= scene.labelZoom || scene.hoverId === node.project.id);
        if (!visible) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        const offset = node.sheet.bodyRadius * camera.zoom + 8;
        el.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y + offset)}px, 0)`;
      }
    };

    const engine = new PixelEngine({
      update: (dt) => {
        time += dt;
        camera.update(dt);
        scene.update(dt, useNebula.getState().liveActivity, Date.now());
        particles.update(dt, scene.nodes);
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
        scene.render(ctx, camera, time);
        particles.render(ctx, scene.nodes, time);
        positionLabels();
      },
    });

    const detachInput = attachInput(canvas, camera, {
      onTap: (world) => {
        const hit = scene.hitTest(world);
        if (hit?.kind === "planet") navigateRef.current(`/project/${hit.node.project.id}`);
      },
      onDoubleTap: (world) => {
        const hit = scene.hitTest(world);
        if (hit?.kind === "zone") camera.fitBounds(zoneBounds(hit.zone), 30);
        else if (hit?.kind === "planet") camera.animateTo({ x: hit.node.x, y: hit.node.y, zoom: 4 });
        else camera.fitBounds(scene.worldBounds(), 60);
      },
      onHover: (world) => {
        const hit = world ? scene.hitTest(world) : null;
        const id = hit?.kind === "planet" ? hit.node.project.id : null;
        canvas.style.cursor = id ? "pointer" : "";
        scene.hoverId = id; // brackets pixel en el lienzo
        setHoverRef.current((prev) => (prev === id ? prev : id));
      },
    });

    // chips de zona de la cabecera → enfocar la cámara
    const onFocusZone = (e: Event): void => {
      const root = (e as CustomEvent<string | null>).detail;
      const zone = root ? scene.zones.find((z) => z.root === root) : null;
      if (zone) camera.fitBounds(zoneBounds(zone), 30);
      else camera.fitBounds(scene.worldBounds(), 60);
    };
    window.addEventListener("nebula:focus-zone", onFocusZone);

    if (import.meta.env.DEV) {
      (window as unknown as { __pixelmap?: unknown }).__pixelmap = { camera, scene, lite };
    }

    engine.start();
    return () => {
      engine.stop();
      detachInput();
      observer.disconnect();
      window.removeEventListener("nebula:focus-zone", onFocusZone);
      cameraRef.current = null;
      sceneRef.current = null;
    };
  }, [lite]);

  // datos → escena (y encuadre inicial en cuanto hay proyectos Y config:
  // sin roots la escena agrupa todo en una zona provisional y el fit saldría mal)
  const configLoaded = config !== null;
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;
    scene.setData(projects, roots);
    if (!didFitRef.current && configLoaded && scene.nodes.length > 0) {
      camera.fitBounds(scene.worldBounds(), 60, false);
      didFitRef.current = true;
    }
  }, [projects, roots, lite, configLoaded]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="pixelated block h-full w-full touch-none select-none" />
      {/* etiquetas DOM: nombre siempre, detalle en hover */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {projects.map((p) => (
          <div
            key={p.id}
            ref={(el) => {
              if (el) labelRefs.current.set(p.id, el);
              else labelRefs.current.delete(p.id);
            }}
            className="absolute top-0 left-0 will-change-transform"
            style={{ display: "none" }}
          >
            <div className="flex -translate-x-1/2 flex-col items-center gap-1 text-center">
              <span
                className="max-w-[110px] truncate text-[11px] font-medium tracking-wide text-slate-200 [text-shadow:0_1px_4px_rgba(4,5,13,0.9)]"
                title={p.name}
              >
                {p.name}
              </span>
              {hoverId === p.id && <HoverCard project={p} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoverCard({ project }: { project: Project }) {
  const git = project.git;
  const tasks = project.tasks.open + project.tasks.suggested;
  return (
    <div className="glass pointer-events-none rounded-lg px-3 py-1.5 text-[11px] whitespace-nowrap text-slate-300">
      {git?.branch && (
        <span>
          ⎇ {git.branch}
          {git.ahead > 0 && <span className="text-emerald-300"> ↑{git.ahead}</span>}
          {git.behind > 0 && <span className="text-amber-300"> ↓{git.behind}</span>}
          {!git.clean && <span className="text-rose-300"> ●</span>}
        </span>
      )}
      {tasks > 0 && <span className="ml-2 text-indigo-300">☰ {tasks}</span>}
      {!git?.branch && tasks === 0 && <span className="text-slate-400">sin actividad</span>}
    </div>
  );
}
