import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useNebula } from "./stores/nebula";
import { Home } from "./pages/Home";
import { ProjectPage } from "./pages/Project";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsModal } from "./components/SettingsModal";

export default function App() {
  const init = useNebula((s) => s.init);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => init(), [init]);

  useEffect(() => {
    const onOpen = (): void => setSettingsOpen(true);
    window.addEventListener("nebula:open-settings", onOpen);
    return () => window.removeEventListener("nebula:open-settings", onOpen);
  }, []);

  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
      <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
