import { useEffect, useMemo, useState } from "react";
import {
  GearSix,
  HardDrives,
  Moon,
  PlusSquare,
  Pulse,
  ShieldCheck,
  SquaresFour,
  Sun,
} from "@phosphor-icons/react";
import { CreatePage } from "./features/generator/CreatePage";
import { HistoryPage } from "./features/history/HistoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { DiagnosticsPage } from "./features/diagnostics/DiagnosticsPage";
import { api } from "./lib/api";
import type { Engine, LibrarySummary } from "./lib/api";
import "./index.css";

type PageName = "Create" | "History" | "Settings" | "Diagnostics";
type ThemeName = "dark" | "paper";

const navigation = [
  { id: "Create" as const, label: "Create", icon: PlusSquare },
  { id: "History" as const, label: "Library", icon: SquaresFour },
  { id: "Settings" as const, label: "Settings", icon: GearSix },
  { id: "Diagnostics" as const, label: "Diagnostics", icon: Pulse },
];

const pageDetails: Record<PageName, { title: string; description: string }> = {
  Create: { title: "New avatar", description: "Portrait and voice workspace" },
  History: { title: "Library", description: "Your local generations" },
  Settings: { title: "Settings", description: "Defaults, storage, and privacy" },
  Diagnostics: { title: "Diagnostics", description: "Runtime and engine health" },
};

const emptySummary: LibrarySummary = {
  total: 0,
  completed: 0,
  active: 0,
  failed: 0,
  output_bytes: 0,
  data_directory: "",
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function initialTheme(): ThemeName {
  const saved = window.localStorage.getItem("avatarkit-theme");
  if (saved === "dark" || saved === "paper") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "paper" : "dark";
}

export default function App() {
  const [current, setCurrent] = useState<PageName>("Create");
  const [summary, setSummary] = useState<LibrarySummary>(emptySummary);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [theme, setTheme] = useState<ThemeName>(initialTheme);

  const refreshSummary = () => api.get<LibrarySummary>("/library").then(setSummary).catch(() => undefined);
  const refreshEngines = () => api.get<Engine[]>("/engines").then(setEngines).catch(() => undefined);

  useEffect(() => {
    void refreshSummary();
    void refreshEngines();
    const timer = window.setInterval(() => {
      void refreshSummary();
      void refreshEngines();
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("avatarkit-theme", theme);
  }, [theme]);

  const readyEngines = useMemo(
    () => engines.filter(engine => engine.installed && engine.models_ready).length,
    [engines],
  );
  const allEnginesReady = engines.length > 0 && readyEngines === engines.length;
  const details = pageDetails[current];

  return <div className="app-shell" data-theme={theme}>
    <aside className="sidebar">
      <button className="brand-lockup" type="button" onClick={() => setCurrent("Create")} aria-label="Open AvatarKit Create">
        <span>Avatar<span>Kit</span></span>
        <small>LOCAL-FIRST</small>
      </button>

      <nav className="primary-nav" aria-label="Workspace">
        <p className="nav-kicker">Workspace</p>
        {navigation.map(item => {
          const Icon = item.icon;
          return <button
            key={item.id}
            type="button"
            className={current === item.id ? "nav-item active" : "nav-item"}
            aria-current={current === item.id ? "page" : undefined}
            onClick={() => setCurrent(item.id)}
          >
            <Icon size={20} weight={current === item.id ? "fill" : "regular"} />
            <span>{item.label}</span>
            {item.id === "History" && summary.completed > 0 && <b>{summary.completed}</b>}
            {item.id === "History" && summary.active > 0 && <em>{summary.active}</em>}
          </button>;
        })}
      </nav>

      <section className="sidebar-storage" aria-label="Local library storage">
        <div className="sidebar-section-title"><HardDrives size={17} /><span>Local library</span></div>
        <strong>{formatBytes(summary.output_bytes)}</strong>
        <small>{summary.completed} ready {summary.completed === 1 ? "video" : "videos"}</small>
        {summary.active > 0 && <p><span className="status-dot busy" /> {summary.active} generation active</p>}
      </section>

      <footer className="privacy-note">
        <span><ShieldCheck size={17} weight="fill" /> Local processing</span>
        <small>No accounts · No telemetry</small>
      </footer>
    </aside>

    <div className="app-frame">
      <header className="app-topbar">
        <div className="topbar-title">
          <strong>{details.title}</strong>
          <span>{details.description}</span>
        </div>
        <div className="topbar-status">
          <button
            type="button"
            className="engine-status"
            onClick={() => setCurrent("Diagnostics")}
            title="Open diagnostics"
          >
            <span className={`status-dot ${allEnginesReady ? "ready" : "warning"}`} />
            <span>{engines.length ? `${readyEngines}/${engines.length} engines ready` : "Checking engines"}</span>
          </button>
          <span className="local-chip"><ShieldCheck size={16} weight="fill" /> All processing is local</span>
          <button
            type="button"
            className="icon-control theme-toggle"
            aria-label={`Switch to ${theme === "dark" ? "paper" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "paper" : "dark"} theme`}
            onClick={() => setTheme(theme === "dark" ? "paper" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      <div className="page-scroll">
        {current === "Create" && <CreatePage />}
        {current === "History" && <HistoryPage onChanged={() => void refreshSummary()} onCreate={() => setCurrent("Create")} />}
        {current === "Settings" && <SettingsPage summary={summary} onChanged={() => void refreshSummary()} />}
        {current === "Diagnostics" && <DiagnosticsPage />}
      </div>
    </div>
  </div>;
}
