/** Rectángulo en coordenadas de mundo (píxeles virtuales). */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

interface CameraAnim {
  fromX: number;
  fromY: number;
  fromZoom: number;
  toX: number;
  toY: number;
  toZoom: number;
  t: number;
  duration: number;
}

const FRICTION = 6; // fricción exponencial de la inercia (1/s)
// por debajo de 1 se permite zoom fraccionario (pantallas pequeñas): el mapa
// entero debe caber aunque el pixel-art pierda algo de nitidez al alejar
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 6;

/**
 * Cámara 2D: centro (x,y) en mundo + zoom (px de pantalla por px de mundo).
 * El zoom es continuo durante los gestos y hace snap al entero más cercano
 * al soltar (settleZoom) para que los píxeles queden nítidos en reposo.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 2;
  /** tamaño del viewport en px CSS (lo fija PixelMap en cada resize) */
  viewW = 1;
  viewH = 1;

  private vx = 0;
  private vy = 0;
  private anim: CameraAnim | null = null;

  worldToScreen(p: Point): Point {
    return {
      x: (p.x - this.x) * this.zoom + this.viewW / 2,
      y: (p.y - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(p: Point): Point {
    return {
      x: (p.x - this.viewW / 2) / this.zoom + this.x,
      y: (p.y - this.viewH / 2) / this.zoom + this.y,
    };
  }

  visibleBounds(margin = 0): Bounds {
    const w = this.viewW / this.zoom + margin * 2;
    const h = this.viewH / this.zoom + margin * 2;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  /** Pan en px de pantalla (arrastre directo: cancela inercia y animación). */
  panBy(dxScreen: number, dyScreen: number): void {
    this.anim = null;
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Lanza inercia con velocidad en px de pantalla por segundo. */
  fling(vxScreen: number, vyScreen: number): void {
    this.vx = -vxScreen / this.zoom;
    this.vy = -vyScreen / this.zoom;
  }

  stop(): void {
    this.vx = 0;
    this.vy = 0;
    this.anim = null;
  }

  /** Zoom multiplicativo manteniendo fijo el punto de pantalla `at`. */
  zoomAt(at: Point, factor: number): void {
    this.anim = null;
    const before = this.screenToWorld(at);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(at);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Snap animado del zoom al entero más cercano (nitidez en reposo). */
  settleZoom(): void {
    if (this.zoom < 1) return; // en zoom alejado no hay entero al que ir
    const target = Math.max(1, Math.min(MAX_ZOOM, Math.round(this.zoom)));
    if (Math.abs(target - this.zoom) < 0.001) return;
    // mantener el centro: solo anima el zoom
    this.animateTo({ x: this.x, y: this.y, zoom: target }, 180);
  }

  animateTo(target: { x: number; y: number; zoom: number }, durationMs = 450): void {
    this.vx = 0;
    this.vy = 0;
    this.anim = {
      fromX: this.x,
      fromY: this.y,
      fromZoom: this.zoom,
      toX: target.x,
      toY: target.y,
      toZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, target.zoom)),
      t: 0,
      duration: durationMs / 1000,
    };
  }

  /** Encuadra `b` con margen `padding` (px de mundo); entero si es posible. */
  fitBounds(b: Bounds, padding = 40, animate = true): void {
    const zx = this.viewW / (b.w + padding * 2);
    const zy = this.viewH / (b.h + padding * 2);
    const raw = Math.min(zx, zy);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, raw >= 1 ? Math.floor(raw) : raw));
    const target = { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom };
    if (animate) this.animateTo(target);
    else {
      this.x = target.x;
      this.y = target.y;
      this.zoom = target.zoom;
    }
  }

  update(dt: number): void {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      // ease in-out cúbico
      const e = a.t < 0.5 ? 4 * a.t * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 3) / 2;
      this.x = a.fromX + (a.toX - a.fromX) * e;
      this.y = a.fromY + (a.toY - a.fromY) * e;
      this.zoom = a.fromZoom + (a.toZoom - a.fromZoom) * e;
      if (a.t >= 1) this.anim = null;
      return;
    }
    if (this.vx !== 0 || this.vy !== 0) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const decay = Math.exp(-FRICTION * dt);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1) {
        this.vx = 0;
        this.vy = 0;
      }
    }
  }
}
