# Configuración

Todo vive en `~/.nebula/config.json`. La página **⚙ /ajustes** de la UI edita este fichero (guardado automático al cambiar cada control); también puedes tocarlo a mano (el daemon lo relee en cada operación). El panel está dividido en páginas: **General** (carpetas y escaneo), **Sincronización** (Jira, Planner y GitHub), **Notificaciones** y **Dispositivos** (acceso desde el móvil).

```jsonc
{
  "roots": ["C:\\Repositorio Personal", "C:\\Growind"],  // carpetas donde buscar repos
  "scanDepth": 2,              // niveles de profundidad al buscar .git
  "excludes": ["node_modules", "dist", "..."],  // carpetas que nunca se recorren
  "autoFetchMinutes": 0,       // git fetch periódico; 0 = desactivado
  "port": 4816,                // puerto del daemon
  "lanAccess": false,          // true = accesible desde tu red local (móvil/tablet)
  "notifications": true,       // toasts nativos de Windows (interruptor general)
  "notificationEvents": {      // toggles finos por evento
    "newExternalTask": true,   // issue/tarea externa nueva asignada
    "agentDone": true,         // un agente termina una sesión con trabajo real
    "dueDigest": true          // aviso diario de vencimientos
  },
  "syncMinutes": 10,           // minutos entre syncs de Jira/Planner/GitHub
  "editorCommand": "code",     // comando para "Abrir en el editor"
  "browserCommand": "",        // navegador para "Abrir el remoto"; vacío = Chrome si está instalado
  "integrations": {
    "jira": {
      "mode": "cloud",                          // "cloud" | "server"
      "baseUrl": "https://miempresa.atlassian.net",
      "email": "yo@empresa.com",                // solo cloud
      "token": "…",                             // API token (cloud) o PAT (server/DC)
      "writeBack": true                         // false = solo lectura: completar en Nebula no toca Jira
    },
    "planner": {
      "clientId": "",           // vacío = client público de Graph PowerShell
      "writeBack": true         // false = solo lectura hacia Planner
    },
    "github": {
      "token": "…"              // Personal Access Token con permiso de lectura de repos
    }
  }
}
```

## Validación

El daemon **no guarda lo que le eches**: `PUT /api/config` descarta en silencio
las claves que no conoce y rechaza con 400 los valores fuera de rango. Si editas
el fichero a mano, respeta estos límites o el ajuste se ignorará:

| Clave | Regla |
|---|---|
| `scanDepth` | entero 1–5 |
| `autoFetchMinutes` | entero 0–720 (0 = desactivado) |
| `syncMinutes` | entero 1–120 |
| `port` | entero 1024–65535 |
| `lanAccess`, `notifications` | booleano |
| `editorCommand`, `browserCommand` | texto, máx. 200 caracteres |
| `roots`, `excludes` | lista de textos |

## Abrir en tu editor y tu navegador

- **`editorCommand`**: lo que se ejecuta al pulsar «Editor». Por defecto `code`
  (VS Code). Sirve cualquier comando que acepte una ruta: `cursor`, `subl`,
  `idea`, `webstorm`…
- **`browserCommand`**: con qué abrir el repositorio remoto. Vacío significa
  «usa Chrome si está instalado, y si no el navegador por defecto del sistema».
  Pon aquí una ruta o un comando para forzar otro.

## Raíces y selector de carpetas

- **`roots`**: lista de carpetas bajo las que Nebula busca repos (directorios con `.git`) hasta `scanDepth` niveles. Los repos anidados dentro de otro repo no se listan por separado.
- El botón **“＋ Añadir carpeta…”** de Ajustes (y el onboarding inicial) abren un navegador de carpetas servido por el propio daemon (`/api/fs/*`): muestra unidades, accesos rápidos y marca qué carpetas son repos (`● repo git`) o cuántos repos contienen. No hace falta escribir rutas a mano.
- Los cambios de raíces disparan re-escaneo automático; los watchers detectan repos nuevos/borrados sin reiniciar.

## Acceso desde el móvil o la tablet

1. Ajustes → activa **"Acceso desde la red local"** y guarda; reinicia el daemon.
2. Botón **QR** (en el mismo ajuste): escanea el código con la cámara del móvil (misma wifi) y se abre Nebula. Si tienes varios adaptadores de red, el modal deja elegir la IP (usa la de tu wifi, normalmente `192.168.1.x`).
3. En el navegador del móvil, "Añadir a pantalla de inicio" la instala como app (PWA).

Con `lanAccess: false` (por defecto) el daemon solo escucha en `127.0.0.1`. Al activarlo, cualquier dispositivo de tu red local puede ver la app — actívalo solo en redes de confianza.

Nota: el config tolera BOM (PowerShell/Bloc de notas lo añaden al guardar UTF-8) y, si el JSON está corrupto, Nebula arranca con valores por defecto **sin sobrescribir tu fichero**.

## Otros ficheros en `~/.nebula/`

| Fichero | Contenido |
|---|---|
| `nebula.db` | SQLite: proyectos, análisis, sesiones de agentes, tareas, blocs de notas, caché de parseo |
| `backups/` | copia de la base de datos y del config, al arrancar y cada 24 h; se conservan las 7 más recientes (`nebula-AAAAMMDD-HHMM.db`) |
| `msal-cache.json` | Tokens de Microsoft 365 (si conectas Planner). Bórralo para desconectar del todo |

## Dónde guarda cada cosa

- Credenciales de Jira, token de GitHub y client_id de Planner: en `config.json` (texto plano en tu disco, igual que `.npmrc` o `.aws/credentials` — no lo subas a ningún sitio). La API nunca los devuelve en claro: `GET /api/config` los enmascara.
- Nada sale de tu máquina salvo las llamadas a los servicios que configures (Jira, Microsoft Graph) y los `git fetch` si los activas.
