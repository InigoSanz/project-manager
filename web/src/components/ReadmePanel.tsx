import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Project } from "@nebula/shared";
import { Icon } from "./Icon";

/**
 * README del repositorio renderizado. El markdown viene de un fichero del
 * disco del usuario, así que se sanea antes de inyectarlo.
 */
export function ReadmePanel({ project }: { project: Project }) {
  const [state, setState] = useState<{ file: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/projects/${project.id}/readme`)
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((d) => alive && setState(d))
      .catch(() => alive && setState(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [project.id]);

  const html = useMemo(() => {
    if (!state?.body) return "";
    const raw = marked.parse(state.body, { async: false }) as string;
    return DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
  }, [state?.body]);

  if (loading) return null;
  if (!state) {
    return (
      <section className="glass rounded-xl p-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">README</h3>
        <p className="text-xs text-slate-500">Este repositorio no tiene README.</p>
      </section>
    );
  }

  return (
    <section className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{state.file}</h3>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
        >
          <Icon name={expanded ? "chevronDown" : "chevronRight"} size={11} />
          {expanded ? "Plegar" : "Ver todo"}
        </button>
      </div>
      <div
        className={`nebula-markdown overflow-y-auto pr-1 ${expanded ? "max-h-[60vh]" : "max-h-64"}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
