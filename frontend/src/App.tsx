import { useEffect, useState } from "react";
import { CreatePage } from "./features/generator/CreatePage";
import { HistoryPage } from "./features/history/HistoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { DiagnosticsPage } from "./features/diagnostics/DiagnosticsPage";
import { api } from "./lib/api";
import type { LibrarySummary } from "./lib/api";
import "./index.css";

type PageName = "Create" | "History" | "Settings" | "Diagnostics";

const navigation: Array<{ id: PageName; label: string; icon: string }> = [
  { id: "Create", label: "Create", icon: "+" },
  { id: "History", label: "Library", icon: "▦" },
  { id: "Settings", label: "Settings", icon: "⚙" },
  { id: "Diagnostics", label: "Diagnostics", icon: "◉" },
];

const emptySummary: LibrarySummary = {
  total: 0,
  completed: 0,
  active: 0,
  failed: 0,
  output_bytes: 0,
  data_directory: "",
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [current, setCurrent] = useState<PageName>("Create");
  const [summary, setSummary] = useState<LibrarySummary>(emptySummary);

  const refreshSummary = () => api.get<LibrarySummary>("/library").then(setSummary).catch(() => undefined);

  useEffect(() => {
    void refreshSummary();
    const timer = window.setInterval(() => void refreshSummary(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="shell">
    <nav>
      <div className="brand">AVATAR<span>KIT</span><small>LOCAL-FIRST</small></div>
      <div className="nav-group">
        <span className="nav-label">Workspace</span>
        {navigation.map(item => <button key={item.id} className={current === item.id ? "current" : ""} onClick={() => setCurrent(item.id)}>
          <i>{item.icon}</i><span>{item.label}</span>
          {item.id === "History" && summary.completed > 0 && <b>{summary.completed}</b>}
          {item.id === "History" && summary.active > 0 && <em>{summary.active}</em>}
        </button>)}
      </div>
      <aside className="library-mini">
        <span className="nav-label">Local library</span>
        <div><b>{summary.completed}</b><small>Ready videos</small></div>
        <div><b>{formatBytes(summary.output_bytes)}</b><small>Generated media</small></div>
        {summary.active > 0 && <p><i /> {summary.active} generation active</p>}
      </aside>
      <footer><span className="local-dot" /> Local processing<br /><small>No accounts · No telemetry</small></footer>
    </nav>
    {current === "Create" && <CreatePage />}
    {current === "History" && <HistoryPage onChanged={() => void refreshSummary()} onCreate={() => setCurrent("Create")} />}
    {current === "Settings" && <SettingsPage summary={summary} onChanged={() => void refreshSummary()} />}
    {current === "Diagnostics" && <DiagnosticsPage />}
  </div>;
}
