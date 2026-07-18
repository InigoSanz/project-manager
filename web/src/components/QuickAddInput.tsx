import { useMemo, useState, type FormEvent } from "react";
import type { Project } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "./Toast";
import { describeParse, parseQuickAdd, submitQuickAdd } from "../lib/quickAdd";

/**
 * Alta rápida unificada de tareas con la sintaxis de tokens
 * (`@proyecto !alta ^vie`). Con `fixedProject` el destino queda fijado
 * (las @menciones se ignoran) pero prioridad y fecha siguen funcionando.
 */
export function QuickAddInput({
  fixedProject,
  onCreated,
  placeholder,
  withButton = false,
  autoFocus = false,
}: {
  fixedProject?: Project;
  onCreated?: () => void;
  placeholder?: string;
  /** muestra el botón "Añadir" al lado (estilo tablero) */
  withButton?: boolean;
  autoFocus?: boolean;
}) {
  const projects = useNebula((s) => s.projects);
  const push = useToasts((s) => s.push);
  const [text, setText] = useState("");

  const parse = useMemo(() => {
    const p = parseQuickAdd(text, projects);
    return fixedProject ? { ...p, project: fixedProject, unknownMention: null } : p;
  }, [text, projects, fixedProject]);

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!parse.title) return;
    setText("");
    const dest = await submitQuickAdd(parse);
    push({ level: "success", message: `Tarea creada en ${dest}` });
    onCreated?.();
  };

  const hint = fixedProject
    ? "!alta/!media/!baja · ^hoy ^mañana ^vie ^25/07"
    : "@proyecto · !alta/!media/!baja · ^hoy ^mañana ^vie ^25/07";

  return (
    <form onSubmit={(e) => void add(e)} className="shrink-0">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
          placeholder={placeholder ?? "Añade una tarea…  (usa @proyecto)"}
          className="glass w-full flex-1 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-accent/60 focus:outline-none max-sm:text-base"
        />
        {withButton && (
          <button
            type="submit"
            className="rounded-lg bg-indigo-500/25 px-4 text-sm text-white transition-colors hover:bg-indigo-500/40"
          >
            Añadir
          </button>
        )}
      </div>
      {text.trim() ? (
        <p className="mt-1 text-[11px] text-slate-500">
          {parse.unknownMention
            ? `@${parse.unknownMention} no casa con ningún proyecto — irá a tu bandeja personal`
            : `→ ${describeParse(parse)} · Enter para crear`}
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-slate-600">{hint}</p>
      )}
    </form>
  );
}
