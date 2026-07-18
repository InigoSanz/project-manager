import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { TodayTask } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "./Toast";
import { parseQuickAdd, submitQuickAdd } from "../lib/quickAdd";

const STATUS_ICON: Record<string, string> = { todo: "○", doing: "◐", done: "✓", suggested: "✳" };

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [taskResults, setTaskResults] = useState<TodayTask[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { projects, rescan } = useNebula();
  const pushToast = useToasts((s) => s.push);

  useEffect(() => {
    const openFresh = (): void => {
      setOpen((o) => !o);
      setQuery("");
      setSelected(0);
    };
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openFresh();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpenEvent = (): void => openFresh();
    window.addEventListener("keydown", onKey);
    window.addEventListener("nebula:open-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nebula:open-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);

  // búsqueda de tareas con debounce
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 3) {
      setTaskResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void fetch(`/api/search/tasks?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((t: TodayTask[]) => setTaskResults(t))
        .catch(() => setTaskResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  const commands = useMemo<Command[]>(() => {
    const close = (fn: () => void) => () => {
      fn();
      setOpen(false);
    };
    return [
      ...projects
        .filter((p) => p.present)
        .map((p) => ({
          id: `p:${p.id}`,
          label: p.name,
          hint: p.path,
          run: close(() => navigate(`/project/${p.id}`)),
        })),
      { id: "today", label: "Abrir Hoy", hint: "tecla T", run: close(() => window.dispatchEvent(new Event("nebula:open-today"))) },
      { id: "home", label: "Ir al mapa", hint: "inicio", run: close(() => navigate("/")) },
      { id: "rescan", label: "Re-escanear proyectos", hint: "acción", run: close(() => void rescan()) },
      { id: "settings", label: "Ajustes", hint: "configuración", run: close(onOpenSettings) },
    ];
  }, [projects, navigate, rescan, onOpenSettings]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const base = !q
      ? [...commands]
      : commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
    // resultados de tareas encontradas
    for (const t of taskResults) {
      base.push({
        id: `task:${t.id}`,
        label: `${STATUS_ICON[t.status] ?? "○"} ${t.title}`,
        hint: t.projectName ?? "sin proyecto",
        run: () => {
          setOpen(false);
          if (t.projectName) {
            navigate(`/project/${t.projectId}?tab=tareas`);
          } else {
            window.dispatchEvent(new Event("nebula:open-today"));
          }
        },
      });
    }
    // texto libre → ofrecer crear tarea (con soporte @proyecto !prio ^fecha)
    if (q.length >= 3) {
      const parse = parseQuickAdd(query.trim(), projects);
      if (parse.title) {
        base.push({
          id: "quick-add",
          label: `➕ Crear tarea: «${parse.title}»`,
          hint: `en ${parse.project?.name ?? "Sin proyecto"}`,
          run: () => {
            void submitQuickAdd(parse).then((dest) =>
              pushToast({ level: "success", message: `Tarea creada en ${dest}` }),
            );
            setOpen(false);
          },
        });
      }
    }
    return base;
  }, [commands, query, projects, pushToast, taskResults, navigate]);

  const runSelected = (): void => filtered[Math.min(selected, filtered.length - 1)]?.run();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-start justify-center bg-black/50 p-4 pt-[18vh] backdrop-blur-sm max-sm:pt-[8dvh]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: -8 }}
            className="glass-raised w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelected((s) => Math.min(s + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelected((s) => Math.max(s - 1, 0));
                } else if (e.key === "Enter") {
                  runSelected();
                }
              }}
              placeholder="Saltar a proyecto, ejecutar acción…"
              className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none max-sm:text-base"
            />
            <ul className="max-h-72 overflow-y-auto p-1.5">
              {filtered.map((c, i) => (
                <li key={c.id}>
                  <button
                    onMouseEnter={() => setSelected(i)}
                    onClick={c.run}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                      i === selected ? "bg-indigo-500/25 text-white" : "text-slate-300"
                    }`}
                  >
                    <span className="truncate">{c.label}</span>
                    {c.hint && <span className="max-w-[45%] truncate text-[10px] text-slate-500">{c.hint}</span>}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">Sin resultados</li>}
            </ul>
            <div className="border-t border-white/10 px-4 py-1.5 text-[10px] text-slate-600">
              ↑↓ navegar · Enter abrir · Esc cerrar
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
