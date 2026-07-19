import type { Project, ProjectTraits } from "@nebula/shared";

/** Estilo de superficie del planeta (lo sesga la tecnología, lo concreta el seed). */
export type SurfaceStyle =
  | "continents"
  | "archipelago"
  | "banded"
  | "mottled"
  | "cratered"
  | "lava"
  | "ice"
  | "crystalline";

export interface RingSpec {
  bands: 1 | 2;
  tilt: number;
  /** semieje mayor relativo al radio del cuerpo */
  scale: number;
  colorIdx: number;
}

export interface MoonSpec {
  kind: "rock" | "ice" | "station";
  /** diámetro del sprite decorativo en px */
  size: number;
  /** radio orbital como múltiplo del radio del cuerpo */
  dist: number;
  /** rad/s; el signo es la dirección */
  speed: number;
  phase: number;
}

/** Parámetros visuales concretos derivados (determinísticamente) de los traits. */
export interface VisualDNA {
  seed: number;
  colors: [string, string, string, string];
  colorCount: number;
  /** detalle de la superficie del planeta */
  noiseScale: number;
  /** rugosidad heredada del shape; sin uso desde que los cuerpos son todos esferas */
  distortion: number;
  /** velocidad de animación (late con la energía) */
  speed: number;
  /** intensidad del brillo/pulso */
  glow: number;
  particleCount: number;
  radius: number;
  shape: ProjectTraits["shape"];
  /** desfase inicial para que cada planeta respire distinto */
  phase: number;
  surface: SurfaceStyle;
  rings: RingSpec | null;
  moons: MoonSpec[];
  /** halo atmosférico de 1-2px alrededor del limbo */
  halo: boolean;
  /** mancha de tormenta (solo superficies banded) */
  storm: boolean;
  /** codificación compacta de las variantes (clave de caché del sprite) */
  variantKey: string;
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

type SurfaceTable = Array<[SurfaceStyle, number]>;

/**
 * La tecnología dominante marca el "bioma" del planeta, pero cada tabla deja
 * varias superficies posibles: así se intuye el stack de un vistazo y dos repos
 * de la misma tecnología siguen distinguiéndose (los decide el seed).
 * Se recorre en orden: gana el primer framework del proyecto que aparezca aquí.
 */
const TECH_SURFACES: Array<[string, SurfaceTable]> = [
  ["angular", [["crystalline", 70], ["mottled", 30]]],
  ["dotnet", [["crystalline", 70], ["cratered", 30]]],
  ["rust-crate", [["crystalline", 60], ["lava", 40]]],
  ["maven", [["cratered", 55], ["continents", 25], ["mottled", 20]]],
  ["gradle", [["cratered", 55], ["mottled", 25], ["continents", 20]]],
  ["django", [["lava", 55], ["banded", 45]]],
  ["python", [["lava", 50], ["banded", 30], ["mottled", 20]]],
  ["go-module", [["banded", 60], ["cratered", 40]]],
  ["docker", [["banded", 50], ["mottled", 30], ["cratered", 20]]],
  ["nextjs", [["continents", 60], ["archipelago", 40]]],
  ["react-native", [["archipelago", 60], ["continents", 40]]],
  ["react", [["continents", 55], ["archipelago", 30], ["ice", 15]]],
  ["vue", [["archipelago", 55], ["continents", 45]]],
  ["nuxt", [["archipelago", 60], ["ice", 40]]],
  ["svelte", [["archipelago", 50], ["ice", 50]]],
  ["astro", [["ice", 60], ["archipelago", 40]]],
  ["nestjs", [["mottled", 60], ["cratered", 40]]],
  ["express", [["mottled", 55], ["continents", 45]]],
  ["fastify", [["mottled", 55], ["archipelago", 45]]],
  ["hono", [["mottled", 60], ["archipelago", 40]]],
  ["electron", [["ice", 60], ["mottled", 40]]],
  ["tauri", [["ice", 55], ["crystalline", 45]]],
  ["threejs", [["crystalline", 50], ["ice", 50]]],
  ["serverless", [["banded", 60], ["mottled", 40]]],
];

/** Sin tecnología reconocida: el shape del analizador sigue haciendo de sesgo. */
const SHAPE_SURFACES: Record<ProjectTraits["shape"], SurfaceTable> = {
  sphere: [["continents", 30], ["archipelago", 20], ["ice", 15], ["mottled", 15], ["cratered", 10], ["lava", 10]],
  cloud: [["banded", 55], ["mottled", 20], ["ice", 15], ["lava", 10]],
  rings: [["continents", 30], ["banded", 25], ["mottled", 25], ["cratered", 20]],
  torus: [["continents", 30], ["archipelago", 20], ["ice", 15], ["mottled", 15], ["cratered", 10], ["lava", 10]],
  crystal: [["crystalline", 70], ["mottled", 30]],
};

function surfaceTableFor(frameworks: string[], shape: ProjectTraits["shape"]): SurfaceTable {
  for (const [tech, table] of TECH_SURFACES) {
    if (frameworks.includes(tech)) return table;
  }
  return SHAPE_SURFACES[shape];
}

function pickWeighted<T>(r: () => number, table: Array<[T, number]>): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let roll = r() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return table[table.length - 1][0];
}

/**
 * Tiradas de variante: cada feature usa su propio stream (`seed ^ CONST`)
 * para que añadir una tirada a una no descoloque las demás.
 */
function rollVariants(
  traits: ProjectTraits,
  frameworks: string[],
  colorCount: number,
  radius: number,
): Pick<VisualDNA, "surface" | "rings" | "moons" | "halo" | "storm" | "variantKey"> {
  const surface = pickWeighted(rng(traits.seed ^ 0x54f4), surfaceTableFor(frameworks, traits.shape));

  let rings: RingSpec | null = null;
  {
    const r = rng(traits.seed ^ 0x9219);
    const present = traits.shape === "rings" || r() < 0.18;
    if (present) {
      rings = {
        bands: r() < 0.4 ? 2 : 1,
        tilt: 0.28 + r() * 0.22,
        scale: 1.45 + r() * 0.25,
        colorIdx: Math.min(colorCount - 1, 1 + Math.floor(r() * 2)),
      };
    }
  }

  const moons: MoonSpec[] = [];
  if (traits.shape === "torus") {
    // la antigua estación-donut sobrevive como luna-estación orbitando
    moons.push({ kind: "station", size: 9, dist: 1.9, speed: 0.35, phase: 0 });
  }
  {
    const r = rng(traits.seed ^ 0x33bb);
    const roll = r();
    const extra = roll < 0.45 ? 1 : roll < 0.63 ? 2 : 0;
    for (let i = 0; i < extra && moons.length < 2; i++) {
      const kind = r() < 0.7 ? "rock" : "ice";
      const size = radius > 1.2 && r() < 0.25 ? 9 : r() < 0.5 ? 7 : 5;
      const prev = moons[moons.length - 1];
      const dist = Math.max(1.6 + r() * 0.8, prev ? prev.dist + 0.35 : 0);
      moons.push({ kind, size, dist, speed: (0.25 + r() * 0.45) * (r() < 0.5 ? -1 : 1), phase: r() * Math.PI * 2 });
    }
  }

  const rHs = rng(traits.seed ^ 0x77e1);
  const halo = rHs() < 0.3;
  const storm = surface === "banded" && rHs() < 0.5;

  const variantKey = [
    surface,
    rings ? `r${rings.bands}t${rings.tilt.toFixed(2)}s${rings.scale.toFixed(2)}c${rings.colorIdx}` : "r0",
    `${halo ? "h" : ""}${storm ? "s" : ""}`,
    `m${moons.map((m) => m.kind[0] + m.size).join("")}`,
  ].join(":");

  return { surface, rings, moons, halo, storm, variantKey };
}

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

  const colorCount = Math.max(1, Math.min(4, palette.length));
  // rango ancho: la complejidad del repo debe notarse de un vistazo en el mapa
  const radius = 0.55 + traits.complexity * 1.15;
  const frameworks = project.analysis?.frameworks ?? [];
  return {
    seed: traits.seed,
    colors,
    colorCount,
    noiseScale: 0.9 + traits.complexity * 1.1 + r() * 0.3,
    distortion: distortionByShape[traits.shape] * (0.7 + traits.complexity * 0.6),
    speed: 0.15 + traits.energy * 0.85,
    glow: 0.35 + traits.energy * 0.65,
    particleCount: Math.round(40 + traits.energy * 260 + traits.complexity * 100),
    radius,
    shape: traits.shape,
    phase: r() * Math.PI * 2,
    ...rollVariants(traits, frameworks, colorCount, radius),
  };
}
