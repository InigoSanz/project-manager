import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNebula } from "../stores/nebula";
import { PixelMap } from "../components/PixelMap";
import { GridView } from "../components/GridView";
import { FolderPicker } from "../components/FolderPicker";
import { zoneColor } from "../pixel/palette";
import { groupProjectsByRoot, ORPHAN_ZONE, zoneName } from "../pixel/roots";
import { Icon } from "../components/Icon";

export function Home() {
  const { projects, scanning, connected, rescan, saveConfig, config, loadConfig, todayCount } = useNebula();
  const [view, setView] = useState<"map" | "grid">("map");
  const [pickerOpen, setPickerOpen] = useState(false);
  const present = useMemo(() => projects.filter((p) => p.present), [projects]);
  const zones = useMemo(() => {
    const roots = config?.roots ?? [];
    return [...groupProjectsByRoot(present, roots).entries()].map(([root, list]) => ({
      root,
      label: root === ORPHAN_ZONE ? "Espacio profundo" : zoneName(root),
      color: root === ORPHAN_ZONE ? "hsla(230 65% 62% / 1)" : zoneColor(root),
      count: list.length,
    }));
  }, [present, config]);

  const addRoot = async (path: string): Promise<void> => {
    setPickerOpen(false);
    const current = config ?? (await (await fetch("/api/config")).json());
    const roots: string[] = current.roots.includes(path) ? current.roots : [...current.roots, path];
    await saveConfig({ roots });
    await loadConfig();
  };

  return (
    <div className="relative h-full">
      {view === "map" ? <PixelMap projects={present} /> : <GridView projects={present} />}

      {/* Cabecera flotante */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
        <div className="pointer-events-auto flex items-center gap-3">
          <h1 className="font-display text-xl font-bold tracking-widest text-white">
            NEBULA<span className="text-accent">.</span>
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

        {/* Chips de zona: enfocar cada carpeta raíz en el mapa */}
        {view === "map" && zones.length > 1 && (
          <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 max-sm:hidden">
            {zones.map((z) => (
              <button
                key={z.root}
                onClick={() => window.dispatchEvent(new CustomEvent("nebula:focus-zone", { detail: z.root }))}
                className="glass rounded-lg px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:text-white"
                title={z.root === ORPHAN_ZONE ? "Proyectos sin carpeta raíz en la config" : z.root}
              >
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: z.color }} />
                {z.label}
                <span className="ml-1 text-slate-400">{z.count}</span>
              </button>
            ))}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("nebula:focus-zone", { detail: null }))}
              className="glass flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:text-white"
              title="Encuadrar todo el mapa"
            >
              <Icon name="map" size={12} />
              Todo
            </button>
          </div>
        )}
        {/* Acciones: arriba en desktop, barra inferior en móvil */}
        {/* en móvil el contenedor ocupa todo el ancho: solo los botones capturan puntero */}
        <div className="pointer-events-auto flex items-center gap-2 max-sm:pointer-events-none max-sm:fixed max-sm:inset-x-2 max-sm:bottom-0 max-sm:z-20 max-sm:justify-center max-sm:gap-1.5 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:[&>*]:pointer-events-auto">
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:new-task"))}
            className="flex items-center gap-1.5 rounded-lg bg-accent/30 px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent/45 max-sm:px-3.5 max-sm:py-2.5"
            title="Crear una tarea (tecla N)"
          >
            <Icon name="plus" size={15} />
            <span className="max-sm:hidden">Nueva tarea</span>
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-today"))}
            className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-200 transition-colors hover:text-white max-sm:px-3.5 max-sm:py-2.5"
            title="Tu día: tareas, avisos y agentes (tecla T)"
          >
            <Icon name="today" size={15} />
            <span className="max-sm:hidden">Hoy</span>
            {todayCount > 0 && <span className="rounded-full bg-accent/40 px-1.5 text-[10px]">{todayCount}</span>}
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-palette"))}
            className="glass hidden rounded-lg px-3.5 py-2.5 text-slate-300 transition-colors hover:text-white max-sm:block"
            title="Buscar proyecto o acción"
          >
            <Icon name="search" size={15} />
          </button>
          <button
            onClick={() => void rescan()}
            className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white max-sm:hidden"
          >
            <Icon name="refresh" size={13} />
            Re-escanear
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-help"))}
            className="glass rounded-lg px-3 py-2 text-slate-300 transition-colors hover:text-white max-sm:px-3.5 max-sm:py-2.5"
            title="Ayuda (tecla ?)"
          >
            <Icon name="help" size={14} />
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:open-settings"))}
            className="glass rounded-lg px-3 py-2 text-slate-300 transition-colors hover:text-white max-sm:px-3.5 max-sm:py-2.5"
            title="Ajustes"
          >
            <Icon name="settings" size={14} />
          </button>
          <div className="glass flex rounded-lg p-0.5 text-xs">
            {([
              { id: "map", label: "Mapa", icon: "map" },
              { id: "grid", label: "Cuadrícula", icon: "grid" },
            ] as const).map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                title={v.label}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors max-sm:px-2.5 max-sm:py-2 ${
                  view === v.id ? "bg-accent/30 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <Icon name={v.icon} size={13} />
                <span className="max-sm:hidden">{v.label}</span>
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
              <Icon name="map" size={34} className="mx-auto text-accent" />
              <p className="mt-3 text-lg text-white">Sin proyectos todavía</p>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Dile a Nebula dónde viven tus repositorios y los detectará todos automáticamente.
              </p>
              <button
                onClick={() => setPickerOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent/30 px-5 py-2.5 text-sm text-white transition-colors hover:bg-accent/45"
              >
                <Icon name="folder" />
                Elegir carpeta de proyectos
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FolderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(p) => void addRoot(p)} />
    </div>
  );
}
