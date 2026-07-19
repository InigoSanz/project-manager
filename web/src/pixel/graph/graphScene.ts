import type { KnowledgeGraph } from "@nebula/shared";
import type { Bounds, Camera, Point } from "../camera";
import { drawPixelText, measurePixelText } from "../font";
import { hslToRgb, rgbToHex } from "../palette";
import { computeGraphLayout, isHub, type CommunityPlacement, type GraphLayout, type GraphNodePos } from "./graphLayout";

/**
 * Escena del grafo de conocimiento como mapa estelar. Implementa el mismo
 * contrato imperativo que `pixel/scene.ts` (setData / update / render* /
 * hitTest / worldBounds) para poder reutilizar cámara, gestos y fondo del
 * mapa de proyectos. No dibuja assets: estrellas, aristas y nebulosas van por
 * código, en el mismo lenguaje pixel-art que el resto de la app.
 */

/** Color CSS de una comunidad a un nivel de luz dado (0 base, + claro, − oscuro). */
function communityColor(hue: number, lightness: number, alpha = 1): string {
  const [r, g, b] = hslToRgb(hue, 0.6, lightness);
  return alpha >= 1 ? rgbToHex(r, g, b) : `rgba(${r},${g},${b},${alpha})`;
}

const EDGE_DIM = "rgba(150,170,220,0.12)";
const EDGE_DIM_FOCUS = "rgba(150,170,220,0.04)";
const EDGE_BRIGHT = "rgba(255,240,210,0.8)";

export class GraphScene {
  nodes: GraphNodePos[] = [];
  communities: CommunityPlacement[] = [];
  /** id del nodo bajo el cursor (lo fija el componente) */
  hoverId: string | null = null;

  private layout: GraphLayout | null = null;
  private edges: KnowledgeGraph["links"] = [];
  /** vecinos del nodo enfocado (incluye el propio), para iluminar su entorno */
  private focusSet: Set<string> | null = null;
  private focusEdges: KnowledgeGraph["links"] = [];
  /** 0..1: cuánto se atenúa el resto al enfocar (animado para que no dé tirones) */
  private focusT = 0;
  private nebulaCache = new Map<string, CanvasGradient>();

  constructor(private lite: boolean) {}

  setData(graph: KnowledgeGraph): void {
    this.layout = computeGraphLayout(graph);
    this.nodes = this.layout.nodes;
    this.communities = this.layout.communities;
    this.edges = graph.links;
    this.nebulaCache.clear();
    this.setFocus(null);
  }

  worldBounds(): Bounds {
    return this.layout?.bounds ?? { x: -100, y: -100, w: 200, h: 200 };
  }

  /** Barrido lineal con radio mínimo táctil (como scene.ts:hitTest). */
  hitTest(world: Point): GraphNodePos | null {
    let best: GraphNodePos | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const r = Math.max(n.r * 1.6, 14);
      const d = Math.hypot(world.x - n.x, world.y - n.y);
      if (d <= r && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  /** Comunidad cuyo círculo contiene el punto (para encuadrar al doble-clic). */
  communityAt(world: Point): CommunityPlacement | null {
    for (const c of this.communities) {
      if (Math.hypot(world.x - c.cx, world.y - c.cy) <= c.radius) return c;
    }
    return null;
  }

  communityBounds(c: CommunityPlacement): Bounds {
    return { x: c.cx - c.radius, y: c.cy - c.radius, w: c.radius * 2, h: c.radius * 2 };
  }

  /** Enfoca un nodo: precalcula vecinos y aristas incidentes una sola vez. */
  setFocus(id: string | null): void {
    if (!id || !this.layout) {
      this.focusSet = null;
      this.focusEdges = [];
      return;
    }
    const neighbors = this.layout.adjacency.get(id) ?? [];
    this.focusSet = new Set([id, ...neighbors]);
    this.focusEdges = this.edges.filter((e) => e.source === id || e.target === id);
  }

  update(dt: number): void {
    // atenuación suave del resto al enfocar un nodo
    const target = this.focusSet ? 1 : 0;
    this.focusT += (target - this.focusT) * Math.min(1, dt * 8);
  }

  /** Contenido en coordenadas de mundo (el llamante fija la transform de cámara). */
  renderWorld(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    if (!this.layout) return;
    const view = camera.visibleBounds(80);

    this.renderNebulae(ctx, view);
    this.renderEdges(ctx);
    this.renderNodes(ctx, view, time);
  }

  private renderNebulae(ctx: CanvasRenderingContext2D, view: Bounds): void {
    for (const c of this.communities) {
      if (!intersectsCircle(view, c.cx, c.cy, c.radius)) continue;
      let grad = this.nebulaCache.get(c.group);
      if (!grad) {
        // gradiente en coordenadas de mundo: se crea una vez y la CTM lo escala
        grad = ctx.createRadialGradient(c.cx, c.cy, c.radius * 0.1, c.cx, c.cy, c.radius);
        const [r, g, b] = hslToRgb(c.hue, 0.55, 0.5);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.16)`);
        grad.addColorStop(0.6, `rgba(${r},${g},${b},0.06)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        this.nebulaCache.set(c.group, grad);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(c.cx - c.radius, c.cy - c.radius, c.radius * 2, c.radius * 2);
    }
  }

  private renderEdges(ctx: CanvasRenderingContext2D): void {
    if (!this.layout) return;
    const idx = this.layout.index;
    // todas las aristas tenues en un único trazo (barato aun con miles)
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.focusSet ? EDGE_DIM_FOCUS : EDGE_DIM;
    ctx.beginPath();
    for (const e of this.edges) {
      const a = this.nodes[idx.get(e.source) ?? -1];
      const b = this.nodes[idx.get(e.target) ?? -1];
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // aristas del nodo enfocado, encendidas por encima
    if (this.focusSet && this.focusEdges.length) {
      ctx.strokeStyle = EDGE_BRIGHT;
      ctx.beginPath();
      for (const e of this.focusEdges) {
        const a = this.nodes[idx.get(e.source) ?? -1];
        const b = this.nodes[idx.get(e.target) ?? -1];
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }

  private renderNodes(ctx: CanvasRenderingContext2D, view: Bounds, time: number): void {
    const dim = this.focusT * 0.82; // cuánto se apaga lo no enfocado
    for (const n of this.nodes) {
      if (n.x < view.x || n.x > view.x + view.w || n.y < view.y || n.y > view.y + view.h) continue;
      const focused = !this.focusSet || this.focusSet.has(n.id);
      const alpha = focused ? 1 : 1 - dim;
      if (alpha <= 0.02) continue;

      const hub = isHub(n.degree);
      const s = Math.max(1, Math.round(n.r));
      const ix = Math.round(n.x);
      const iy = Math.round(n.y);

      if (hub && focused) this.renderGlow(ctx, ix, iy, n.r * 2.4, n.community);

      // parpadeo sutil: solo afecta al brillo del núcleo
      const tw = 0.75 + 0.25 * Math.sin(time * 2 + n.x * 0.7 + n.y * 0.3);
      const body = communityColor(this.communities[n.community]?.hue ?? 230, 0.62, alpha);
      const hot = communityColor(this.communities[n.community]?.hue ?? 230, Math.min(0.95, 0.78 + tw * 0.18), alpha);

      // estrella pixel: brazos horizontal y vertical + núcleo caliente
      ctx.fillStyle = body;
      ctx.fillRect(ix - s, iy - 1, s * 2, 2);
      ctx.fillRect(ix - 1, iy - s, 2, s * 2);
      ctx.fillStyle = hot;
      ctx.fillRect(ix - 1, iy - 1, 2, 2);
    }
  }

  private renderGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, community: number): void {
    const [r, g, b] = hslToRgb(this.communities[community]?.hue ?? 230, 0.7, 0.65);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  /**
   * Etiquetas de constelación en coordenadas de PANTALLA (fuente bitmap, tamaño
   * constante y nítido). El llamante debe haber restablecido la transform a dpr.
   */
  renderOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    // al acercarse mucho, las etiquetas de zona estorban: se desvanecen
    const alpha = clamp(1.6 - camera.zoom * 0.5, 0.12, 0.85);
    if (alpha <= 0.12 && camera.zoom > 3) return;
    for (const c of this.communities) {
      // sin nombre útil (Graphify sin LLM deja "Community N") no vale la pena
      const label = c.label.trim();
      if (!label) continue;
      const s = camera.worldToScreen({ x: c.cx, y: c.cy - c.radius });
      if (s.x < -120 || s.x > camera.viewW + 120 || s.y < -20 || s.y > camera.viewH + 20) continue;
      const text = label.length > 22 ? label.slice(0, 21) + "…" : label;
      const w = measurePixelText(text);
      drawPixelText(ctx, text, Math.round(s.x - w / 2), Math.round(s.y), `rgba(180,190,220,${alpha})`, 1);
    }
  }
}

function intersectsCircle(b: Bounds, cx: number, cy: number, r: number): boolean {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  return Math.hypot(cx - nx, cy - ny) <= r;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
