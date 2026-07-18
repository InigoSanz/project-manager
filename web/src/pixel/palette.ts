/** Utilidades de color y dithering para el arte pixelado. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Fondo hacia el que oscurecen las sombras (azul muy profundo, no negro puro). */
const SHADOW: [number, number, number] = [8, 9, 22];
const LIGHT: [number, number, number] = [240, 244, 255];

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Rampa de sombreado pixel-art: level -2..2 (0 = color base).
 * Negativo oscurece hacia azul profundo, positivo aclara hacia blanco frío.
 */
export function shade(hex: string, level: number): string {
  const base = hexToRgb(hex);
  if (level === 0) return rgbToHex(...base);
  const t = Math.min(1, Math.abs(level) * 0.32);
  const target = level < 0 ? SHADOW : LIGHT;
  return rgbToHex(...mix(base, target, t));
}

/** Matriz de Bayer 4×4 normalizada a 0..1 (umbrales de dithering ordenado). */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

/** true si el píxel (x,y) debe usar el color "claro" para una cobertura t (0..1). */
export function dither(x: number, y: number, t: number): boolean {
  return t > BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4];
}

/** HSL (h en grados, s/l en 0..1) → RGB 0..255. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Hash FNV-1a de 32 bits (estable entre sesiones). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tono estable por zona (carpeta raíz): hue determinista, saturación fija. */
export function zoneHue(root: string): number {
  return hashString(root.toLowerCase()) % 360;
}

/** Color CSS del acento de una zona. */
export function zoneColor(root: string, alpha = 1): string {
  return `hsla(${zoneHue(root)} 65% 62% / ${alpha})`;
}
