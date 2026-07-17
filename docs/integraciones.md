# Integraciones

## Graphify (grafo de conocimiento)

[Graphify](https://github.com/safishamsi/graphify) genera un grafo de conocimiento por repo (tree-sitter, 100% local). Nebula detecta su salida y la renderiza en 3D (pestaña **Grafo**).

```bash
uv tool install graphifyy
cd tu-repo
graphify map
```

Nebula lee `<repo>/graphify-out/graph.json` (nodos con `community`/`degree`, aristas `calls`/`imports`/…). Grafos enormes se recortan a los 600 nodos de mayor grado para mantener el render fluido. Si no hay grafo, la pestaña muestra las instrucciones.

## Obsidian (notas)

Si tienes Obsidian, Nebula lee `%APPDATA%/obsidian/obsidian.json` para localizar tus vaults y busca notas `.md` que mencionen el nombre del proyecto (en la ruta o en el contenido). La pestaña **Notas** las lista y las abre con `obsidian://open`. Sin Obsidian instalado, la pestaña simplemente aparece vacía.

## Jira (issues asignados a ti)

**Permisos**: ninguno de administrador. Solo necesitas un token personal:

- **Jira Cloud** (`miempresa.atlassian.net`): crea un API token en <https://id.atlassian.com/manage-profile/security/api-tokens>. En Ajustes: URL + tu email + el token.
- **Jira Server / Data Center** (on-premise): crea un *Personal Access Token* desde tu perfil de Jira (Perfil → Personal Access Tokens). En Ajustes: URL + el PAT (sin email).

El botón **Probar conexión** valida las credenciales al momento (`/myself`). El tipo (Cloud/Server) se autodetecta por la URL y puede cambiarse.

**Qué sincroniza** (cada 10 min y al guardar ajustes): tus issues abiertos (`assignee = currentUser() AND statusCategory != Done`, máx. 100). Cada issue se convierte en una tarea del kanban:

- Estado: `new → Pendiente`, `indeterminate → En curso`; si el issue desaparece del filtro (cerrado o reasignado) la tarea local pasa a Hecho.
- Es **solo lectura**: mover la tarjeta en Nebula no cambia nada en Jira; el badge ◆ abre el issue en el navegador.

**Mapeo issue → repo**: por la clave de proyecto Jira (el `ABC` de `ABC-123`):

- Nebula propone automáticamente la clave que más aparece en tus ramas y últimos commits ("detectado ◆ ABC — Asociar").
- Puedes fijarla o cambiarla a mano en la pestaña Tareas de cada proyecto.
- Issues cuya clave no casa con ningún repo caen en la **bandeja global** (`GET /api/inbox/tasks`).

## Microsoft Planner (tareas 365)

**Permisos**: delegados, es decir, inicias sesión **tú** con tu cuenta 365 y Nebula solo ve lo que tú ves. Permiso pedido: `Tasks.Read` (solo lectura). No hay secreto de aplicación ni acceso de tenant.

**Cómo conectar**: Ajustes → *Conectar Microsoft 365* → Nebula muestra un código y la URL <https://microsoft.com/devicelogin>; entras, pegas el código, aceptas, y listo. El token se renueva solo (`~/.nebula/msal-cache.json`); "Desconectar" lo borra.

**El client_id**: por defecto se usa el cliente público de *Microsoft Graph PowerShell* (`14d82eec-204b-4c2f-b7e8-296a70dab67e`), presente en la mayoría de tenants. Si el tuyo lo bloquea, Nebula te muestra el error AADSTS traducido y la solución: que un admin registre una app pública con permiso delegado `Tasks.Read` y pegues su client_id en Ajustes (campo `integrations.planner.clientId` de la config).

**Qué sincroniza**: `GET /me/planner/tasks` (tus tareas). `percentComplete` 0 → Pendiente, 1–99 → En curso, 100 → Hecho. El mapeo a repos es por coincidencia del nombre del plan con el nombre del repo; lo que no casa va a la bandeja global. Solo lectura, igual que Jira.
