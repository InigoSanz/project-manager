import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TaskItem } from "@nebula/shared";
import { Icon } from "./Icon";

const PRIORITY_META: Record<number, { label: string; cls: string } | undefined> = {
  1: { label: "baja", cls: "text-slate-400" },
  2: { label: "media", cls: "text-amber-300" },
  3: { label: "alta", cls: "text-rose-300" },
};

function dueLabel(iso: string): { text: string; cls: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso + "T00:00:00");
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "vencida ayer" : `vencida (${-days}d)`, cls: "bg-rose-500/20 text-rose-300" };
  if (days === 0) return { text: "hoy", cls: "bg-amber-500/20 text-amber-300" };
  if (days === 1) return { text: "mañana", cls: "bg-amber-500/10 text-amber-200/80" };
  if (days < 7) return { text: due.toLocaleDateString("es", { weekday: "short" }), cls: "bg-white/5 text-slate-300" };
  return { text: due.toLocaleDateString("es", { day: "numeric", month: "short" }), cls: "bg-white/5 text-slate-400" };
}

/** Badges de vencimiento y prioridad (solo lectura). */
export function TaskMetaBadges({ task }: { task: TaskItem }) {
  const prio = PRIORITY_META[task.priority];
  if (!task.dueDate && !prio) return null;
  const due = task.dueDate ? dueLabel(task.dueDate) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {prio && (
        <span className={`inline-flex items-center gap-1 text-[10px] ${prio.cls}`} title={`prioridad ${prio.label}`}>
          <Icon name="priority" size={10} />
          {prio.label}
        </span>
      )}
      {due && (
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] ${due.cls}`}
          title={`vence ${task.dueDate}`}
        >
          <Icon name="clock" size={10} />
          {due.text}
        </span>
      )}
    </span>
  );
}

/** Botón de calendario con popover para editar fecha y prioridad. */
export function TaskMetaEditor({ task, onSaved }: { task: TaskItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(task.dueDate ?? "");
  const [prio, setPrio] = useState<number>(task.priority);

  const save = async (): Promise<void> => {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: due || null, priority: prio }),
    });
    setOpen(false);
    onSaved();
  };

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Fecha y prioridad"
        className="rounded p-1 text-slate-500 opacity-45 transition-opacity group-hover:opacity-100 hover:text-white pointer-coarse:opacity-100"
      >
        <Icon name="calendar" size={13} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="glass-raised absolute bottom-full left-0 z-30 mb-1 w-56 rounded-xl p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="block text-[10px] tracking-wider text-slate-400 uppercase">Vence</label>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-200 focus:outline-none [color-scheme:dark]"
            />
            {/* posponer con un click */}
            <div className="mt-1 flex gap-1">
              {(
                [
                  ["hoy", 0],
                  ["mañana", 1],
                  ["+1 sem", 7],
                ] as const
              ).map(([label, days]) => (
                <button
                  key={label}
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + days);
                    setDue(
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                    );
                  }}
                  className="flex-1 rounded-md bg-white/5 px-1 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-2.5 block text-[10px] tracking-wider text-slate-400 uppercase">Prioridad</label>
            <div className="mt-1 flex gap-1">
              {(["—", "baja", "media", "alta"] as const).map((label, i) => (
                <button
                  key={label}
                  onClick={() => setPrio(i)}
                  className={`flex-1 rounded-md px-1 py-1.5 text-[11px] transition-colors ${
                    prio === i ? "bg-indigo-500/30 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="text-[11px] text-slate-500 hover:text-white">
                Cancelar
              </button>
              <button
                onClick={() => void save()}
                className="rounded-md bg-indigo-500/30 px-2.5 py-1 text-[11px] text-white hover:bg-indigo-500/45"
              >
                Guardar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
