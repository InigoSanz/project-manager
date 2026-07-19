# 🌌 Nebula

> Centro de control **local** para tus proyectos: convierte tu actividad de desarrollo en un mapa espacial pixel-art interactivo desde el que además puedes trabajar.

Nebula detecta automáticamente los repositorios Git de tu máquina y representa cada proyecto como un planeta pixel-art procedural generado a partir de su ADN: lenguajes, tamaño, complejidad y actividad reciente. Cada carpeta raíz que configures es una zona del mapa con su propia nebulosa.

<p align="center">
  <img
    src="docs/assets/nebula-overview.png"
    alt="Vista principal de Nebula"
    width="900"
  />
</p>

## Índice

- [En 1 minuto](#en-1-minuto)
- [Qué hace](#qué-hace)
- [Requisitos](#requisitos)
- [Instalación rápida](#instalación-rápida)
- [Primer arranque](#primer-arranque)
- [Desarrollo](#desarrollo)
- [Modo desatendido en Windows](#modo-desatendido-en-windows)
- [Acceso desde móvil o tablet](#acceso-desde-móvil-o-tablet)
- [Integraciones opcionales](#integraciones-opcionales)
- [Atajos principales](#atajos-principales)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura del repositorio](#arquitectura-del-repositorio)
- [Seguridad y privacidad](#seguridad-y-privacidad)
- [Documentación](#documentación)
- [Actualización](#actualización)
- [Solución de problemas](#solución-de-problemas)
- [Licencia](#licencia)

## En 1 minuto

```bash
git clone https://github.com/InigoSanz/nebula-project-manager.git
cd nebula-project-manager
pnpm go            # instala + compila + arranca → http://localhost:4816
```

La primera vez, si Nebula no encuentra tus repos, te deja **elegir la carpeta** donde viven y escanea todo lo que haya dentro. No hay nada que configurar para empezar; las integraciones y los agentes son opcionales.

## Qué hace

**El mapa.** Detecta tus repos Git y los dibuja como planetas pixel-art en un mapa 2D, agrupados por carpeta raíz. La superficie la marca la tecnología detectada, el tamaño la complejidad, y el planeta late y suelta partículas cuando un agente de IA trabaja dentro. Pan, zoom, filtros (tecnología, git, actividad) y favoritos.

**Trabajar sin salir.** Desde cualquier proyecto: abrir en tu editor, terminal, carpeta o el remoto en el navegador; ejecutar los scripts del `package.json` con la salida en vivo; y operar con git (estado, diff, cambio de rama —guardando en un stash si hace falta—, `fetch`/`pull`, búsqueda en el historial). Estas acciones solo funcionan desde tu propio equipo.

**Tus tareas, en un sitio.** Reúne las tareas propias, las sugeridas por tus sesiones de IA y las de Jira, Planner y GitHub. Vista **Hoy** (qué toca ahora), **`/tareas`** (todo con filtros) y un **kanban** por proyecto. Creación rápida escribiendo `@proyecto`, `!prioridad` y `^fecha`.

**Contexto del repo.** README renderizado, versión y gestor, salud (CI, tests, licencia), dependencias desactualizadas, actividad git en vivo, sesiones de **Claude Code, Codex, Cursor, Gemini y Antigravity**, bloc de notas propio y el grafo de conocimiento de Graphify dibujado como **mapa estelar**.

**Integraciones (opcionales).** Jira y Microsoft Planner con write-back opcional, GitHub (PRs, revisiones e issues), Obsidian (notas) y Graphify (grafo). Si una herramienta no está instalada, Nebula sigue funcionando sin ella.

**Para el día a día.** Responsive (escritorio, móvil y tablet, con acceso por QR en la red local), arranque desatendido en Windows, command palette (`Ctrl+K`), tour de bienvenida y ayuda con `?`. Todo es local: nada sale de tu máquina salvo lo que tú configures.

## Requisitos

- [Node.js](https://nodejs.org/) **24 o superior**
- [pnpm](https://pnpm.io/)
- [Git](https://git-scm.com/) disponible en el `PATH`

Instalación global de pnpm:

```bash
npm install -g pnpm
```

Las integraciones y agentes son opcionales. Si una herramienta no está instalada o configurada, Nebula continúa funcionando sin aportar datos de esa fuente.

## Instalación rápida

```bash
git clone https://github.com/InigoSanz/nebula-project-manager.git
cd nebula-project-manager
pnpm go
```

`pnpm go`:

1. instala las dependencias si es necesario;
2. compila la interfaz si todavía no existe un build;
3. inicia el servidor y la aplicación.

Después abre:

```text
http://localhost:4816
```

## Primer arranque

Al iniciar Nebula por primera vez:

1. La aplicación intenta detectar automáticamente dónde se encuentran tus repositorios.
2. Si no encuentra ninguno, muestra la opción **Elegir carpeta de proyectos**.
3. Selecciona una carpeta raíz que contenga tus repositorios.
4. Nebula escanea la ruta y añade los proyectos encontrados.
5. Puedes añadir más carpetas desde **Ajustes**.

La configuración se almacena en:

```text
~/.nebula/config.json
```

Los datos locales se almacenan en:

```text
~/.nebula/
```

## Desarrollo

Instala las dependencias:

```bash
pnpm install
```

Inicia el entorno de desarrollo:

```bash
pnpm dev
```

Servicios disponibles:

- Interfaz web con hot reload: `http://localhost:5173`
- API y WebSocket: `http://localhost:4816`

Comandos principales:

```bash
pnpm dev          # inicia todos los paquetes en modo desarrollo
pnpm dev:web      # inicia únicamente la interfaz
pnpm dev:server   # inicia únicamente el servidor
pnpm typecheck    # comprueba los tipos del monorepo
pnpm build        # compila la interfaz web
pnpm start        # inicia el servidor en modo normal
pnpm go           # instala, compila e inicia
```

## Modo desatendido en Windows

Nebula puede iniciarse automáticamente y sin mostrar una terminal al comenzar la sesión de Windows.

Instalar el arranque automático:

```bash
pnpm autostart:install
```

Eliminarlo:

```bash
pnpm autostart:uninstall
```

La aplicación seguirá disponible en:

```text
http://localhost:4816
```

## Acceso desde móvil o tablet

Nebula puede exponerse dentro de la red local:

1. Abre **Ajustes**.
2. Activa **Acceso desde la red local**.
3. Reinicia el daemon.
4. Escanea el código QR desde un dispositivo conectado a la misma red.

> [!WARNING]
> Activa el acceso LAN únicamente en redes de confianza. Cuando está habilitado, otros dispositivos de la red local pueden acceder a la aplicación.

## Integraciones opcionales

### Agentes de IA

Nebula puede detectar sesiones de:

- Claude Code
- Codex CLI
- Cursor
- Gemini CLI
- Antigravity

No es necesario instalar todos los proveedores.

### Jira

Permite:

- importar issues asignados al usuario;
- asociarlos a repositorios;
- mostrarlos como tareas del kanban;
- cerrar issues desde Nebula mediante write-back.

Puede configurarse en modo de solo lectura desactivando la escritura desde **Ajustes**.

### Microsoft Planner

Permite:

- iniciar sesión mediante Microsoft 365;
- sincronizar tareas asignadas;
- completar tareas desde Nebula;
- utilizar autenticación delegada de Microsoft 365.

La caché de tokens se almacena localmente en:

```text
~/.nebula/msal-cache.json
```

### Graphify

Nebula renderiza el grafo cuando encuentra:

```text
graphify-out/graph.json
```

Ejemplo de generación:

```bash
uv tool install graphify
cd tu-repositorio
graphify update .           # extrae el grafo (AST, sin LLM)
graphify cluster-only .     # agrupa en comunidades (opcional)
```

### Obsidian

Nebula busca notas relacionadas con cada proyecto en los vaults detectados y las abre mediante enlaces `obsidian://`.

## Atajos principales

| Atajo | Acción |
|---|---|
| `Ctrl+K` | Abrir la command palette |
| `N` | Crear una tarea |
| `T` | Abrir la vista Hoy |
| `?` | Abrir la ayuda |
| `Esc` | Cerrar el panel o modal activo |
| `@proyecto` `!alta` `^viernes` | Atajos al escribir el título de una tarea |

## Stack tecnológico

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Motor pixel-art propio sobre Canvas 2D (sprites y ruido procedurales)
- Zustand
- Framer Motion

### Backend

- Node.js
- TypeScript
- Fastify
- WebSocket
- SQLite
- Chokidar

### Organización

- Monorepo con pnpm workspaces
- Tipos compartidos entre servidor e interfaz
- Datos locales almacenados en `~/.nebula/`

## Arquitectura del repositorio

```text
.
├── docs/       # documentación técnica y funcional
├── scripts/    # arranque rápido y autostart de Windows
├── server/     # daemon, API, WebSocket, SQLite e integraciones
├── shared/     # tipos TypeScript compartidos
└── web/        # interfaz React y motor pixel-art 2D
```

El servidor actúa como fuente de verdad:

1. escanea los repositorios;
2. analiza Git, lenguajes y actividad;
3. persiste los datos en SQLite;
4. observa cambios en repositorios y sesiones;
5. publica eventos mediante WebSocket;
6. actualiza la interfaz en tiempo real.

Consulta [Arquitectura](docs/arquitectura.md) para una explicación detallada.

## Seguridad y privacidad

Nebula está diseñado para funcionar localmente.

- Por defecto, el servidor escucha únicamente en `127.0.0.1`.
- El acceso LAN está desactivado inicialmente.
- **Comprobación de origen**: solo se atienden peticiones cuyo `Origin` sea el de la propia aplicación, de modo que una página web abierta en tu navegador no puede hablar con el daemon.
- **Las acciones que ejecutan algo** (abrir el editor, lanzar scripts, `fetch`/`pull`/`checkout`, explorar carpetas) **solo se permiten desde el propio equipo**. Desde el móvil ves toda la información, pero no puedes lanzar nada.
- Los scripts ejecutables se validan contra los nombres reales del `package.json`: nunca se ejecuta texto libre.
- Al apagar el daemon se cierran los procesos que hubiera lanzado, incluida su descendencia.
- Las credenciales de Jira y GitHub se almacenan localmente en `~/.nebula/config.json` y la API nunca las devuelve en claro.
- Los tokens de Microsoft se almacenan en `~/.nebula/msal-cache.json`.
- No debes subir el contenido de `~/.nebula/` a un repositorio.
- El write-back de Jira y Planner puede desactivarse.
- Nebula solo realiza conexiones externas hacia los servicios que configures y hacia los remotos Git cuando habilitas operaciones como `fetch`.
- La comprobación de dependencias desactualizadas consulta el registry de npm, y solo cuando la pides a mano.

> [!CAUTION]
> Las credenciales de Jira y el token de GitHub se guardan en texto plano en el equipo local, igual que hacen `.npmrc` o `.aws/credentials`. Protege tu cuenta de usuario, no compartas el archivo de configuración y revoca cualquier token expuesto.

Consulta [Configuración](docs/configuracion.md) para conocer todos los detalles.

## Documentación

La documentación completa se encuentra en [`docs/`](docs/README.md):

- [Instalación](docs/instalacion.md)
- [Configuración](docs/configuracion.md)
- [Arquitectura](docs/arquitectura.md)
- [Acciones sobre proyectos](docs/acciones.md)
- [Tareas](docs/tareas.md)
- [Agentes de IA](docs/agentes.md)
- [Integraciones](docs/integraciones.md)
- [Sistema visual](docs/visuales.md)
- [API](docs/api.md)
- [Solución de problemas](docs/solucion-problemas.md)

## Actualización

Para actualizar una instalación existente:

```bash
git pull
pnpm install
pnpm build
```

Después reinicia el daemon.

## Solución de problemas

Consulta [Solución de problemas](docs/solucion-problemas.md).

Comprobaciones básicas:

1. ejecuta `pnpm typecheck`;
2. comprueba que Node.js y pnpm cumplen los requisitos;
3. verifica que el puerto `4816` no está ocupado por otra aplicación.

## Licencia

Este proyecto se distribuye bajo la licencia [MIT](LICENSE).

---

Desarrollado por [Iñigo Sanz](https://github.com/InigoSanz).
