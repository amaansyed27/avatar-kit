import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LibrarySummary, Settings } from "../../lib/api";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsPage({ summary, onChanged }: { summary: LibrarySummary; onChanged: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Settings>("/settings").then(setSettings).catch(() => setError("Could not load local settings."));
  }, []);

  const save = async () => {
    if (!settings) return;
    try {
      setSettings(await api.put<Settings>("/settings", settings));
      setError("");
      setMessage("Settings saved locally.");
    } catch {
      setError("Could not save local settings.");
    }
  };

  const clear = async (scope: "all" | "failed") => {
    const wording = scope === "all"
      ? `Delete all ${summary.total} jobs, generated videos, source copies, and logs? Models and settings will be kept.`
      : "Delete failed, cancelled, and incomplete jobs plus their local files?";
    if (!window.confirm(`${wording} This cannot be undone.`)) return;
    try {
      const result = await api.delete<{ deleted: number }>(`/jobs?scope=${scope}`);
      setError("");
      setMessage(`Deleted ${result.deleted} local ${result.deleted === 1 ? "job" : "jobs"}.`);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not clear local generations.");
    }
  };

  return <main className="settings-page">
    <header><p className="eyebrow">PREFERENCES & STORAGE</p><h1>Local settings</h1><p className="intro">Control generation defaults and the files AvatarKit keeps on this machine.</p></header>
    {message && <aside className="success">{message}</aside>}
    {error && <aside className="error">{error}</aside>}
    {settings && <>
      <section className="settings-section">
        <div className="section-heading"><span className="step">01 / Generation defaults</span><p>These choices are applied when you open the Create page.</p></div>
        <div className="settings-grid">
          <label>Default quality<select value={settings.default_preset} onChange={event => setSettings({ ...settings, default_preset: event.target.value })}><option value="fast">Fast test · 256px</option><option value="balanced">Balanced</option><option value="best">Best quality · 512px</option></select><small>Fast is recommended for quick previews.</small></label>
          <label>Preferred compute<select value={settings.device} onChange={event => setSettings({ ...settings, device: event.target.value })}><option value="auto">Auto · use GPU when available</option><option value="cuda">NVIDIA CUDA</option><option value="cpu">CPU only</option></select><small>CPU works but takes substantially longer.</small></label>
          <label className="toggle-row"><span><b>Watermark by default</b><small>Add a visible AI GENERATED label to new videos.</small></span><input type="checkbox" checked={settings.watermark_enabled} onChange={event => setSettings({ ...settings, watermark_enabled: event.target.checked })} /></label>
        </div>
      </section>
      <section className="settings-section">
        <div className="section-heading"><span className="step">02 / Local limits</span><p>Files outside these limits are rejected before generation.</p></div>
        <div className="settings-grid two-column">
          <label>Maximum file size<div className="number-input"><input type="number" min="1" max="2048" value={settings.max_upload_mb} onChange={event => setSettings({ ...settings, max_upload_mb: Number(event.target.value) })} /><span>MB</span></div></label>
          <label>Maximum audio length<div className="number-input"><input type="number" min="1" max="7200" value={settings.max_audio_seconds} onChange={event => setSettings({ ...settings, max_audio_seconds: Number(event.target.value) })} /><span>seconds</span></div></label>
        </div>
      </section>
      <button className="save-settings" onClick={() => void save()}>Save local settings</button>
    </>}
    <section className="settings-section storage-section">
      <div className="section-heading"><span className="step">03 / Generated media</span><p>Model downloads are preserved by every cleanup action below.</p></div>
      <div className="storage-card">
        <div><strong>{summary.completed}</strong><span>ready videos</span></div>
        <div><strong>{summary.total}</strong><span>total jobs</span></div>
        <div><strong>{formatBytes(summary.output_bytes)}</strong><span>video storage</span></div>
      </div>
      <div className="data-path"><div><b>Output folder</b><code>{summary.data_directory || "Loading…"}</code></div><button onClick={() => void navigator.clipboard.writeText(summary.data_directory).then(() => setMessage("Output path copied.")).catch(() => setError("Could not copy the output path."))}>Copy path</button></div>
    </section>
    <section className="danger-zone">
      <div><span className="step">04 / Cleanup</span><h2>Clear local generations</h2><p>This removes history and associated media. Installed engines, models, and preferences stay intact.</p></div>
      <div className="danger-actions"><button onClick={() => void clear("failed")}>Clear incomplete jobs</button><button className="danger" onClick={() => void clear("all")}>Clear all generations</button></div>
    </section>
  </main>;
}
