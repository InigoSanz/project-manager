# El sistema visual (pixel art generativo)

Cada proyecto se representa con un **planeta pixel-art único y determinista**: el mismo repo produce siempre el mismo sprite, y la visual evoluciona con la actividad. No hay assets dibujados ni imágenes de IA: todo se genera por código en un motor propio de Canvas 2D (`web/src/pixel/`).

## Pipeline

```
analyzer (server)                    dna.ts (web)                    pixel/ (web)
──────────────────                   ─────────────                   ────────────
lenguajes (% bytes)  ──► palette ──► colores (hasta 4)          ──► rampas de sombreado + dithering
nº ficheros + LOC    ──► complexity► noiseScale, radius         ──► detalle/tamaño del sprite
commits 30d + agentes──► energy   ──► speed, glow               ──► velocidad de rotación / pulso
framework dominante  ──► shape    ──► sphere/torus/crystal/…    ──► tipo de cuerpo celeste
hash(nombre::ruta)   ──► seed     ──► PRNG mulberry32           ──► ruido y variaciones
```

1. **`server/src/analyzer`** calcula los *traits* (`ProjectTraits` en `shared`): `seed`, `complexity`, `energy` (commits recientes 70% + sesiones de agentes 30%), `palette` (colores linguist) y `shape` (por framework: react→sphere, vue→torus, rust/.NET→crystal, python→cloud, go/docker→rings). Desde v2.1 el `shape` es solo un **sesgo**: `deriveDNA` tira variantes deterministas por seed (superficie continents/archipelago/banded/mottled/cratered/lava/ice, anillos de 1-2 bandas, 0-2 lunas —o una luna-estación para `torus`—, halo y tormenta), así que dos repos del mismo framework nunca se ven iguales.
2. **`web/src/visuals/dna.ts`** convierte traits en parámetros de render (`VisualDNA`) con un PRNG determinista (mulberry32).
3. **`web/src/pixel/sprites.ts`** genera la **tira de rotación** (8 frames en táctil, 16 en escritorio) de cada cuerpo: globos por-píxel con proyección esférica falsa y ruido con envoltura cilíndrica (rotación sin costura), anillos en dos pasadas, estaciones anulares con ventanas parpadeantes y cristales facetados. Sombreado por rampas de 5 niveles con dithering Bayer 4×4. Todo va a caché por `seed`.
4. **`web/src/pixel/scene.ts` + `PixelMap.tsx`** montan el mapa: una **zona por carpeta raíz** (nebulosa de fondo, borde punteado y etiqueta en fuente bitmap 5×7 propia), planetas en espiral áurea dentro de cada zona, partículas orbitales cuando un agente trabaja y **pulso en vivo** (redibujo aditivo del sprite).

## El mapa

- **Zonas por root** (`pixel/layout.ts` + `pixel/roots.ts`): los proyectos se agrupan por prefijo de su carpeta raíz configurada; los huérfanos caen en «Espacio profundo». Con una zona va centrada; con varias se reparten en anillo.
- **Cámara** (`pixel/camera.ts`): pan con inercia, zoom al cursor/pinch con snap a entero al soltar (nitidez pixel-perfect), encuadre por zona (doble click o chips de la cabecera).
- **Fondo** (`pixel/starfield.ts`): 4 capas de estrellas con paralaje (2 en táctil), parpadeo senoidal en la capa cercana.
- **Detalle** (`web/src/pages/Project.tsx`): el mismo planeta como héroe vía `PixelPlanet.tsx`; también es el avatar de las tarjetas del Grid.

## Ajustar la estética

- Tamaño de los planetas: fórmula `size` en `pixel/sprites.ts` (`generateSpriteSheet`).
- Nº de "continentes": `SURF_PERIOD` en `pixel/sprites.ts` (celdas de terreno por vuelta).
- Rampas de sombreado y dithering: `pixel/palette.ts` (`shade`, `BAYER4`).
- Color de cada zona: `zoneHue` en `pixel/palette.ts` (hash del path del root).
- Velocidad de rotación: multiplicador de `frameAcc` en `pixel/scene.ts` (∝ `dna.speed`).
- Colores por lenguaje: `EXT_TO_LANG` en `server/src/analyzer/languages.ts`.
