import { useEffect, useState } from "react";
import type { ObsidianNote, Project } from "@nebula/shared";

export function NotesPanel({ project }: { project: Project }) {
  const [notes, setNotes] = useState<ObsidianNote[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${project.id}/notes`)
      .then((r) => r.json())
      .then((n: ObsidianNote[]) => alive && setNotes(n))
      .catch(() => alive && setNotes([]));
    return () => {
      alive = false;
    };
  }, [project.id]);

  if (!notes) return <p className="p-4 text-sm text-slate-500">Buscando notas…</p>;
  if (notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
        <div>
          <p className="text-3xl">📓</p>
          <p className="mt-3">Sin notas de Obsidian que mencionen «{project.name}».</p>
          <p className="mt-1 text-xs text-slate-500">
            Se buscan notas .md en tus vaults que citen el proyecto por nombre.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-1">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => (
          <li key={`${n.vault}/${n.file}`}>
            <a
              href={n.uri}
              className="glass block rounded-xl p-4 transition-colors hover:border-white/25"
              title={`Abrir en Obsidian (${n.vault})`}
            >
              <p className="truncate text-sm font-medium text-slate-100">📄 {n.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {n.vault} / {n.file}
              </p>
              <p className="mt-2 text-[10px] text-slate-600">
                {new Date(n.mtime).toLocaleDateString("es", { dateStyle: "medium" })}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
