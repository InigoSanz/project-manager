import { useEffect } from "react";
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

function Section({ title }: { title: string }) {
  return <h3 className="mt-5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{title}</h3>;
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
  // la propia Ayuda prometía «Esc cierra cualquier panel» sin implementarlo
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

            <Section title="Atajos" />
            <Row k={<Key>N</Key>} desc="Crear una tarea" />
            <Row k={<Key>T</Key>} desc="Abrir o cerrar el panel Hoy" />
            <Row k={<><Key>Ctrl</Key> <Key>K</Key></>} desc="Buscar proyectos y tareas, o ejecutar acciones" />
            <Row k={<Key>?</Key>} desc="Esta ayuda" />
            <Row k={<Key>Esc</Key>} desc="Cerrar el panel abierto" />

            <Section title="El mapa" />
            <div className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-400">
              <p>Cada planeta es un repositorio y cada zona una de tus carpetas raíz.</p>
              <p>
                Arrastra para moverte, rueda o pellizca para acercarte, y haz doble clic para encuadrar una zona. Los
                nombres aparecen al acercarte lo suficiente.
              </p>
              <p>
                Con la barra de filtros acotas por tecnología, estado de git o actividad. La estrella fija un proyecto
                arriba y el archivador lo oculta sin borrar nada.
              </p>
              <p>
                Los repositorios cuya carpeta raíz ya no está configurada se agrupan en «Espacio profundo». Con el
                botón «Cuadrícula» ves lo mismo como fichas.
              </p>
            </div>

            <Section title="Trabajar en un proyecto" />
            <div className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-400">
              <p>
                Desde la pestaña <b className="text-slate-300">Resumen</b>: abre el proyecto en tu editor, en una
                terminal, en el explorador o el repositorio remoto en el navegador.
              </p>
              <p>
                Ahí mismo lanzas los scripts del <code className="text-slate-300">package.json</code> y ves su salida
                en vivo. Solo se ejecutan los que el proyecto declara, nunca texto libre.
              </p>
              <p>
                En <b className="text-slate-300">Git</b> puedes ver el diff de cada fichero, cambiar de rama, hacer
                fetch o pull y buscar en el historial. Si un cambio de rama pisara algo, git lo rechaza y te lo cuenta.
              </p>
              <p className="text-slate-500">
                Todo esto solo funciona desde este equipo: desde el móvil ves la información, pero no se ejecuta nada.
              </p>
            </div>

            <Section title="Tus tareas están en tres sitios" />
            <div className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-400">
              <p>
                <b className="text-slate-300">Hoy</b> (<Key>T</Key>) es lo accionable ahora: lo que tienes en curso,
                avisos de git, agentes trabajando y revisiones pendientes.
              </p>
              <p>
                <Link to="/tareas" onClick={onClose} className="text-accent hover:underline">
                  Todas las tareas
                </Link>{" "}
                es la lista completa, con filtros por proyecto, origen y vencimiento.
              </p>
              <p>
                La pestaña <b className="text-slate-300">Tareas</b> de cada proyecto es su tablero, con las columnas
                Pendiente, En curso y Hecha.
              </p>
            </div>

            <Section title="Crear tareas" />
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

            <Section title="Leyenda" />
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
              <LegendItem icon="jira">issue de Jira</LegendItem>
              <LegendItem icon="planner">tarea de Planner</LegendItem>
              <LegendItem icon="github">issue de GitHub</LegendItem>
              <LegendItem icon="pullRequest">pull request</LegendItem>
              <LegendItem icon="ai">derivada de una sesión de IA</LegendItem>
              <LegendItem icon="clock">vencimiento</LegendItem>
              <LegendItem icon="priority">prioridad</LegendItem>
              <LegendItem icon="flag">atención en git</LegendItem>
              <LegendItem icon="dot">agente trabajando ahora</LegendItem>
              <LegendItem icon="branch">rama actual</LegendItem>
              <LegendItem icon="star">favorito</LegendItem>
              <LegendItem icon="archive">archivado</LegendItem>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Nebula trae tus issues de Jira, Planner y GitHub, y al completarlos aquí los cierra también allí. Puedes
              dejarlo en solo lectura en{" "}
              <Link to="/ajustes/sincronizacion" onClick={onClose} className="text-indigo-300 hover:underline">
                Ajustes → Sincronización
              </Link>
              .
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
