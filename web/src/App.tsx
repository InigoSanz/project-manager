import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useNebula } from "./stores/nebula";
import { Home } from "./pages/Home";
import { ProjectPage } from "./pages/Project";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsModal } from "./components/SettingsModal";
import { TodayPanel } from "./components/TodayPanel";
import { ToastStack } from "./components/Toast";

export default function App() {
  const init = useNebula((s) => s.init);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  useEffect(() => init(), [init]);

  useEffect(() => {
    const onOpenSettings = (): void => setSettingsOpen(true);
    const onOpenToday = (): void => setTodayOpen(true);
    const onKey = (e: KeyboardEvent): void => {
      // T abre/cierra Hoy salvo que se esté escribiendo en un campo
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTodayOpen((o) => !o);
      }
    };
    window.addEventListener("nebula:open-settings", onOpenSettings);
    window.addEventListener("nebula:open-today", onOpenToday);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("nebula:open-settings", onOpenSettings);
      window.removeEventListener("nebula:open-today", onOpenToday);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
      <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TodayPanel open={todayOpen} onClose={() => setTodayOpen(false)} />
      <ToastStack />
    </div>
  );
}
