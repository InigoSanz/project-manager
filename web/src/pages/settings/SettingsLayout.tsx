import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { NebulaConfig } from "@nebula/shared";
import { useNebula } from "../../stores/nebula";
import { Icon, type IconName } from "../../components/Icon";

export const SETTINGS_SECTIONS: Array<{ id: string; label: string; icon: IconName; hint: string }> = [
  { id: "general", label: "General", icon: "settings", hint: "Carpetas y escaneo" },
  { id: "sincronizacion", label: "Sincronización", icon: "sync", hint: "Jira y Planner" },
  { id: "notificaciones", label: "Notificaciones", icon: "bell", hint: "Avisos de Windows" },
  { id: "acceso", label: "Dispositivos", icon: "device", hint: "Acceso desde el móvil" },
];

export interface SettingsContext {
  config: NebulaConfig;
  patch: (partial: Partial<NebulaConfig>, opts?: { rescan?: boolean }) => void;
}

/** Acceso al borrador de configuración desde cada página de ajustes. */
export function useSettings(): SettingsContext {
  return useOutletContext<SettingsContext>();
}

/**
 * Tarjeta de ajustes. Impone un ritmo vertical único: cada hijo directo es una
 * fila separada por un hairline, así ninguna sección inventa su propio
 * espaciado (era la causa de que unas respiraran más que otras).
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5 max-sm:p-4">
      <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{title}</h2>
      <div className="mt-1 divide-y divide-white/5 [&>*]:py-3 [&>*:first-child]:pt-2 [&>*:last-child]:pb-0">
        {children}
      </div>
    </section>
  );
}

/**
 * Ajustes como páginas reales: el menú lateral navega entre rutas
 * (`/ajustes/general`, `/ajustes/sincronizacion`…) en vez de hacer scroll a un
 * ancla, así se ve una sección cada vez y se puede enlazar directamente.
 */
export function SettingsLayout() {
  const { config, loadConfig, rescan } = useNebula();
  const [local, setLocal] = useState<NebulaConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config && !local) setLocal(config);
  }, [config, local]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  /** Aplica un cambio local y lo guarda con debounce (guardado al cambiar). */
  const patch = (partial: Partial<NebulaConfig>, opts: { rescan?: boolean } = {}): void => {
    setLocal((prev) => (prev ? { ...prev, ...partial } : prev));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setLocal((current) => {
        if (current) {
          void fetch("/api/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(current),
          }).then(() => {
            // indicador inline en vez de toast: guardar es lo normal aquí
            setSaved(true);
            if (savedTimer.current) clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSaved(false), 2000);
            if (opts.rescan) void rescan();
          });
        }
        return current;
      });
    }, 400);
  };

  if (!local) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando ajustes…</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl gap-6 p-6 max-sm:flex-col max-sm:gap-4 max-sm:p-4">
        <nav className="sticky top-6 h-fit w-52 shrink-0 max-sm:static max-sm:w-full">
          <Link to="/" className="mb-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
            <Icon name="arrowLeft" size={13} />
            Volver al mapa
          </Link>
          <h1 className="mb-2 font-display text-xl font-bold text-white max-sm:mb-3">Ajustes</h1>
          <div className="space-y-1 max-sm:flex max-sm:gap-1.5 max-sm:space-y-0 max-sm:overflow-x-auto max-sm:pb-1">
            {SETTINGS_SECTIONS.map((s) => (
              <NavLink
                key={s.id}
                to={`/ajustes/${s.id}`}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-accent/25 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon name={s.icon} size={15} />
                {s.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1 space-y-5 pb-10">
          <div className="flex h-5 items-center justify-end">
            <AnimatePresence>
              {saved && (
                <motion.span
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs text-emerald-300"
                >
                  <Icon name="check" size={13} />
                  Guardado
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <Outlet context={{ config: local, patch } satisfies SettingsContext} />
        </div>
      </div>
    </div>
  );
}
