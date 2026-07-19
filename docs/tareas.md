# Tareas

Nebula reúne en un sitio tareas que normalmente viven repartidas: las que
apuntas tú, las que sugieren tus agentes de IA y las que te asignan en Jira,
Planner o GitHub. La idea es no tener que abrir cuatro pestañas para saber qué
te toca hacer.

## Las tres superficies

Hay tres sitios donde ves tareas, y cada uno responde a una pregunta distinta.
Merece la pena tenerlo claro porque es lo que evita que parezcan tres listas
descoordinadas: **son la misma lista, filtrada de tres maneras**.

| Dónde | Qué pregunta responde | Qué muestra |
|---|---|---|
| **Hoy** (`T`) | ¿qué hago ahora? | lo que está en curso, lo pendiente para hoy, lo sugerido por agentes y los avisos de git |
| **`/tareas`** | ¿qué tengo en total? | todo, con filtros por proyecto, estado, origen, prioridad y vencimiento |
| **Pestaña del proyecto** | ¿qué queda en *este* repo? | el kanban de ese proyecto y nada más |

Si buscas algo concreto y no sabes de qué proyecto era, `/tareas`. Si te sientas
a trabajar y quieres saber por dónde empezar, Hoy. Si ya estás dentro de un
repo, su pestaña.

## Estados

Tres columnas: **Pendiente**, **En curso** y **Hecha**. Las tareas sugeridas por
un agente aparecen aparte hasta que las aceptas, para que lo que propone la
máquina no se mezcle con lo que has decidido tú. Si descartas una sugerencia,
queda archivada y no vuelve a aparecer.

## De dónde vienen

| Origen | Cómo llega | Se puede completar desde Nebula |
|---|---|---|
| **Manual** | la escribes tú | sí |
| **Agente** | un agente de IA dejó trabajo pendiente identificado en su sesión | sí |
| **Jira** | issues abiertos asignados a ti | sí, con write-back |
| **Planner** | tus tareas de Microsoft 365 | sí, con write-back |
| **GitHub** | issues abiertos asignados a ti | sí, pero **no** cierra el issue |

**Write-back** significa que completar la tarjeta en Nebula la cierra también en el
sistema de origen. Puedes desactivarlo en Ajustes y usar Jira o Planner en modo
solo lectura. Los detalles de cada integración están en
[integraciones.md](integraciones.md).

Las tareas cuyo origen no se puede emparejar con ningún repo local caen en
**«Sin proyecto»**, que es la bandeja que ves al final del panel Hoy.

## Crear tareas rápido

Pulsa `N` en cualquier pantalla (o el botón **Nueva tarea**) y escribe el título.
Mientras escribes, Nebula interpreta tres marcas y te enseña abajo dónde va a
acabar la tarea, para que no tengas que fiarte:

| Marca | Ejemplo | Efecto |
|---|---|---|
| `@` | `@portfolio` | proyecto destino; sin `@`, va a «Sin proyecto» |
| `!` | `!alta`, `!media`, `!baja` | prioridad |
| `^` | `^hoy`, `^mañana`, `^vie`, `^25/07`, `^2026-07-25` | fecha de vencimiento |

```
arreglar el login @portfolio !alta ^mañana
```

Notas útiles:

- El `@` no exige el nombre exacto: `@port` encuentra `portfolio`. Si varios
  proyectos coinciden, gana el de nombre más corto; una coincidencia exacta
  siempre gana.
- Un día de la semana (`^vie`) apunta **al próximo**, nunca a hoy.
- Una fecha como `^25/07` que ya pasó se entiende del año que viene.
- Si escribes una fecha que Nebula no reconoce, se queda en el título en lugar
  de desaparecer sin avisar.
- Nada de esto es obligatorio: escribir solo el título es perfectamente válido.

## Vencimientos y prioridad

La prioridad va de 0 a 3 (ninguna, baja, media, alta) y las fechas son días
sueltos, sin hora. Si tienes activadas las notificaciones, Nebula te manda un
aviso diario con lo que vence — el resumen se configura en Ajustes →
Notificaciones.

## Búsqueda

`Ctrl+K` busca tareas por título y notas desde cualquier pantalla, además de
proyectos. La búsqueda de `/tareas` es más fina: acepta filtros combinados y
pagina resultados.
