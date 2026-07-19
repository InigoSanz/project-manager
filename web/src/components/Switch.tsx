import { Children, cloneElement, isValidElement } from "react";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-indigo-500/70" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}

/** Fila de ajuste: título + descripción a la izquierda, control a la derecha. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  // el ritmo vertical (py) lo aporta el contenedor Section de Ajustes.
  // El título se propaga a los Switch hijos como aria-label: sin esto un
  // lector de pantalla anuncia todos los interruptores sin nombre.
  const labelled = Children.map(children, (child) =>
    isValidElement<{ label?: string }>(child) && child.type === Switch && !child.props.label
      ? cloneElement(child, { label: title })
      : child,
  );
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-slate-200">{title}</p>
        {description && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{labelled}</div>
    </div>
  );
}
