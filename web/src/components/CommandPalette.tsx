import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNebula } from "../stores/nebula";

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
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { projects, rescan } = useNebula();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setSelected(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);

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
      { id: "home", label: "Ir a la galaxia", hint: "inicio", run: close(() => navigate("/")) },
      { id: "rescan", label: "Re-escanear proyectos", hint: "acción", run: close(() => void rescan()) },
      { id: "settings", label: "Ajustes", hint: "configuración", run: close(onOpenSettings) },
    ];
  }, [projects, navigate, rescan, onOpenSettings]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
  }, [commands, query]);

  const runSelected = (): void => filtered[Math.min(selected, filtered.length - 1)]?.run();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: -8 }}
            className="glass w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
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
              className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none"
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
