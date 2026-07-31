import { useEffect, useState } from "react";
import {
  CheckCircle,
  Cpu,
  Database,
  FilmStrip,
  FolderOpen,
  HardDrives,
  Pulse,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Engine } from "../../lib/api";

type Diagnostic = {
  os: string;
  python: string;
  data_directory: string;
  free_disk_bytes: number;
  ffmpeg: boolean;
  engines: Engine[];
};

function formatStorage(bytes: number) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function DiagnosticsPage() {
  const [info, setInfo] = useState<Diagnostic | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setRunning(true);
    setError("");
    try {
      setInfo(await api.get<Diagnostic>("/diagnostics"));
    } catch {
      setError("Diagnostics could not reach the local backend.");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const readyCount = info?.engines.filter(engine => engine.installed && engine.models_ready).length ?? 0;
  const fullyReady = Boolean(info?.ffmpeg && info.engines.length > 0 && readyCount === info.engines.length);

  return <main className="diagnostics-page">
    <header className="page-heading">
      <div><span className="eyebrow">Machine check</span><h1>Diagnostics</h1><p>Live status for AvatarKit’s local runtime, storage, and generation engines.</p></div>
      <button className="primary-small" type="button" disabled={running} onClick={() => void load()}>
        {running ? <SpinnerGap className="spin" size={18} /> : <Pulse size={18} />}
        {running ? "Checking…" : "Run again"}
      </button>
    </header>

    {error && <aside className="error">{error}</aside>}

    {info && <>
      <section className={`health-banner ${fullyReady ? "ready" : "attention"}`}>
        {fullyReady ? <CheckCircle size={25} weight="fill" /> : <WarningCircle size={25} weight="fill" />}
        <div><strong>{fullyReady ? "AvatarKit is ready to generate" : "Some local components need attention"}</strong><span>{fullyReady ? "Media tools and all installed engines passed their readiness checks." : "Review the component details below before starting a generation."}</span></div>
        <b>{readyCount}/{info.engines.length} engines</b>
      </section>

      <div className="diagnostic-grid">
        <section className="system-panel">
          <div className="panel-title"><h2>System runtime</h2><span>Live</span></div>
          <div className="runtime-list">
            <div><span className={`runtime-icon ${info.ffmpeg ? "good" : "bad"}`}><FilmStrip size={19} /></span><span><strong>Media runtime</strong><small>{info.ffmpeg ? "FFmpeg and ffprobe available" : "FFmpeg or ffprobe missing"}</small></span><b>{info.ffmpeg ? "Ready" : "Missing"}</b></div>
            <div><span className="runtime-icon"><HardDrives size={19} /></span><span><strong>Free disk space</strong><small>AvatarKit data drive</small></span><b>{formatStorage(info.free_disk_bytes)}</b></div>
            <div><span className="runtime-icon"><Cpu size={19} /></span><span><strong>Backend Python</strong><small>{info.os}</small></span><b>{info.python}</b></div>
            <div><span className="runtime-icon"><FolderOpen size={19} /></span><span><strong>Data directory</strong><small><code>{info.data_directory}</code></small></span></div>
          </div>
        </section>

        <section className="engines-panel">
          <div className="panel-title"><h2>Generation engines</h2><span>{readyCount} ready</span></div>
          <div className="engine-list">{info.engines.map(engine => {
            const ready = engine.installed && engine.models_ready;
            return <article key={engine.engine_id}>
              <span className={`engine-mark ${ready ? "good" : "bad"}`}>{ready ? <CheckCircle size={20} weight="fill" /> : <WarningCircle size={20} weight="fill" />}</span>
              <div><strong>{engine.display_name}</strong><span>{engine.installed ? "Installed" : "Not installed"} · {engine.models_ready ? "Models ready" : "Models missing"}</span><small>{engine.detail}</small></div>
              <b>{ready ? "Ready" : "Setup needed"}</b>
            </article>;
          })}</div>
        </section>
      </div>

      <section className="diagnostic-note">
        <Database size={19} />
        <div><strong>Private by design</strong><span>Diagnostics reads local system information only. Nothing is sent to an account or remote service.</span></div>
      </section>
    </>}
  </main>;
}
