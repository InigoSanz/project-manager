import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";

interface LanInfo {
  enabled: boolean;
  urls: string[];
}

export function QrModal({ open, onClose, onEnableLan }: { open: boolean; onClose: () => void; onEnableLan: () => void }) {
  const [info, setInfo] = useState<LanInfo | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    setInfo(null);
    void fetch("/api/lan-info")
      .then((r) => r.json())
      .then((i: LanInfo) => {
        setInfo(i);
        setSelected(0);
      })
      .catch(() => setInfo({ enabled: false, urls: [] }));
  }, [open]);

  useEffect(() => {
    const url = info?.urls[selected];
    if (info?.enabled && url && canvas.current) {
      void QRCode.toCanvas(canvas.current, url, {
        width: 220,
        margin: 1,
        color: { dark: "#e6e8f2", light: "#0c0e1d" },
      });
    }
  }, [info, selected]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            className="glass w-full max-w-sm rounded-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">📱 Abrir en el móvil</h2>
            {!info ? (
              <p className="mt-4 text-sm text-slate-500">Cargando…</p>
            ) : !info.enabled ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  El acceso desde la red local está desactivado. Actívalo y reinicia Nebula para poder abrirla desde
                  el móvil o la tablet (misma wifi).
                </p>
                <button
                  onClick={onEnableLan}
                  className="mt-4 rounded-lg bg-indigo-500/30 px-4 py-2 text-sm text-white hover:bg-indigo-500/45"
                >
                  Activar acceso LAN
                </button>
              </>
            ) : info.urls.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No se ha detectado ninguna IP de red local.</p>
            ) : (
              <>
                <p className="mt-2 text-xs text-slate-500">Escanea con la cámara del móvil (misma wifi):</p>
                <div className="mt-3 flex justify-center">
                  <canvas ref={canvas} className="rounded-xl" />
                </div>
                <p className="mt-3 font-mono text-sm text-indigo-300">{info.urls[selected]}</p>
                {info.urls.length > 1 && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {info.urls.map((u, i) => (
                      <button
                        key={u}
                        onClick={() => setSelected(i)}
                        className={`rounded-md px-2 py-0.5 text-[10px] ${
                          i === selected ? "bg-indigo-500/30 text-white" : "bg-white/5 text-slate-400"
                        }`}
                      >
                        {u.replace(/^http:\/\//, "").replace(/:\d+$/, "")}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-600">
                  Consejo: en el navegador del móvil, «Añadir a pantalla de inicio» la deja como una app.
                </p>
              </>
            )}
            <button onClick={onClose} className="mt-4 text-xs text-slate-500 hover:text-white">
              Cerrar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
