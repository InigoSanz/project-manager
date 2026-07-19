import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project, TaskItem, TaskStatus } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "./Toast";
import { parseQuickAdd } from "../lib/quickAdd";
import { Icon } from "./Icon";

const STATUSES: Array<{ id: TaskStatus; label: string }> = [
  { id: "todo", label: "Pendiente" },
  { id: "doing", label: "En curso" },
  { id: "done", label: "Hecha" },
];

/** Ejemplo del campo título, en el mundo de quien usa esto. */
const TITLE_PLACEHOLDER = "Revisar el PR de autenticación";

const PRIORITIES = ["Ninguna", "Baja", "Media", "Alta"] as const;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Atajos de fecha: lo que la gente realmente elige. */
function quickDates(): Array<{ label: string; value: string }> {
  const today = new Date();
  // "esta semana" = viernes de la semana en curso (o el próximo si ya pasó)
  const toFriday = (5 - today.getDay() + 7) % 7 || 7;
  return [
    { label: "Hoy", value: isoDate(today) },
    { label: "Mañana", value: daysFromNow(1) },
    { label: "Esta semana", value: daysFromNow(toFriday) },
  ];
}

export interface TaskDialogState {
  mode: "create" | "edit";
  /** en modo editar, la tarea; en crear, null */
  task?: TaskItem | null;
  /** en modo crear: valores de partida */
  defaults?: { projectId?: string | null; status?: TaskStatus; title?: string };
}

/**
 * Ficha única de tarea para crear y editar. Campos etiquetados en lenguaje
 * natural y elección por botones: no hace falta conocer ninguna sintaxis.
 * Quien ya se sabe los atajos (`@proyecto !alta ^vie`) puede teclearlos en el
 * título y se convierten solos en los botones correspondientes.
 */
export function TaskDialog({
  state,
  onClose,
  onSaved,
}: {
  state: TaskDialogState | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allProjects = useNebula((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => p.present), [allProjects]);
  const push = useToasts((s) => s.push);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState(0);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [projectId, setProjectId] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isEdit = state?.mode === "edit";
  const task = state?.task ?? null;

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit" && state.task) {
      setTitle(state.task.title);
      setNotes(state.task.notes ?? "");
      setDueDate(state.task.dueDate ?? "");
      setPriority(state.task.priority);
      setStatus(state.task.status);
      setProjectId(state.task.projectId);
    } else {
      setTitle(state.defaults?.title ?? "");
      setNotes("");
      setDueDate("");
      setPriority(0);
      setStatus(state.defaults?.status ?? "todo");
      setProjectId(state.defaults?.projectId ?? "");
    }
    setShowDatePicker(false);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  /**
   * Al escribir un espacio consumimos los atajos que haya en el texto y los
   * volcamos en los controles: así se descubren usándolos, sin tener que
   * conocerlos de antemano.
   */
  const onTitleChange = (value: string): void => {
    if (!value.endsWith(" ")) {
      setTitle(value);
      return;
    }
    const parsed = parseQuickAdd(value, projects);
    const consumed =
      parsed.title !== value.trim() && (parsed.project !== null || parsed.dueDate !== null || parsed.priority !== 0);
    if (!consumed) {
      setTitle(value);
      return;
    }
    setTitle(parsed.title + " ");
    if (parsed.project) setProjectId(parsed.project.id);
    if (parsed.dueDate) setDueDate(parsed.dueDate);
    if (parsed.priority) setPriority(parsed.priority);
  };

  const save = async (): Promise<void> => {
    const clean = title.trim();
    if (!clean) return;

    if (isEdit && task) {
      const patch: Record<string, unknown> = {};
      if (clean !== task.title) patch.title = clean;
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
      return;
    }

    const url = projectId ? `/api/projects/${projectId}/tasks` : "/api/inbox/tasks";
    const created = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean, notes: notes.trim() || null, dueDate: dueDate || null, priority }),
    }).then((r) => r.json() as Promise<TaskItem>);
    // el alta siempre entra como "pendiente": si pedían otro estado, se mueve
    if (status !== "todo" && created?.id) {
      await fetch(`/api/tasks/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    }
    const dest = projects.find((p) => p.id === projectId)?.name ?? "Sin proyecto";
    push({ level: "success", message: `Tarea creada en ${dest}` });
    onSaved();
    onClose();
  };

  const remove = async (): Promise<void> => {
    if (!task) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    push({ level: "info", message: "Tarea eliminada" });
    onSaved();
    onClose();
  };

  const dates = quickDates();
  const externalSource = task && (task.source === "jira" || task.source === "planner");

  return (
    <AnimatePresence>
      {state && (
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
            className="glass-raised max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">{isEdit ? "Editar tarea" : "Nueva tarea"}</h2>
              <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:text-white" title="Cerrar (Esc)">
                <Icon name="close" size={15} />
              </button>
            </div>

            <label className="mt-4 block text-xs text-slate-300">¿Qué hay que hacer?</label>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              autoFocus
              placeholder={TITLE_PLACEHOLDER}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />

            <label className="mt-4 block text-xs text-slate-300">¿En qué proyecto?</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 focus:outline-none"
            >
              <option value="" className="bg-slate-900">
                Sin proyecto
              </option>
              {projects.map((p: Project) => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {p.name}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-xs text-slate-300">¿Para cuándo?</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <ChipButton active={!dueDate} onClick={() => setDueDate("")}>
                Sin fecha
              </ChipButton>
              {dates.map((d) => (
                <ChipButton key={d.label} active={dueDate === d.value} onClick={() => setDueDate(d.value)}>
                  {d.label}
                </ChipButton>
              ))}
              <ChipButton
                active={Boolean(dueDate) && !dates.some((d) => d.value === dueDate)}
                onClick={() => setShowDatePicker((s) => !s)}
              >
                <Icon name="calendar" size={12} />
                Otra fecha
              </ChipButton>
            </div>
            {(showDatePicker || (dueDate && !dates.some((d) => d.value === dueDate))) && (
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-200 focus:outline-none [color-scheme:dark]"
              />
            )}

            <label className="mt-4 block text-xs text-slate-300">¿Qué prioridad tiene?</label>
            <div className="mt-1.5 flex gap-1.5">
              {PRIORITIES.map((label, i) => (
                <ChipButton key={label} active={priority === i} onClick={() => setPriority(i)} className="flex-1">
                  {label}
                </ChipButton>
              ))}
            </div>

            {isEdit && (
              <>
                <label className="mt-4 block text-xs text-slate-300">Estado</label>
                <div className="mt-1.5 flex gap-1.5">
                  {STATUSES.map((s) => (
                    <ChipButton key={s.id} active={status === s.id} onClick={() => setStatus(s.id)} className="flex-1">
                      {s.label}
                    </ChipButton>
                  ))}
                </div>
              </>
            )}

            <label className="mt-4 block text-xs text-slate-300">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexto, enlaces, pasos…"
              className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />

            {externalSource && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-500/10 p-2.5 text-[11px] leading-relaxed text-sky-200/90">
                <Icon name={task.source === "jira" ? "jira" : "planner"} size={13} className="mt-px shrink-0" />
                Esta tarea viene de {task.source === "jira" ? "Jira" : "Planner"}: al marcarla como hecha, Nebula la
                cerrará también allí.
              </p>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              Atajo: escribe <code className="text-slate-500">@proyecto</code>,{" "}
              <code className="text-slate-500">!alta</code> o <code className="text-slate-500">^viernes</code> en el
              título y se rellenan solos.
            </p>

            <div className="mt-5 flex items-center justify-between">
              {isEdit ? (
                <button
                  onClick={() => void remove()}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-300"
                >
                  <Icon name="trash" size={13} />
                  Eliminar
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                  Cancelar
                </button>
                <button
                  onClick={() => void save()}
                  disabled={!title.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-accent/30 px-4 py-1.5 text-xs text-white transition-colors hover:bg-accent/45 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {!isEdit && <Icon name="plus" size={13} />}
                  {isEdit ? "Guardar" : "Crear tarea"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChipButton({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
        active ? "bg-accent/30 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}
