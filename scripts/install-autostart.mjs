// Crea un lanzador silencioso de Nebula en la carpeta Inicio de Windows.
// Uso: node scripts/install-autostart.mjs   (o pnpm autostart:install)
//      node scripts/install-autostart.mjs --uninstall
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startup = path.join(os.homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const vbsPath = path.join(startup, "nebula-daemon.vbs");

if (process.argv.includes("--uninstall")) {
  fs.rmSync(vbsPath, { force: true });
  console.log(`✓ Autostart eliminado (${vbsPath})`);
  process.exit(0);
}

if (!fs.existsSync(startup)) {
  console.error(`No existe la carpeta de inicio: ${startup}`);
  process.exit(1);
}

// VBS: arranca el daemon sin ventana de consola (0 = oculto)
const vbs = `' Nebula - daemon de gestion de proyectos (autogenerado)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "${repoRoot.replaceAll('"', '""')}"
shell.Run "cmd /c pnpm --filter @nebula/server start", 0, False
`;

fs.writeFileSync(vbsPath, vbs, "utf8");
console.log(`✓ Autostart instalado: ${vbsPath}`);
console.log("  Nebula arrancará oculto al iniciar sesión. UI: http://localhost:4816");
