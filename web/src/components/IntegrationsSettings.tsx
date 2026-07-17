import { useEffect, useRef, useState } from "react";
import type { JiraConfig, JiraStatus, PlannerStatus } from "@nebula/shared";

/** Sección Jira + Microsoft 365 del modal de ajustes. */
export function IntegrationsSettings({
  jira,
  onJiraChange,
}: {
  jira: JiraConfig | undefined;
  onJiraChange: (cfg: JiraConfig | undefined) => void;
}) {
  return (
    <div className="space-y-5">
      <JiraSection jira={jira} onChange={onJiraChange} />
      <PlannerSection />
    </div>
  );
}

function JiraSection({
  jira,
  onChange,
}: {
  jira: JiraConfig | undefined;
  onChange: (cfg: JiraConfig | undefined) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(jira?.baseUrl ?? "");
  const [email, setEmail] = useState(jira?.email ?? "");
  const [token, setToken] = useState(jira?.token ?? "");
  const [mode, setMode] = useState<"cloud" | "server">(jira?.mode ?? "cloud");
  const [testResult, setTestResult] = useState<JiraStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const touched = useRef(false);

  // autodetectar modo por la URL (editable después)
  useEffect(() => {
    if (baseUrl.includes(".atlassian.net")) setMode("cloud");
  }, [baseUrl]);

  // propagar al padre para que se guarde con el resto de ajustes
  useEffect(() => {
    if (!touched.current) return;
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    onChange(trimmed && token.trim() ? { mode, baseUrl: trimmed, email: email.trim() || undefined, token: token.trim() } : undefined);
  }, [baseUrl, email, token, mode]);

  const test = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/jira/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, baseUrl: baseUrl.trim(), email: email.trim(), token: token.trim() }),
      });
      setTestResult((await res.json()) as JiraStatus);
    } finally {
      setTesting(false);
    }
  };

  const input =
    "mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-slate-200 focus:ring-1 focus:ring-indigo-400/60 focus:outline-none";

  return (
    <section onInput={() => (touched.current = true)}>
      <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">◆ Jira</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Trae los issues asignados a ti. Cloud: crea un token en{" "}
        <a
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-300 hover:underline"
        >
          id.atlassian.com
        </a>
        . Server/DC: usa un Personal Access Token de tu perfil. No requiere permisos de administrador.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] text-slate-400">URL de Jira</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://miempresa.atlassian.net" className={input} spellCheck={false} />
        </div>
        <div>
          <label className="text-[11px] text-slate-400">Tipo</label>
          <select
            value={mode}
            onChange={(e) => {
              touched.current = true;
              setMode(e.target.value as "cloud" | "server");
            }}
            className={input}
          >
            <option value="cloud">Cloud (email + API token)</option>
            <option value="server">Server / Data Center (PAT)</option>
          </select>
        </div>
        {mode === "cloud" && (
          <div>
            <label className="text-[11px] text-slate-400">Email Atlassian</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" className={input} spellCheck={false} />
          </div>
        )}
        <div className={mode === "cloud" ? "col-span-2" : ""}>
          <label className="text-[11px] text-slate-400">{mode === "cloud" ? "API token" : "Personal Access Token"}</label>
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" className={input} spellCheck={false} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => void test()}
          disabled={testing || !baseUrl.trim() || !token.trim()}
          className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40"
        >
          {testing ? "Probando…" : "Probar conexión"}
        </button>
        {testResult &&
          (testResult.ok ? (
            <span className="text-xs text-emerald-300">✓ Conectado como {testResult.user}</span>
          ) : (
            <span className="max-w-[60%] truncate text-xs text-rose-300" title={testResult.error ?? ""}>
              ✕ {testResult.error}
            </span>
          ))}
      </div>
    </section>
  );
}

function PlannerSection() {
  const [status, setStatus] = useState<PlannerStatus | null>(null);
  const polling = useRef<number | null>(null);

  const refresh = async (): Promise<PlannerStatus | null> => {
    try {
      const s = (await (await fetch("/api/planner/status")).json()) as PlannerStatus;
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    void refresh();
    return () => {
      if (polling.current) window.clearInterval(polling.current);
    };
  }, []);

  const connect = async (): Promise<void> => {
    const s = (await (
      await fetch("/api/planner/connect", { method: "POST" })
    ).json()) as PlannerStatus;
    setStatus(s);
    if (polling.current) window.clearInterval(polling.current);
    polling.current = window.setInterval(() => {
      void refresh().then((st) => {
        if (st && st.state !== "pending" && polling.current) {
          window.clearInterval(polling.current);
          polling.current = null;
        }
      });
    }, 2500);
  };

  const disconnect = async (): Promise<void> => {
    setStatus((await (await fetch("/api/planner/disconnect", { method: "POST" })).json()) as PlannerStatus);
  };

  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">▦ Microsoft 365 · Planner</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Trae tus tareas de Planner iniciando sesión con tu cuenta 365 (solo lectura, permiso delegado Tasks.Read).
      </p>
      <div className="mt-2">
        {(!status || status.state === "none") && (
          <button onClick={() => void connect()} className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
            Conectar Microsoft 365
          </button>
        )}
        {status?.state === "pending" &&
          (status.userCode ? (
            <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-3 text-xs text-sky-200">
              <p>
                1. Abre{" "}
                <a href={status.verificationUri ?? "https://microsoft.com/devicelogin"} target="_blank" rel="noreferrer" className="font-semibold underline">
                  {status.verificationUri ?? "microsoft.com/devicelogin"}
                </a>
              </p>
              <p className="mt-1">
                2. Introduce el código: <code className="rounded bg-black/40 px-2 py-0.5 font-mono text-sm font-bold tracking-widest">{status.userCode}</code>
              </p>
              <p className="mt-1 text-sky-300/70">Esperando a que completes el inicio de sesión…</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Solicitando código a Microsoft…</p>
          ))}
        {status?.state === "connected" && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-emerald-300">✓ Conectado{status.user ? ` como ${status.user}` : ""}</span>
            <span className="text-[11px] text-slate-500">{status.taskCount} tareas</span>
            <button onClick={() => void disconnect()} className="text-[11px] text-slate-500 hover:text-rose-300">
              Desconectar
            </button>
          </div>
        )}
        {status?.state === "error" && (
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3">
            <p className="text-xs whitespace-pre-line text-rose-200">{status.error}</p>
            <button onClick={() => void connect()} className="mt-2 rounded-md bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">
              Reintentar
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
