import type { Project } from "@nebula/shared";

/** Normaliza un path Windows/posix para comparar por prefijo. */
function norm(p: string): string {
  return p.toLowerCase().replace(/\//g, "\\").replace(/\\+$/, "");
}

/**
 * Carpeta raíz (de config.roots) a la que pertenece un proyecto: el prefijo
 * más largo que contenga su path. null si ninguno (root retirado de la config).
 */
export function rootForProject(projectPath: string, roots: string[]): string | null {
  const p = norm(projectPath);
  let best: string | null = null;
  for (const root of roots) {
    const n = norm(root);
    if ((p === n || p.startsWith(n + "\\")) && (!best || n.length > norm(best).length)) {
      best = root;
    }
  }
  return best;
}

/** Nombre corto de la zona: última carpeta del root. */
export function zoneName(root: string): string {
  const parts = root.replace(/\//g, "\\").replace(/\\+$/, "").split("\\");
  return parts[parts.length - 1] || root;
}

/** Clave usada para los proyectos huérfanos (sin root en la config actual). */
export const ORPHAN_ZONE = "\0orphan";

/** Agrupa proyectos por root (los huérfanos bajo ORPHAN_ZONE), orden estable. */
export function groupProjectsByRoot(projects: Project[], roots: string[]): Map<string, Project[]> {
  const groups = new Map<string, Project[]>();
  // las zonas siguen el orden de la config, la huérfana siempre al final
  for (const root of roots) groups.set(root, []);
  for (const project of projects) {
    const root = rootForProject(project.path, roots) ?? ORPHAN_ZONE;
    const list = groups.get(root);
    if (list) list.push(project);
    else groups.set(root, [project]);
  }
  for (const [key, list] of groups) {
    if (list.length === 0 && key !== ORPHAN_ZONE) groups.delete(key);
    else list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}
