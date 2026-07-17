import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { JiraConfig, NebulaConfig, NotificationEvents } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { useToasts } from "../components/Toast";
import { FolderPicker } from "../components/FolderPicker";
import { QrModal } from "../components/QrModal";
import { IntegrationsSettings } from "../components/IntegrationsSettings";
import { Switch, SettingRow } from "../components/Switch";

const SECTIONS = [
  { id: "general", label: "⚙ General" },
  { id: "sync", label: "⇄ Sincronización" },
  { id: "notificaciones", label: "🔔 Notificaciones" },
  { id: "acceso", label: "📱 Dispositivos y acceso" },
];

const DEFAULT_EVENTS: NotificationEvents = { newExternalTask: true, agentDone: true, dueDigest: true };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="glass scroll-mt-20 rounded-2xl p-5 max-sm:p-4">
      <h2 className="mb-2 text-sm font-semibold tracking-wider text-slate-300 uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { config, loadConfig, rescan } = useNebula();
  const push = useToasts((s) => s.push);
  const [local, setLocal] = useState<NebulaConfig | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jiraDraft = useRef<JiraConfig | undefined>(undefined);
  const jiraTouched = useRef(false);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config && !local) setLocal(config);
  }, [config, local]);

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
            push({ level: "info", message: "Guardado" });
            if (opts.rescan) void rescan();
          });
        }
        return current;
      });
    }, 400);
  };

  const saveJira = (): void => {
    if (!jiraTouched.current || !local) return;
    const integrations = { ...local.integrations, jira: jiraDraft.current };
    patch({ integrations });
    jiraTouched.current = false;
    void fetch("/api/jira/sync", { method: "POST" });
  };

  if (!local) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Cargando ajustes…</div>;

  const events = { ...DEFAULT_EVENTS, ...local.notificationEvents };
  const setEvent = (key: keyof NotificationEvents, v: boolean): void =>
    patch({ notificationEvents: { ...events, [key]: v } });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl gap-6 p-6 max-sm:p-3">
        {/* Menú lateral (desktop) */}
        <nav className="sticky top-6 hidden h-fit w-48 shrink-0 space-y-1 lg:block">
          <Link to="/" className="mb-4 block text-xs text-slate-400 hover:text-white">
            ← Volver a la galaxia
          </Link>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-5 pb-10">
          <div className="flex items-center justify-between lg:hidden">
            <Link to="/" className="text-xs text-slate-400 hover:text-white">
              ← Volver
            </Link>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Ajustes</h1>

          {/* ---------- General ---------- */}
          <Section id="general" title="General">
            <div className="flex items-center justify-between">
              <label className="text-[11px] tracking-wider text-slate-400 uppercase">Carpetas raíz (una por línea)</label>
              <button
                onClick={() => setPickerOpen(true)}
                className="rounded-md bg-indigo-500/20 px-2.5 py-1.5 text-[11px] text-indigo-200 hover:bg-indigo-500/35"
              >
                ＋ Añadir carpeta…
              </button>
            </div>
            <textarea
              value={local.roots.join("\n")}
              onChange={(e) =>
                patch({ roots: e.target.value.split("\n").map((r) => r.trim()).filter(Boolean) }, { rescan: true })
              }
              rows={3}
              spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-slate-200 focus:ring-1 focus:ring-indigo-400/60 focus:outline-none"
            />
            <SettingRow title="Profundidad de escaneo" description="Niveles de subcarpetas donde buscar repos git.">
              <input
                type="number"
                min={1}
                max={5}
                value={local.scanDepth}
                onChange={(e) => patch({ scanDepth: Number(e.target.value) }, { rescan: true })}
                className="w-20 rounded-lg border border-white/10 bg-black/30 p-2 text-center text-sm text-slate-200 focus:outline-none"
              />
            </SettingRow>
            <SettingRow title="git fetch automático" description="Minutos entre fetch de remotos; 0 = desactivado.">
              <input
                type="number"
                min={0}
                max={720}
                value={local.autoFetchMinutes}
                onChange={(e) => patch({ autoFetchMinutes: Number(e.target.value) })}
                className="w-20 rounded-lg border border-white/10 bg-black/30 p-2 text-center text-sm text-slate-200 focus:outline-none"
              />
            </SettingRow>
          </Section>

          {/* ---------- Sincronización ---------- */}
          <Section id="sync" title="Sincronización">
            <IntegrationsSettings
              jira={local.integrations?.jira}
              onJiraChange={(cfg) => {
                jiraDraft.current = cfg ? { ...cfg, writeBack: local.integrations?.jira?.writeBack } : undefined;
                jiraTouched.current = true;
              }}
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={saveJira}
                className="rounded-md bg-indigo-500/25 px-3 py-1.5 text-xs text-white hover:bg-indigo-500/40"
              >
                Guardar credenciales Jira
              </button>
            </div>

            <div className="mt-4 border-t border-white/10 pt-2">
              <SettingRow
                title="Nebula puede cerrar issues en Jira"
                description="Desactivado: solo lectura — completar una tarjeta aquí no cambia nada en Jira."
              >
                <Switch
                  checked={local.integrations?.jira?.writeBack !== false}
                  onChange={(v) =>
                    local.integrations?.jira &&
                    patch({ integrations: { ...local.integrations, jira: { ...local.integrations.jira, writeBack: v } } })
                  }
                />
              </SettingRow>
              <SettingRow
                title="Nebula puede completar tareas en Planner"
                description="Desactivado: solo lectura — completar aquí no marca nada al 100% en Planner."
              >
                <Switch
                  checked={local.integrations?.planner?.writeBack !== false}
                  onChange={(v) =>
                    patch({ integrations: { ...local.integrations, planner: { ...local.integrations?.planner, writeBack: v } } })
                  }
                />
              </SettingRow>
              <SettingRow title="Sincronizar cada" description="Minutos entre syncs automáticos de Jira y Planner.">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={local.syncMinutes ?? 10}
                  onChange={(e) => patch({ syncMinutes: Math.max(1, Number(e.target.value)) })}
                  className="w-20 rounded-lg border border-white/10 bg-black/30 p-2 text-center text-sm text-slate-200 focus:outline-none"
                />
                <button
                  onClick={() => {
                    void fetch("/api/jira/sync", { method: "POST" });
                    void fetch("/api/planner/sync", { method: "POST" });
                    push({ level: "info", message: "Sincronización lanzada" });
                  }}
                  className="rounded-md bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
                >
                  Sincronizar ahora
                </button>
              </SettingRow>
            </div>
          </Section>

          {/* ---------- Notificaciones ---------- */}
          <Section id="notificaciones" title="Notificaciones">
            <SettingRow title="🔔 Notificaciones de Windows" description="Interruptor general de los toasts nativos.">
              <Switch checked={local.notifications !== false} onChange={(v) => patch({ notifications: v })} />
            </SettingRow>
            <div className={local.notifications === false ? "pointer-events-none opacity-40" : ""}>
              <SettingRow title="Issue o tarea nueva asignada" description="Jira y Planner al sincronizar.">
                <Switch checked={events.newExternalTask} onChange={(v) => setEvent("newExternalTask", v)} />
              </SettingRow>
              <SettingRow title="Un agente termina" description="Sesiones de IA con trabajo real (≥10 herramientas).">
                <Switch checked={events.agentDone} onChange={(v) => setEvent("agentDone", v)} />
              </SettingRow>
              <SettingRow title="Vencimientos del día" description="Un aviso al día si algo vence hoy.">
                <Switch checked={events.dueDigest} onChange={(v) => setEvent("dueDigest", v)} />
              </SettingRow>
            </div>
            <div className="mt-2 rounded-xl border border-dashed border-white/10 p-3 text-[11px] leading-relaxed text-slate-500">
              📲 <span className="text-slate-400">Notificaciones en el móvil — próximamente.</span> El push web exige HTTPS
              (Nebula va por HTTP local); llegará vía un relé tipo ntfy cuando lo activemos.
            </div>
          </Section>

          {/* ---------- Dispositivos y acceso ---------- */}
          <Section id="acceso" title="Dispositivos y acceso">
            <SettingRow
              title="📱 Acceso desde la red local"
              description="Abre Nebula desde el móvil/tablet en tu wifi. Se aplica al reiniciar el daemon."
            >
              <button onClick={() => setQrOpen(true)} className="rounded-md bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                QR
              </button>
              <Switch checked={local.lanAccess} onChange={(v) => patch({ lanAccess: v })} />
            </SettingRow>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Consejo: en el navegador del móvil usa «Añadir a pantalla de inicio» para instalarla como app.
            </p>
          </Section>
        </div>
      </div>

      <FolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(p) => {
          setPickerOpen(false);
          if (!local.roots.includes(p)) patch({ roots: [...local.roots, p] }, { rescan: true });
        }}
      />
      <QrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onEnableLan={() => {
          setQrOpen(false);
          patch({ lanAccess: true });
          push({ level: "info", message: "Acceso LAN activado — reinicia Nebula para aplicarlo." });
        }}
      />
    </div>
  );
}
