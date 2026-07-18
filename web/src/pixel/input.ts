import type { Camera, Point } from "./camera";

export interface InputHandlers {
  onTap?: (world: Point, screen: Point) => void;
  onDoubleTap?: (world: Point, screen: Point) => void;
  /** null cuando el puntero sale del canvas o hay un gesto activo */
  onHover?: (world: Point | null, screen: Point | null) => void;
}

const TAP_MAX_MS = 300;
const TAP_MAX_DIST = 6;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 24;

interface PointerState {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startAt: number;
  moved: boolean;
}

/**
 * Gestos sobre el canvas: arrastre = pan, rueda = zoom al cursor, pinch con
 * dos punteros, tap y doble tap. Devuelve la función de limpieza.
 */
export function attachInput(canvas: HTMLCanvasElement, camera: Camera, handlers: InputHandlers): () => void {
  const pointers = new Map<number, PointerState>();
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let pinchDist = 0;
  // muestras recientes del arrastre para calcular la velocidad del fling
  let samples: Array<{ x: number; y: number; t: number }> = [];

  const local = (e: PointerEvent | WheelEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: PointerEvent): void => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, { x: p.x, y: p.y, startX: p.x, startY: p.y, startAt: performance.now(), moved: false });
    camera.stop();
    samples = [{ x: p.x, y: p.y, t: performance.now() }];
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      handlers.onHover?.(null, null);
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const p = local(e);
    const st = pointers.get(e.pointerId);
    if (!st) {
      // movimiento sin botón: hover
      handlers.onHover?.(camera.screenToWorld(p), p);
      return;
    }
    const dx = p.x - st.x;
    const dy = p.y - st.y;
    if (Math.hypot(p.x - st.startX, p.y - st.startY) > TAP_MAX_DIST) st.moved = true;

    if (pointers.size === 1) {
      camera.panBy(dx, dy);
      const now = performance.now();
      samples.push({ x: p.x, y: p.y, t: now });
      while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
    } else if (pointers.size === 2) {
      st.x = p.x;
      st.y = p.y;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchDist > 0 && dist > 0) camera.zoomAt(mid, dist / pinchDist);
      pinchDist = dist;
    }
    st.x = p.x;
    st.y = p.y;
  };

  const onPointerUp = (e: PointerEvent): void => {
    const st = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!st) return;
    if (pointers.size === 1) {
      // fin del pinch: el puntero restante no debe "saltar"
      pinchDist = 0;
      const rest = [...pointers.values()][0];
      samples = [{ x: rest.x, y: rest.y, t: performance.now() }];
      return;
    }
    if (pointers.size > 0) return;

    const now = performance.now();
    if (!st.moved && now - st.startAt < TAP_MAX_MS) {
      const p = { x: st.x, y: st.y };
      const isDouble = now - lastTapAt < DOUBLE_TAP_MS && Math.hypot(p.x - lastTapX, p.y - lastTapY) < DOUBLE_TAP_DIST;
      lastTapAt = isDouble ? 0 : now;
      lastTapX = p.x;
      lastTapY = p.y;
      if (isDouble) handlers.onDoubleTap?.(camera.screenToWorld(p), p);
      else handlers.onTap?.(camera.screenToWorld(p), p);
      camera.settleZoom();
      return;
    }
    // fling con la velocidad media de las últimas muestras
    if (samples.length >= 2) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0.01) camera.fling((b.x - a.x) / dt, (b.y - a.y) / dt);
    }
    camera.settleZoom();
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    camera.zoomAt(local(e), factor);
    // pequeño debounce del snap: se asienta al dejar de rodar
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => camera.settleZoom(), 160);
  };
  let wheelTimer: ReturnType<typeof setTimeout>;

  const onLeave = (): void => handlers.onHover?.(null, null);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    clearTimeout(wheelTimer);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
  };
}
