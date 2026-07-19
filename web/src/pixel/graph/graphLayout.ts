import type { KnowledgeGraph } from "@nebula/shared";
import type { Bounds } from "../camera";
import { rng } from "../../visuals/dna";
import { hashString, zoneHue } from "../palette";

/**
 * Layout 2D determinista para el grafo de conocimiento, pensado como un mapa
 * estelar: cada nodo es una estrella, cada comunidad de Graphify una
 * constelación con su propia región. Es el análogo del layout del mapa de
 * proyectos (`pixel/layout.ts`): comunidades = zonas, nodos = planetas.
 *
 * Todo el cálculo es de una sola pasada al cargar (no por frame) y estable
 * mientras el grafo no cambie (semilla derivada de su contenido).
 */

export interface GraphNodePos {
  id: string;
  label: string;
  type: string;
  group: string;
  degree: number;
  x: number;
  y: number;
  /** radio visual de la estrella, ∝ grado */
  r: number;
  /** índice de comunidad (para colorear sin re-hashear) */
  community: number;
}

export interface CommunityPlacement {
  group: string;
  /** nombre de la constelación = etiqueta del nodo más conectado */
  label: string;
  cx: number;
  cy: number;
  radius: number;
  hue: number;
}

export interface GraphLayout {
  nodes: GraphNodePos[];
  communities: CommunityPlacement[];
  /** id de nodo → índice en `nodes`, para resolver aristas rápido */
  index: Map<string, number>;
  /** id de nodo → ids vecinos (para iluminar el vecindario al enfocar) */
  adjacency: Map<string, string[]>;
  bounds: Bounds;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Sin comunidad asignada: todos caen en la misma constelación «suelta». */
const NO_GROUP = "∅";

/** Radio de la estrella según su grado (nodos-hub más grandes y con glow). */
export function nodeRadius(degree: number): number {
  return 2 + Math.min(6, Math.sqrt(Math.max(0, degree)));
}

/** ¿Es un hub? (umbral para dibujar halo y priorizar su etiqueta). */
export function isHub(degree: number): boolean {
  return degree >= 6;
}

/**
 * Fruchterman-Reingold compacto sobre una comunidad, en coordenadas locales.
 * Revela la subestructura (nodos muy conectados se juntan) sin depender de
 * ninguna librería de fuerzas. Determinista: mismas posiciones cada vez.
 */
function forceLayout(
  count: number,
  edges: Array<[number, number]>,
  radius: number,
  r: () => number,
): Array<{ x: number; y: number }> {
  const k = Math.max(12, (radius * 1.6) / Math.sqrt(Math.max(1, count)));
  const pos: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    // arranque en espiral áurea: reparto uniforme y sin dos nodos superpuestos
    const ang = i * GOLDEN + r() * 0.2;
    const rad = radius * 0.6 * Math.sqrt((i + 0.5) / Math.max(1, count));
    pos.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
  }
  if (count <= 1) return pos;

  const disp = pos.map(() => ({ x: 0, y: 0 }));
  let temp = radius * 0.5;
  const ITERS = count > 120 ? 60 : 90;
  for (let it = 0; it < ITERS; it++) {
    for (let i = 0; i < count; i++) {
      disp[i].x = 0;
      disp[i].y = 0;
    }
    // repulsión entre todos los pares (O(n²) por comunidad, una sola carga)
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // desempate determinista para no dividir por cero
          dx = (i - j) * 0.01;
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const force = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        disp[i].x += ux * force;
        disp[i].y += uy * force;
        disp[j].x -= ux * force;
        disp[j].y -= uy * force;
      }
    }
    // atracción a lo largo de las aristas internas
    for (const [a, b] of edges) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      disp[a].x -= ux * force;
      disp[a].y -= uy * force;
      disp[b].x += ux * force;
      disp[b].y += uy * force;
    }
    // desplazar, limitado por la temperatura, y enfriar
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(disp[i].x, disp[i].y) || 0.01;
      pos[i].x += (disp[i].x / d) * Math.min(d, temp);
      pos[i].y += (disp[i].y / d) * Math.min(d, temp);
    }
    temp *= 0.94;
  }
  return pos;
}

/** Reescala un conjunto de puntos para que quepa en `radius` centrado en 0. */
function fitToRadius(pts: Array<{ x: number; y: number }>, radius: number): void {
  let max = 0;
  for (const p of pts) max = Math.max(max, Math.hypot(p.x, p.y));
  if (max < 0.01) return;
  const scale = (radius * 0.82) / max;
  for (const p of pts) {
    p.x *= scale;
    p.y *= scale;
  }
}

/** Empuja las constelaciones que se solapan (mismo espíritu que layout.ts:relax). */
function relaxCommunities(c: CommunityPlacement[], iterations = 40): void {
  const GAP = 40;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        const a = c[i];
        const b = c[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.hypot(dx, dy) || 0.001;
        const need = a.radius + b.radius + GAP;
        if (dist >= need) continue;
        const push = (need - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.cx -= ux * push;
        a.cy -= uy * push;
        b.cx += ux * push;
        b.cy += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

export function computeGraphLayout(graph: KnowledgeGraph): GraphLayout {
  const seed = hashString((graph.generatedAt ?? "") + ":" + graph.nodes.length);
  const rootRng = rng(seed);

  // agrupar por comunidad, preservando el orden de aparición
  const groups = new Map<string, KnowledgeGraph["nodes"]>();
  for (const n of graph.nodes) {
    const key = n.group ?? NO_GROUP;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(n);
  }
  const groupKeys = [...groups.keys()];
  const communityIndex = new Map(groupKeys.map((g, i) => [g, i]));

  // adyacencia global (para iluminar vecinos) y aristas internas por comunidad
  const adjacency = new Map<string, string[]>();
  const nodeGroup = new Map<string, string>();
  for (const n of graph.nodes) nodeGroup.set(n.id, n.group ?? NO_GROUP);
  const push = (a: string, b: string): void => {
    const l = adjacency.get(a);
    if (l) l.push(b);
    else adjacency.set(a, [b]);
  };
  for (const e of graph.links) {
    if (!nodeGroup.has(e.source) || !nodeGroup.has(e.target)) continue;
    push(e.source, e.target);
    push(e.target, e.source);
  }

  // radio de cada constelación según cuántas estrellas contiene
  const communities: CommunityPlacement[] = groupKeys.map((group, i) => {
    const list = groups.get(group)!;
    const radius = 70 + 34 * Math.sqrt(list.length);
    // la constelación toma el nombre de su estrella más conectada
    const hub = list.reduce((best, n) => ((n.degree ?? 0) > (best.degree ?? 0) ? n : best), list[0]);
    return {
      group,
      label: hub?.label ?? group,
      cx: 0,
      cy: 0,
      radius,
      hue: group === NO_GROUP ? 230 : zoneHue(group),
      community: i,
    } as CommunityPlacement & { community: number };
  });

  // colocar las constelaciones: una va centrada; varias en espiral áurea +
  // relajación (escala mejor que un anillo cuando hay muchas comunidades)
  if (communities.length === 1) {
    communities[0].cx = 0;
    communities[0].cy = 0;
  } else {
    // espiral compacta: la relajación posterior evita solapes, así que se
    // arranca apretado para que el grafo se lea como una galaxia, no islas
    const avgR = communities.reduce((s, c) => s + c.radius, 0) / communities.length;
    communities.forEach((c, i) => {
      const ang = i * GOLDEN;
      const rad = 1.35 * avgR * Math.sqrt(i + 0.6);
      c.cx = Math.cos(ang) * rad;
      c.cy = Math.sin(ang) * rad;
    });
    relaxCommunities(communities);
  }

  // posicionar los nodos dentro de cada constelación con fuerza dirigida
  const nodes: GraphNodePos[] = [];
  const index = new Map<string, number>();
  groupKeys.forEach((group, gi) => {
    const list = groups.get(group)!;
    const place = communities[gi];
    const localIdx = new Map(list.map((n, i) => [n.id, i]));
    const intraEdges: Array<[number, number]> = [];
    for (const e of graph.links) {
      if ((nodeGroup.get(e.source) ?? NO_GROUP) !== group) continue;
      if ((nodeGroup.get(e.target) ?? NO_GROUP) !== group) continue;
      const a = localIdx.get(e.source);
      const b = localIdx.get(e.target);
      if (a !== undefined && b !== undefined && a !== b) intraEdges.push([a, b]);
    }
    const local = forceLayout(list.length, intraEdges, place.radius, rng(seed ^ hashString(group)));
    fitToRadius(local, place.radius);
    list.forEach((n, i) => {
      index.set(n.id, nodes.length);
      nodes.push({
        id: n.id,
        label: n.label,
        type: n.type,
        group,
        degree: n.degree ?? 0,
        x: Math.round(place.cx + local[i].x),
        y: Math.round(place.cy + local[i].y),
        r: nodeRadius(n.degree ?? 0),
        community: gi,
      });
    });
  });

  // límites globales, con margen para nebulosas y etiquetas
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of communities) {
    minX = Math.min(minX, c.cx - c.radius);
    minY = Math.min(minY, c.cy - c.radius);
    maxX = Math.max(maxX, c.cx + c.radius);
    maxY = Math.max(maxY, c.cy + c.radius);
  }
  if (!isFinite(minX)) {
    minX = minY = -100;
    maxX = maxY = 100;
  }
  const pad = 80;
  const bounds: Bounds = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };

  return { nodes, communities, index, adjacency, bounds };
}
