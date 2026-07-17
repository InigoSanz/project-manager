# Agentes de IA

Nebula detecta qué han hecho tus agentes de código en cada repo y lo muestra como un timeline unificado. Cada proveedor lee el almacenamiento local de su herramienta; si no está instalada, simplemente no aporta sesiones.

## Modelo común

Todos los proveedores implementan `AgentProvider` (`server/src/agents/types.ts`) y normalizan a `AgentSession`:

```ts
{ agent, sessionId, projectId, title, firstPrompt, startedAt, endedAt,
  messageCount, toolUseCount, filesTouched[], status: "live" | "done" }
```

- El mapeo sesión → repo se hace por el `cwd`/workspace de la sesión (`matchProject`, multiplataforma).
- Una sesión es **live** si su fichero cambió hace < 2 min → el orbe del proyecto late y el timeline la marca "● en vivo".
- Caché incremental en la tabla `parse_cache` (mtime+size): solo se re-parsea lo que cambió.
- Las sesiones terminadas con trabajo real (≥3 herramientas o ≥6 mensajes) generan **tareas sugeridas** en el kanban.

## Los 5 proveedores

| Agente | Fuente | Formato |
|---|---|---|
| **Claude Code** | `~/.claude/projects/<ruta-slugificada>/*.jsonl` | JSONL: `type: user/assistant/summary`, tool_use en el content, `cwd` en cada entrada |
| **Codex CLI** | `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl` | JSONL: `session_meta` (cwd), `response_item` (mensajes/function calls), `event_msg` (`user_message`; los `token_count` se ignoran) |
| **Cursor** | IDE: `%APPDATA%\Cursor\User\workspaceStorage\<hash>\state.vscdb` + `globalStorage/state.vscdb` · CLI: `~/.cursor/chats/<hash>/<chatId>/store.db` | SQLite KV: `composer.composerData` (lista) + `composerData:<id>` (conversación). El hash→carpeta sale de `workspace.json` |
| **Gemini CLI** | `~/.gemini/tmp/<sha256-de-la-ruta>/chats/*.json(l)` | JSON clásico (`messages[]` con `parts`/`functionCall`) y JSONL nuevo (`session_metadata` + `type: user/gemini`). El hash del directorio es sha256 de la ruta del proyecto |
| **Antigravity** (Google) | `%APPDATA%\Antigravity\User\workspaceStorage\<hash>\state.vscdb` (+ `~/.antigravity` si existe) | Fork de VSCode: extracción defensiva de estructuras tipo conversación en las tablas KV (esquema no documentado por Google) |

**Nota sobre Cursor/Antigravity**: sus BD SQLite se abren siempre **sobre una copia temporal de solo lectura** (`server/src/agents/vscdb.ts`) para no bloquear la app si está abierta.

## Añadir un proveedor nuevo

1. Crea `server/src/agents/<nombre>.ts` implementando `AgentProvider`:
   - `kind`: identificador (añádelo a `AgentKind` en `shared/src/index.ts`).
   - `watchPaths()`: directorios a vigilar para actividad en vivo (pueden no existir).
   - `collect(projects, cache)`: descubre ficheros de sesión y devuelve `AgentSession[]`. Usa `withCache` para el parseo incremental y `matchProject` para el mapeo.
2. Regístralo en la lista `providers` de `server/src/agents/manager.ts`.
3. Añade su identidad visual (icono + etiqueta + color) en `AGENT_META` de `web/src/components/AgentTimeline.tsx`.

Con eso hereda gratis: timeline, badge en vivo, pulso del orbe, tareas sugeridas y contadores.
