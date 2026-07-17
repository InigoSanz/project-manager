import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { JiraConfig } from "@nebula/shared";
import { useNebula } from "../stores/nebula";
import { FolderPicker } from "./FolderPicker";
import { IntegrationsSettings } from "./IntegrationsSettings";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, loadConfig, saveConfig, rescan } = useNebula();
  const [roots, setRoots] = useState("");
  const [depth, setDepth] = useState(2);
  const [fetchMin, setFetchMin] = useState(0);
  const [jira, setJira] = useState<JiraConfig | undefined>(undefined);
  const [jiraTouched, setJiraTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) void loadConfig();
  }, [open, loadConfig]);

  useEffect(() => {
    if (config) {
      setRoots(config.roots.join("\n"));
      setDepth(config.scanDepth);
      setFetchMin(config.autoFetchMinutes);
      setJira(config.integrations?.jira);
      setJiraTouched(false);
    }
  }, [config]);

  const save = async (): Promise<void> => {
    setSaving(true);
    await saveConfig({
      roots: roots
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
      scanDepth: depth,
      autoFetchMinutes: fetchMin,
      integrations: {
        ...config?.integrations,
        jira: jiraTouched ? jira : config?.integrations?.jira,
      },
    });
    if (jiraTouched) void fetch("/api/jira/sync", { method: "POST" });
    await rescan();
    setSaving(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            className="glass max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">Ajustes</h2>

            <div className="mt-5 flex items-center justify-between">
              <label className="block text-xs font-medium tracking-wider text-slate-400 uppercase">
                Carpetas raíz (una por línea)
              </label>
              <button
                onClick={() => setPickerOpen(true)}
                className="rounded-md bg-indigo-500/20 px-2.5 py-1 text-[11px] text-indigo-200 hover:bg-indigo-500/35"
              >
                ＋ Añadir carpeta…
              </button>
            </div>
            <textarea
              value={roots}
              onChange={(e) => setRoots(e.target.value)}
              rows={4}
              spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-slate-200 focus:ring-1 focus:ring-indigo-400/60 focus:outline-none"
              placeholder="C:\Repositorio Personal"
            />

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium tracking-wider text-slate-400 uppercase">
                  Profundidad de escaneo
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-slate-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium tracking-wider text-slate-400 uppercase">
                  git fetch cada (min, 0 = off)
                </label>
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={fetchMin}
                  onChange={(e) => setFetchMin(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-5">
              <IntegrationsSettings
                jira={jira}
                onJiraChange={(cfg) => {
                  setJira(cfg);
                  setJiraTouched(true);
                }}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">
                Cancelar
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-lg bg-indigo-500/30 px-4 py-2 text-sm text-white hover:bg-indigo-500/45 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar y re-escanear"}
              </button>
            </div>
          </motion.div>
          <FolderPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(p) => {
              setPickerOpen(false);
              setRoots((prev) => {
                const lines = prev.split("\n").map((l) => l.trim()).filter(Boolean);
                if (!lines.includes(p)) lines.push(p);
                return lines.join("\n");
              });
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
