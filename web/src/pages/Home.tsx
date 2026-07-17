import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNebula } from "../stores/nebula";
import { Galaxy } from "../scenes/Galaxy";
import { GridView } from "../components/GridView";
import { FolderPicker } from "../components/FolderPicker";

export function Home() {
  const { projects, scanning, connected, liveActivity, rescan, saveConfig, config, loadConfig, todayCount } =
    useNebula();
  const [view, setView] = useState<"galaxy" | "grid">("galaxy");
  const [pickerOpen, setPickerOpen] = useState(false);
  const present = projects.filter((p) => p.present);

  const addRoot = async (path: string): Promise<void> => {
    setPickerOpen(false);
    const current = config ?? (await (await fetch("/api/config")).json());
    const roots: string[] = current.roots.includes(path) ? current.roots : [...current.roots, path];
    await saveConfig({ roots });
    await loadConfig();
  };

  return (
    <div className="relative h-full">
      {view === "galaxy" ? (
        <Galaxy projects={present} liveActivity={liveActivity} />
      ) : (
        <GridView projects={present} />
      )}

      {/* Cabecera flotante */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
        <div className="pointer-events-auto flex items-center gap-3">
          <h1 className="font-display text-xl font-bold tracking-widest text-white">
            NEBULA<span className="text-indigo-400">.</span>
          </h1>
          <span className="text-xs text-slate-400">
            {present.length} proyectos
            {scanning && <span className="ml-2 animate-pulse text-indigo-300">escaneando…</span>}
          </span>
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-500"}`}
            title={connected ? "conectado" : "desconectado"}
          />
        </div>
        {/* Acciones: arriba en desktop, barra inferior en móvil */}
        <div className="pointer-events-auto flex items-center gap-2 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-0 max-sm:z-20 max-sm:justify-center max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-today"))}
            className="glass rounded-lg px-3 py-1.5 text-xs text-slate-200 transition-colors hover:text-white max-sm:px-4 max-sm:py-2.5 max-sm:text-sm"
            title="Tu día: tareas, avisos y agentes (tecla T)"
          >
            ◔ Hoy{todayCount > 0 && <span className="ml-1.5 rounded-full bg-indigo-500/40 px-1.5 text-[10px]">{todayCount}</span>}
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-palette"))}
            className="glass hidden rounded-lg px-4 py-2.5 text-sm text-slate-300 transition-colors hover:text-white max-sm:block"
            title="Buscar proyecto o acción"
          >
            🔍
          </button>
          <button
            onClick={() => void rescan()}
            className="glass rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white max-sm:hidden"
          >
            ↻ Re-escanear
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-help"))}
            className="glass rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white max-sm:px-4 max-sm:py-2.5 max-sm:text-sm"
            title="Ayuda (tecla ?)"
          >
            ?
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-settings"))}
            className="glass rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white max-sm:px-4 max-sm:py-2.5 max-sm:text-sm"
            title="Ajustes"
          >
            ⚙
          </button>
          <div className="glass flex rounded-lg p-0.5 text-xs">
            {(["galaxy", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 transition-colors max-sm:px-3.5 max-sm:py-2 ${
                  view === v ? "bg-indigo-500/30 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <span className="max-sm:hidden">{v === "galaxy" ? "◉ Galaxia" : "▦ Grid"}</span>
                <span className="hidden max-sm:inline">{v === "galaxy" ? "◉" : "▦"}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {present.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          >
            <div className="glass pointer-events-auto rounded-2xl p-8 text-center">
              <p className="text-3xl">🌌</p>
              <p className="mt-3 text-lg text-white">Sin proyectos todavía</p>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Dile a Nebula dónde viven tus repositorios y los detectará todos automáticamente.
              </p>
              <button
                onClick={() => setPickerOpen(true)}
                className="mt-5 rounded-xl bg-indigo-500/30 px-5 py-2.5 text-sm text-white transition-colors hover:bg-indigo-500/45"
              >
                📁 Elegir carpeta de proyectos
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FolderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(p) => void addRoot(p)} />
    </div>
  );
}
