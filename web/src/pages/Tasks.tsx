import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TaskItem, TaskStatus } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { Icon, type IconName } from "../components/Icon";
import { TaskMetaBadges } from "../components/TaskMeta";
import { TaskDialog, type TaskDialogState } from "../components/TaskDialog";

type Row = TaskItem & { projectName: string | null };

const STATUS_TABS: Array<{ id: string; label: string; statuses: TaskStatus[] }> = [
  { id: "abiertas", label: "Abiertas", statuses: ["todo", "doing"] },
  { id: "curso", label: "En curso", statuses: ["doing"] },
  { id: "sugeridas", label: "Sugeridas", statuses: ["suggested"] },
  { id: "hechas", label: "Hechas", statuses: ["done"] },
];

const SOURCE_ICON: Record<string, IconName> = {
  jira: "jira",
  planner: "planner",
  github: "github",
  agent: "ai",
  manual: "check",
};

/**
 * Todas las tareas de todos los orígenes en un solo sitio, con filtros.
 * Hasta ahora solo existían los subconjuntos recortados del panel Hoy.
 */
export function TasksPage() {
  const projects = useNebula((s) => s.projects);
  const tasksVersion = useNebula((s) => s.tasksVersion);
  const [tab, setTab] = useState(STATUS_TABS[0]);
  const [projectId, setProjectId] = useState("");
  const [source, setSource] = useState("");
  const [due, setDue] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ items: Row[]; total: number } | null>(null);
  const [dialog, setDialog] = useState<TaskDialogState | null>(null);

  const present = useMemo(() => projects.filter((p) => p.present), [projects]);

  const load = useMemo(
    () => async (): Promise<void> => {
      const params = new URLSearchParams({ status: tab.statuses.join(","), limit: "200" });
      if (projectId) params.set("projectId", projectId);
      if (source) params.set("source", source);
      if (due) params.set("due", due);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/tasks?${params}`);
      setData((await res.json()) as { items: Row[]; total: number });
    },
    [tab, projectId, source, due, q],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load, tasksVersion]);

  const complete = async (task: Row): Promise<void> => {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: task.status === "done" ? "todo" : "done" }),
    });
    void load();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-6 max-sm:p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Link to="/" className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
              <Icon name="arrowLeft" size={13} />
              Volver al mapa
            </Link>
            <h1 className="font-display text-2xl font-bold text-white">Tareas</h1>
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event("nebula:new-task"))}
            className="flex items-center gap-1.5 rounded-lg bg-accent/30 px-3 py-2 text-xs text-white hover:bg-accent/45"
          >
            <Icon name="plus" size={14} />
            Nueva tarea
          </button>
        </div>

        {/* Estados como pestañas: es la división que más se usa */}
        <nav className="mb-3 flex gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab.id === t.id ? "bg-accent/25 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="glass mb-4 flex flex-wrap items-center gap-2 rounded-xl p-2 text-xs">
          <div className="relative min-w-40 flex-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pr-2 pl-7 text-xs text-slate-200 placeholder:text-slate-600 focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />
            <Icon name="search" size={12} className="absolute top-2 left-2 text-slate-500" />
          </div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md bg-white/5 px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="" className="bg-slate-900">Todos los proyectos</option>
            {present.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-md bg-white/5 px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="" className="bg-slate-900">Cualquier origen</option>
            <option value="manual" className="bg-slate-900">Manuales</option>
            <option value="jira" className="bg-slate-900">Jira</option>
            <option value="planner" className="bg-slate-900">Planner</option>
            <option value="github" className="bg-slate-900">GitHub</option>
            <option value="agent" className="bg-slate-900">Sugeridas por IA</option>
          </select>
          <select
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-md bg-white/5 px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="" className="bg-slate-900">Cualquier fecha</option>
            <option value="overdue" className="bg-slate-900">Vencidas</option>
            <option value="today" className="bg-slate-900">Vencen hoy</option>
            <option value="week" className="bg-slate-900">Esta semana</option>
            <option value="none" className="bg-slate-900">Sin fecha</option>
          </select>
          {data && <span className="ml-auto text-slate-500">{data.total} tareas</span>}
        </div>

        {!data ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : data.items.length === 0 ? (
          <p className="glass rounded-xl p-6 text-center text-sm text-slate-500">
            No hay tareas que cumplan estos filtros.
          </p>
        ) : (
          <ul className="glass divide-y divide-white/5 rounded-xl">
            {data.items.map((t) => (
              <li key={t.id} className="flex items-start gap-3 p-3">
                <button
                  onClick={() => void complete(t)}
                  title={t.status === "done" ? "Reabrir" : "Completar"}
                  className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    t.status === "done"
                      ? "border-emerald-400 bg-emerald-400/20 text-emerald-300"
                      : "border-slate-600 text-transparent hover:border-emerald-400 hover:text-emerald-400/60"
                  }`}
                >
                  <Icon name="check" size={10} strokeWidth={2.2} />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setDialog({ mode: "edit", task: t })}
                    className={`block w-full truncate text-left text-sm hover:text-white ${
                      t.status === "done" ? "text-slate-500 line-through" : "text-slate-200"
                    }`}
                  >
                    {t.title}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    {t.projectName ? (
                      <Link to={`/project/${t.projectId}`} className="hover:text-accent">
                        {t.projectName}
                      </Link>
                    ) : (
                      <span>Sin proyecto</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Icon name={SOURCE_ICON[t.source] ?? "check"} size={10} />
                      {t.source}
                    </span>
                    <TaskMetaBadges task={t} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TaskDialog state={dialog} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
