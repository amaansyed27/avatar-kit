import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Engine } from "../../lib/api";

type Diagnostic = { os: string; python: string; data_directory: string; free_disk_bytes: number; ffmpeg: boolean; engines: Engine[] };

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

  return <main>
    <header className="split-header"><div><p className="eyebrow">MACHINE CHECK</p><h1>Diagnostics</h1><p className="intro">Live status for the local runtime and generation engines.</p></div><button className="primary-small" disabled={running} onClick={() => void load()}>{running ? "Checking…" : "Run again"}</button></header>
    {error && <aside className="error">{error}</aside>}
    {info && <div className="diagnostics">
      <div className="diagnostic-overview">
        <article><span className={`health-dot ${info.ffmpeg ? "good" : "bad"}`} /><div><b>Media runtime</b><small>{info.ffmpeg ? "FFmpeg and ffprobe available" : "FFmpeg or ffprobe missing"}</small></div></article>
        <article><strong>{formatStorage(info.free_disk_bytes)}</strong><div><b>Free disk space</b><small>Available on the AvatarKit data drive</small></div></article>
      </div>
      <p><b>System</b>{info.os}</p><p><b>Backend Python</b>{info.python}</p><p><b>Data directory</b><code>{info.data_directory}</code></p>
      <h2>Generation engines</h2>
      <div className="engine-grid">{info.engines.map(engine => <article key={engine.engine_id}>
        <span className={`health-dot ${engine.installed && engine.models_ready ? "good" : "bad"}`} />
        <div><b>{engine.display_name}</b><span>{engine.installed ? "Installed" : "Not installed"} · {engine.models_ready ? "models ready" : "models missing"}</span><small>{engine.detail}</small></div>
      </article>)}</div>
    </div>}
  </main>;
}
