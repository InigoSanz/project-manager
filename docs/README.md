# Documentación de Nebula

Nebula es un centro de control **local** para tus proyectos y repositorios: detecta los repos git de tu máquina, los dibuja como planetas pixel-art en un mapa 2D y reúne en un solo sitio su estado git, la actividad de tus agentes de IA, tus tareas (propias, de Jira, de Planner y de GitHub), su grafo de conocimiento y sus notas. Desde el propio mapa puedes además abrir un proyecto en el editor, lanzar los scripts de su `package.json` y operar con git.

| Documento | Qué cubre |
|---|---|
| [instalacion.md](instalacion.md) | Requisitos, arranque en un paso, autostart de Windows |
| [configuracion.md](configuracion.md) | `~/.nebula/config.json` al completo y el selector de carpetas |
| [arquitectura.md](arquitectura.md) | Monorepo, flujo de datos, esquema de base de datos |
| [acciones.md](acciones.md) | Abrir, ejecutar scripts y operar con git desde Nebula |
| [tareas.md](tareas.md) | Las tres superficies de tareas, orígenes y sintaxis rápida |
| [agentes.md](agentes.md) | Los 5 proveedores de sesiones IA y cómo añadir uno nuevo |
| [integraciones.md](integraciones.md) | Graphify, Obsidian, Jira, Microsoft Planner y GitHub |
| [visuales.md](visuales.md) | El sistema de arte generativo (análisis → planeta) |
| [api.md](api.md) | Referencia REST, eventos WebSocket y modelo de seguridad |
| [solucion-problemas.md](solucion-problemas.md) | Errores conocidos y sus arreglos |

## En 30 segundos

```bash
pnpm go          # instala (si hace falta) + compila (si hace falta) + arranca
# → http://localhost:4816
```

La primera vez, si Nebula no encuentra proyectos, la propia UI te ofrece **elegir la carpeta** donde viven tus repos y detecta todo lo que haya dentro.
