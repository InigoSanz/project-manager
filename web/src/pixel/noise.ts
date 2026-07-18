import { rng } from "../visuals/dna";

/** Función de ruido 2D normalizada a 0..1. */
export type Noise2D = (x: number, y: number) => number;

/**
 * Value-noise 2D determinista sobre una retícula sembrada con mulberry32.
 * La retícula envuelve en ambos ejes cada `period` unidades: muestrear con
 * `x + period` devuelve lo mismo, lo que permite tiras de rotación cilíndricas
 * (la superficie del planeta "da la vuelta" sin costura).
 */
export function makeNoise(seed: number, period = 64): Noise2D {
  const r = rng(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = r();

  const at = (ix: number, iy: number): number => {
    const gx = ((ix % period) + period) % period;
    const gy = ((iy % period) + period) % period;
    return grid[gy * period + gx];
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);

  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/**
 * Fractal brownian motion: suma de octavas del ruido base.
 * Las frecuencias son potencias de 2, así que conserva el periodo del base.
 */
export function fbm(noise: Noise2D, octaves = 4): Noise2D {
  return (x, y) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      total += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / total;
  };
}
