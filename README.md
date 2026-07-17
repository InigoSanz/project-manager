# 🌌 Nebula

Gestor visual **local** de proyectos/repositorios. Detecta automáticamente los repos de tu máquina y los representa como una constelación de orbes procedurales generados a partir del ADN de cada proyecto: sus lenguajes, su tamaño y su actividad.

## Qué hace

- **Detección automática**: eliges carpetas desde la UI (navegador de carpetas integrado) y Nebula encuentra todos los repos git; los watchers detectan repos nuevos sin reiniciar.
- **Arte generativo por proyecto**: cada repo tiene una visual única y determinista (shaders GLSL + three.js). Los colores salen de la mezcla de lenguajes, el tamaño de la complejidad, y el "pulso" de la actividad reciente (commits + sesiones de agentes IA).
- **Git en vivo**: rama, ahead/behind, working tree, ramas, últimos commits y sparkline de actividad — actualizado por WebSocket al instante.
- **Agentes IA**: timeline unificado de sesiones de **Claude Code**, **Codex CLI**, **Cursor**, **Gemini CLI** y **Antigravity** por proyecto, con detección de sesiones en vivo (el orbe late cuando un agente trabaja).
- **Vista "Hoy"** (tecla `T`): todas tus tareas, avisos git y agentes activos de todos los proyectos en un panel; añade tareas al vuelo con `@proyecto` y completa con un click.
- **Tareas**: kanban por proyecto + sugeridas automáticas desde las sesiones de agentes + **issues de Jira** asignados a ti + **tareas de Microsoft Planner** (login 365 delegado). Completar en Nebula **cierra también en Jira/Planner** (write-back).
- **Grafo de conocimiento**: renderiza en 3D el grafo de [Graphify](https://github.com/safishamsi/graphify) si existe `graphify-out/graph.json` en el repo.
- **Obsidian**: encuentra notas de tus vaults que mencionan cada proyecto y las abre con `obsidian://`.
- **Command palette**: `Ctrl+K` para saltar a cualquier proyecto o acción.

## Uso

```bash
pnpm go           # instala + compila + arranca → http://localhost:4816
```

Desarrollo (hot reload): `pnpm dev` (UI en :5173, API en :4816).

### Modo desatendido

```bash
pnpm autostart:install    # arranca Nebula oculto al iniciar sesión en Windows
pnpm autostart:uninstall
```

## Documentación

Toda la documentación está en [`docs/`](docs/README.md): [instalación](docs/instalacion.md) · [configuración](docs/configuracion.md) · [arquitectura](docs/arquitectura.md) · [agentes](docs/agentes.md) · [integraciones (Graphify/Obsidian/Jira/Planner)](docs/integraciones.md) · [sistema visual](docs/visuales.md) · [API](docs/api.md) · [solución de problemas](docs/solucion-problemas.md).

Requisitos: Node ≥ 24, pnpm, git. Los agentes/integraciones que no estén instalados simplemente no aportan datos (portable a cualquier equipo).
