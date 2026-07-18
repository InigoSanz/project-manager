import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TaskItem, TaskStatus } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "./Toast";

const STATUSES: Array<{ id: TaskStatus; label: string }> = [
  { id: "todo", label: "Pendiente" },
  { id: "doing", label: "En curso" },
  { id: "done", label: "Hecho" },
];

/**
 * Editor completo de una tarea (título, notas, proyecto, fecha, prioridad y
 * estado). Se abre al pulsar el título de cualquier tarjeta o fila; todos los
 * campos van al PATCH /api/tasks/:id que el servidor ya soporta.
 */
export function TaskEditor({
  task,
  onClose,
  onSaved,
}: {
  /** null = cerrado */
  task: TaskItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allProjects = useNebula((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => p.present), [allProjects]);
  const push = useToasts((s) => s.push);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<number>(0);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueDate(task.dueDate ?? "");
    setPriority(task.priority);
    setStatus(task.status);
    setProjectId(task.projectId);
  }, [task]);

  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  const save = async (): Promise<void> => {
    if (!task || !title.trim()) return;
    const patch: Record<string, unknown> = {};
    if (title.trim() !== task.title) patch.title = title.trim();
    if ((notes.trim() || null) !== task.notes) patch.notes = notes.trim() || null;
    if ((dueDate || null) !== task.dueDate) patch.dueDate = dueDate || null;
    if (priority !== task.priority) patch.priority = priority;
    if (status !== task.status) patch.status = status;
    if (projectId && projectId !== task.projectId) patch.projectId = projectId;
    if (Object.keys(patch).length > 0) {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      push({ level: "success", message: "Tarea actualizada" });
      onSaved();
    }
    onClose();
  };

  const remove = async (): Promise<void> => {
    if (!task) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    push({ level: "info", message: "Tarea eliminada" });
    onSaved();
    onClose();
  };

  const currentProject = projects.find((p) => p.id === task?.projectId);

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[58] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="glass-raised w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Editar tarea</h2>
              <button onClick={onClose} className="text-slate-500 hover:text-white" title="Cerrar (Esc)">
                ✕
              </button>
            </div>

            <label className="mt-4 block text-[10px] tracking-wider text-slate-400 uppercase">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && void save()}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />

            <label className="mt-3 block text-[10px] tracking-wider text-slate-400 uppercase">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Contexto, enlaces, pasos…"
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] tracking-wider text-slate-400 uppercase">Proyecto</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-slate-200 focus:outline-none"
                >
                  {!currentProject && <option value={task.projectId}>Sin proyecto</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] tracking-wider text-slate-400 uppercase">Estado</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-slate-200 focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900">
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] tracking-wider text-slate-400 uppercase">Vence</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-200 focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-wider text-slate-400 uppercase">Prioridad</label>
                <div className="mt-1 flex gap-1">
                  {(["—", "baja", "media", "alta"] as const).map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setPriority(i)}
                      className={`flex-1 rounded-md px-1 py-1.5 text-[11px] transition-colors ${
                        priority === i ? "bg-accent/30 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button onClick={() => void remove()} className="text-xs text-slate-500 hover:text-rose-300">
                🗑 Eliminar
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                  Cancelar
                </button>
                <button
                  onClick={() => void save()}
                  className="rounded-lg bg-accent/30 px-4 py-1.5 text-xs text-white transition-colors hover:bg-accent/45"
                >
                  Guardar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
