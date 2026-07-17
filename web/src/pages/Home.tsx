import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNebula } from "../stores/nebula";
import { Galaxy } from "../scenes/Galaxy";
import { GridView } from "../components/GridView";
import { FolderPicker } from "../components/FolderPicker";

export function Home() {
  const { projects, scanning, connected, liveActivity, rescan, saveConfig, config, loadConfig } = useNebula();
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
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => void rescan()}
            className="glass rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
          >
            ↻ Re-escanear
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-settings"))}
            className="glass rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
            title="Ajustes (o Ctrl+K)"
          >
            ⚙
          </button>
          <div className="glass flex rounded-lg p-0.5 text-xs">
            {(["galaxy", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  view === v ? "bg-indigo-500/30 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {v === "galaxy" ? "◉ Galaxia" : "▦ Grid"}
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
