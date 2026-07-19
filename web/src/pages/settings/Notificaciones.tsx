import type { NotificationEvents } from "@nebula/shared";
import { Switch, SettingRow } from "../../components/Switch";
import { Section, useSettings } from "./SettingsLayout";

const DEFAULT_EVENTS: NotificationEvents = { newExternalTask: true, agentDone: true, dueDigest: true };

export function NotificationSettings() {
  const { config, patch } = useSettings();
  const events = { ...DEFAULT_EVENTS, ...config.notificationEvents };
  const setEvent = (key: keyof NotificationEvents, v: boolean): void =>
    patch({ notificationEvents: { ...events, [key]: v } });

  return (
    <>
      <Section title="Notificaciones de Windows">
        <SettingRow title="Activar avisos" description="Interruptor general de los avisos nativos del sistema.">
          <Switch checked={config.notifications !== false} onChange={(v) => patch({ notifications: v })} />
        </SettingRow>
        <div
          className={`divide-y divide-white/5 [&>*]:py-3 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0 ${
            config.notifications === false ? "pointer-events-none opacity-40" : ""
          }`}
        >
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
      </Section>

      <Section title="En el móvil">
        <p className="text-[11px] leading-relaxed text-slate-500">
          <span className="text-slate-400">Próximamente.</span> El push web exige HTTPS y Nebula va por HTTP local;
          llegará a través de un relé tipo ntfy cuando lo activemos.
        </p>
      </Section>
    </>
  );
}
