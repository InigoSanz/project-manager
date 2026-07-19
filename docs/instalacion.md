# Instalación y arranque

## Requisitos

- **Node.js ≥ 24** (LTS actual). Con nvm-windows: `nvm install 24 && nvm use 24`.
- **pnpm** (`npm install -g pnpm`).
- **git** en el PATH (Nebula lee el estado de los repos con el propio CLI de git).

Nada más: la base de datos es SQLite embebido (better-sqlite3 trae binarios precompilados) y todos los datos viven en `~/.nebula/`.

## Arranque en un paso

```bash
pnpm go
```

`scripts/go.mjs` hace lo mínimo necesario: `pnpm install` si no hay `node_modules`, `pnpm build` si no existe `web/dist`, y `pnpm start`. Ideal para un equipo recién clonado.

Comandos individuales:

```bash
pnpm install     # dependencias
pnpm build       # compila la UI (web/dist)
pnpm start       # daemon + UI en http://localhost:4816
pnpm dev         # desarrollo: UI con hot reload en :5173, API en :4816
pnpm dev:web     # solo la UI (contra un daemon ya levantado)
pnpm dev:server  # solo el daemon
pnpm typecheck   # comprueba tipos de los 3 paquetes
```

## Primer arranque

1. Nebula intenta deducir dónde están tus proyectos leyendo las sesiones de Claude Code (`~/.claude/projects`). Si acierta, verás tus repos directamente.
2. Si no hay nada, la pantalla inicial ofrece **“Elegir carpeta de proyectos”**: un navegador de carpetas del propio equipo que marca cuáles contienen repos git. Eliges una y Nebula escanea.
3. Puedes añadir más raíces en ⚙ Ajustes (o editar `~/.nebula/config.json`).

## Arranque automático con Windows (modo desatendido)

```bash
pnpm autostart:install     # crea un lanzador oculto en shell:startup
pnpm autostart:uninstall   # lo elimina
```

El daemon arranca sin ventana al iniciar sesión; la UI queda disponible en `http://localhost:4816` cuando la necesites. Si ya hay un Nebula corriendo, un segundo arranque lo detecta y sale limpiamente.

## En el móvil y la tablet

La UI es completamente responsive: barra de acciones inferior en el móvil, kanban con carrusel horizontal, controles táctiles siempre visibles y mapa con menos capas de estrellas y menos frames de rotación para que vaya fluido. Para abrirla desde otro dispositivo: activa el acceso LAN y escanea el QR (ver [configuracion.md](configuracion.md#acceso-desde-el-móvil-o-la-tablet)).

Desde el móvil **ves** todo el estado pero no puedes lanzar nada: abrir el editor, ejecutar scripts y las acciones de git solo funcionan desde el propio equipo. Es a propósito — ver [api.md](api.md#seguridad).

## Actualizar

```bash
git pull && pnpm install && pnpm build
```

y reinicia el daemon.
