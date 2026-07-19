import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

function LegendItem({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Icon name={icon} size={12} className="shrink-0 text-slate-500" />
      {children}
    </span>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">{children}</kbd>;
}

function Row({ k, desc }: { k: React.ReactNode; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-xs text-slate-400">{desc}</span>
      <span className="shrink-0">{k}</span>
    </div>
  );
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            className="glass-raised max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Ayuda</h2>
              <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:text-white" title="Cerrar">
                <Icon name="close" size={15} />
              </button>
            </div>

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Atajos</h3>
            <Row k={<Key>N</Key>} desc="Crear una tarea nueva" />
            <Row k={<Key>T</Key>} desc="Abrir/cerrar el panel Hoy" />
            <Row k={<><Key>Ctrl</Key> <Key>K</Key></>} desc="Buscar proyectos, tareas y acciones" />
            <Row k={<Key>?</Key>} desc="Esta ayuda" />
            <Row k={<Key>Esc</Key>} desc="Cerrar cualquier panel" />

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Crear tareas</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Pulsa <Key>N</Key> o el botón «Nueva tarea»: eliges proyecto, fecha y prioridad con botones, sin
              aprenderte nada.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Si prefieres el teclado, escribe los atajos en el título y se rellenan solos:{" "}
              <span className="text-indigo-300">@proyecto</span> ·{" "}
              <span className="text-rose-300">!alta/!media/!baja</span> ·{" "}
              <span className="text-amber-300">^hoy ^mañana ^vie ^25/07</span>
            </p>

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">El mapa</h3>
            <div className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-400">
              <p>Cada planeta es un repositorio y cada zona una de tus carpetas raíz.</p>
              <p>Los repos cuyo root ya no está en la configuración caen en «Espacio profundo».</p>
              <p>Arrastra para moverte, rueda o pellizca para acercarte; doble click encuadra una zona.</p>
            </div>

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Leyenda</h3>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
              <LegendItem icon="jira">issue de Jira</LegendItem>
              <LegendItem icon="planner">tarea de Planner</LegendItem>
              <LegendItem icon="ai">derivada de una sesión de IA</LegendItem>
              <LegendItem icon="clock">vencimiento</LegendItem>
              <LegendItem icon="priority">prioridad</LegendItem>
              <LegendItem icon="flag">atención en git</LegendItem>
              <LegendItem icon="dot">agente trabajando ahora</LegendItem>
              <LegendItem icon="branch">rama actual</LegendItem>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Al completar una tarea de Jira/Planner, Nebula la cierra también allí (configurable en{" "}
              <Link to="/ajustes" onClick={onClose} className="text-indigo-300 hover:underline">
                Ajustes → Sincronización
              </Link>
              ).
            </p>

            <div className="mt-4 flex justify-between border-t border-white/10 pt-3">
              <button
                onClick={() => {
                  onClose();
                  window.dispatchEvent(new Event("nebula:open-tour"));
                }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white"
              >
                <Icon name="refresh" size={12} />
                Ver el tour de nuevo
              </button>
              <Link
                to="/ajustes"
                onClick={onClose}
                className="flex items-center gap-1.5 text-xs text-indigo-300 hover:underline"
              >
                <Icon name="settings" size={12} />
                Ajustes
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
