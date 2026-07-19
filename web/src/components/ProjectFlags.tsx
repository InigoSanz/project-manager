import type { Project } from "@nebula/shared";
import { Icon } from "./Icon";

/** PATCH de las marcas del usuario; el cambio vuelve por WebSocket. */
async function patchFlags(id: string, flags: { favorite?: boolean; archived?: boolean }): Promise<void> {
  await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flags),
  });
}

/** Fija un proyecto: sale el primero en la cuadrícula y se puede filtrar. */
export function FavoriteButton({ project, size = 14 }: { project: Project; size?: number }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void patchFlags(project.id, { favorite: !project.favorite });
      }}
      title={project.favorite ? "Quitar de favoritos" : "Marcar como favorito (sale el primero)"}
      className={`rounded-md p-1 transition-colors ${
        project.favorite ? "text-amber-300" : "text-slate-600 hover:text-slate-300"
      }`}
    >
      <Icon name="star" size={size} />
    </button>
  );
}

/**
 * Archiva un proyecto: deja de aparecer en el mapa y en la cuadrícula, salvo
 * que actives «Mostrar archivados» en los filtros. No borra nada.
 */
export function ArchiveButton({ project, size = 14 }: { project: Project; size?: number }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void patchFlags(project.id, { archived: !project.archived });
      }}
      title={
        project.archived
          ? "Desarchivar: vuelve a aparecer en el mapa"
          : "Archivar: se oculta del mapa y de la cuadrícula (no se borra nada)"
      }
      className={`rounded-md p-1 transition-colors ${
        project.archived ? "text-sky-300" : "text-slate-600 hover:text-slate-300"
      }`}
    >
      <Icon name="archive" size={size} />
    </button>
  );
}
