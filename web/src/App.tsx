import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useNebula } from "./stores/nebula";
import { Home } from "./pages/Home";
import { ProjectPage } from "./pages/Project";
import { TasksPage } from "./pages/Tasks";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { GeneralSettings } from "./pages/settings/General";
import { SyncSettings } from "./pages/settings/Sincronizacion";
import { NotificationSettings } from "./pages/settings/Notificaciones";
import { AccessSettings } from "./pages/settings/Acceso";
import { CommandPalette } from "./components/CommandPalette";
import { TodayPanel } from "./components/TodayPanel";
import { TaskDialog, type TaskDialogState } from "./components/TaskDialog";
import { StatsModal } from "./components/StatsModal";
import { ToastStack } from "./components/Toast";
import { WelcomeTour } from "./components/WelcomeTour";
import { HelpModal } from "./components/HelpModal";

export default function App() {
  const init = useNebula((s) => s.init);
  const navigate = useNavigate();
  const [todayOpen, setTodayOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newTask, setNewTask] = useState<TaskDialogState | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  useEffect(() => init(), [init]);

  useEffect(() => {
    const onOpenSettings = (): void => {
      void navigate("/ajustes");
    };
    const onOpenToday = (): void => setTodayOpen(true);
    const onOpenHelp = (): void => setHelpOpen(true);
    // el detalle permite precargar proyecto/estado (p. ej. desde una columna)
    const onNewTask = (e: Event): void =>
      setNewTask({ mode: "create", defaults: (e as CustomEvent<TaskDialogState["defaults"]>).detail ?? undefined });
    const onKey = (e: KeyboardEvent): void => {
      // los atajos de una tecla no deben dispararse mientras se escribe
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTodayOpen((o) => !o);
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewTask({ mode: "create" });
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener("nebula:open-settings", onOpenSettings);
    window.addEventListener("nebula:open-today", onOpenToday);
    window.addEventListener("nebula:open-help", onOpenHelp);
    const onOpenStats = (): void => setStatsOpen(true);
    window.addEventListener("nebula:new-task", onNewTask);
    window.addEventListener("nebula:open-stats", onOpenStats);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("nebula:open-settings", onOpenSettings);
      window.removeEventListener("nebula:open-today", onOpenToday);
      window.removeEventListener("nebula:open-help", onOpenHelp);
      window.removeEventListener("nebula:new-task", onNewTask);
      window.removeEventListener("nebula:open-stats", onOpenStats);
      window.removeEventListener("keydown", onKey);
    };
  }, [navigate]);

  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tareas" element={<TasksPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/ajustes" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="sincronizacion" element={<SyncSettings />} />
          <Route path="notificaciones" element={<NotificationSettings />} />
          <Route path="acceso" element={<AccessSettings />} />
        </Route>
        {/* cualquier otra ruta vuelve al mapa en vez de dejar la página en blanco */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CommandPalette onOpenSettings={() => navigate("/ajustes")} />
      <TodayPanel open={todayOpen} onClose={() => setTodayOpen(false)} />
      <TaskDialog state={newTask} onClose={() => setNewTask(null)} onSaved={() => {}} />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <WelcomeTour />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastStack />
    </div>
  );
}
