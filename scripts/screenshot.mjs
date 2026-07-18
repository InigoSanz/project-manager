// Captura headless de Nebula (verificación y assets del README).
// Uso: node scripts/screenshot.mjs [salida.png] [--mobile] [--url URL] [--wait ms] [--eval "js"]
// Requiere la app corriendo (pnpm dev o pnpm start) y el Chromium de la caché de Playwright.
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const VALUED_FLAGS = new Set(["--url", "--wait", "--eval"]);
const out =
  args.find((a, i) => !a.startsWith("--") && !VALUED_FLAGS.has(args[i - 1] ?? "")) ??
  "docs/assets/nebula-overview.png";
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const mobile = args.includes("--mobile");
const url = flag("--url", "http://localhost:5173/");
const waitMs = Number(flag("--wait", "3000"));
const evalJs = flag("--eval", null);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findChromium() {
  if (process.env.NEBULA_CHROMIUM && fs.existsSync(process.env.NEBULA_CHROMIUM)) return process.env.NEBULA_CHROMIUM;
  const cache = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const sub of ["chrome-win64", "chrome-win"]) {
        const exe = path.join(cache, dir, sub, "chrome.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  throw new Error("No se encontró Chromium. Define NEBULA_CHROMIUM o instala navegadores de Playwright.");
}

// perfil bajo el repo: las rutas con ñ (C:\Users\Iñigo) dan problemas en APIs ANSI de Chromium
const browser = await chromium.launchPersistentContext(path.join(repoRoot, ".cache", "pw-profile"), {
  executablePath: findChromium(),
  headless: true,
  viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
  deviceScaleFactor: mobile ? 3 : 1,
  hasTouch: mobile,
  isMobile: mobile,
});
// el tour de bienvenida taparía la captura en un perfil recién creado
await browser.addInitScript(() => localStorage.setItem("nebula:tour-v2", "1"));
const page = browser.pages()[0] ?? (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(waitMs);
if (evalJs) {
  const result = await page.evaluate(evalJs);
  console.log("eval:", JSON.stringify(result));
  await page.waitForTimeout(1000);
}
fs.mkdirSync(path.dirname(path.resolve(repoRoot, out)), { recursive: true });
await page.screenshot({ path: path.resolve(repoRoot, out) });
await browser.close();
if (errors.length) {
  console.log("ERRORES DE PÁGINA:");
  for (const e of errors) console.log("  " + e);
} else {
  console.log("sin errores de página");
}
console.log("captura:", path.resolve(repoRoot, out));
