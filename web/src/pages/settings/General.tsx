import { useState } from "react";
import { FolderPicker } from "../../components/FolderPicker";
import { SettingRow } from "../../components/Switch";
import { Icon } from "../../components/Icon";
import { zoneColor } from "../../pixel/palette";
import { Section, useSettings } from "./SettingsLayout";

export function GeneralSettings() {
  const { config, patch } = useSettings();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Section title="Carpetas de proyectos">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-200">
              Carpetas raíz
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                Cada una es una zona del mapa. Nebula busca dentro los repositorios git.
              </span>
            </p>
            <button
              onClick={() => setPickerOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent/20 px-2.5 py-1.5 text-[11px] text-indigo-200 hover:bg-accent/35"
            >
              <Icon name="plus" size={12} />
              Añadir carpeta
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {config.roots.map((root) => (
              <li
                key={root}
                className="group flex items-center gap-2.5 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
              >
                {/* el color enlaza cada carpeta con su zona del mapa */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ background: zoneColor(root) }}
                  title="Color de su zona en el mapa"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200" title={root}>
                  {root}
                </span>
                <button
                  onClick={() => patch({ roots: config.roots.filter((r) => r !== root) }, { rescan: true })}
                  className="shrink-0 p-1 text-slate-600 transition-colors hover:text-rose-300 pointer-coarse:text-slate-500"
                  title="Quitar esta carpeta (sus proyectos pasan a «Espacio profundo»)"
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
            {config.roots.length === 0 && (
              <li className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-slate-500">
                Sin carpetas: añade dónde viven tus repositorios.
              </li>
            )}
          </ul>
        </div>
      </Section>

      <Section title="Escaneo">
        <SettingRow title="Profundidad de escaneo" description="Niveles de subcarpetas donde buscar repos git.">
          <input
            type="number"
            min={1}
            max={5}
            value={config.scanDepth}
            onChange={(e) => patch({ scanDepth: Number(e.target.value) }, { rescan: true })}
            className="w-20 rounded-lg border border-white/10 bg-black/30 p-2 text-center text-sm text-slate-200 focus:outline-none"
          />
        </SettingRow>
        <SettingRow title="git fetch automático" description="Minutos entre fetch de remotos; 0 = desactivado.">
          <input
            type="number"
            min={0}
            max={720}
            value={config.autoFetchMinutes}
            onChange={(e) => patch({ autoFetchMinutes: Number(e.target.value) })}
            className="w-20 rounded-lg border border-white/10 bg-black/30 p-2 text-center text-sm text-slate-200 focus:outline-none"
          />
        </SettingRow>
      </Section>

      <Section title="Herramientas">
        <SettingRow
          title="Comando del editor"
          description="El que se usa al pulsar «Editor». Por defecto VS Code («code»); por ejemplo «subl», «webstorm» o «cursor»."
        >
          <input
            value={config.editorCommand ?? ""}
            onChange={(e) => patch({ editorCommand: e.target.value })}
            placeholder="code"
            spellCheck={false}
            className="w-40 rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-slate-200 focus:outline-none"
          />
        </SettingRow>
        <SettingRow
          title="Navegador"
          description="El que abre el repositorio remoto. Vacío = Google Chrome; si no está instalado, el predeterminado del sistema."
        >
          <input
            value={config.browserCommand ?? ""}
            onChange={(e) => patch({ browserCommand: e.target.value })}
            placeholder="chrome"
            spellCheck={false}
            className="w-40 rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-slate-200 focus:outline-none"
          />
        </SettingRow>
      </Section>

      <FolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(p) => {
          setPickerOpen(false);
          if (!config.roots.includes(p)) patch({ roots: [...config.roots, p] }, { rescan: true });
        }}
      />
    </>
  );
}
