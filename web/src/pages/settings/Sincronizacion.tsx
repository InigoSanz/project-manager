import { useEffect, useRef, useState } from "react";
import type { GitHubStatus, JiraConfig } from "@nebula/shared";
import { useToasts } from "../../components/Toast";
import { IntegrationsSettings } from "../../components/IntegrationsSettings";
import { Switch, SettingRow } from "../../components/Switch";
import { Section, useSettings } from "./SettingsLayout";

export function SyncSettings() {
  const { config, patch } = useSettings();
  const push = useToasts((s) => s.push);
  const jiraDraft = useRef<JiraConfig | undefined>(undefined);
  const jiraTouched = useRef(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);

  useEffect(() => {
    void fetch("/api/github/status")
      .then((r) => r.json())
      .then((s: GitHubStatus) => s.configured && setGithubStatus(s))
      .catch(() => {});
  }, []);

  /** Guarda el token, comprueba que sirve y lanza la primera sincronización. */
  const saveGithub = async (): Promise<void> => {
    const token = githubToken.trim();
    const probe = (await (
      await fetch("/api/github/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
    ).json()) as GitHubStatus;
    setGithubStatus(probe);
    if (!probe.ok) return;
    patch({ integrations: { ...config.integrations, github: { token } } });
    setGithubToken("");
    push({ level: "success", message: `GitHub conectado como ${probe.user}` });
    // el guardado va con debounce: damos margen antes de pedir el sync
    setTimeout(() => {
      void fetch("/api/github/sync", { method: "POST" })
        .then((r) => r.json())
        .then((s: GitHubStatus) => setGithubStatus(s));
    }, 900);
  };

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

      <Section title="GitHub">
        <div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Trae tus pull requests, las revisiones que te han pedido y los issues asignados. Crea un token en{" "}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              github.com/settings/tokens
            </a>{" "}
            con permiso de lectura de repos. Los proyectos se emparejan por la URL del remoto.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="Personal Access Token"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />
            <button
              onClick={() => void saveGithub()}
              disabled={!githubToken.trim()}
              className="shrink-0 rounded-md bg-accent/25 px-3 py-1.5 text-xs text-white hover:bg-accent/40 disabled:opacity-40"
            >
              Conectar
            </button>
          </div>
          {githubStatus && (
            <p className={`mt-2 text-xs ${githubStatus.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {githubStatus.ok
                ? `✓ Conectado como ${githubStatus.user} · ${githubStatus.pullCount} PRs · ${githubStatus.issueCount} issues`
                : `✕ ${githubStatus.error}`}
            </p>
          )}
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
