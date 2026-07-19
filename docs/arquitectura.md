# Arquitectura

## Monorepo (pnpm workspaces)

```
shared/   Tipos TypeScript compartidos: el contrato entre server y web
server/   Daemon Node (Fastify + WebSocket + SQLite) — corre con tsx, sin build
web/      UI React 19 + Vite + Tailwind 4 + motor pixel-art propio sobre Canvas 2D
scripts/  go.mjs (arranque en un paso), install-autostart.mjs (Windows)
docs/     esta documentación
```

No hay ninguna librería 3D: el mapa se dibuja a mano en un `<canvas>` 2D
(`web/src/pixel/`). Ver [visuales.md](visuales.md).

### Módulos del daemon

| Módulo | Responsabilidad |
|---|---|
| `scanner/` | descubre repos bajo las raíces y vigila cambios (chokidar) |
| `analyzer/` | lenguajes, frameworks, métricas, salud y *traits* visuales |
| `git/` | estado, detalle, diff, log y acciones (fetch/pull/checkout) por CLI |
| `agents/` | los 5 proveedores de sesiones de IA |
| `tasks/` | tareas locales, sugeridas y externas + write-back |
| `integrations/` | `jira.ts`, `planner.ts`, `github.ts`, Graphify y Obsidian |
| `actions/` | abrir en editor, terminal, carpeta o navegador |
| `runs/` | ejecución de scripts del `package.json` con salida en vivo |
| `notes/` | bloc de notas por proyecto (`project_notes`) |
| `security.ts` | orígenes permitidos, endpoints solo-loopback, validación de config |
| `backup.ts` | copia diaria y rotativa de la base de datos y del config |
| `lan.ts` | URLs de red local para el acceso desde el móvil |

## Flujo de datos

```
        ┌────────────┐   descubre .git    ┌──────────┐
roots ─►│  scanner   ├───────────────────►│ analyzer │─► lenguajes, frameworks,
        │ (chokidar) │                    └────┬─────┘   métricas, ADN visual
        └─────┬──────┘                         │
              │ git status (CLI porcelain v2)  ▼
              │                          ┌──────────┐    ┌───────────┐
              └─────────────────────────►│  SQLite  │◄───┤  agents   │ 5 proveedores
                                         │ ~/.nebula│    │ (watchers)│ (Claude, Codex,
  Jira / Planner / GitHub sync ─────────►│          │    └───────────┘  Cursor, Gemini,
                                         └────┬─────┘                   Antigravity)
                                              │ eventos
                                              ▼
                                        WebSocket hub ─► UI (zustand store)
```

- **Todo es push**: los watchers (repos, `.git`, directorios de sesiones de agentes) actualizan SQLite y difunden eventos WS; la UI nunca hace polling salvo los paneles bajo demanda (git detail, sesiones, tareas, grafo, notas).
- **El daemon es la única fuente de verdad**; la UI es reconstruible en cualquier momento (`pnpm build`).

## Esquema de base de datos (SQLite)

| Tabla | Claves | Uso |
|---|---|---|
| `projects` | `id` (sha1 de la ruta), `path` único | repo detectado + JSON de análisis + JSON de git status + `jira_key`, `jira_key_suggestion`, `remote_url`, `favorite`, `archived` |
| `agent_sessions` | `id` = `agente:sessionId` | sesión normalizada de cualquier proveedor |
| `tasks` | `id` (uuid, o `jira:KEY` / `planner:id`) | kanban + sugeridas + externas; `source` ∈ manual/agent/jira/planner/github; además `due_date`, `priority` (0-3) y `external_meta` |
| `project_notes` | `project_id` | bloc de notas propio del proyecto (las de Obsidian son solo lectura) |
| `notified` | `id` | notificaciones nativas ya emitidas, para no repetirlas |
| `parse_cache` | `path` | mtime+size por fichero de sesión, evita re-parsear |

Los proyectos virtuales `jira-inbox` y `planner-inbox` agrupan tareas externas sin repo asociado.

**Migraciones**: todas son aditivas e idempotentes (`PRAGMA table_info` y `ALTER TABLE` solo si falta la columna), así que actualizar Nebula nunca pierde datos. Aparte, `backup.ts` copia la base de datos y el config a `~/.nebula/backups/` al arrancar y cada 24 h, conservando las 7 últimas.

## Decisiones de diseño

- **Git por CLI** (`git -C … status --porcelain=v2`), no librerías JS: fidelidad total con worktrees, sparse checkouts y versiones nuevas de git.
- **Watchers defensivos**: `ignorePermissionErrors`, handlers de `error`, y los `*.lock` de git jamás se vigilan (aparecen y desaparecen en milisegundos y en Windows producen EPERM). Además `process.on("uncaughtException")` mantiene vivo el daemon ante cualquier fallo puntual.
- **Puerto ocupado**: si `:4816` ya responde como Nebula, el segundo arranque sale con código 0 ("ya está corriendo"); si lo ocupa otra app, mensaje claro y salida con error.
- **Integraciones tolerantes a ausencia**: cada proveedor/integración devuelve vacío si su herramienta no está instalada — el mismo build funciona en cualquier equipo.
- **Ejecutar solo desde el propio equipo**: Nebula no tiene login; su modelo de confianza es «escucho en localhost». Como eso no basta cuando se puede lanzar procesos, los endpoints que ejecutan algo exigen que la petición llegue por loopback y se comprueba la cabecera `Origin`. Desde el móvil se ve todo pero no se lanza nada. Detalle en [api.md](api.md#seguridad).
