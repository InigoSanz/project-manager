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

- **AADSTS65001 / 90094** (se necesita consentimiento de admin) o **AADSTS7000218 / 700016** (client bloqueado): tu tenant no permite el client público de Graph PowerShell. Solución: un admin registra una app (tipo *Public client/native*, permiso delegado `Tasks.Read`) y pegas su client_id en Ajustes.
- **Código caducado**: el device code dura ~15 min; vuelve a pulsar *Conectar Microsoft 365*.

Para desconectar del todo: botón *Desconectar* o borra `~/.nebula/msal-cache.json`.

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
