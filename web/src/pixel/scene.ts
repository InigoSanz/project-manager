import type { Project } from "@nebula/shared";
import { deriveDNA, type VisualDNA } from "../visuals/dna";
import type { Bounds, Camera } from "./camera";
import { drawPixelText, measurePixelText } from "./font";
import { layoutZones, type ZonePlacement } from "./layout";
import { fbm, makeNoise } from "./noise";
import { dither, hashString, hslToRgb } from "./palette";
import { groupProjectsByRoot } from "./roots";
import { generateSpriteSheet, type SpriteSheet } from "./sprites";

export interface SceneNode {
  project: Project;
  x: number;
  y: number;
  dna: VisualDNA;
  sheet: SpriteSheet;
  /** acumulador de frame (float; el frame actual es floor % frames) */
  frameAcc: number;
  /** 0..1 suavizado del estado "agente activo ahora" */
  pulse: number;
  live: boolean;
}

export type HitResult =
  | { kind: "planet"; node: SceneNode }
  | { kind: "zone"; zone: ZonePlacement }
  | null;

const LIVE_WINDOW_MS = 60_000;
const NEBULA_DOWNSCALE = 4;

/** Nebulosa de fondo de una zona: blobs de ruido a 1/4 de resolución. */
function makeZoneNebula(zone: ZonePlacement): HTMLCanvasElement {
  const d = Math.ceil((zone.radius * 2.6) / NEBULA_DOWNSCALE);
  const canvas = document.createElement("canvas");
  canvas.width = d;
  canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(d, d);
  const noise = fbm(makeNoise(hashString(zone.root) ^ 0xbeb, 64), 3);
  const toneA = hslToRgb(zone.hue, 0.55, 0.55);
  const toneB = hslToRgb((zone.hue + 40) % 360, 0.5, 0.45);
  const c = d / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const nx = (x - c) / c;
      const ny = (y - c) / c;
      const dist = Math.hypot(nx, ny);
      if (dist > 1) continue;
      const falloff = 1 - dist * dist;
      const v = noise(x * 0.12, y * 0.12) * falloff;
      // umbral ditherizado: rompe las "bandas" duras entre niveles de alpha
      const t = (v - 0.28) / 0.3;
      if (t <= 0) continue;
      const q = Math.min(2.999, t * 3);
      let lvl = Math.floor(q);
      if (dither(x, y, q - lvl)) lvl++;
      const a = Math.round([0, 14, 26, 40][Math.min(3, lvl)] * falloff);
      if (a === 0) continue;
      const tone = noise(x * 0.05 + 40, y * 0.05) > 0.5 ? toneA : toneB;
      const i = (y * d + x) * 4;
      img.data[i] = tone[0];
      img.data[i + 1] = tone[1];
      img.data[i + 2] = tone[2];
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Escena del mapa: zonas por root con sus planetas, nebulosas y etiquetas.
 * Trabaja en coordenadas de mundo; PixelMap aplica la transform de cámara.
 */
export class SpaceScene {
  zones: ZonePlacement[] = [];
  nodes: SceneNode[] = [];
  /** proyecto bajo el puntero (lo fija PixelMap; dibuja los brackets) */
  hoverId: string | null = null;
  /**
   * Zoom a partir del cual caben los nombres de proyecto sin pisarse. Se
   * calcula con la separación real entre planetas: cuantos más proyectos tenga
   * la zona más apretados están, y más hay que acercarse para ver los nombres.
   */
  labelZoom = 0.7;
  private nebulae = new Map<string, HTMLCanvasElement>();
  private frames: number;

  constructor(private lite: boolean) {
    this.frames = lite ? 8 : 16;
  }

  setData(projects: Project[], roots: string[]): void {
    const prev = new Map(this.nodes.map((n) => [n.project.id, n]));
    this.zones = layoutZones(groupProjectsByRoot(projects, roots));
    this.nodes = this.zones.flatMap((zone) =>
      zone.planets.map(({ project, x, y }) => {
        const dna = deriveDNA(project);
        const sheet = generateSpriteSheet(dna, this.frames);
        const old = prev.get(project.id);
        return {
          project,
          x,
          y,
          dna,
          sheet,
          frameAcc: old?.frameAcc ?? dna.phase * 2,
          pulse: old?.pulse ?? 0,
          live: old?.live ?? false,
        };
      }),
    );
    for (const zone of this.zones) {
      if (!this.nebulae.has(zone.root)) this.nebulae.set(zone.root, makeZoneNebula(zone));
    }
    for (const key of [...this.nebulae.keys()]) {
      if (!this.zones.some((z) => z.root === key)) this.nebulae.delete(key);
    }
    this.labelZoom = computeLabelZoom(this.nodes);
  }

  update(dt: number, liveActivity: Record<string, number>, now: number): void {
    for (const node of this.nodes) {
      // velocidad de rotación ligada a la energía del proyecto
      node.frameAcc += dt * (1.5 + node.dna.speed * 5);
      node.live = now - (liveActivity[node.project.id] ?? 0) < LIVE_WINDOW_MS;
      const target = node.live ? 1 : 0;
      node.pulse += (target - node.pulse) * Math.min(1, dt * 3);
    }
  }

  /** `ctx` ya lleva la transform de cámara (unidades de mundo). */
  render(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    const view = camera.visibleBounds(140);

    for (const zone of this.zones) {
      if (!intersects(view, zoneBounds(zone))) continue;
      const nebula = this.nebulae.get(zone.root);
      if (nebula) {
        const d = nebula.width * NEBULA_DOWNSCALE;
        ctx.drawImage(nebula, zone.cx - d / 2, zone.cy - d / 2, d, d);
      }
      // borde punteado de la zona
      ctx.fillStyle = `hsla(${zone.hue} 65% 62% / 0.4)`;
      const dots = Math.max(36, Math.round(zone.radius / 3));
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * Math.PI * 2;
        ctx.fillRect(
          Math.round(zone.cx + Math.cos(a) * zone.radius),
          Math.round(zone.cy + Math.sin(a) * zone.radius),
          1,
          1,
        );
      }
      // etiqueta pixel de la zona (sombra doble para legibilidad + shimmer suave)
      const label = zone.label.toUpperCase();
      const w = measurePixelText(label);
      const lx = Math.round(zone.cx - w / 2);
      const ly = Math.round(zone.cy - zone.radius - 22);
      const alpha = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(time * 1.2 + zone.hue));
      drawPixelText(ctx, label, lx + 1, ly + 1, "rgba(4,5,13,0.85)");
      drawPixelText(ctx, label, lx - 1, ly, "rgba(4,5,13,0.6)");
      drawPixelText(ctx, label, lx, ly, `hsla(${zone.hue} 70% 72% / ${alpha.toFixed(2)})`);
    }

    for (const node of this.nodes) {
      const half = node.sheet.frameSize / 2;
      const margin = half + node.sheet.bodyRadius * 2.5; // las lunas sobresalen del cell
      if (node.x + margin < view.x || node.x - margin > view.x + view.w) continue;
      if (node.y + margin < view.y || node.y - margin > view.y + view.h) continue;
      const frame = Math.floor(node.frameAcc) % node.sheet.frames;
      const sx = frame * node.sheet.frameSize;
      const dx = Math.round(node.x - half);
      const dy = Math.round(node.y - half);

      // lunas en órbita: posición derivada del tiempo (sin estado); las de
      // sin(ang)<0 pasan por detrás del planeta
      const moonPos = node.dna.moons.map((moon, i) => {
        const ang = moon.phase + time * moon.speed;
        return {
          moon,
          sprite: node.sheet.decor[i],
          x: node.x + Math.cos(ang) * node.sheet.bodyRadius * moon.dist,
          y: node.y + Math.sin(ang) * node.sheet.bodyRadius * moon.dist * 0.42,
          front: Math.sin(ang) >= 0,
        };
      });
      for (const m of moonPos) {
        if (!m.front && m.sprite) {
          ctx.drawImage(m.sprite, Math.round(m.x - m.moon.size / 2), Math.round(m.y - m.moon.size / 2));
        }
      }

      ctx.drawImage(node.sheet.canvas, sx, 0, node.sheet.frameSize, node.sheet.frameSize, dx, dy, node.sheet.frameSize, node.sheet.frameSize);
      if (node.pulse > 0.02) {
        // pulso de actividad: el mismo frame sumado en aditivo, latiendo
        const beat = 0.5 + 0.5 * Math.sin(time * 5 + node.dna.phase);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = node.pulse * (0.2 + 0.35 * beat);
        ctx.drawImage(node.sheet.canvas, sx, 0, node.sheet.frameSize, node.sheet.frameSize, dx, dy, node.sheet.frameSize, node.sheet.frameSize);
        ctx.restore();
      }

      for (const m of moonPos) {
        if (!m.front || !m.sprite) continue;
        const mx = Math.round(m.x - m.moon.size / 2);
        const my = Math.round(m.y - m.moon.size / 2);
        ctx.drawImage(m.sprite, mx, my);
        // parpadeo de la ventana de la luna-estación
        if (m.moon.kind === "station" && Math.floor(time * 2 + node.dna.phase) % 3 !== 0) {
          ctx.fillStyle = "#ffe9a8";
          ctx.fillRect(mx + Math.round(m.moon.size * 0.7), my + Math.round(m.moon.size * 0.45), 1, 1);
        }
      }

      // brackets de esquina sobre el planeta apuntado
      if (this.hoverId === node.project.id) {
        const hs = Math.round(node.sheet.bodyRadius * 1.5 + 2);
        const arm = Math.max(3, Math.round(hs / 3));
        ctx.fillStyle = "#e8eaf6";
        ctx.globalAlpha = 0.55 + 0.3 * Math.sin(time * 4);
        const cxn = Math.round(node.x);
        const cyn = Math.round(node.y);
        for (const [sxs, sys] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const bx = cxn + sxs * hs;
          const by = cyn + sys * hs;
          ctx.fillRect(Math.min(bx, bx - sxs * (arm - 1)), by, arm, 1);
          ctx.fillRect(bx, Math.min(by, by - sys * (arm - 1)), 1, arm);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  hitTest(world: { x: number; y: number }): HitResult {
    for (const node of this.nodes) {
      const r = Math.max(node.sheet.bodyRadius * 1.25, 14);
      if (Math.hypot(world.x - node.x, world.y - node.y) <= r) return { kind: "planet", node };
    }
    for (const zone of this.zones) {
      if (Math.hypot(world.x - zone.cx, world.y - zone.cy) <= zone.radius) return { kind: "zone", zone };
    }
    return null;
  }

  worldBounds(): Bounds {
    if (this.zones.length === 0) return { x: -160, y: -160, w: 320, h: 320 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const zone of this.zones) {
      const b = zoneBounds(zone);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
}

/**
 * Ancho de referencia de un nombre en pantalla (px CSS). Las etiquetas se
 * truncan por CSS, así que basta con reservar algo menos que su ancho máximo.
 */
const LABEL_WIDTH = 66;

/**
 * Zoom mínimo para mostrar nombres: el vecino más cercano de cada planeta debe
 * quedar, en pantalla, más lejos que el ancho de una etiqueta.
 */
function computeLabelZoom(nodes: SceneNode[]): number {
  if (nodes.length < 2) return 0.5;
  let minNearest = Infinity;
  for (const a of nodes) {
    let nearest = Infinity;
    for (const b of nodes) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < nearest) nearest = d;
    }
    if (nearest < minNearest) minNearest = nearest;
  }
  if (!Number.isFinite(minNearest) || minNearest <= 0) return 0.7;
  return Math.max(0.5, Math.min(3, LABEL_WIDTH / minNearest));
}

export function zoneBounds(zone: ZonePlacement): Bounds {
  return {
    x: zone.cx - zone.radius,
    y: zone.cy - zone.radius - 34, // hueco de la etiqueta
    w: zone.radius * 2,
    h: zone.radius * 2 + 34,
  };
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
