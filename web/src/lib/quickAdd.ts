import type { Project, TaskItem } from "@nebula/shared";

export interface QuickAddParse {
  title: string;
  /** proyecto destino; null = «Sin proyecto» */
  project: Project | null;
  /** el texto tenía @algo que no casó con ningún proyecto */
  unknownMention: string | null;
  /** ISO YYYY-MM-DD si el texto lleva ^fecha */
  dueDate: string | null;
  priority: TaskItem["priority"];
}

const PRIORITY_TOKENS: Record<string, TaskItem["priority"]> = { alta: 3, media: 2, baja: 1 };
const WEEKDAYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "^hoy" | "^mañana" | "^vie" | "^25/07" | "^2026-07-25" → ISO o null. */
export function parseDateToken(token: string): string | null {
  const t = token.toLowerCase().replace("ñ", "n");
  const today = new Date();
  if (t === "hoy") return toIsoDate(today);
  if (t === "manana") return toIsoDate(new Date(today.getTime() + 86_400_000));
  const wd = WEEKDAYS.findIndex((w) => t.startsWith(w));
  if (wd >= 0) {
    const delta = (wd - today.getDay() + 7) % 7 || 7; // el próximo, nunca hoy
    return toIsoDate(new Date(today.getTime() + delta * 86_400_000));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dm = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (dm) {
    const year = dm[3] ? Number(dm[3]) : today.getFullYear();
    const date = new Date(year, Number(dm[2]) - 1, Number(dm[1]));
    if (!dm[3] && date < today) date.setFullYear(year + 1); // "25/07" ya pasado → año siguiente
    return toIsoDate(date);
  }
  return null;
}

/** "arreglar login @portfolio !alta ^mañana" → título + proyecto + prioridad + fecha. */
export function parseQuickAdd(text: string, projects: Project[]): QuickAddParse {
  let rest = text;

  let priority: TaskItem["priority"] = 0;
  rest = rest.replace(/!(alta|media|baja)\b/i, (_, p: string) => {
    priority = PRIORITY_TOKENS[p.toLowerCase()];
    return "";
  });

  let dueDate: string | null = null;
  rest = rest.replace(/\^(\S+)/, (m0, token: string) => {
    const parsed = parseDateToken(token);
    if (parsed) {
      dueDate = parsed;
      return "";
    }
    return m0; // token de fecha no reconocido: se queda en el título
  });

  let project: Project | null = null;
  let unknownMention: string | null = null;
  const m = rest.match(/@(\S+)/);
  if (m) {
    const needle = m[1].toLowerCase();
    const candidates = projects.filter((p) => p.present && p.name.toLowerCase().includes(needle));
    // preferir coincidencia exacta; si hay varias parciales, la de nombre más corto
    project =
      candidates.find((p) => p.name.toLowerCase() === needle) ??
      candidates.sort((a, b) => a.name.length - b.name.length)[0] ??
      null;
    unknownMention = project ? null : m[1];
    rest = rest.replace(m[0], "");
  }

  return { title: rest.replace(/\s+/g, " ").trim(), project, unknownMention, dueDate, priority };
}

/** Resumen del destino/atributos para la preview y los toasts. */
export function describeParse(parse: QuickAddParse): string {
  const parts = [parse.project?.name ?? "Sin proyecto"];
  if (parse.dueDate) parts.push(`vence ${parse.dueDate}`);
  if (parse.priority > 0) parts.push(["", "baja", "media", "alta"][parse.priority]);
  return parts.join(" · ");
}

/** Crea la tarea donde toque. Devuelve el nombre del destino para el toast. */
export async function submitQuickAdd(parse: QuickAddParse): Promise<string> {
  const url = parse.project ? `/api/projects/${parse.project.id}/tasks` : "/api/inbox/tasks";
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: parse.title, dueDate: parse.dueDate, priority: parse.priority }),
  });
  return parse.project?.name ?? "Sin proyecto";
}
