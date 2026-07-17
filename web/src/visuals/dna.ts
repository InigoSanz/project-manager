import type { Project, ProjectTraits } from "@nebula/shared";

/** Parámetros visuales concretos derivados (determinísticamente) de los traits. */
export interface VisualDNA {
  seed: number;
  colors: [string, string, string, string];
  colorCount: number;
  /** escala del ruido del shader (detalle de la superficie) */
  noiseScale: number;
  /** amplitud del desplazamiento de vértices */
  distortion: number;
  /** velocidad de animación (late con la energía) */
  speed: number;
  /** intensidad del glow fresnel */
  glow: number;
  particleCount: number;
  radius: number;
  shape: ProjectTraits["shape"];
  /** desfase inicial para que cada orbe respire distinto */
  phase: number;
}

/** PRNG determinista (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FALLBACK = "#6366f1";

export function deriveDNA(project: Project): VisualDNA {
  const traits: ProjectTraits = project.analysis?.traits ?? {
    seed: 1,
    complexity: 0.3,
    energy: 0,
    palette: [FALLBACK],
    shape: "sphere",
  };
  const r = rng(traits.seed);
  const palette = traits.palette.length > 0 ? traits.palette : [FALLBACK];
  const colors: [string, string, string, string] = [
    palette[0] ?? FALLBACK,
    palette[1] ?? palette[0] ?? FALLBACK,
    palette[2] ?? palette[0] ?? FALLBACK,
    palette[3] ?? palette[1] ?? palette[0] ?? FALLBACK,
  ];

  const distortionByShape: Record<ProjectTraits["shape"], number> = {
    sphere: 0.16,
    torus: 0.12,
    crystal: 0.06,
    cloud: 0.34,
    rings: 0.15,
  };

  return {
    seed: traits.seed,
    colors,
    colorCount: Math.max(1, Math.min(4, palette.length)),
    noiseScale: 0.9 + traits.complexity * 1.1 + r() * 0.3,
    distortion: distortionByShape[traits.shape] * (0.7 + traits.complexity * 0.6),
    speed: 0.15 + traits.energy * 0.85,
    glow: 0.35 + traits.energy * 0.65,
    particleCount: Math.round(40 + traits.energy * 260 + traits.complexity * 100),
    radius: 0.7 + traits.complexity * 0.9,
    shape: traits.shape,
    phase: r() * Math.PI * 2,
  };
}

/** Posición determinista en la constelación: espiral de ángulo áureo. */
export function constellationPosition(index: number, seed: number): [number, number, number] {
  const r = rng(seed ^ 0x9e3779b9);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = index * golden + r() * 0.35;
  const radius = 3.2 + index * 1.9 + r() * 0.9;
  const y = (r() - 0.5) * 3.4;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}
