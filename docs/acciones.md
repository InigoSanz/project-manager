# Acciones sobre un proyecto

Nebula no es solo un visor: desde el mapa, la cuadrícula o la ficha de un
proyecto puedes abrirlo donde trabajas, lanzar sus scripts y operar con git sin
cambiar de ventana.

> **Todo esto solo funciona desde el propio equipo.** Desde el móvil ves el
> estado completo, pero los botones de acción devuelven 403. La razón está en
> [Seguridad](#por-qué-solo-desde-tu-equipo).

## Abrir

Cuatro destinos, disponibles en la ficha del proyecto y en cada tarjeta de la
cuadrícula:

| Botón | Qué hace |
|---|---|
| **Editor** | abre la carpeta del proyecto en tu editor |
| **Terminal** | abre una consola ya situada en la carpeta |
| **Carpeta** | abre el explorador de archivos del sistema |
| **Remoto** | abre el repositorio remoto en el navegador |

**Editor**: por defecto ejecuta `code` (VS Code). Cámbialo con `editorCommand`
en [la configuración](configuracion.md#abrir-en-tu-editor-y-tu-navegador) —
sirve cualquier CLI que acepte una ruta (`cursor`, `subl`, `idea`, `webstorm`).

**Terminal**: en Windows usa Windows Terminal si está instalado y, si no, cae a
la consola clásica en esa carpeta.

**Remoto**: normaliza la URL del remoto antes de abrirla, así que funciona igual
con SSH (`git@github.com:user/repo.git`) que con HTTPS. Se abre en **Chrome** si
está instalado; para forzar otro navegador, usa `browserCommand`. Si el
repositorio no tiene remoto configurado, el botón te lo dice en vez de no hacer
nada.

La ruta nunca la envía el navegador: sale siempre del proyecto guardado en la
base de datos, de modo que no hay forma de pedirle a Nebula que abra otra cosa.

## Ejecutar scripts del `package.json`

En la pestaña de scripts aparecen los que Nebula haya leído del `package.json`
del proyecto. Al lanzar uno:

- La **salida llega en vivo** por WebSocket, agrupada cada 80 ms para no inundar
  la interfaz con un mensaje por línea.
- Se conservan las **últimas 500 líneas**, así que puedes cerrar el panel, volver
  y seguir viendo el hilo.
- Si el script imprime una URL local (lo típico de un servidor de desarrollo),
  Nebula la detecta y te ofrece el enlace.
- El mismo script no puede lanzarse dos veces a la vez: si ya está corriendo, te
  pide que lo pares primero.

**Parar** mata el proceso **y toda su descendencia**. Esto importa en Windows:
matar `pnpm` no mata al `node`/`vite` que ha lanzado, así que Nebula usa
`taskkill /T`. Al apagar el daemon se paran todas las ejecuciones vivas — no
quedan procesos huérfanos ocupando puertos.

**Qué se puede ejecutar**: solo nombres que existan de verdad en el
`package.json`. El nombre del script nunca llega al shell como texto libre; se
valida contra las claves reales antes de lanzarlo. Si acabas de añadir un script
y no aparece, pulsa *Re-escanear*.

## Git

Desde el panel de git de cada proyecto:

- **Ver el diff** de cualquier fichero modificado, preparado o sin preparar.
- **Buscar en el historial**: la búsqueda mira tanto en los mensajes de commit
  como en el contenido de los cambios, y une los dos resultados. (Hay un motivo
  para hacer dos consultas: si le pasas a git `--grep` y `-S` a la vez, exige que
  se cumplan **las dos**, que casi nunca es lo que quieres.)
- **Cambiar de rama**, con la lista de ramas locales. Se rechaza si hay
  conflictos sin resolver, para no dejarte a medias.
- **`fetch`** y **`pull`**, que actualizan el estado del proyecto al terminar.

Todo se hace con el CLI de git, no con una librería JS: así el comportamiento es
idéntico al de tu terminal, incluidos worktrees y sparse checkouts.

## Dependencias desactualizadas

En la ficha del proyecto puedes pedir un informe de dependencias
desactualizadas. Consulta el registry de npm y **solo se lanza cuando lo pides a
mano**: no hay comprobación periódica en segundo plano. El último informe se
guarda para que puedas volver a consultarlo sin repetir la llamada.

## Por qué solo desde tu equipo

Nebula no tiene login. Su modelo de confianza siempre ha sido «escucho en
localhost», y eso basta mientras la aplicación solo *lee*. En cuanto puede
lanzar procesos, deja de bastar por dos motivos:

1. Cualquier página web que abras en el navegador puede hacer peticiones a
   `http://localhost:4816`. Sin defensa, navegar por internet equivaldría a
   dejar que un sitio cualquiera ejecute comandos en tu máquina. Por eso se
   comprueba la cabecera `Origin` y se rechaza lo que no venga de Nebula.
2. Con el acceso desde la red local activado, cualquier dispositivo de tu wifi
   alcanza la API entera. Por eso las acciones que *ejecutan* algo exigen además
   que la petición llegue por loopback.

El resultado es el reparto que verás usando la app: desde el móvil consultas
todo el estado —proyectos, git, tareas, agentes— pero para actuar tienes que
estar en el equipo. Es una decisión deliberada, no una limitación pendiente de
arreglar.

Detalle técnico en [api.md](api.md#seguridad).
