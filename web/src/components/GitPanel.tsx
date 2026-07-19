import { useEffect, useState } from "react";
import type { GitCommit, GitDetail, GitFileDiff, Project } from "@nebula/shared";
import { useToasts } from "./Toast";
import { Icon } from "./Icon";
import { ConfirmDialog } from "./ConfirmDialog";
import { plural } from "../lib/plural";

/** Visor de diff de un fichero: coloreado por tipo de línea. */
function DiffViewer({ projectId, file, onClose }: { projectId: string; file: string; onClose: () => void }) {
  const [diff, setDiff] = useState<GitFileDiff | null>(null);

  useEffect(() => {
    let alive = true;
    setDiff(null);
    fetch(`/api/projects/${projectId}/git/diff?path=${encodeURIComponent(file)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: GitFileDiff) => alive && setDiff(d))
      .catch(() => alive && setDiff({ path: file, staged: false, binary: false, truncated: false, lines: [] }));
    return () => {
      alive = false;
    };
  }, [projectId, file]);

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="truncate font-mono text-[10px] text-slate-300" title={file}>
          {file}
        </span>
        <button onClick={onClose} className="shrink-0 text-slate-500 hover:text-white" title="Cerrar">
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="max-h-72 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {!diff ? (
          <p className="text-slate-600">Cargando diff…</p>
        ) : diff.binary ? (
          <p className="text-slate-500">Fichero binario: no hay nada que mostrar.</p>
        ) : diff.lines.length === 0 ? (
          <p className="text-slate-500">Sin cambios que mostrar.</p>
        ) : (
          <>
            {diff.lines.map((l, i) => (
              <div
                key={i}
                className={
                  l.kind === "add"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : l.kind === "del"
                      ? "bg-rose-500/10 text-rose-300"
                      : l.kind === "hunk"
                        ? "mt-1 text-accent"
                        : "text-slate-400"
                }
              >
                <span className="select-none opacity-50">
                  {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
                </span>
                {l.text}
              </div>
            ))}
            {diff.truncated && <p className="mt-2 text-amber-300/80">— diff recortado por tamaño —</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Sparkline de commits (serie única → un solo tono, barras finas, hueco 2px). */
function CommitSpark({ histogram }: { histogram: number[] }) {
  const max = Math.max(1, ...histogram);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex h-16 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {histogram.map((v, i) => {
          const daysAgo = histogram.length - 1 - i;
          return (
            <div
              key={i}
              className="group relative flex-1 cursor-default"
              onMouseEnter={() => setHover(i)}
            >
              <div
                className="w-full rounded-t-[3px] transition-colors"
                style={{
                  height: `${Math.max(v === 0 ? 4 : 10, (v / max) * 100)}%`,
                  background: hover === i ? "#a5b4fc" : v === 0 ? "#ffffff10" : "#7c8cff",
                  opacity: v === 0 ? 1 : 0.55 + (v / max) * 0.45,
                }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] whitespace-nowrap text-white shadow-lg ring-1 ring-white/10">
                  {v} commit{v === 1 ? "" : "s"} · {daysAgo === 0 ? "hoy" : `hace ${daysAgo}d`}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>hace 30 días</span>
        <span>hoy</span>
      </div>
    </div>
  );
}

/** Nombre de cada acción para los avisos («No se pudo traer cambios: …»). */
const ACTION_LABEL: Record<string, string> = {
  fetch: "Traer cambios",
  pull: "Aplicar cambios",
  checkout: "Cambiar de rama",
};

const STATE_LABEL: Record<string, string> = {
  M: "modificado",
  A: "añadido",
  D: "borrado",
  R: "renombrado",
  "??": "sin seguimiento",
  U: "conflicto",
};

export function GitPanel({ project }: { project: Project }) {
  const [detail, setDetail] = useState<GitDetail | null>(null);
  const [error, setError] = useState(false);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<GitCommit[] | null>(null);
  // rama a la que cambiar cuando git pide guardar los cambios antes (stash)
  const [stashPrompt, setStashPrompt] = useState<string | null>(null);
  const push = useToasts((s) => s.push);

  // búsqueda en el historial con debounce (git log --grep / -S)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void fetch(`/api/projects/${project.id}/git/log?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((c: GitCommit[]) => alive && setFound(c))
        .catch(() => alive && setFound([]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, project.id]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${project.id}/git`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: GitDetail) => alive && setDetail(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // re-fetch cuando el estado git del proyecto cambia (evento WS actualiza project.git)
  }, [project.id, project.git]);

  /** Lanza fetch/pull/checkout y refresca el panel con el resultado. */
  const gitAction = async (action: string, body?: Record<string, unknown>): Promise<void> => {
    setBusy(action);
    try {
      const res = await fetch(`/api/projects/${project.id}/git/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      // el mensaje dice QUÉ falló y enseña la salida real de git, que suele
      // explicar el motivo (cambios sin guardar, conflictos, sin remoto…)
      const what = ACTION_LABEL[action] ?? action;
      if (res.ok) push({ level: "success", message: data.message || `${what}: hecho.` });
      else push({ level: "error", message: `No se pudo ${what.toLowerCase()}: ${data.error ?? "error de git"}` });
      const fresh = await fetch(`/api/projects/${project.id}/git`);
      if (fresh.ok) setDetail((await fresh.json()) as GitDetail);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Cambia de rama. Si git lo rechaza por cambios sin guardar, abre el diálogo
   * para ofrecer guardarlos en un stash, en vez de un error críptico.
   */
  const runCheckout = async (branch: string, stash: boolean): Promise<void> => {
    setBusy("checkout");
    try {
      const res = await fetch(`/api/projects/${project.id}/git/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, stash }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; needsStash?: boolean };
      if (!res.ok && data.needsStash && !stash) {
        setStashPrompt(branch); // preguntar antes de guardar en stash
        return;
      }
      if (res.ok) push({ level: "success", message: data.message || `Cambiado a ${branch}.` });
      else push({ level: "error", message: `No se pudo cambiar de rama: ${data.error ?? "error de git"}` });
      const fresh = await fetch(`/api/projects/${project.id}/git`);
      if (fresh.ok) setDetail((await fresh.json()) as GitDetail);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="p-4 text-sm text-rose-300">No se pudo leer el estado git.</p>;
  if (!detail) return <p className="p-4 text-sm text-slate-500">Cargando git…</p>;

  const { status, commits, branches, changes } = detail;
  const shownCommits = found ?? commits;

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-1 lg:grid-cols-3">
      {/* Columna 1: estado + cambios */}
      <div className="space-y-4">
        <section className="glass rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Estado</h3>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void gitAction("fetch")}
                disabled={busy !== null}
                title="Traer cambios del remoto sin aplicarlos"
                className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <Icon name="refresh" size={11} />
                {busy === "fetch" ? "Trayendo…" : "Fetch"}
              </button>
              <button
                onClick={() => void gitAction("pull")}
                disabled={busy !== null}
                title="Traer y aplicar los cambios del remoto (solo si no hay que fusionar nada)"
                className="flex items-center gap-1 rounded-md bg-accent/20 px-2 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-accent/35 disabled:opacity-40"
              >
                <Icon name="chevronDown" size={11} />
                {busy === "pull" ? "Aplicando…" : "Pull"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-white/5 px-2 py-1 text-slate-200">
              ⎇ {status.branch ?? "sin rama (HEAD suelto)"}
            </span>
            {status.upstream && (
              <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">
                {status.upstream} {status.ahead > 0 && `↑${status.ahead}`} {status.behind > 0 && `↓${status.behind}`}
              </span>
            )}
            {status.clean ? (
              <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-300">✓ limpio</span>
            ) : (
              <>
                {status.staged > 0 && (
                  <span
                    className="rounded-md bg-sky-500/15 px-2 py-1 text-sky-300"
                    title="Cambios preparados para el próximo commit (staged)"
                  >
                    {plural(status.staged, "preparado")}
                  </span>
                )}
                {status.unstaged > 0 && (
                  <span
                    className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-300"
                    title="Cambios en ficheros ya seguidos por git, aún sin preparar (unstaged)"
                  >
                    {plural(status.unstaged, "sin preparar", "sin preparar")}
                  </span>
                )}
                {status.untracked > 0 && (
                  <span
                    className="rounded-md bg-white/10 px-2 py-1 text-slate-300"
                    title="Ficheros que git todavía no sigue (untracked)"
                  >
                    {plural(status.untracked, "nuevo")}
                  </span>
                )}
                {status.conflicted > 0 && (
                  <span className="rounded-md bg-rose-500/15 px-2 py-1 text-rose-300">
                    ⚠ {plural(status.conflicted, "conflicto")}
                  </span>
                )}
              </>
            )}
          </div>
          {changes.length > 0 && (
            <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto text-xs">
              {changes.map((c) => (
                <li key={c.path}>
                  {/* pulsar un fichero abre su diff */}
                  <button
                    onClick={() => setOpenDiff(openDiff === c.path ? null : c.path)}
                    className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-white/5 ${
                      openDiff === c.path ? "bg-white/5 text-white" : "text-slate-300"
                    }`}
                    title={`Ver cambios · ${STATE_LABEL[c.state] ?? c.state}: ${c.path}`}
                  >
                    <span className="w-5 shrink-0 font-mono text-amber-400/90">{c.state}</span>
                    <span className="truncate">{c.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {openDiff && <DiffViewer projectId={project.id} file={openDiff} onClose={() => setOpenDiff(null)} />}
        </section>

        {/* Ramas justo bajo Estado: cambiar de rama es acción frecuente y no
            debe quedar bajo el pliegue */}
        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Ramas</h3>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {branches.map((b) => (
              <li key={b.name}>
                {/* pulsar una rama cambia a ella; si hay cambios sin guardar,
                    ofrece guardarlos en un stash antes de cambiar */}
                <button
                  onClick={() => !b.isCurrent && void runCheckout(b.name, false)}
                  disabled={b.isCurrent || busy !== null}
                  title={
                    b.isCurrent
                      ? "Rama actual"
                      : `Cambiar a ${b.name} · si tienes cambios sin guardar, te ofrece guardarlos en un stash`
                  }
                  className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors enabled:hover:bg-white/5 disabled:cursor-default"
                >
                  <span className={`truncate ${b.isCurrent ? "font-semibold text-indigo-300" : "text-slate-300"}`}>
                    {b.isCurrent && "● "}
                    {b.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">{b.lastCommitAt?.slice(0, 10)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass rounded-xl p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Actividad · 30 días
          </h3>
          <CommitSpark histogram={project.analysis?.metrics.commitHistogram ?? []} />
        </section>
      </div>

      {/* Columnas 2-3: historial */}
      <section className="glass rounded-xl p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            {query.trim() ? "Resultados" : "Últimos commits"}
          </h3>
          <div className="relative w-56">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el historial…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pr-2 pl-7 text-xs text-slate-200 placeholder:text-slate-600 focus:ring-1 focus:ring-accent/60 focus:outline-none"
            />
            <Icon name="search" size={12} className="absolute top-2 left-2 text-slate-500" />
          </div>
        </div>
        <ul className="space-y-2 overflow-y-auto">
          {shownCommits.map((c) => (
            <li key={c.hash} className="flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
              <code className="mt-0.5 shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                {c.shortHash}
              </code>
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-200" title={c.subject}>
                  {c.subject}
                </p>
                <p className="text-[11px] text-slate-500">
                  {c.author} · {new Date(c.date).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
                  {c.refs.length > 0 && <span className="ml-2 text-amber-300/80">{c.refs.join(" · ")}</span>}
                </p>
              </div>
            </li>
          ))}
          {shownCommits.length === 0 && (
            <li className="text-xs text-slate-500">
              {query.trim() ? `Ningún commit coincide con «${query.trim()}».` : "Sin commits todavía."}
            </li>
          )}
        </ul>
      </section>

      <ConfirmDialog
        open={stashPrompt !== null}
        icon="branch"
        title="Cambios sin guardar"
        message={
          <>
            Tienes cambios sin guardar en esta rama. ¿Guardarlos en un <strong className="text-slate-200">stash</strong> de
            git y cambiar a «{stashPrompt}»?
            <br />
            <span className="mt-1 inline-block text-xs text-slate-500">Podrás recuperarlos con «git stash pop».</span>
          </>
        }
        confirmLabel="Guardar y cambiar"
        cancelLabel="Cancelar"
        onCancel={() => setStashPrompt(null)}
        onConfirm={() => {
          const branch = stashPrompt;
          setStashPrompt(null);
          if (branch) void runCheckout(branch, true);
        }}
      />
    </div>
  );
}
