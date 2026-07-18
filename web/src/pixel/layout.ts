import type { Project } from "@nebula/shared";
import { rng } from "../visuals/dna";
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

/** Posición determinista dentro de la zona: espiral áurea con densidad uniforme. */
function planetOffset(index: number, count: number, zoneRadius: number, r: () => number): { x: number; y: number } {
  const angle = index * GOLDEN + r() * 0.35;
  const rad = zoneRadius * (0.2 + 0.72 * Math.sqrt((index + 0.5) / Math.max(1, count)));
  return { x: Math.cos(angle) * rad, y: Math.sin(angle) * rad };
}

/**
 * Coloca cada zona (root) como una región circular separada: una sola zona va
 * centrada; varias se reparten en un anillo alrededor del origen. Determinista
 * y estable mientras no cambie el conjunto de roots.
 */
export function layoutZones(groups: Map<string, Project[]>): ZonePlacement[] {
  const entries = [...groups.entries()];
  const radii = entries.map(([, list]) => 90 + 34 * Math.sqrt(Math.max(1, list.length)));
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
      planets: projects.map((project, idx) => {
        const off = planetOffset(idx, projects.length, radius, r);
        return { project, x: Math.round(cx + off.x), y: Math.round(cy + off.y) };
      }),
    };
  });
}
