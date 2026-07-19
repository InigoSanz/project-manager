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
      <section className="glass rounded-xl p-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Notas de Obsidian</h3>
        <p className="text-xs text-slate-500">
          Ninguna nota de tus vaults menciona «{project.name}». Se buscan ficheros .md que citen el proyecto por
          nombre; se abren en Obsidian y Nebula no las modifica.
        </p>
      </section>
    );
  }

  return (
    <section className="glass rounded-xl p-4">
      {/* cabecera explícita: en la pestaña Conocimiento conviven estas notas
          (de Obsidian, solo lectura) con el bloc propio de Nebula */}
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Notas de Obsidian</h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    </section>
  );
}
