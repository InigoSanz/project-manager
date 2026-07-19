import { spawn } from "node:child_process";
import fs from "node:fs";

/**
 * Abrir cosas del sistema: editor, terminal, explorador y el repositorio
 * remoto en el navegador. Nunca recibe una ruta del cliente — la ruta sale
 * siempre del proyecto guardado, así no hay forma de apuntar a otro sitio.
 */

export type OpenTarget = "editor" | "terminal" | "explorer" | "remote";

/**
 * Lanza y se desentiende. `detached` + `unref` para que cerrar el daemon no
 * arrastre al editor, y `windowsHide` para que no parpadee una consola.
 */
function launch(command: string, args: string[], useShell = false): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    shell: useShell,
  });
  child.on("error", () => {
    /* la herramienta no está instalada: se informa por el retorno del endpoint */
  });
  child.unref();
}

const isWin = process.platform === "win32";

/** Comillas para una línea que pasa por shell (rutas con espacios y con ñ). */
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function openInEditor(dir: string, editorCommand: string): void {
  // `code` (y la mayoría de CLIs de editores en Windows) es un .cmd: desde
  // Node 20.12 no se puede lanzar sin shell, así que va entrecomillado.
  if (isWin) launch(`${editorCommand} ${quote(dir)}`, [], true);
  else launch(editorCommand, [dir]);
}

function openTerminal(dir: string): void {
  if (!isWin) {
    launch("x-terminal-emulator", [], false);
    return;
  }
  // Windows Terminal si está; si no, la consola clásica en esa carpeta
  const child = spawn("wt.exe", ["-d", dir], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => launch(`start "" cmd.exe /k cd /d ${quote(dir)}`, [], true));
  child.unref();
}

function openExplorer(dir: string): void {
  // ojo: explorer.exe devuelve código 1 incluso cuando funciona, por eso no
  // se comprueba el resultado
  if (isWin) launch("explorer.exe", [dir]);
  else launch(process.platform === "darwin" ? "open" : "xdg-open", [dir]);
}

/** Sitios donde Chrome se instala en Windows, en orden de probabilidad. */
function findChrome(): string | null {
  const candidates = [
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["ProgramFiles"] ?? "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Abre una URL en Chrome. Se localiza el ejecutable y se lanza directamente
 * (sin shell, con la URL como argumento) en vez de delegar en el navegador
 * predeterminado del sistema. Si no está instalado, se recurre al de por
 * defecto para no dejar al usuario sin nada.
 */
function openUrl(url: string, browserCommand?: string): void {
  if (!isWin) {
    launch(browserCommand?.trim() || (process.platform === "darwin" ? "open" : "xdg-open"), [url]);
    return;
  }
  if (browserCommand?.trim()) {
    launch(`${browserCommand.trim()} ${quote(url)}`, [], true);
    return;
  }
  const chrome = findChrome();
  if (chrome) launch(chrome, [url]);
  else launch("explorer.exe", [url]); // sin Chrome: el navegador predeterminado
}

/**
 * Normaliza la URL del remoto a algo que el navegador pueda abrir:
 * `git@github.com:user/repo.git` → `https://github.com/user/repo`
 */
export function remoteToBrowserUrl(remote: string | null): string | null {
  if (!remote) return null;
  const clean = remote.trim().replace(/\.git$/, "");
  const ssh = clean.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  if (/^https?:\/\//.test(clean)) return clean;
  return null;
}

export interface OpenResult {
  ok: boolean;
  error?: string;
}

/** Ejecuta la acción sobre un proyecto ya validado. */
export function openProject(
  target: OpenTarget,
  projectPath: string,
  opts: { editorCommand?: string; browserCommand?: string; remoteUrl?: string | null } = {},
): OpenResult {
  if (target !== "remote" && !fs.existsSync(projectPath)) {
    return { ok: false, error: "La carpeta del proyecto ya no existe." };
  }

  switch (target) {
    case "editor":
      openInEditor(projectPath, opts.editorCommand?.trim() || "code");
      return { ok: true };
    case "terminal":
      openTerminal(projectPath);
      return { ok: true };
    case "explorer":
      openExplorer(projectPath);
      return { ok: true };
    case "remote": {
      const url = remoteToBrowserUrl(opts.remoteUrl ?? null);
      if (!url) return { ok: false, error: "Este repositorio no tiene un remoto que se pueda abrir." };
      openUrl(url, opts.browserCommand);
      return { ok: true };
    }
  }
}
