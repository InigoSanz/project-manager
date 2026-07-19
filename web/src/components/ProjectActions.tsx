import type { Project } from "@nebula/shared";
import { useToasts } from "./Toast";
import { Icon, type IconName } from "./Icon";

type Target = "editor" | "terminal" | "explorer" | "remote";

const ACTIONS: Array<{ target: Target; label: string; icon: IconName; title: string }> = [
  { target: "editor", label: "Editor", icon: "editor", title: "Abrir el proyecto en el editor" },
  { target: "terminal", label: "Terminal", icon: "terminal", title: "Abrir una terminal en la carpeta" },
  { target: "explorer", label: "Carpeta", icon: "folder", title: "Abrir la carpeta en el explorador" },
  { target: "remote", label: "Remoto", icon: "external", title: "Abrir el repositorio remoto en el navegador" },
];

/** Lanza la acción y avisa si el servidor la rechaza (sin remoto, sin carpeta…). */
export async function openProject(projectId: string, target: Target): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/projects/${projectId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? "No se pudo abrir." };
  } catch {
    return { ok: false, error: "No se pudo contactar con Nebula." };
  }
}

/**
 * Barra de acciones de un proyecto: abrir en el editor, en una terminal, en el
 * explorador o el remoto en el navegador. Es la puerta de salida de Nebula
 * hacia el trabajo real.
 */
export function ProjectActions({
  project,
  compact = false,
  className = "",
}: {
  project: Project;
  /** solo iconos, para las tarjetas de la cuadrícula */
  compact?: boolean;
  className?: string;
}) {
  const push = useToasts((s) => s.push);

  const run = async (target: Target): Promise<void> => {
    const res = await openProject(project.id, target);
    if (!res.ok) push({ level: "error", message: res.error ?? "No se pudo abrir." });
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {ACTIONS.map((a) => {
        // sin remoto configurado el botón sobra: no lo mostramos en compacto
        const disabled = a.target === "remote" && !project.remoteUrl;
        if (disabled && compact) return null;
        return (
          <button
            key={a.target}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void run(a.target);
            }}
            disabled={disabled}
            title={disabled ? "Este repositorio no tiene remoto" : a.title}
            className={`glass flex items-center gap-1.5 rounded-lg text-xs text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
              compact ? "p-1.5" : "px-2.5 py-1.5"
            }`}
          >
            <Icon name={a.icon} size={compact ? 13 : 13} />
            {!compact && a.label}
          </button>
        );
      })}
    </div>
  );
}
