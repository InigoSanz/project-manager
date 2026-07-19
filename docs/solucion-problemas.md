# Solución de problemas

## "El puerto 4816 está ocupado"

- Si el mensaje es *"Nebula ya está corriendo… nada que hacer"*: no es un error; ya tienes el daemon levantado (p. ej. por el autostart). Abre `http://localhost:4816`.
- Si lo ocupa otra aplicación: cambia `"port"` en `~/.nebula/config.json` y vuelve a arrancar.

## Node demasiado viejo

Nebula necesita Node ≥ 24 y lo comprueba al arrancar. Con nvm-windows:

```bash
nvm install 24
nvm use 24
```

Ojo: si instalas Node con winget pero usas nvm, **manda la versión de nvm** (es la primera en el PATH).

## Errores EPERM / watchers en Windows

Los ficheros `*.lock` de git y los borrados rápidos pueden producir `EPERM` al vigilarlos. Nebula los ignora y ningún error de watcher tumba el daemon (hay red de seguridad global). Si ves muchos avisos `[scanner] watcher…` en el log, suele ser un antivirus bloqueando lecturas: excluye tus carpetas de código del escaneo en tiempo real.

## better-sqlite3 no compila / falla al instalar

Trae binarios precompilados para Node LTS en Windows x64 — `pnpm install` no debería compilar nada. Si tu combinación de Node/SO no tiene binario, instala las Build Tools de Visual Studio o cambia a la LTS más reciente.

## La UI no carga (`Cannot GET /`)

Falta compilar la web: `pnpm build` y reinicia (o usa `pnpm go`, que lo hace solo).

## Jira: "Probar conexión" falla

- **401**: token caducado/mal copiado, o en Cloud falta el email.
- **403 en Server/DC**: tu Jira no tiene PATs habilitados; pídelo o usa otro modo de auth.
- **404 en `/search/jql`**: probablemente marcaste Cloud pero es un Server on-premise (o al revés) — cambia el tipo en Ajustes.
- URL con path (p. ej. `https://empresa.com/jira`): inclúyelo en la URL base.

## Planner: errores AADSTS

Nebula traduce los más comunes en la propia UI:

- **AADSTS65001 / 90094** (se necesita consentimiento de admin) o **AADSTS7000218 / 700016** (client bloqueado): tu tenant no permite el client público de Graph PowerShell. Solución: un admin registra una app (tipo *Public client/native*, permiso delegado `Tasks.ReadWrite`) y pegas su client_id en Ajustes.
- **Código caducado**: el device code dura ~15 min; vuelve a pulsar *Conectar Microsoft 365*.

Para desconectar del todo: botón *Desconectar* o borra `~/.nebula/msal-cache.json`.

## Desde el móvil los botones de acción no hacen nada

Es el comportamiento esperado. Abrir el editor, ejecutar scripts y las acciones
de git solo se permiten desde el propio equipo (responden **403 «Esta acción
solo puede lanzarse desde el propio equipo»**). Con `lanAccess` activado
cualquier dispositivo de tu wifi llega a la API, y no queremos que eso implique
poder ejecutar procesos en tu máquina. Desde el móvil consultas el estado; para
actuar, siéntate en el equipo.

## 403 "origen no permitido"

Una petición llegó con una cabecera `Origin` que no es la de Nebula. Casos
normales:

- Estás en desarrollo y abriste la UI en un puerto distinto de `5173`.
- Cambiaste `port` en el config pero tienes abierta una pestaña vieja con el
  puerto anterior: recárgala.
- Activaste `lanAccess` y entraste por una IP que no es la que Nebula anuncia
  (mira las URLs del modal del QR).

Si no es ninguno, es justo lo que la comprobación busca evitar: una web externa
intentando hablar con tu daemon. Ignórala.

## "Valor inválido para «…»" al guardar ajustes

El daemon valida rangos antes de escribir el config. Revisa los límites en
[configuracion.md](configuracion.md#validación) — lo más habitual es un
`scanDepth` mayor de 5 o un `port` por debajo de 1024. Las claves que Nebula no
conoce no dan error: se descartan sin más, así que si un ajuste que añadiste a
mano "no se guarda", probablemente el nombre esté mal escrito.

## Un script no arranca o no se deja parar

- **"Ese script no está declarado en el package.json del proyecto"**: solo se
  ejecutan scripts que existan de verdad; el nombre nunca llega libre al shell.
  Si acabas de añadirlo, pulsa *Re-escanear*.
- **"«dev» ya se está ejecutando"**: tienes esa misma ejecución viva. Párala
  desde el panel antes de relanzarla.
- Al parar, Nebula mata el proceso **y toda su descendencia** (`taskkill /T`):
  en Windows matar `pnpm` no mata al `vite` que ha lanzado. Si aun así queda
  algo ocupando el puerto, busca el `node` huérfano en el Administrador de
  tareas.
- Al cerrar el daemon se paran todas las ejecuciones vivas: no deja huérfanos.

## GitHub: no aparecen mis issues

- **"Probar conexión" falla**: el token está mal copiado o le falta el permiso
  de lectura de repos (scope `repo` en un token clásico).
- **Los issues salen en la bandeja en vez de en su repo**: el emparejamiento va
  por la URL del remoto. Comprueba que el repo local tiene remoto configurado
  (`git remote -v`); sin remoto no hay forma de saber a qué repositorio de
  GitHub corresponde.
- **Un pull request no aparece como tarea**: es intencionado, los PRs tienen su
  propio panel. Ver [integraciones.md](integraciones.md#github-issues-y-pull-requests).

## Rutas con caracteres especiales (ñ, acentos)

Todo el código usa APIs de fichero nativas (sin URL-encoding), así que `C:\Users\Iñigo` funciona. Si un agente externo guarda sesiones con la ruta percent-encoded, el mapeo por `cwd` puede fallar para ese agente concreto — repórtalo con un ejemplo del fichero de sesión.

## Restaurar un backup

Nebula guarda copias rotativas (7) en `~/.nebula/backups/` al arrancar y cada 24 h:

```bash
# parar el daemon y restaurar
copy %USERPROFILE%\.nebula\backups\nebula-AAAAMMDD-HHmm.db %USERPROFILE%\.nebula\nebula.db
```

Las tareas de Jira/Planner se re-sincronizan solas; el backup protege sobre todo tus tareas manuales.

## No llegan las notificaciones de Windows

- Comprueba el toggle 🔔 en Ajustes y `"notifications": true` en el config.
- Windows → Configuración → Sistema → Notificaciones: el remitente "Nebula" (SnoreToast) debe estar permitido y el modo No molestar desactivado.
- Cada aviso se emite una sola vez (deduplicado en BD); para re-probar, borra filas de la tabla `notified`.

## Empezar de cero

```bash
# borra datos derivados (los repos no se tocan)
rm -r ~/.nebula
```

El siguiente arranque re-escanea y reconstruye todo.
