import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";

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
              <button onClick={onClose} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Atajos</h3>
            <Row k={<Key>T</Key>} desc="Abrir/cerrar el panel Hoy" />
            <Row k={<><Key>Ctrl</Key> <Key>K</Key></>} desc="Buscar proyectos, tareas y acciones" />
            <Row k={<Key>?</Key>} desc="Esta ayuda" />
            <Row k={<Key>Esc</Key>} desc="Cerrar cualquier panel" />

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Crear tareas al vuelo</h3>
            <p className="mt-1 rounded-lg bg-black/30 p-2.5 font-mono text-[11px] text-slate-300">
              preparar demo <span className="text-indigo-300">@portfolio</span>{" "}
              <span className="text-rose-300">!alta</span> <span className="text-amber-300">^vie</span>
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              <span className="text-indigo-300">@proyecto</span> destino ·{" "}
              <span className="text-rose-300">!alta/!media/!baja</span> prioridad ·{" "}
              <span className="text-amber-300">^hoy ^mañana ^vie ^25/07</span> vencimiento. Funciona en el panel Hoy y
              en Ctrl+K.
            </p>

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">El mapa</h3>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
              <span>🪐 planeta = repositorio</span>
              <span>zona = carpeta raíz</span>
              <span>Espacio profundo = sin raíz</span>
              <span>rueda/pinch = zoom · arrastrar = mover</span>
            </div>

            <h3 className="mt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Leyenda</h3>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
              <span>◆ issue de Jira</span>
              <span>▦ tarea de Planner</span>
              <span>✳ derivada de IA / Claude</span>
              <span>⌁ Codex · ▮ Cursor</span>
              <span>✦ Gemini · ◒ Antigravity</span>
              <span>⏱ vencimiento · ▲ prioridad</span>
              <span>● en vivo (agente activo)</span>
              <span>⚑ atención git</span>
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
                className="text-xs text-slate-500 hover:text-white"
              >
                ↺ Ver el tour de nuevo
              </button>
              <Link to="/ajustes" onClick={onClose} className="text-xs text-indigo-300 hover:underline">
                ⚙ Ajustes
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
