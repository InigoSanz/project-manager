import { useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useNebula } from "./stores/nebula";
import { Home } from "./pages/Home";
import { ProjectPage } from "./pages/Project";
import { SettingsPage } from "./pages/Settings";
import { CommandPalette } from "./components/CommandPalette";
import { TodayPanel } from "./components/TodayPanel";
import { ToastStack } from "./components/Toast";
import { WelcomeTour } from "./components/WelcomeTour";
import { HelpModal } from "./components/HelpModal";

export default function App() {
  const init = useNebula((s) => s.init);
  const navigate = useNavigate();
  const [todayOpen, setTodayOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => init(), [init]);

  useEffect(() => {
    const onOpenSettings = (): void => {
      void navigate("/ajustes");
    };
    const onOpenToday = (): void => setTodayOpen(true);
    const onOpenHelp = (): void => setHelpOpen(true);
    const onKey = (e: KeyboardEvent): void => {
      // T abre/cierra Hoy salvo que se esté escribiendo en un campo
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTodayOpen((o) => !o);
      }
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener("nebula:open-settings", onOpenSettings);
    window.addEventListener("nebula:open-today", onOpenToday);
    window.addEventListener("nebula:open-help", onOpenHelp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("nebula:open-settings", onOpenSettings);
      window.removeEventListener("nebula:open-today", onOpenToday);
      window.removeEventListener("nebula:open-help", onOpenHelp);
      window.removeEventListener("keydown", onKey);
    };
  }, [navigate]);

  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
      </Routes>
      <CommandPalette onOpenSettings={() => navigate("/ajustes")} />
      <TodayPanel open={todayOpen} onClose={() => setTodayOpen(false)} />
      <WelcomeTour />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastStack />
    </div>
  );
}
