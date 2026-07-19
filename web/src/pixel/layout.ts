import type { Project } from "@nebula/shared";
import { deriveDNA, rng } from "../visuals/dna";
import { hashString, zoneHue } from "./palette";
import { ORPHAN_ZONE, zoneName } from "./roots";

export interface ZonePlacement {
  /** path del root, o ORPHAN_ZONE */
  root: string;
  label: string;
  cx: number;
  cy: number;
  radius: number;
  hue: number;
  planets: Array<{ project: Project; x: number; y: number }>;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Aire mínimo entre los bordes de dos planetas vecinos. */
const PLANET_GAP = 16;

/** Posición determinista dentro de la zona: espiral áurea con densidad uniforme. */
function planetOffset(index: number, count: number, zoneRadius: number, r: () => number): { x: number; y: number } {
  const angle = index * GOLDEN + r() * 0.35;
  const rad = zoneRadius * (0.2 + 0.72 * Math.sqrt((index + 0.5) / Math.max(1, count)));
  return { x: Math.cos(angle) * rad, y: Math.sin(angle) * rad };
}

/** Radio visual del sprite, en la misma escala que usa generateSpriteSheet. */
function planetRadius(project: Project): number {
  const dna = deriveDNA(project);
  const size = 20 + dna.radius * 28;
  return (dna.rings ? size * 0.72 * 1.5 : size) / 2;
}

/**
 * Empuja los planetas que se solapan hasta dejar `PLANET_GAP` de aire.
 * Determinista (sin aleatoriedad) y acotado a unas pocas pasadas: con 15-20
 * proyectos en una zona la espiral áurea sola deja pares demasiado juntos.
 */
function relax(
  planets: Array<{ x: number; y: number; r: number }>,
  zoneRadius: number,
  iterations = 12,
): void {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const a = planets[i];
        const b = planets[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const need = a.r + b.r + PLANET_GAP;
        if (dist >= need) continue;
        const push = (need - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    // no dejar que nadie se salga del círculo de la zona
    for (const p of planets) {
      const d = Math.hypot(p.x, p.y);
      const max = zoneRadius - p.r * 0.5;
      if (d > max) {
        p.x = (p.x / d) * max;
        p.y = (p.y / d) * max;
      }
    }
    if (!moved) break;
  }
}

/**
 * Coloca cada zona (root) como una región circular separada: una sola zona va
 * centrada; varias se reparten en un anillo alrededor del origen. Determinista
 * y estable mientras no cambie el conjunto de roots.
 */
export function layoutZones(groups: Map<string, Project[]>): ZonePlacement[] {
  const entries = [...groups.entries()];
  // más aire por planeta: una zona con 20 proyectos necesita ~316px de radio
  const radii = entries.map(([, list]) => 110 + 46 * Math.sqrt(Math.max(1, list.length)));
  const maxR = Math.max(...radii, 90);
  const n = entries.length;
  // separación mínima entre centros adyacentes del anillo
  const ringR = n <= 1 ? 0 : Math.max((2 * maxR + 60) / (2 * Math.sin(Math.PI / n)), maxR * 1.5);

  return entries.map(([root, projects], i) => {
    const jitter = ((hashString(root) % 1000) / 1000 - 0.5) * 0.22;
    // arranca en π: con 2 zonas quedan lado a lado (mejor para pantallas anchas)
    const angle = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI + (n > 1 ? jitter : 0);
    const cx = n <= 1 ? 0 : Math.round(Math.cos(angle) * ringR);
    const cy = n <= 1 ? 0 : Math.round(Math.sin(angle) * ringR);
    const radius = radii[i];
    const r = rng(hashString(root) ^ 0x9e37);
    return {
      root,
      label: root === ORPHAN_ZONE ? "ESPACIO PROFUNDO" : zoneName(root),
      cx,
      cy,
      radius,
      hue: root === ORPHAN_ZONE ? 230 : zoneHue(root),
      planets: (() => {
        // espiral áurea + relajación, en coordenadas locales a la zona
        const local = projects.map((project, idx) => {
          const off = planetOffset(idx, projects.length, radius, r);
          return { project, x: off.x, y: off.y, r: planetRadius(project) };
        });
        relax(local, radius);
        return local.map((p) => ({ project: p.project, x: Math.round(cx + p.x), y: Math.round(cy + p.y) }));
      })(),
    };
  });
}
