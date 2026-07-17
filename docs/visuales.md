# El sistema visual (arte generativo)

Cada proyecto se representa con un **orbe procedural único y determinista**: el mismo repo produce siempre la misma visual, y la visual evoluciona con la actividad. No hay imágenes generadas por IA ni assets: todo es shader.

## Pipeline

```
analyzer (server)                    dna.ts (web)                    GLSL
──────────────────                   ─────────────                   ────
lenguajes (% bytes)  ──► palette ──► colores (hasta 4)          ──► uColorA..D
nº ficheros + LOC    ──► complexity► noiseScale, radius         ──► detalle/tamaño
commits 30d + agentes──► energy   ──► speed, glow, partículas   ──► pulso/brillo
framework dominante  ──► shape    ──► sphere/torus/crystal/…    ──► geometría
hash(nombre::ruta)   ──► seed     ──► PRNG mulberry32 (fase, jitter)
```

1. **`server/src/analyzer`** calcula los *traits* (`ProjectTraits` en `shared`): `seed`, `complexity` (0-1, escala log de ficheros+bytes), `energy` (0-1, commits recientes 70% + sesiones de agentes 30%), `palette` (colores linguist de los lenguajes dominantes) y `shape` (por framework: react→sphere, vue→torus, rust/.NET→crystal, python→cloud, go/docker→rings).
2. **`web/src/visuals/dna.ts`** convierte traits en parámetros concretos de render (`VisualDNA`) con un PRNG determinista (mulberry32 sembrado con `seed`).
3. **`web/src/visuals/NebulaMaterial.ts`** es el shader: simplex noise 3D fbm de 4 octavas desplaza los vértices; el fragment colorea por bandas de la paleta con deriva lenta y añade fresnel para alimentar el **bloom** de postprocesado.
4. **`ProjectOrb.tsx`** monta geometría + material + partículas orbitales (cantidad ∝ energía) + anillo (shape `rings`) y aplica la "respiración" (escala senoidal) y el **pulso en vivo** (`livePulse` sube el glow cuando un agente está trabajando en el repo).

## Escenas

- **Galaxy** (`web/src/scenes/Galaxy.tsx`): constelación en espiral de ángulo áureo (`constellationPosition`), estrellas de fondo, bloom + viñeta, auto-rotación suave, hover con acercamiento y click para navegar.
- **Detalle** (`web/src/pages/Project.tsx`): el mismo orbe como héroe a mayor escala.

## Ajustar la estética

- Intensidad global del brillo: `Bloom intensity` en `Galaxy.tsx`.
- Rugosidad de la superficie: `noiseScale`/`distortion` en `dna.ts` (por forma).
- Tope del pulso en vivo: `targetGlow` en `ProjectOrb.tsx` (limitado a 1.25 para no quemar la escena).
- Colores por lenguaje: `EXT_TO_LANG` en `server/src/analyzer/languages.ts`.
