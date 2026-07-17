import type { Project } from "@nebula/shared";

export interface QuickAddParse {
  title: string;
  /** proyecto destino; null = bandeja personal */
  project: Project | null;
  /** el texto tenía @algo que no casó con ningún proyecto */
  unknownMention: string | null;
}

/** "arreglar login @portfolio" → { title: "arreglar login", project: portfolio } */
export function parseQuickAdd(text: string, projects: Project[]): QuickAddParse {
  const m = text.match(/@(\S+)/);
  if (!m) return { title: text.trim(), project: null, unknownMention: null };
  const needle = m[1].toLowerCase();
  const candidates = projects.filter((p) => p.present && p.name.toLowerCase().includes(needle));
  // preferir coincidencia exacta; si hay varias parciales, la de nombre más corto
  const project =
    candidates.find((p) => p.name.toLowerCase() === needle) ??
    candidates.sort((a, b) => a.name.length - b.name.length)[0] ??
    null;
  return {
    title: text.replace(m[0], "").replace(/\s+/g, " ").trim(),
    project,
    unknownMention: project ? null : m[1],
  };
}

/** Crea la tarea donde toque. Devuelve el nombre del destino para el toast. */
export async function submitQuickAdd(parse: QuickAddParse): Promise<string> {
  const url = parse.project ? `/api/projects/${parse.project.id}/tasks` : "/api/inbox/tasks";
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: parse.title }),
  });
  return parse.project?.name ?? "tu bandeja personal";
}
