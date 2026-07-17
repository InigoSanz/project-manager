import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { TodayData, TodayTask } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "./Toast";
import { parseQuickAdd, submitQuickAdd } from "../lib/quickAdd";

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  jira: { label: "◆ Jira", cls: "bg-sky-500/15 text-sky-300" },
  planner: { label: "▦ Planner", cls: "bg-blue-500/15 text-blue-300" },
  agent: { label: "✳ IA", cls: "bg-indigo-500/15 text-indigo-300" },
};

const AGENT_ICON: Record<string, string> = { claude: "✳", codex: "⌁", cursor: "▮", gemini: "✦", antigravity: "◒" };

function TaskRow({ task, onChanged }: { task: TodayTask; onChanged: () => void }) {
  const [done, setDone] = useState(false);
  const badge = SOURCE_BADGE[task.source];

  const complete = async (): Promise<void> => {
    setDone(true);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setTimeout(onChanged, 350); // deja ver la animación del check
  };

  return (
    <motion.li layout exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-2.5 py-1.5">
      <button
        onClick={() => void complete()}
        title="Completar"
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-all ${
          done
            ? "scale-110 border-emerald-400 bg-emerald-400/20 text-emerald-300"
            : "border-slate-600 text-transparent hover:border-emerald-400 hover:text-emerald-400/60"
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${done ? "text-slate-500 line-through" : "text-slate-200"}`} title={task.title}>
          {task.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[10px]">
          {task.projectName && (
            <Link to={`/project/${task.projectId}`} className="text-slate-500 hover:text-indigo-300">
              {task.projectName}
            </Link>
          )}
          {badge && <span className={`rounded px-1 py-px ${badge.cls}`}>{badge.label}</span>}
          {task.externalMeta?.syncError && (
            <span className="text-amber-400/80" title={task.externalMeta.syncError}>
              ⚠ no sincronizada
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function InboxRow({ task, onChanged }: { task: TodayTask; onChanged: () => void }) {
  // ojo: seleccionar el array estable y filtrar aquí — un selector que crea
  // un array nuevo por snapshot provoca un bucle de renders (React #185)
  const allProjects = useNebula((s) => s.projects);
  const projects = allProjects.filter((p) => p.present);
  const assign = async (projectId: string): Promise<void> => {
    if (!projectId) return;
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    onChanged();
  };
  const badge = SOURCE_BADGE[task.source];
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-200" title={task.title}>
          {task.title}
        </p>
        {badge && <span className={`mt-0.5 inline-block rounded px-1 py-px text-[10px] ${badge.cls}`}>{badge.label}</span>}
      </div>
      <select
        defaultValue=""
        onChange={(e) => void assign(e.target.value)}
        className="glass shrink-0 rounded-md px-1.5 py-1 text-[11px] text-slate-300 focus:outline-none"
        title="Asignar a un proyecto"
      >
        <option value="" disabled>
          asignar a…
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id} className="bg-slate-900">
            {p.name}
          </option>
        ))}
      </select>
    </li>
  );
}

function Section({ title, count, children, hint }: { title: string; count?: number; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="flex items-baseline gap-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
        {title}
        {count !== undefined && <span className="text-slate-600">{count}</span>}
      </h3>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : <div className="mt-1">{children}</div>}
    </section>
  );
}

export function TodayPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<TodayData | null>(null);
  const projects = useNebula((s) => s.projects);
  const tasksVersion = useNebula((s) => s.tasksVersion);
  const push = useToasts((s) => s.push);
  const [text, setText] = useState("");

  const refresh = async (): Promise<void> => {
    try {
      setData((await (await fetch("/api/today")).json()) as TodayData);
    } catch {
      /* daemon reiniciando */
    }
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open, tasksVersion]);

  const parse = useMemo(() => parseQuickAdd(text, projects), [text, projects]);

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!parse.title) return;
    setText("");
    const dest = await submitQuickAdd(parse);
    push({ level: "success", message: `Tarea creada en ${dest}` });
    void refresh();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="glass fixed top-0 right-0 bottom-0 z-50 flex w-[420px] max-w-full flex-col border-l border-white/10 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">◔ Hoy</h2>
              <button onClick={onClose} className="text-slate-500 hover:text-white" title="Cerrar (Esc o T)">
                ✕
              </button>
            </div>

            {/* Añadir rápido */}
            <form onSubmit={(e) => void add(e)} className="mt-3 shrink-0">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Añade una tarea…  (usa @proyecto)"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-indigo-400/60 focus:outline-none"
              />
              {text.trim() && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {parse.unknownMention
                    ? `@${parse.unknownMention} no casa con ningún proyecto — irá a tu bandeja personal`
                    : `→ ${parse.project?.name ?? "tu bandeja personal"} · Enter para crear`}
                </p>
              )}
            </form>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {!data ? (
                <p className="mt-6 text-center text-sm text-slate-500">Cargando…</p>
              ) : (
                <>
                  <Section title="En curso" count={data.doing.length} hint={data.doing.length === 0 ? "Nada en curso — empieza algo de «Siguiente» o acepta una sugerida." : undefined}>
                    <ul>
                      <AnimatePresence>
                        {data.doing.map((t) => (
                          <TaskRow key={t.id} task={t} onChanged={() => void refresh()} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </Section>

                  {data.attention.length > 0 && (
                    <Section title="Atención git" count={data.attention.length}>
                      <ul>
                        {data.attention.map((a) => (
                          <li key={a.projectId} className="py-1">
                            <Link to={`/project/${a.projectId}`} onClick={onClose} className="group flex items-baseline gap-2 text-sm">
                              <span className="text-amber-300/90">▲</span>
                              <span className="text-slate-200 group-hover:text-white">{a.name}</span>
                              <span className="truncate text-[11px] text-slate-500">{a.reasons.join(" · ")}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {data.live.length > 0 && (
                    <Section title="Agentes ahora" count={data.live.length}>
                      <ul>
                        {data.live.map((l, i) => (
                          <li key={i} className="py-1">
                            <Link to={`/project/${l.projectId}`} onClick={onClose} className="flex items-baseline gap-2 text-sm">
                              <span className="animate-pulse text-emerald-400">●</span>
                              <span className="text-slate-200">
                                {AGENT_ICON[l.agent] ?? "•"} {l.agent}
                              </span>
                              <span className="text-slate-500">en {l.projectName}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {data.suggested.length > 0 && (
                    <Section title="Sugeridas por IA" count={data.suggested.length}>
                      <ul>
                        {data.suggested.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 py-1.5">
                            <p className="min-w-0 flex-1 truncate text-sm text-slate-300" title={t.title}>
                              {t.title}
                              {t.projectName && <span className="ml-1.5 text-[10px] text-slate-500">{t.projectName}</span>}
                            </p>
                            <button
                              onClick={() =>
                                void fetch(`/api/tasks/${t.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "todo" }),
                                }).then(() => refresh())
                              }
                              className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/25"
                            >
                              Aceptar
                            </button>
                            <button
                              onClick={() =>
                                void fetch(`/api/tasks/${t.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "dismissed" }),
                                }).then(() => refresh())
                              }
                              className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-white/10"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section title="Siguiente" count={data.todo.length} hint={data.todo.length === 0 ? "Todo hecho por aquí. Añade algo arriba o revisa tus proyectos." : undefined}>
                    <ul>
                      <AnimatePresence>
                        {data.todo.map((t) => (
                          <TaskRow key={t.id} task={t} onChanged={() => void refresh()} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </Section>

                  {data.inbox.length > 0 && (
                    <Section title="Sin proyecto" count={data.inbox.length}>
                      <p className="mb-1 text-[11px] text-slate-600">Issues y tareas que no casan con ningún repo. Asígnalas o complétalas aquí.</p>
                      <ul>
                        {data.inbox.map((t) => (
                          <InboxRow key={t.id} task={t} onChanged={() => void refresh()} />
                        ))}
                      </ul>
                    </Section>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
