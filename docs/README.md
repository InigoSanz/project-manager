# Documentación de Nebula

Nebula es un gestor visual **local** de proyectos/repositorios: detecta los repos git de tu máquina, los representa como orbes procedurales en una galaxia 3D y concentra en un solo sitio su estado git, la actividad de tus agentes de IA, tus tareas (propias, de Jira y de Planner), su grafo de conocimiento y sus notas.

| Documento | Qué cubre |
|---|---|
| [instalacion.md](instalacion.md) | Requisitos, arranque en un paso, autostart de Windows |
| [configuracion.md](configuracion.md) | `~/.nebula/config.json` al completo y el selector de carpetas |
| [arquitectura.md](arquitectura.md) | Monorepo, flujo de datos, esquema de base de datos |
| [agentes.md](agentes.md) | Los 5 proveedores de sesiones IA y cómo añadir uno nuevo |
| [integraciones.md](integraciones.md) | Graphify, Obsidian, Jira y Microsoft Planner |
| [visuales.md](visuales.md) | El sistema de arte generativo (ADN → shader) |
| [api.md](api.md) | Referencia REST + eventos WebSocket |
| [solucion-problemas.md](solucion-problemas.md) | Errores conocidos y sus arreglos |

## En 30 segundos

```bash
pnpm go          # instala (si hace falta) + compila (si hace falta) + arranca
# → http://localhost:4816
```

La primera vez, si Nebula no encuentra proyectos, la propia UI te ofrece **elegir la carpeta** donde viven tus repos y detecta todo lo que haya dentro.
