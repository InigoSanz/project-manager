// Arranque en un paso: compila la UI si no existe y levanta el daemon.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!fs.existsSync(path.join(root, "node_modules"))) {
  console.log("→ Instalando dependencias (primera vez)…");
  run("pnpm", ["install"]);
}
if (!fs.existsSync(path.join(root, "web", "dist", "index.html"))) {
  console.log("→ Compilando la interfaz (primera vez)…");
  run("pnpm", ["build"]);
}
run("pnpm", ["start"]);
