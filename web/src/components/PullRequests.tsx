import { useEffect, useState } from "react";
import type { PullRequest } from "@nebula/shared";
import { Icon } from "./Icon";

/** Cache de módulo: Hoy y la pestaña Git piden lo mismo, no hace falta duplicar. */
let cache: { at: number; data: PullRequest[] } | null = null;

async function loadPulls(): Promise<PullRequest[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.data;
  try {
    const data = (await (await fetch("/api/github/pulls")).json()) as PullRequest[];
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return [];
  }
}

/**
 * Pull requests abiertas. No son tareas (no se completan a mano), así que se
 * muestran aparte: las que te han pedido revisar van primero.
 */
export function PullRequests({ projectId, compact = false }: { projectId?: string; compact?: boolean }) {
  const [pulls, setPulls] = useState<PullRequest[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPulls().then((p) => alive && setPulls(p));
    return () => {
      alive = false;
    };
  }, []);

  if (!pulls || pulls.length === 0) return null;
  const mine = projectId ? pulls.filter((p) => p.projectId === projectId) : pulls;
  if (mine.length === 0) return null;

  // lo que te bloquea a ti primero
  const sorted = [...mine].sort((a, b) => Number(b.reviewRequested) - Number(a.reviewRequested));

  const body = (
    <ul className="space-y-1.5">
      {sorted.map((pr) => (
        <li key={pr.id}>
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:bg-white/5"
          >
            <Icon
              name="pullRequest"
              size={12}
              className={`mt-0.5 shrink-0 ${pr.draft ? "text-slate-500" : "text-emerald-400"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-slate-200" title={pr.title}>
                {pr.title}
              </span>
              <span className="text-[10px] text-slate-500">
                {pr.repo} #{pr.number}
                {pr.draft && " · borrador"}
              </span>
            </span>
            {pr.reviewRequested && (
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10px] text-amber-300">
                te toca revisar
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );

  if (compact) return body;

  return (
    <section className="glass rounded-xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        <Icon name="github" size={13} />
        Pull requests
      </h3>
      {body}
    </section>
  );
}
