import type { MoonSpec, VisualDNA } from "../visuals/dna";
import { rng } from "../visuals/dna";
import { fbm, makeNoise, type Noise2D } from "./noise";
import { dither, hexToRgb } from "./palette";

/** Tira horizontal de frames pre-renderizados de un cuerpo celeste. */
export interface SpriteSheet {
  canvas: HTMLCanvasElement;
  /** lado de cada frame (px virtuales) */
  frameSize: number;
  frames: number;
  /** radio visual del cuerpo (para hit-test y halos) */
  bodyRadius: number;
  /** mini-sprites de las lunas, en el mismo orden que dna.moons */
  decor: HTMLCanvasElement[];
}

/**
 * Periodo del ruido de superficie: nº de "celdas" de terreno alrededor del
 * planeta. Pequeño = continentes grandes. La rotación desplaza la longitud
 * exactamente un periodo por vuelta, así que no hay costura entre frames.
 */
const SURF_PERIOD = 10;

/** Fondo de sombra y luz de las rampas (coherente con palette.shade). */
const SHADOW: [number, number, number] = [8, 9, 22];
const LIGHT: [number, number, number] = [240, 244, 255];

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

type Ramp = Array<[number, number, number]>;

/** Rampa precalculada: niveles -2..+2 para cada color del ADN. */
function buildRamps(colors: string[]): Ramp[] {
  return colors.map((hex) => {
    const base = hexToRgb(hex);
    return [-2, -1, 0, 1, 2].map((level) => {
      if (level === 0) return base;
      const t = Math.min(1, Math.abs(level) * 0.32);
      return mix(base, level < 0 ? SHADOW : LIGHT, t);
    });
  });
}

const CAP_RAMP = buildRamps(["#dfe6f2"])[0];
const METAL_RAMP = buildRamps(["#8f97ad"])[0];
const WINDOW_OFF: [number, number, number] = [46, 50, 74];

/** Iluminación desde arriba-izquierda, en 0..1. */
function lightAt(nx: number, ny: number): number {
  let l = 0.55 - nx * 0.32 - ny * 0.38;
  const rr = nx * nx + ny * ny;
  if (rr > 0.86) l -= 0.28; // oscurecimiento del limbo
  return Math.max(0, Math.min(1, l));
}

/**
 * Nivel de sombreado -2..1. El dithering se concentra en la mitad alta de cada
 * escalón: transición de luz reconocible sin convertir la esfera en ruido.
 */
function shadeLevel(l: number, x: number, y: number): number {
  const t = l * 3.6 - 2;
  const li = Math.floor(t);
  const frac = t - li;
  const level = frac > 0.5 && dither(x, y, (frac - 0.5) * 2) ? li + 1 : li;
  return Math.max(-2, Math.min(1, level));
}

function put(img: ImageData, x: number, y: number, c: [number, number, number], a = 255): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = a;
}

const clampLevel = (level: number): number => Math.max(-2, Math.min(2, level));
const smoothstep = (a: number, b: number, t: number): number => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** Distancia longitudinal con envoltura (el planeta "da la vuelta"). */
function wrapDelta(a: number, b: number, period: number): number {
  let d = (a - b) % period;
  if (d > period / 2) d -= period;
  if (d < -period / 2) d += period;
  return d;
}

interface BodyContext {
  dna: VisualDNA;
  ramps: Ramp[];
  noise: Noise2D;
  /** segundo stream para vetas de lava y variaciones de tono */
  noise2: Noise2D;
  /** cráteres precomputados en coordenadas de ruido (u,v,r) */
  craters: Array<{ u: number; v: number; r: number }>;
  /** vetas de cristal incrustadas en la superficie (mismas coordenadas) */
  shards: Array<{ u: number; v: number; r: number }>;
  storm: { u: number; v: number } | null;
  freq: number;
}

interface SurfaceSample {
  value: number;
  levelDelta: number;
  /** casquete polar helado */
  capOverride: boolean;
  /** veta incandescente: ignora la iluminación y va a tope de brillo */
  brightOverride: boolean;
  /** usa la rampa de acento conservando el sombreado (cristales) */
  accentRamp: boolean;
}

/** Valor de superficie 0..1 (+ overrides de color/nivel) según el estilo. */
function surfaceAt(ctx: BodyContext, u: number, v: number, ny: number): SurfaceSample {
  const { dna, noise, noise2 } = ctx;
  let value: number;
  let levelDelta = 0;
  let capOverride = false;
  let brightOverride = false;
  let accentRamp = false;

  switch (dna.surface) {
    case "continents":
      value = smoothstep(0.42, 0.58, noise(u, v));
      break;
    case "archipelago":
      value = Math.pow(noise(u, v), 2.4);
      break;
    case "banded": {
      const turb = noise(u, v * 0.6) - 0.5;
      value = (Math.sin(ny * 4.2 + turb * 3.2) + 1) / 2;
      if (ctx.storm) {
        const du = wrapDelta(u, ctx.storm.u, SURF_PERIOD * ctx.freq) / 1.4;
        const dv = (v - ctx.storm.v) / 0.9;
        const s = du * du + dv * dv;
        if (s < 1) levelDelta = s > 0.72 ? 1 : -1; // ojo de tormenta con borde claro
      }
      break;
    }
    case "mottled":
      value = noise(u * 2, v * 2);
      break;
    case "cratered": {
      value = smoothstep(0.35, 0.65, noise(u * 0.8, v * 0.8));
      for (const c of ctx.craters) {
        const du = wrapDelta(u, c.u, SURF_PERIOD * ctx.freq);
        const dv = v - c.v;
        const d = Math.hypot(du, dv);
        if (d < c.r) levelDelta = -1;
        else if (Math.abs(d - c.r) < 0.12 * c.r) levelDelta = 1;
      }
      break;
    }
    case "lava": {
      value = smoothstep(0.4, 0.6, noise(u, v));
      if (Math.abs(noise2(u, v) - 0.5) < 0.045) brightOverride = true; // vetas incandescentes
      break;
    }
    case "ice": {
      value = smoothstep(0.42, 0.58, noise(u, v));
      const edge = (Math.abs(ny) - 0.55) / 0.1;
      if (edge > 1 || (edge > 0 && dither(Math.round(u * 7), Math.round(v * 7), edge))) capOverride = true;
      break;
    }
    case "crystalline": {
      // roca base + vetas de cristal en rombo incrustadas en la superficie:
      // giran con la longitud, así que el planeta sigue siendo un disco perfecto
      value = smoothstep(0.4, 0.6, noise(u, v));
      for (const s of ctx.shards) {
        const du = Math.abs(wrapDelta(u, s.u, SURF_PERIOD * ctx.freq));
        const dv = Math.abs(v - s.v);
        const d = du + dv; // distancia manhattan → facetas angulares
        if (d < s.r) {
          accentRamp = true;
          levelDelta = d < s.r * 0.45 ? 2 : 1;
        }
      }
      break;
    }
  }
  return { value, levelDelta, capOverride, brightOverride, accentRamp };
}

/**
 * Globo unificado: superficie + anillos + halo + contorno en una sola pasada
 * por píxel. Los anillos se evalúan analíticamente (elipse) con prioridad
 * anillo-delantero > globo > anillo-trasero: sin huecos ni hacks de oclusión.
 */
function renderBody(cell: number, R: number, rotFrac: number, ctx: BodyContext): ImageData {
  const img = new ImageData(cell, cell);
  const { dna, ramps } = ctx;
  const rings = dna.rings;
  const Rb = rings ? R * 0.72 : R;
  const c = cell / 2;
  const outlineRR = ((Rb - 1.25) / Rb) ** 2;
  // halo: aro fino pegado al limbo (con anillos se omite: sería ruido entre ambos)
  const haloRR = ((Rb + 1.5) / Rb) ** 2;
  const showHalo = dna.halo && !rings;
  const ringShadowRR = ((Rb + 1.5) / Rb) ** 2;
  const ringRamp = rings ? ramps[Math.min(rings.colorIdx, ramps.length - 1)] : null;

  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const nx = (x - c + 0.5) / Rb;
      const ny = (y - c + 0.5) / Rb;
      const rr = nx * nx + ny * ny;

      // test de anillo (elipse inclinada centrada en el cuerpo)
      let ringHit = false;
      if (rings) {
        const ex = nx / rings.scale;
        const ey = ny / (rings.scale * rings.tilt);
        const e = ex * ex + ey * ey;
        ringHit = (e >= 0.86 && e <= 1) || (rings.bands === 2 && e >= 0.7 && e <= 0.79);
      }
      const front = ny > 0;

      if (ringHit && front && ringRamp) {
        const level = dither(x, y, 0.25) ? 1 : 0;
        put(img, x, y, ringRamp[level + 2]);
        continue;
      }

      if (rr <= 1) {
        // proyección esférica falsa con envoltura cilíndrica
        const rowHalf = Math.sqrt(Math.max(0.0001, 1 - ny * ny));
        const sx = Math.max(-1, Math.min(1, nx / rowHalf));
        const theta = Math.asin(sx);
        const u = (theta / (Math.PI * 2) + rotFrac) * SURF_PERIOD * ctx.freq;
        const v = (Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI) * SURF_PERIOD * ctx.freq;

        const surf = surfaceAt(ctx, u, v, ny);
        // 3 bandas de color como máximo: con 4 la superficie se vuelve ruido
        const bands = Math.min(3, dna.colorCount);
        const t = Math.max(0, Math.min(0.999, surf.value)) * bands;
        let idx = Math.floor(t);
        // el dithering solo actúa en el borde entre bandas (transición ~25%),
        // no en todo su ancho: bandas limpias con costura pixelada
        const frac = t - idx;
        if (frac > 0.75 && dither(x, y, (frac - 0.75) / 0.25)) idx = Math.min(bands - 1, idx + 1);
        let ramp = ramps[idx];
        if (surf.capOverride) ramp = CAP_RAMP;
        if (surf.brightOverride || surf.accentRamp) ramp = ramps[Math.min(1, ramps.length - 1)];

        const l = lightAt(nx, ny);
        let level = shadeLevel(l, x, y) + surf.levelDelta;
        if (surf.brightOverride) level = 2;
        if (l > 0.85 && rr < 0.35) level = 2;
        if (rr > outlineRR) level = -2; // contorno de 1px en px absolutos
        put(img, x, y, ramp[clampLevel(level) + 2]);
        continue;
      }

      if (ringHit && ringRamp) {
        // mitad trasera: sombra de terminator pegada al limbo
        const level = rr < ringShadowRR ? -2 : -1;
        put(img, x, y, ringRamp[level + 2]);
        continue;
      }

      // aliento atmosférico: aro continuo de 1px (sin dither, para no dejar
      // píxeles sueltos que estropeen la circunferencia)
      if (showHalo && rr <= haloRR) {
        put(img, x, y, ramps[0][3], 90);
      }
    }
  }
  return img;
}

/** Mini-sprite de una luna (un solo frame: a este tamaño la rotación no se ve). */
function renderMoonSprite(moon: MoonSpec, dna: VisualDNA): HTMLCanvasElement {
  const s = moon.size;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx2 = canvas.getContext("2d")!;
  const img = new ImageData(s, s);
  const c = s / 2;
  const R = s / 2;
  const tint = buildRamps([dna.colors[0]])[0];

  if (moon.kind === "station") {
    // anillo metálico con hub: la vieja estación, en miniatura orbital
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const nx = (x - c + 0.5) / R;
        const ny = (y - c + 0.5) / R;
        const d = Math.hypot(nx, ny);
        const inRing = d <= 1 && d >= 0.6;
        const inHub = d < 0.3;
        if (!inRing && !inHub) continue;
        const level = shadeLevel(lightAt(nx, ny), x, y);
        put(img, x, y, mix(METAL_RAMP[level + 2], tint[level + 2], 0.3));
      }
    }
    // ventana apagada fija; el parpadeo lo dibuja la escena en runtime
    put(img, Math.round(s * 0.7), Math.round(s * 0.45), WINDOW_OFF);
  } else {
    const ramp = moon.kind === "ice" ? CAP_RAMP : METAL_RAMP.map((m, i) => mix(m, tint[i], 0.25)) as Ramp;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const nx = (x - c + 0.5) / R;
        const ny = (y - c + 0.5) / R;
        const rr = nx * nx + ny * ny;
        if (rr > 1) continue;
        let level = shadeLevel(lightAt(nx, ny), x, y);
        if (rr > ((R - 1) / R) ** 2) level = -2;
        put(img, x, y, ramp[clampLevel(level) + 2]);
      }
    }
  }
  ctx2.putImageData(img, 0, 0);
  return canvas;
}

const sheetCache = new Map<string, SpriteSheet>();

/**
 * Genera (con caché) la tira de frames del cuerpo de un proyecto.
 * Determinista: mismo ADN → misma tira.
 */
export function generateSpriteSheet(dna: VisualDNA, frames: number): SpriteSheet {
  const size = Math.round(20 + dna.radius * 28); // diámetro del cuerpo
  const key = `v4:${dna.seed}:${dna.variantKey}:${dna.colors.join()}:${size}:${frames}`;
  const hit = sheetCache.get(key);
  if (hit) return hit;

  const R = size / 2;
  const cell = Math.ceil(size * 1.8);
  const canvas = document.createElement("canvas");
  canvas.width = cell * frames;
  canvas.height = cell;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const ramps = buildRamps(dna.colors.slice(0, dna.colorCount));
  const temp = document.createElement("canvas");
  temp.width = cell;
  temp.height = cell;
  const tctx = temp.getContext("2d")!;

  const freq = Math.max(1, Math.round(dna.noiseScale * 0.8));
  const rCraters = rng(dna.seed ^ 0xc4a7);
  const craters: BodyContext["craters"] = [];
  if (dna.surface === "cratered") {
    const n = 5 + Math.floor(rCraters() * 4);
    for (let i = 0; i < n; i++) {
      craters.push({
        u: rCraters() * SURF_PERIOD * freq,
        v: (rCraters() - 0.5) * SURF_PERIOD * freq * 0.45,
        r: 0.35 + rCraters() * 0.5,
      });
    }
  }
  const rShards = rng(dna.seed ^ 0xc21);
  const shards: BodyContext["shards"] = [];
  if (dna.surface === "crystalline") {
    const n = 4 + Math.floor(rShards() * 4);
    for (let i = 0; i < n; i++) {
      shards.push({
        u: rShards() * SURF_PERIOD * freq,
        v: (rShards() - 0.5) * SURF_PERIOD * freq * 0.5,
        r: 0.5 + rShards() * 0.7,
      });
    }
  }
  const rStorm = rng(dna.seed ^ 0x5707);
  const bctx: BodyContext = {
    dna,
    ramps,
    noise: fbm(makeNoise(dna.seed, SURF_PERIOD), 3),
    noise2: fbm(makeNoise(dna.seed ^ 0x1afa, SURF_PERIOD), 2),
    craters,
    shards,
    storm: dna.storm ? { u: rStorm() * SURF_PERIOD * freq, v: (rStorm() - 0.5) * 1.6 } : null,
    freq,
  };
  for (let f = 0; f < frames; f++) {
    tctx.clearRect(0, 0, cell, cell);
    tctx.putImageData(renderBody(cell, R, f / frames, bctx), 0, 0);
    ctx.drawImage(temp, f * cell, 0);
  }

  const decor = dna.moons.map((m) => renderMoonSprite(m, dna));
  const bodyRadius = dna.rings ? R * 0.72 : R;
  const sheet: SpriteSheet = { canvas, frameSize: cell, frames, bodyRadius, decor };
  sheetCache.set(key, sheet);
  return sheet;
}
