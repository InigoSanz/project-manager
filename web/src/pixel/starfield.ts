import { rng } from "../visuals/dna";
import type { Camera } from "./camera";

const TILE = 512;

interface TwinkleStar {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  color: string;
}

interface Layer {
  parallax: number;
  tile: HTMLCanvasElement;
  /** solo la capa más cercana parpadea (y nunca en lite) */
  twinkle: TwinkleStar[];
}

const COLORS = ["#cdd3ec", "#cdd3ec", "#e8eaf6", "#8b93ff", "#7cc8d8", "#eec98f"];

function makeTile(seed: number, count: number, dim: number): { canvas: HTMLCanvasElement; r: () => number } {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(r() * TILE);
    const y = Math.floor(r() * TILE);
    const c = COLORS[Math.floor(r() * COLORS.length)];
    ctx.globalAlpha = (0.25 + r() * 0.55) * dim;
    ctx.fillStyle = c;
    const size = r() < 0.85 ? 1 : 2;
    ctx.fillRect(x, y, size, size);
    // alguna estrella con cruz de brillo
    if (r() < 0.045) {
      ctx.globalAlpha = 0.25 * dim;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
  return { canvas, r };
}

/**
 * Fondo estelar de varias capas con paralaje. Se dibuja en espacio de pantalla
 * (px CSS): las capas lejanas se desplazan menos que el mundo al hacer pan.
 */
interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

export class Starfield {
  private layers: Layer[] = [];
  private lite: boolean;
  private shooting: ShootingStar | null = null;
  private nextShootAt = 5;

  constructor(seed: number, lite: boolean) {
    this.lite = lite;
    const specs = lite
      ? [
          { parallax: 0.15, count: 90, dim: 0.7 },
          { parallax: 0.45, count: 60, dim: 1 },
        ]
      : [
          { parallax: 0.08, count: 110, dim: 0.5 },
          { parallax: 0.2, count: 90, dim: 0.7 },
          { parallax: 0.4, count: 70, dim: 0.85 },
          { parallax: 0.7, count: 50, dim: 1 },
        ];
    specs.forEach((spec, i) => {
      const { canvas, r } = makeTile(seed + i * 101, spec.count, spec.dim);
      const twinkle: TwinkleStar[] = [];
      const isNear = i === specs.length - 1;
      if (isNear && !lite) {
        for (let s = 0; s < 40; s++) {
          twinkle.push({
            x: Math.floor(r() * TILE),
            y: Math.floor(r() * TILE),
            size: r() < 0.7 ? 1 : 2,
            phase: r() * Math.PI * 2,
            speed: 0.8 + r() * 2.2,
            color: COLORS[Math.floor(r() * COLORS.length)],
          });
        }
      }
      this.layers.push({ parallax: spec.parallax, tile: canvas, twinkle });
    });
  }

  /** Estrella fugaz ocasional (ambiental: aquí sí vale Math.random). */
  private renderShootingStar(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    if (!this.shooting && time > this.nextShootAt) {
      const fromLeft = Math.random() < 0.5;
      this.shooting = {
        x: fromLeft ? -10 : Math.random() * camera.viewW,
        y: fromLeft ? Math.random() * camera.viewH * 0.5 : -10,
        vx: 300 + Math.random() * 120,
        vy: 100 + Math.random() * 60,
        born: time,
      };
      this.nextShootAt = time + 7 + Math.random() * 9;
    }
    const s = this.shooting;
    if (!s) return;
    const age = time - s.born;
    if (age > 0.7) {
      this.shooting = null;
      return;
    }
    const x = s.x + s.vx * age;
    const y = s.y + s.vy * age;
    const fade = 0.8 * (1 - age / 0.7);
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 5; k++) {
      ctx.globalAlpha = Math.max(0.08, fade * (1 - k * 0.22));
      ctx.fillRect(Math.round(x - s.vx * 0.012 * k), Math.round(y - s.vy * 0.012 * k), k === 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** `ctx` en px CSS (transform dpr ya aplicada). `time` en segundos. */
  render(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    const { viewW, viewH } = camera;
    for (const layer of this.layers) {
      const offX = camera.x * layer.parallax * camera.zoom;
      const offY = camera.y * layer.parallax * camera.zoom;
      const startX = -(((offX % TILE) + TILE) % TILE);
      const startY = -(((offY % TILE) + TILE) % TILE);
      for (let x = startX; x < viewW; x += TILE) {
        for (let y = startY; y < viewH; y += TILE) {
          ctx.drawImage(layer.tile, Math.round(x), Math.round(y));
          for (const s of layer.twinkle) {
            const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
            ctx.globalAlpha = a;
            ctx.fillStyle = s.color;
            ctx.fillRect(Math.round(x + s.x), Math.round(y + s.y), s.size, s.size);
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    if (!this.lite) this.renderShootingStar(ctx, camera, time);
  }
}
