# Arquitectura

## Monorepo (pnpm workspaces)

```
shared/   Tipos TypeScript compartidos: el contrato entre server y web
server/   Daemon Node (Fastify + WebSocket + SQLite) — corre con tsx, sin build
web/      UI React 19 + Vite + Tailwind 4 + react-three-fiber
scripts/  go.mjs (arranque en un paso), install-autostart.mjs (Windows)
docs/     esta documentación
```

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
        Jira / Planner sync ────────────►│          │    └───────────┘  Cursor, Gemini,
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
| `projects` | `id` (sha1 de la ruta), `path` único | repo detectado + JSON de análisis + JSON de git status + `jira_key`, `jira_key_suggestion` |
| `agent_sessions` | `id` = `agente:sessionId` | sesión normalizada de cualquier proveedor |
| `tasks` | `id` (uuid, o `jira:KEY` / `planner:id`) | kanban + sugeridas + externas; `source` ∈ manual/agent/jira/planner/email |
| `parse_cache` | `path` | mtime+size por fichero de sesión, evita re-parsear |

Los proyectos virtuales `jira-inbox` y `planner-inbox` agrupan tareas externas sin repo asociado.

## Decisiones de diseño

- **Git por CLI** (`git -C … status --porcelain=v2`), no librerías JS: fidelidad total con worktrees, sparse checkouts y versiones nuevas de git.
- **Watchers defensivos**: `ignorePermissionErrors`, handlers de `error`, y los `*.lock` de git jamás se vigilan (aparecen y desaparecen en milisegundos y en Windows producen EPERM). Además `process.on("uncaughtException")` mantiene vivo el daemon ante cualquier fallo puntual.
- **Puerto ocupado**: si `:4816` ya responde como Nebula, el segundo arranque sale con código 0 ("ya está corriendo"); si lo ocupa otra app, mensaje claro y salida con error.
- **Integraciones tolerantes a ausencia**: cada proveedor/integración devuelve vacío si su herramienta no está instalada — el mismo build funciona en cualquier equipo.
