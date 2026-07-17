# API del daemon

Base: `http://localhost:4816`. Todo JSON. Los tipos exactos están en `shared/src/index.ts`.

## Proyectos

| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | `{ ok, name: "nebula" }` |
| `GET /api/projects` | todos los proyectos presentes (con análisis, git, contadores) |
| `GET /api/projects/:id` | un proyecto |
| `PATCH /api/projects/:id` | actualizar `jiraKey` (`{ jiraKey: "PROJ" \| null }`) |
| `GET /api/projects/:id/git` | detalle git: status, commits, ramas, cambios |
| `GET /api/projects/:id/sessions` | sesiones de agentes IA del proyecto |
| `GET /api/projects/:id/graph` | grafo Graphify (204 si no hay) |
| `GET /api/projects/:id/notes` | notas de Obsidian relacionadas |
| `POST /api/projects/:id/refresh` | re-analizar el proyecto |
| `POST /api/projects/:id/jira-suggest` | recalcular sugerencia de clave Jira |
| `POST /api/scan` | re-escaneo completo (asíncrono) |

## Tareas

| Método y ruta | Descripción |
|---|---|
| `GET /api/projects/:id/tasks` | tareas del proyecto (excluye descartadas) |
| `POST /api/projects/:id/tasks` | crear (`{ title, notes? }`) |
| `PATCH /api/tasks/:taskId` | cambiar `title`/`notes`/`status` (suggested/todo/doing/done/dismissed) |
| `DELETE /api/tasks/:taskId` | eliminar |
| `GET /api/inbox/tasks` | bandeja global: tareas Jira/Planner sin repo asociado |

## Integraciones

| Método y ruta | Descripción |
|---|---|
| `GET /api/jira/status` | estado del sync Jira |
| `POST /api/jira/test` | probar credenciales (`{ mode, baseUrl, email?, token }`) |
| `POST /api/jira/sync` | sync inmediato |
| `GET /api/planner/status` | estado (none/pending/connected/error, userCode si pending) |
| `POST /api/planner/connect` | inicia device code; devuelve código y URL |
| `POST /api/planner/disconnect` | borra tokens |
| `POST /api/planner/sync` | sync inmediato |

## Sistema de ficheros (para el selector de carpetas)

| Método y ruta | Descripción |
|---|---|
| `GET /api/fs/roots` | unidades + accesos rápidos |
| `GET /api/fs/list?path=…` | subdirectorios con `isRepo` y `repoCount` |

## Config

| Método y ruta | Descripción |
|---|---|
| `GET /api/config` | configuración actual |
| `PUT /api/config` | guardar (parcial); re-escanea y re-vigila |

## WebSocket — `ws://localhost:4816/ws`

Al conectar se recibe un snapshot `projects.changed`. Eventos (`WsEvent` en shared):

| Evento | Cuándo |
|---|---|
| `projects.changed` | lista completa (escaneo, repos nuevos/borrados) |
| `project.updated` | un proyecto cambió (git, análisis, contadores) |
| `agent.activity` | sesión de agente activa en un proyecto |
| `tasks.changed` | tareas de un proyecto cambiaron (incluye syncs Jira/Planner) |
| `scan.state` | `{ scanning: boolean }` |
