# Integraciones

## Graphify (grafo de conocimiento)

[Graphify](https://github.com/safishamsi/graphify) genera un grafo de conocimiento por repo (tree-sitter, 100% local). Nebula detecta su salida y la dibuja como un **mapa estelar pixel-art** en la pestaña **Conocimiento** del proyecto: cada símbolo es una estrella (tamaño ∝ conexiones), cada comunidad una constelación con su nebulosa, y las llamadas/imports son líneas de luz. Al enfocar una estrella se ilumina su vecindario. Comparte cámara y gestos con el mapa de proyectos.

```bash
uv tool install graphify
cd tu-repo
graphify update .        # extrae el grafo con AST (sin LLM ni API key)
graphify cluster-only .  # opcional: agrupa el grafo en comunidades
```

Nebula lee `<repo>/graphify-out/graph.json` (nodos con `label`/`community`, aristas `calls`/`imports`/…). El grado de cada nodo se calcula sobre las aristas del propio grafo. Grafos enormes se recortan a los 600 nodos de mayor grado para mantener el render fluido. Si no hay grafo, la pestaña muestra las instrucciones.

## Obsidian (notas)

Si tienes Obsidian, Nebula lee `%APPDATA%/obsidian/obsidian.json` para localizar tus vaults y busca notas `.md` que mencionen el nombre del proyecto (en la ruta o en el contenido). La pestaña **Conocimiento** las lista junto al grafo y las abre con `obsidian://open`. Sin Obsidian instalado, esa parte simplemente aparece vacía.

Las notas de Obsidian son **solo lectura**. Para escribir, cada proyecto tiene además su propio bloc de notas dentro de Nebula, que se guarda en la base de datos.

## Jira (issues asignados a ti)

**Permisos**: ninguno de administrador. Solo necesitas un token personal:

- **Jira Cloud** (`miempresa.atlassian.net`): crea un API token en <https://id.atlassian.com/manage-profile/security/api-tokens>. En Ajustes: URL + tu email + el token.
- **Jira Server / Data Center** (on-premise): crea un *Personal Access Token* desde tu perfil de Jira (Perfil → Personal Access Tokens). En Ajustes: URL + el PAT (sin email).

El botón **Probar conexión** valida las credenciales al momento (`/myself`). El tipo (Cloud/Server) se autodetecta por la URL y puede cambiarse.

**Qué sincroniza** (cada 10 min y al guardar ajustes): tus issues abiertos (`assignee = currentUser() AND statusCategory != Done`, máx. 100). Cada issue se convierte en una tarea del kanban:

- Estado: `new → Pendiente`, `indeterminate → En curso`; si el issue desaparece del filtro (cerrado o reasignado) la tarea local pasa a Hecho.
- **Write-back al completar**: marcar la tarjeta como Hecho en Nebula ejecuta en Jira la primera transición disponible hacia un estado de categoría *Done* (un toast confirma "✓ cerrado en Jira"). Si tu flujo no permite cerrar desde el estado actual, la tarea queda hecha en local con el aviso "⚠ no sincronizada" y el motivo. Mover entre Pendiente/En curso no toca Jira.

**Mapeo issue → repo**: por la clave de proyecto Jira (el `ABC` de `ABC-123`):

- Nebula propone automáticamente la clave que más aparece en tus ramas y últimos commits ("detectado ◆ ABC — Asociar").
- Puedes fijarla o cambiarla a mano en la pestaña Tareas de cada proyecto.
- Issues cuya clave no coincide con ningún repo caen en la **bandeja global** (`GET /api/inbox/tasks`).

## GitHub (issues y pull requests)

**Permisos**: un *Personal Access Token* con permiso de lectura sobre tus repos
(en un token clásico, el scope `repo`). Créalo en
<https://github.com/settings/tokens> y pégalo en Ajustes → Sincronización. El
botón **Probar conexión** lo valida al momento. El token se guarda en
`config.json` y la API nunca lo devuelve en claro.

**Qué trae** (cada `syncMinutes`, por defecto 10, y al guardar ajustes), usando
la API de búsqueda para pedir solo lo tuyo:

| Consulta | Se convierte en |
|---|---|
| `is:issue is:open assignee:@me` | **tareas** con origen GitHub |
| `is:pr is:open author:@me` | pull request en el panel de PRs |
| `is:pr is:open review-requested:@me` | pull request en el panel de PRs |

**Por qué los PRs no son tareas.** Un pull request no es trabajo pendiente en el
mismo sentido que un issue: no lo cierras tú decidiéndolo, lo cierra la revisión
o el merge. Meterlos en el kanban ensuciaría la lista de «lo que tengo que
hacer» con filas que no puedes completar desde Nebula. Por eso viven en su
propio panel, con el estado de revisión a la vista.

**Emparejamiento con tus repos**: por la **URL del remoto**, no por el nombre.
Nebula normaliza cualquier forma del remoto (SSH, HTTPS, con o sin `.git`) a
`owner/repo` y la compara con el repositorio del issue. Es bastante más fiable
que casar nombres: dos repos tuyos pueden llamarse igual, pero su remoto no. Lo
que no encuentra repo local cae en la bandeja `github-inbox`.

Los issues que dejan de estar abiertos o asignados a ti pasan automáticamente a
**Hecha** en Nebula. No hay write-back hacia GitHub: completar una tarea en
Nebula no cierra el issue.

## Microsoft Planner (tareas 365)

**Permisos**: delegados, es decir, inicias sesión **tú** con tu cuenta 365 y Nebula solo ve lo que tú ves. Permiso pedido: `Tasks.ReadWrite` (leer tus tareas y poder completarlas desde Nebula). No hay secreto de aplicación ni acceso de tenant. *Si conectaste con una versión anterior (Tasks.Read), desconecta y vuelve a conectar para conceder el permiso de escritura.*

**Cómo conectar**: Ajustes → *Conectar Microsoft 365* → Nebula muestra un código y la URL <https://microsoft.com/devicelogin>; entras, pegas el código, aceptas, y listo. El token se renueva solo (`~/.nebula/msal-cache.json`); "Desconectar" lo borra.

**El client_id**: por defecto se usa el cliente público de *Microsoft Graph PowerShell* (`14d82eec-204b-4c2f-b7e8-296a70dab67e`), presente en la mayoría de tenants. Si el tuyo lo bloquea, Nebula te muestra el error AADSTS traducido y la solución: que un admin registre una app pública con permiso delegado `Tasks.ReadWrite` y pegues su client_id en Ajustes (campo `integrations.planner.clientId` de la config).

**Qué sincroniza**: `GET /me/planner/tasks` (tus tareas). `percentComplete` 0 → Pendiente, 1–99 → En curso, 100 → Hecho. El mapeo a repos es por coincidencia del nombre del plan con el nombre del repo; lo que no coincide va a la bandeja "Sin proyecto" del panel Hoy. **Write-back**: completar la tarjeta en Nebula pone `percentComplete = 100` en Planner (con el etag actual de la tarea, como exige Graph).
