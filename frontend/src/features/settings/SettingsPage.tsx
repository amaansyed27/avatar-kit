import { useEffect, useState } from "react";
import { ArrowRight, Check, ClipboardText, Cpu, DownloadSimple, FloppyDisk, FolderOpen, Gauge, HardDrives, ShieldCheck, Trash, Warning } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { LibrarySummary, Settings, StorageReport } from "../../lib/api";

type Tab = "general" | "storage" | "privacy" | "support";
const tabs: { id: Tab; label: string }[] = [{ id: "general", label: "General" }, { id: "storage", label: "Storage" }, { id: "privacy", label: "Privacy & limits" }, { id: "support", label: "Support" }];
const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export function SettingsPage({ summary: _summary, onChanged, onOpenModels, onRerunSetup }: { summary: LibrarySummary; onChanged: () => void; onOpenModels: () => void; onRerunSetup: () => void }) {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshStorage = () => api.get<StorageReport>("/storage").then(setStorage).catch(() => setError("Could not read local storage."));
  useEffect(() => { void api.get<Settings>("/settings").then(setSettings); void refreshStorage(); }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true); setError("");
    try { setSettings(await api.put<Settings>("/settings", settings)); await refreshStorage(); setMessage("Changes saved on this computer."); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save settings."); }
    finally { setSaving(false); }
  };

  const clearJobs = async (scope: "all" | "failed") => {
    if (!window.confirm(scope === "all" ? "Delete every generation and its local media? Models and settings are kept." : "Delete failed and incomplete generations?")) return;
    try { const result = await api.delete<{ deleted: number }>(`/jobs?scope=${scope}`); setMessage(`Deleted ${result.deleted} generation${result.deleted === 1 ? "" : "s"}.`); onChanged(); await refreshStorage(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Cleanup failed."); }
  };

  const clearCategory = async (id: string, label: string) => {
    if (!window.confirm(`Clear ${label.toLowerCase()}? This cannot be undone.`)) return;
    try { const result = await api.delete<{ removed_bytes: number; storage: StorageReport }>(`/storage/${id}`); setStorage(result.storage); setMessage(`Cleared ${formatBytes(result.removed_bytes)} from ${label.toLowerCase()}.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Cleanup failed."); }
  };

  const rerun = async () => { if (!settings) return; await api.put("/settings", { setup_completed: false }); onRerunSetup(); };

  return <main className="settings-page managed-settings">
    <header className="page-heading"><div><span className="eyebrow">Control center</span><h1>Settings</h1><p>Everything AvatarKit stores and uses is under your control.</p></div>{settings && <button className="primary-small" disabled={saving} onClick={() => void save()}><FloppyDisk size={18} /> {saving ? "Saving…" : "Save changes"}</button>}</header>
    {message && <aside className="success"><Check size={17} weight="bold" />{message}</aside>}{error && <aside className="error">{error}</aside>}
    <div className="settings-tabs" role="tablist">{tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>

    {settings && tab === "general" && <div className="settings-stack">
      <section className="settings-panel"><div className="settings-panel-heading"><span className="settings-icon"><Gauge size={20} /></span><div><h2>Generation quality</h2><p>The starting point for every new avatar.</p></div></div><div className="choice-grid three compact">{[["fast", "Fast", "Quick 256px previews"], ["balanced", "Balanced", "Recommended default"], ["best", "Best", "Higher-detail 512px"]].map(([value, title, copy]) => <button key={value} type="button" className={settings.default_preset === value ? "choice-card selected" : "choice-card"} onClick={() => setSettings({ ...settings, default_preset: value })}><strong>{title}</strong><small>{copy}</small></button>)}</div></section>
      <section className="settings-panel"><div className="settings-panel-heading"><span className="settings-icon"><Cpu size={20} /></span><div><h2>Compute</h2><p>Choose which hardware is allowed to run models.</p></div></div><div className="choice-grid three compact">{[["auto", "Automatic", "GPU first, CPU fallback"], ["cuda", "NVIDIA GPU", "CUDA only"], ["cpu", "CPU only", "Compatible but slower"]].map(([value, title, copy]) => <button key={value} type="button" className={settings.device === value ? "choice-card selected" : "choice-card"} onClick={() => setSettings({ ...settings, device: value })}><strong>{title}</strong><small>{copy}</small></button>)}</div></section>
      <section className="settings-panel setting-rows"><label className="switch-row"><span><strong>Open completed video</strong><small>Open the output automatically after generation.</small></span><input type="checkbox" checked={settings.open_after_generation} onChange={event => setSettings({ ...settings, open_after_generation: event.target.checked })} /></label><label className="switch-row"><span><strong>Watermark by default</strong><small>Mark new videos as AI-generated.</small></span><input type="checkbox" checked={settings.watermark_enabled} onChange={event => setSettings({ ...settings, watermark_enabled: event.target.checked })} /></label></section>
    </div>}

    {settings && !storage && tab === "storage" && <section className="settings-panel storage-loading"><span className="spinner" /><div><strong>Calculating local storage…</strong><small>Scanning model, cache, and generation folders.</small></div></section>}
    {settings && storage && tab === "storage" && <div className="settings-stack">
      <section className="settings-panel storage-hero"><div><span className="settings-icon"><HardDrives size={20} /></span><div><h2>{formatBytes(storage.used_bytes)} used by AvatarKit</h2><p>{formatBytes(storage.free_bytes)} free on the data drive.</p></div></div><button className="secondary-button" onClick={onOpenModels}>Manage models <ArrowRight size={17} /></button></section>
      <section className="settings-panel"><div className="settings-panel-heading"><span className="settings-icon"><FolderOpen size={20} /></span><div><h2>File locations</h2><p>Models and app data stay together; finished videos can go elsewhere.</p></div></div><label className="field"><span>Finished video folder</span><input value={settings.output_directory} placeholder={storage.output_directory} onChange={event => setSettings({ ...settings, output_directory: event.target.value })} /><small>Leave blank to use AvatarKit's default output folder.</small></label><div className="path-list"><div><span>App data & models</span><code>{storage.data_directory}</code><button aria-label="Copy app data path" onClick={() => void navigator.clipboard.writeText(storage.data_directory)}><ClipboardText size={16} /></button></div><div><span>Current video folder</span><code>{storage.output_directory}</code><button aria-label="Copy output path" onClick={() => void navigator.clipboard.writeText(storage.output_directory)}><ClipboardText size={16} /></button></div></div></section>
      <section className="settings-panel"><div className="settings-panel-heading"><span className="settings-icon"><HardDrives size={20} /></span><div><h2>Storage breakdown</h2><p>Clear disposable data without touching models or finished work.</p></div></div><div className="storage-table">{storage.categories.map(category => <div key={category.id}><span><strong>{category.label}</strong><small>{formatBytes(category.bytes)}</small></span>{category.clearable ? <button onClick={() => void clearCategory(category.id, category.label)}>Clear</button> : <em>Managed</em>}</div>)}</div></section>
      <section className="settings-panel danger-zone"><div><Warning size={20} /><span><strong>Generation cleanup</strong><small>These actions remove local library records and media.</small></span></div><div><button onClick={() => void clearJobs("failed")}>Clear incomplete</button><button className="danger-button" onClick={() => void clearJobs("all")}><Trash size={16} /> Clear all generations</button></div></section>
    </div>}

    {settings && tab === "privacy" && <div className="settings-stack"><section className="settings-panel"><div className="settings-panel-heading"><span className="settings-icon"><ShieldCheck size={20} /></span><div><h2>Local data policy</h2><p>No account, cloud upload, analytics, or telemetry.</p></div></div><div className="setting-rows"><label className="switch-row"><span><strong>Keep source files</strong><small>Retain uploaded portraits and audio with each job.</small></span><input type="checkbox" checked={settings.keep_source_files} onChange={event => setSettings({ ...settings, keep_source_files: event.target.checked })} /></label><label className="switch-row"><span><strong>Clean temporary files automatically</strong><small>Remove disposable working files after generation.</small></span><input type="checkbox" checked={settings.auto_cleanup_temp} onChange={event => setSettings({ ...settings, auto_cleanup_temp: event.target.checked })} /></label></div></section><section className="settings-panel"><div className="settings-panel-heading"><div><h2>Safety limits</h2><p>Reject oversized local media before a job starts.</p></div></div><div className="form-grid"><label className="field"><span>Maximum upload (MB)</span><input type="number" min="1" max="2048" value={settings.max_upload_mb} onChange={event => setSettings({ ...settings, max_upload_mb: Number(event.target.value) })} /></label><label className="field"><span>Maximum audio (seconds)</span><input type="number" min="1" max="7200" value={settings.max_audio_seconds} onChange={event => setSettings({ ...settings, max_audio_seconds: Number(event.target.value) })} /></label></div></section></div>}

    {tab === "support" && <div className="settings-stack"><section className="settings-panel"><div className="settings-panel-heading"><span className="settings-icon"><DownloadSimple size={20} /></span><div><h2>Troubleshooting</h2><p>Export information when you need help.</p></div></div><div className="support-actions"><a href="/api/v1/logs/download" download><DownloadSimple size={17} /> Download logs</a><a href="/api/v1/diagnostics/report" download><ClipboardText size={17} /> Diagnostic report</a></div><p className="muted-copy">Review bundles before sharing—they may include local file paths and engine errors.</p></section><section className="settings-panel"><div className="settings-panel-heading"><div><h2>Setup</h2><p>Revisit storage, performance, and model choices.</p></div></div><button className="secondary-button" onClick={() => void rerun()}>Run setup again <ArrowRight size={17} /></button></section></div>}
  </main>;
}
