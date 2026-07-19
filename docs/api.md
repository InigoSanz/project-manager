# API del daemon

Base: `http://localhost:4816`. Todo JSON. Los tipos exactos están en `shared/src/index.ts`.

Las rutas marcadas con 🔒 solo responden si la petición llega desde el propio
equipo (ver [Seguridad](#seguridad)).

## Proyectos

| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | `{ ok, name: "nebula" }` |
| `GET /api/projects` | todos los proyectos presentes (con análisis, git, contadores) |
| `GET /api/projects/:id` | un proyecto |
| `PATCH /api/projects/:id` | `{ jiraKey?: "PROJ" \| null, favorite?: boolean, archived?: boolean }` |
| `GET /api/projects/:id/sessions` | sesiones de agentes IA del proyecto |
| `GET /api/projects/:id/graph` | grafo Graphify (204 si no hay) |
| `GET /api/projects/:id/notes` | notas de Obsidian relacionadas |
| `GET /api/projects/:id/readme` | README renderizado del repo (204 si no tiene) |
| `GET /api/projects/:id/scratchpad` | bloc de notas propio de Nebula |
| `PUT /api/projects/:id/scratchpad` | guardar el bloc (`{ body }`) |
| `GET /api/projects/:id/outdated` | último informe de dependencias desactualizadas (204 si no hay) |
| `POST /api/projects/:id/outdated` | 🔒 recalcularlo (lanza el gestor de paquetes) |
| `POST /api/projects/:id/refresh` | re-analizar el proyecto |
| `POST /api/projects/:id/jira-suggest` | recalcular sugerencia de clave Jira |
| `POST /api/scan` | re-escaneo completo (asíncrono) |

## Acciones sobre un proyecto

Detalle funcional en [acciones.md](acciones.md).

| Método y ruta | Descripción |
|---|---|
| `POST /api/projects/:id/open` | 🔒 abrir el proyecto. `{ target }` ∈ `editor` \| `terminal` \| `explorer` \| `remote` |
| `POST /api/projects/:id/runs` | 🔒 lanzar un script del `package.json` (`{ script }`); devuelve `RunInfo` |
| `GET /api/runs` | ejecuciones vivas y recientes |
| `GET /api/runs/:runId` | una ejecución + su búfer de salida (últimas 500 líneas) |
| `POST /api/runs/:runId/stop` | 🔒 matar el proceso y toda su descendencia |

Solo se aceptan scripts que existan de verdad en el `package.json` del proyecto:
el nombre nunca llega al shell como texto libre.

## Git

| Método y ruta | Descripción |
|---|---|
| `GET /api/projects/:id/git` | detalle: status, commits, ramas, cambios |
| `GET /api/projects/:id/git/diff?path=…&staged=` | diff de un fichero |
| `GET /api/projects/:id/git/log?q=` | historial; con `q` busca en mensaje **y** en contenido |
| `POST /api/projects/:id/git/:action` | 🔒 `fetch` \| `pull` \| `checkout` (este último con `{ branch }`) |

`checkout` se rechaza si hay conflictos sin resolver.

## Tareas

| Método y ruta | Descripción |
|---|---|
| `GET /api/today` | vista Hoy agregada: `{ doing, todo, suggested, inbox, attention, live }` |
| `GET /api/tasks` | consulta con filtros: `status` (lista separada por comas), `projectId`, `source`, `priority`, `due`, `q`, `limit` (máx 300), `offset`. Devuelve `{ total, items }` con `projectName` resuelto |
| `GET /api/search/tasks?q=` | búsqueda de tareas (título+notas, ≥2 caracteres, máx 15) |
| `GET /api/projects/:id/tasks` | tareas del proyecto (excluye descartadas) |
| `POST /api/projects/:id/tasks` | crear (`{ title, notes?, dueDate?, priority? }`) |
| `PATCH /api/tasks/:taskId` | cambiar `title`/`notes`/`status`/`projectId`/`dueDate` (YYYY-MM-DD)/`priority` (0-3). Poner `status: "done"` en una tarea jira/planner dispara el **write-back** al sistema origen |
| `DELETE /api/tasks/:taskId` | eliminar |
| `GET /api/inbox/tasks` | bandejas: tareas sin repo (jira-inbox, planner-inbox, inbox personal) |
| `POST /api/inbox/tasks` | crear tarea en «Sin proyecto» |

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
| `GET /api/github/status` | estado del sync de GitHub |
| `GET /api/github/pulls` | pull requests abiertos que te afectan |
| `POST /api/github/test` | probar un token (`{ token }`) |
| `POST /api/github/sync` | sync inmediato |

## Sistema de ficheros (para el selector de carpetas)

| Método y ruta | Descripción |
|---|---|
| `GET /api/fs/roots` | 🔒 unidades + accesos rápidos |
| `GET /api/fs/list?path=…` | 🔒 subdirectorios con `isRepo` y `repoCount` |

Solo-loopback: exponer el árbol de directorios de tu disco a toda la wifi sería
una fuga de información aunque no ejecute nada.

## Config

| Método y ruta | Descripción |
|---|---|
| `GET /api/config` | configuración actual, **con los tokens enmascarados** (`••••••••`) y dos banderas `hasJiraToken` / `hasGithubToken` |
| `PUT /api/config` | guardar (parcial); re-escanea y re-vigila. 400 si algún valor es inválido |
| `GET /api/lan-info` | `{ enabled, urls }` para el QR de acceso desde el móvil |

`PUT /api/config` solo acepta las claves de la lista blanca (las demás se
descartan en silencio) y valida los rangos — ver [configuracion.md](configuracion.md#validación).
Si el cliente reenvía un token con el valor enmascarado, se conserva el que ya
estaba guardado en lugar de sobrescribirlo.

## WebSocket — `ws://localhost:4816/ws`

Al conectar se recibe un snapshot `projects.changed`. Eventos (`WsEvent` en shared):

| Evento | Cuándo |
|---|---|
| `projects.changed` | lista completa (escaneo, repos nuevos/borrados) |
| `project.updated` | un proyecto cambió (git, análisis, contadores) |
| `agent.activity` | sesión de agente activa en un proyecto |
| `tasks.changed` | tareas de un proyecto cambiaron (incluye syncs Jira/Planner) |
| `scan.state` | `{ scanning: boolean }` |
| `toast` | notificación para la UI: `{ level, message, link? }` (p. ej. resultado de un write-back) |
| `run.started` | arrancó un script: `{ run: RunInfo }` |
| `run.output` | salida agrupada cada 80 ms: `{ runId, chunks }` con `{ stream, line }` |
| `run.exited` | terminó (o lo mataste): `{ run }` con `status`, `exitCode` y `endedAt` |

La unión `WsEvent` es **aditiva**: el cliente ignora los tipos que no conoce, así
que añadir eventos nuevos no rompe pestañas abiertas con una versión anterior.

## Seguridad

Nebula no tiene autenticación: su modelo de confianza es «solo escucho en tu
máquina». Eso deja dos huecos que el daemon cierra en `server/src/security.ts`.

**1. Comprobación de `Origin`.** Cualquier web que visites puede llamar a
`http://localhost:4816` desde tu navegador. Sin comprobar el origen, navegar por
internet equivaldría a dejar que cualquier página ejecute código en tu equipo.
Se rechazan con **403** las peticiones cuyo `Origin` no sea el propio Nebula (o
una URL de red local, si activaste `lanAccess`). Las peticiones sin `Origin`
—`curl`, la navegación normal— pasan: el ataque que preocupa siempre lo envía.

**2. Ejecutar solo desde el propio equipo.** Con `lanAccess` activado, cualquier
dispositivo de la wifi tendría la API entera. Por eso todo lo que *ejecuta* algo
(abrir el editor, lanzar scripts, acciones de git, recalcular dependencias)
exige que la petición llegue por loopback y devuelve **403** en caso contrario.
Desde el móvil ves todo el estado pero no puedes lanzar nada; es intencionado.

**3. Configuración.** `PUT /api/config` valida contra una lista blanca de claves
con rangos, y `GET /api/config` nunca devuelve los tokens de Jira ni de GitHub
en claro.
