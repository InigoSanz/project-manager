import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface FsEntry {
  name: string;
  path: string;
  isRepo: boolean;
  repoCount: number;
}

interface Listing {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export function FolderPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const [roots, setRoots] = useState<Array<{ name: string; path: string }>>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setListing(null);
    void fetch("/api/fs/roots")
      .then((r) => r.json())
      .then(setRoots)
      .catch(() => setRoots([]));
  }, [open]);

  const navigate = async (path: string): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
      if (res.ok) setListing((await res.json()) as Listing);
    } finally {
      setLoading(false);
    }
  };

  const crumbs = listing ? listing.path.split(/[\\/]/).filter(Boolean) : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            className="glass flex h-[70vh] max-h-[85dvh] w-full max-w-xl flex-col rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white">Elige la carpeta donde viven tus proyectos</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Nebula buscará repositorios git dentro (hasta la profundidad configurada).
            </p>

            {/* Accesos rápidos / unidades */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roots.map((r) => (
                <button
                  key={r.path}
                  onClick={() => void navigate(r.path)}
                  className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  {r.name}
                </button>
              ))}
            </div>

            {/* Breadcrumb */}
            {listing && (
              <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-400">
                {crumbs.map((c, i) => {
                  const prefix = listing.path.match(/^[A-Za-z]:[\\/]/) ? crumbs.slice(0, i + 1).join("\\") : "/" + crumbs.slice(0, i + 1).join("/");
                  const full = /^[A-Za-z]:$/.test(prefix) ? prefix + "\\" : prefix;
                  return (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-600">›</span>}
                      <button onClick={() => void navigate(full)} className="hover:text-white">
                        {c}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Lista */}
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/5">
              {loading && <p className="p-4 text-xs text-slate-500">Cargando…</p>}
              {!loading && listing && (
                <ul>
                  {listing.parent && (
                    <li>
                      <button
                        onClick={() => void navigate(listing.parent!)}
                        className="w-full px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/5"
                      >
                        ↰ ..
                      </button>
                    </li>
                  )}
                  {listing.entries.map((e) => (
                    <li key={e.path} className="flex items-center border-t border-white/5">
                      <button
                        onClick={() => void navigate(e.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                      >
                        <span className="shrink-0">📁</span>
                        <span className="truncate">{e.name}</span>
                        {e.isRepo && (
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            ● repo git
                          </span>
                        )}
                        {e.repoCount > 0 && (
                          <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
                            {e.repoCount}
                            {e.repoCount >= 20 ? "+" : ""} repos dentro
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {listing.entries.length === 0 && (
                    <li className="p-4 text-center text-xs text-slate-600">Sin subcarpetas visibles</li>
                  )}
                </ul>
              )}
              {!loading && !listing && (
                <p className="p-4 text-center text-xs text-slate-600">Elige una unidad o acceso rápido para empezar</p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-slate-500">{listing?.path ?? ""}</span>
              <div className="flex shrink-0 gap-2">
                <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                  Cancelar
                </button>
                <button
                  disabled={!listing}
                  onClick={() => listing && onSelect(listing.path)}
                  className="rounded-lg bg-indigo-500/30 px-4 py-1.5 text-xs text-white hover:bg-indigo-500/45 disabled:opacity-40"
                >
                  Usar esta carpeta
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
