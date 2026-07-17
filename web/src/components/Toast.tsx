import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";

export interface ToastItem {
  id: number;
  level: "success" | "error" | "info";
  message: string;
  link?: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    // los errores se quedan más tiempo: hay que poder leerlos
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.level === "error" ? 10000 : 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

const STYLE: Record<ToastItem["level"], string> = {
  success: "border-emerald-400/40 text-emerald-200",
  error: "border-rose-400/40 text-rose-200",
  info: "border-sky-400/40 text-sky-200",
};

export function ToastStack() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[80] flex w-96 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className={`glass pointer-events-auto rounded-xl border-l-2 p-3 text-sm shadow-xl ${STYLE[t.level]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-line">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="shrink-0 text-slate-500 hover:text-white">
                ✕
              </button>
            </div>
            {t.link && (
              <a href={t.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline opacity-80 hover:opacity-100">
                Abrir ↗
              </a>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
