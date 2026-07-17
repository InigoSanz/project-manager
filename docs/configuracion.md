# Configuración

Todo vive en `~/.nebula/config.json`. La UI (⚙ Ajustes) edita este fichero; también puedes tocarlo a mano (el daemon lo relee en cada operación).

```jsonc
{
  "roots": ["C:\\Repositorio Personal", "C:\\Growind"],  // carpetas donde buscar repos
  "scanDepth": 2,              // niveles de profundidad al buscar .git
  "excludes": ["node_modules", "dist", "..."],  // carpetas que nunca se recorren
  "autoFetchMinutes": 0,       // git fetch periódico; 0 = desactivado
  "port": 4816,                // puerto del daemon
  "integrations": {
    "jira": {
      "mode": "cloud",                          // "cloud" | "server"
      "baseUrl": "https://miempresa.atlassian.net",
      "email": "yo@empresa.com",                // solo cloud
      "token": "…"                              // API token (cloud) o PAT (server/DC)
    },
    "planner": {
      "clientId": ""            // vacío = client público de Graph PowerShell
    }
  }
}
```

## Raíces y selector de carpetas

- **`roots`**: lista de carpetas bajo las que Nebula busca repos (directorios con `.git`) hasta `scanDepth` niveles. Los repos anidados dentro de otro repo no se listan por separado.
- El botón **“＋ Añadir carpeta…”** de Ajustes (y el onboarding inicial) abren un navegador de carpetas servido por el propio daemon (`/api/fs/*`): muestra unidades, accesos rápidos y marca qué carpetas son repos (`● repo git`) o cuántos repos contienen. No hace falta escribir rutas a mano.
- Los cambios de raíces disparan re-escaneo automático; los watchers detectan repos nuevos/borrados sin reiniciar.

## Otros ficheros en `~/.nebula/`

| Fichero | Contenido |
|---|---|
| `nebula.db` | SQLite: proyectos, análisis, sesiones de agentes, tareas, caché de parseo |
| `msal-cache.json` | Tokens de Microsoft 365 (si conectas Planner). Bórralo para desconectar del todo |

## Dónde guarda cada cosa

- Credenciales de Jira y client_id de Planner: en `config.json` (texto plano en tu disco, igual que `.npmrc` o `.aws/credentials` — no lo subas a ningún sitio).
- Nada sale de tu máquina salvo las llamadas a los servicios que configures (Jira, Microsoft Graph) y los `git fetch` si los activas.
