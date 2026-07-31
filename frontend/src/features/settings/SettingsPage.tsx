import { useEffect, useState } from "react";
import {
  Check,
  ClipboardText,
  Cpu,
  FloppyDisk,
  FolderOpen,
  Gauge,
  HardDrives,
  ImageSquare,
  ShieldCheck,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { LibrarySummary, Settings } from "../../lib/api";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function SettingsPage({ summary, onChanged }: { summary: LibrarySummary; onChanged: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Settings>("/settings").then(setSettings).catch(() => setError("Could not load local settings."));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await api.put<Settings>("/settings", settings));
      setError("");
      setMessage("Settings saved locally.");
    } catch {
      setError("Could not save local settings.");
    } finally {
      setSaving(false);
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

  const copyPath = () => {
    void navigator.clipboard.writeText(summary.data_directory)
      .then(() => setMessage("Output path copied."))
      .catch(() => setError("Could not copy the output path."));
  };

  return <main className="settings-page">
    <header className="page-heading">
      <div><span className="eyebrow">Preferences and storage</span><h1>Local settings</h1><p>Set generation defaults and control what AvatarKit keeps on this machine.</p></div>
      {settings && <button className="primary-small" type="button" disabled={saving} onClick={() => void save()}>{saving ? <span className="spinner" /> : <FloppyDisk size={18} />} {saving ? "Saving…" : "Save changes"}</button>}
    </header>

    {message && <aside className="success"><Check size={17} weight="bold" /> {message}</aside>}
    {error && <aside className="error">{error}</aside>}

    {settings && <div className="settings-layout">
      <div className="settings-main">
        <section className="settings-panel">
          <div className="settings-panel-heading"><span className="settings-icon"><Gauge size={20} /></span><div><h2>Generation defaults</h2><p>Applied whenever you open a new creation.</p></div></div>
          <div className="form-grid">
            <label className="field">
              <span><ImageSquare size={16} /> Default quality</span>
              <select value={settings.default_preset} onChange={event => setSettings({ ...settings, default_preset: event.target.value })}>
                <option value="fast">Fast preview · 256px</option>
                <option value="balanced">Balanced · recommended</option>
                <option value="best">Best quality · 512px</option>
              </select>
              <small>Balanced is a good default for most modern GPUs.</small>
            </label>
            <label className="field">
              <span><Cpu size={16} /> Preferred compute</span>
              <select value={settings.device} onChange={event => setSettings({ ...settings, device: event.target.value })}>
                <option value="auto">Auto · GPU preferred, CPU fallback</option>
                <option value="cuda">NVIDIA CUDA only</option>
                <option value="cpu">CPU only</option>
              </select>
              <small>CPU is fully supported but takes substantially longer.</small>
            </label>
          </div>
          <div className="setting-rows">
            <label className="switch-row">
              <span><strong>Watermark by default</strong><small>Add a visible AI-generated label to new videos.</small></span>
              <input type="checkbox" checked={settings.watermark_enabled} onChange={event => setSettings({ ...settings, watermark_enabled: event.target.checked })} />
            </label>
            <label className="switch-row">
              <span><strong>Open completed output</strong><small>Open a generation automatically after it finishes.</small></span>
              <input type="checkbox" checked={settings.open_after_generation} onChange={event => setSettings({ ...settings, open_after_generation: event.target.checked })} />
            </label>
            <label className="switch-row">
              <span><strong>Clean failed work files</strong><small>Remove temporary files after an unsuccessful generation.</small></span>
              <input type="checkbox" checked={settings.cleanup_failed} onChange={event => setSettings({ ...settings, cleanup_failed: event.target.checked })} />
            </label>
          </div>
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading"><span className="settings-icon"><ShieldCheck size={20} /></span><div><h2>Upload limits</h2><p>Media outside these limits is rejected before generation.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Maximum file size</span><div className="unit-input"><input type="number" min="1" max="2048" value={settings.max_upload_mb} onChange={event => setSettings({ ...settings, max_upload_mb: Number(event.target.value) })} /><b>MB</b></div></label>
            <label className="field"><span>Maximum audio length</span><div className="unit-input"><input type="number" min="1" max="7200" value={settings.max_audio_seconds} onChange={event => setSettings({ ...settings, max_audio_seconds: Number(event.target.value) })} /><b>seconds</b></div></label>
          </div>
        </section>
      </div>

      <aside className="settings-side">
        <section className="storage-panel">
          <div className="settings-panel-heading"><span className="settings-icon"><HardDrives size={20} /></span><div><h2>Generated media</h2><p>Models are never removed by cleanup.</p></div></div>
          <div className="storage-stats">
            <div><strong>{summary.completed}</strong><span>Ready videos</span></div>
            <div><strong>{summary.total}</strong><span>Total jobs</span></div>
            <div><strong>{formatBytes(summary.output_bytes)}</strong><span>Video storage</span></div>
          </div>
          <div className="path-block">
            <span><FolderOpen size={16} /> Output folder</span>
            <code>{summary.data_directory || "Loading…"}</code>
            <div>
              <button type="button" onClick={copyPath}><ClipboardText size={16} /> Copy path</button>
            </div>
          </div>
        </section>

        <section className="cleanup-panel">
          <div className="settings-panel-heading"><span className="settings-icon danger"><Warning size={20} /></span><div><h2>Cleanup</h2><p>Remove local history and media without touching installed engines or models.</p></div></div>
          <button type="button" onClick={() => void clear("failed")}>Clear incomplete jobs</button>
          <button className="danger-button" type="button" onClick={() => void clear("all")}><Trash size={17} /> Clear all generations</button>
        </section>
      </aside>
    </div>}
  </main>;
}
