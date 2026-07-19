import type { Project } from "@nebula/shared";
import { Icon } from "./Icon";

/** Fija un proyecto arriba. El cambio llega de vuelta por WebSocket. */
export function FavoriteButton({ project, size = 14 }: { project: Project; size?: number }) {
  const toggle = async (): Promise<void> => {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !project.favorite }),
    });
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      title={project.favorite ? "Quitar de favoritos" : "Marcar como favorito"}
      className={`rounded-md p-1 transition-colors ${
        project.favorite ? "text-amber-300" : "text-slate-600 hover:text-slate-300"
      }`}
    >
      <Icon name="star" size={size} />
    </button>
  );
}
