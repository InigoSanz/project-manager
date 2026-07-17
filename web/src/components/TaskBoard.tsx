import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project, TaskItem, TaskStatus } from "@nebula/shared";
import { useNebula } from "../stores/nebula";

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
        href="https://tasks.office.com"
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-blue-500/25"
        title="Abrir Planner"
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

function TaskCard({ task, onDelete }: { task: TaskItem; onDelete: () => void }) {
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
      className="glass group cursor-grab rounded-lg p-3 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-100">{task.title}</p>
        <button
          onClick={onDelete}
          className="hidden shrink-0 text-slate-500 hover:text-rose-400 group-hover:block"
          title="Eliminar"
        >
          ✕
        </button>
      </div>
      {task.notes && <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-slate-400">{task.notes}</p>}
      <ExternalBadge task={task} />
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
  const [newTitle, setNewTitle] = useState("");
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const version = useNebula((s) => s.tasksVersion[project.id] ?? 0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${project.id}/tasks`)
      .then((r) => r.json())
      .then((t: TaskItem[]) => alive && setTasks(t))
      .catch(() => {});
    return () => {
      alive = false;
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

  const createTask = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    await fetch(`/api/projects/${project.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
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
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-indigo-300 uppercase">
              ✳ Sugeridas por tus sesiones de IA
            </h3>
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

      {/* Alta rápida */}
      <form onSubmit={(e) => void createTask(e)} className="flex shrink-0 gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nueva tarea…"
          className="glass flex-1 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-indigo-400/60 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-500/25 px-4 text-sm text-white transition-colors hover:bg-indigo-500/40"
        >
          Añadir
        </button>
      </form>

      {/* Kanban */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
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
              className={`glass flex min-h-0 flex-col rounded-xl border-t-2 p-3 ${col.accent} ${
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
                    <TaskCard key={t.id} task={t} onDelete={() => void remove(t.id)} />
                  ))}
                </AnimatePresence>
                {items.length === 0 && (
                  <p className="mt-4 text-center text-xs text-slate-600">Arrastra tareas aquí</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
