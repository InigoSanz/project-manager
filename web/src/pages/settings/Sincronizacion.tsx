import { useRef } from "react";
import type { JiraConfig } from "@nebula/shared";
import { useToasts } from "../../components/Toast";
import { IntegrationsSettings } from "../../components/IntegrationsSettings";
import { Switch, SettingRow } from "../../components/Switch";
import { Section, useSettings } from "./SettingsLayout";

export function SyncSettings() {
  const { config, patch } = useSettings();
  const push = useToasts((s) => s.push);
  const jiraDraft = useRef<JiraConfig | undefined>(undefined);
  const jiraTouched = useRef(false);

  const saveJira = (): void => {
    if (!jiraTouched.current) return;
    patch({ integrations: { ...config.integrations, jira: jiraDraft.current } });
    jiraTouched.current = false;
    void fetch("/api/jira/sync", { method: "POST" });
  };

  return (
    <>
      <Section title="Cuentas conectadas">
        <div>
          <IntegrationsSettings
            jira={config.integrations?.jira}
            onJiraChange={(cfg) => {
              jiraDraft.current = cfg ? { ...cfg, writeBack: config.integrations?.jira?.writeBack } : undefined;
              jiraTouched.current = true;
            }}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={saveJira}
              className="rounded-md bg-accent/25 px-3 py-1.5 text-xs text-white hover:bg-accent/40"
            >
              Guardar credenciales Jira
            </button>
          </div>
        </div>
      </Section>

      <Section title="Qué puede cambiar Nebula">
        <SettingRow
          title="Cerrar issues en Jira"
          description="Desactivado: solo lectura — completar una tarea aquí no cambia nada en Jira."
        >
          <Switch
            checked={config.integrations?.jira?.writeBack !== false}
            onChange={(v) =>
              config.integrations?.jira &&
              patch({ integrations: { ...config.integrations, jira: { ...config.integrations.jira, writeBack: v } } })
            }
          />
        </SettingRow>
        <SettingRow
          title="Completar tareas en Planner"
          description="Desactivado: solo lectura — completar aquí no marca nada al 100% en Planner."
        >
          <Switch
            checked={config.integrations?.planner?.writeBack !== false}
            onChange={(v) =>
              patch({
                integrations: { ...config.integrations, planner: { ...config.integrations?.planner, writeBack: v } },
              })
            }
          />
        </SettingRow>
        <SettingRow title="Sincronizar cada" description="Minutos entre syncs automáticos de Jira y Planner.">
          <input
            type="number"
            min={1}
            max={120}
            value={config.syncMinutes ?? 10}
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
      </Section>
    </>
  );
}
