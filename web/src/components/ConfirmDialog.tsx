import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon, type IconName } from "./Icon";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** icono opcional en un círculo sobre el título */
  icon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación con el mismo lenguaje visual que el resto de modales
 * (`glass-raised`, backdrop con blur, animación). Sustituye a `window.confirm`
 * para decisiones puntuales. Enter confirma, Esc y clic fuera cancelan.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Aceptar",
  cancelLabel = "Cancelar",
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[72] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            role="dialog"
            aria-modal="true"
            className="glass-raised w-full max-w-sm rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {icon && (
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-200">
                <Icon name={icon} size={18} />
              </div>
            )}
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <div className="mt-2 text-sm leading-relaxed text-slate-400">{message}</div>
            <div className="mt-5 flex justify-center gap-2">
              <button
                onClick={onCancel}
                className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className="rounded-lg bg-indigo-500/30 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-500/45"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
