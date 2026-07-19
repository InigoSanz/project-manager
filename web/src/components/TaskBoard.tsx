import { useEffect, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project, TaskItem, TaskStatus } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { TaskMetaBadges, TaskMetaEditor } from "./TaskMeta";
import { QuickAddInput } from "./QuickAddInput";
import { TaskDialog, type TaskDialogState } from "./TaskDialog";
import { Icon } from "./Icon";

/** Orden de columna: vencidas primero, luego fecha asc, prioridad desc, resto. */
function sortColumn(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

const COLUMNS: Array<{ id: TaskStatus; label: string; accent: string }> = [
  { id: "todo", label: "Pendiente", accent: "border-t-sky-400/60" },
  { id: "doing", label: "En curso", accent: "border-t-amber-400/60" },
  { id: "done", label: "Hecho", accent: "border-t-emerald-400/60" },
];

async function patchTask(id: string, patch: Partial<TaskItem>): Promise<void> {
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function ExternalBadge({ task }: { task: TaskItem }) {
  const jiraBase = useNebula((s) => s.config?.integrations?.jira?.baseUrl);
  if (task.source === "jira" && task.sourceRef) {
    const href = jiraBase ? `${jiraBase.replace(/\/+$/, "")}/browse/${task.sourceRef}` : undefined;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-500/25"
        title="Abrir en Jira"
      >
        ◆ {task.sourceRef} ↗
      </a>
    );
  }
  if (task.source === "planner") {
    return (
      <a
        // enlace profundo a la tarea concreta cuando sabemos su id
        href={task.sourceRef ? `https://tasks.office.com/Home/Task/${task.sourceRef}` : "https://tasks.office.com"}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-blue-500/25"
        title="Abrir en Planner"
      >
        ▦ Planner ↗
      </a>
    );
  }
  if (task.source === "agent") {
    return (
      <span className="mt-2 inline-block rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
        ✳ derivada de sesión IA
      </span>
    );
  }
  return null;
}

const FLOW: TaskStatus[] = ["todo", "doing", "done"];

function TaskCard({
  task,
  onDelete,
  onMove,
  onMetaSaved,
  onEdit,
}: {
  task: TaskItem;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
  onMetaSaved: () => void;
  onEdit: () => void;
}) {
  const idx = FLOW.indexOf(task.status);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStartCapture={(e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData("text/task-id", task.id);
      }}
      className="glass group cursor-grab rounded-xl p-3 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        {task.status !== "done" && (
          <button
            onClick={() => onMove("done")}
            title="Completar"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] text-transparent transition-colors hover:border-emerald-400 hover:text-emerald-400"
          >
            ✓
          </button>
        )}
        <button
          onClick={onEdit}
          title="Editar tarea"
          className={`min-w-0 flex-1 text-left text-sm hover:text-white ${
            task.status === "done" ? "text-slate-500 line-through" : "text-slate-100"
          }`}
        >
          {task.title}
        </button>
        <button
          onClick={onDelete}
          className="shrink-0 p-1 text-slate-500 opacity-45 transition-opacity group-hover:opacity-100 hover:text-rose-400 pointer-coarse:opacity-100"
          title="Eliminar"
        >
          ✕
        </button>
      </div>
      {task.notes && <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-slate-400">{task.notes}</p>}
      <div className="flex items-end justify-between">
        <div className="min-w-0">
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TaskMetaBadges task={task} />
            <TaskMetaEditor task={task} onSaved={onMetaSaved} />
          </div>
          <ExternalBadge task={task} />
          {task.externalMeta?.syncError && (
            <span className="mt-2 ml-1 inline-block text-[10px] text-amber-400/90" title={task.externalMeta.syncError}>
              ⚠ no sincronizada
            </span>
          )}
        </div>
        {idx >= 0 && (
          <div className="flex shrink-0 gap-1 opacity-45 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
            {idx > 0 && (
              <button onClick={() => onMove(FLOW[idx - 1])} title="Mover atrás" className="rounded bg-white/5 px-1.5 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white pointer-coarse:px-2.5">
                ‹
              </button>
            )}
            {idx < FLOW.length - 1 && (
              <button onClick={() => onMove(FLOW[idx + 1])} title="Mover adelante" className="rounded bg-white/5 px-1.5 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white pointer-coarse:px-2.5">
                ›
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function JiraKeyControl({ project }: { project: Project }) {
  const jiraConfigured = useNebula((s) => Boolean(s.config?.integrations?.jira?.baseUrl));
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.jiraKey ?? "");
  if (!jiraConfigured) return null;

  const save = async (key: string | null): Promise<void> => {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraKey: key }),
    });
    setEditing(false);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Proyecto Jira:</span>
      {editing ? (
        <>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="PROJ"
            className="glass w-24 rounded-md px-2 py-1 font-mono text-xs text-white focus:outline-none"
            autoFocus
          />
          <button onClick={() => void save(value.trim() || null)} className="rounded-md bg-indigo-500/25 px-2 py-1 text-white hover:bg-indigo-500/40">
            Guardar
          </button>
          <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-white">
            Cancelar
          </button>
        </>
      ) : project.jiraKey ? (
        <>
          <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-mono text-sky-300">◆ {project.jiraKey}</span>
          <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-white">
            cambiar
          </button>
          <button onClick={() => void save(null)} className="text-slate-500 hover:text-rose-300">
            quitar
          </button>
        </>
      ) : project.jiraKeySuggestion ? (
        <>
          <span className="text-slate-400">
            detectado <code className="font-mono text-sky-300">{project.jiraKeySuggestion}</code> en ramas/commits
          </span>
          <button
            onClick={() => void save(project.jiraKeySuggestion)}
            className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-300 hover:bg-emerald-500/25"
          >
            Asociar
          </button>
          <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-white">
            otra clave…
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-white">
          asociar clave…
        </button>
      )}
    </div>
  );
}

export function TaskBoard({ project }: { project: Project }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [dialog, setDialog] = useState<TaskDialogState | null>(null);
  const version = useNebula((s) => s.tasksVersion[project.id] ?? 0);

  const refetch = (): void => {
    void fetch(`/api/projects/${project.id}/tasks`)
      .then((r) => r.json())
      .then((t: TaskItem[]) => setTasks(t))
      .catch(() => {});
  };

  useEffect(() => {
    let alive = true;
    // pequeño debounce: no pisar el estado optimista en mitad de un drag
    const timer = setTimeout(() => {
      void fetch(`/api/projects/${project.id}/tasks`)
        .then((r) => r.json())
        .then((t: TaskItem[]) => alive && setTasks(t))
        .catch(() => {});
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [project.id, version]);

  const suggested = tasks.filter((t) => t.status === "suggested");

  const move = async (taskId: string, status: TaskStatus): Promise<void> => {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await patchTask(taskId, { status });
  };

  const remove = async (taskId: string): Promise<void> => {
    setTasks((ts) => ts.filter((t) => t.id !== taskId));
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-1">
      {/* Bandeja de sugeridas */}
      <AnimatePresence>
        {suggested.length > 0 && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass shrink-0 rounded-xl border-l-2 border-l-indigo-400/70 p-3"
          >
            <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wider text-indigo-300 uppercase">
              <Icon name="ai" size={13} />
              Sugeridas por tus sesiones de IA
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              Salen de lo que hicieron Claude, Codex o Cursor en este repo. Acéptalas para convertirlas en tareas o
              descártalas: en ningún caso se toca el código.
            </p>
            <ul className="space-y-2">
              {suggested.map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-200" title={t.title}>
                    {t.title}
                  </p>
                  <button
                    onClick={() => void move(t.id, "todo")}
                    className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() => void move(t.id, "dismissed")}
                    className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10"
                  >
                    Descartar
                  </button>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Asociación con Jira (solo si Jira está configurado) */}
      <JiraKeyControl project={project} />

      {/* Alta rápida con tokens (misma sintaxis que Hoy y la paleta) */}
      <QuickAddInput fixedProject={project} onCreated={refetch} withButton placeholder="Nueva tarea…  (!alta ^vie)" />

      {/* Kanban: 3 columnas en ≥sm; scroll horizontal con snap en móvil */}
      <div className="min-h-0 flex-1 gap-3 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto sm:grid sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = sortColumn(tasks.filter((t) => t.status === col.id));
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/task-id");
                if (id) void move(id, col.id);
              }}
              className={`glass flex min-h-0 flex-col rounded-xl border-t-2 p-3 max-sm:w-[85vw] max-sm:shrink-0 max-sm:snap-center ${col.accent} ${
                dragOver === col.id ? "ring-1 ring-indigo-400/60" : ""
              }`}
            >
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold tracking-wider text-slate-400 uppercase">
                {col.label}
                <span className="text-slate-600">{items.length}</span>
              </h3>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                <AnimatePresence>
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onDelete={() => void remove(t.id)}
                      onMove={(s) => void move(t.id, s)}
                      onMetaSaved={refetch}
                      onEdit={() => setDialog({ mode: "edit", task: t })}
                    />
                  ))}
                </AnimatePresence>
                {items.length === 0 && (
                  <p className="mt-4 text-center text-xs text-slate-600">Sin tareas aquí</p>
                )}
              </div>
              {/* alta directa en la columna que estás mirando */}
              <button
                onClick={() => setDialog({ mode: "create", defaults: { projectId: project.id, status: col.id } })}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 py-2 text-[11px] text-slate-500 transition-colors hover:border-white/25 hover:text-white"
              >
                <Icon name="plus" size={12} />
                Añadir aquí
              </button>
            </div>
          );
        })}
      </div>

      <TaskDialog state={dialog} onClose={() => setDialog(null)} onSaved={refetch} />
    </div>
  );
}
