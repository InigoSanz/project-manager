import { useState } from "react";
import { QrModal } from "../../components/QrModal";
import { Switch, SettingRow } from "../../components/Switch";
import { Icon } from "../../components/Icon";
import { useToasts } from "../../components/Toast";
import { Section, useSettings } from "./SettingsLayout";

export function AccessSettings() {
  const { config, patch } = useSettings();
  const push = useToasts((s) => s.push);
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <>
      <Section title="Red local">
        <SettingRow
          title="Acceso desde el móvil o la tablet"
          description="Abre Nebula desde otro dispositivo de tu wifi. Se aplica al reiniciar el daemon."
        >
          <button
            onClick={() => setQrOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
          >
            <Icon name="qr" size={13} />
            Ver QR
          </button>
          <Switch checked={config.lanAccess} onChange={(v) => patch({ lanAccess: v })} />
        </SettingRow>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Consejo: en el navegador del móvil usa «Añadir a pantalla de inicio» para instalarla como app.
        </p>
      </Section>

      <QrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onEnableLan={() => {
          setQrOpen(false);
          patch({ lanAccess: true });
          push({ level: "info", message: "Acceso LAN activado — reinicia Nebula para aplicarlo." });
        }}
      />
    </>
  );
}
