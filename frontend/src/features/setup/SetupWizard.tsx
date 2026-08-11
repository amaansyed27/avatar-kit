import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cpu, FolderOpen, HardDrives, ShieldCheck, Sparkle } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Engine, Settings, StorageReport } from "../../lib/api";

type Props = { settings: Settings; storage: StorageReport; engines: Engine[]; onComplete: (settings: Settings, openModels: boolean) => void };

export function SetupWizard({ settings, storage, engines, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(settings);
  const [installNow, setInstallNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const last = step === 3;

  const finish = async () => {
    setSaving(true); setError("");
    try {
      const saved = await api.put<Settings>("/settings", { ...draft, setup_completed: true });
      if (installNow) {
        await Promise.all(engines.filter(engine => !engine.models_ready).map(engine => api.post(`/engines/${engine.engine_id}/setup`)));
      }
      onComplete(saved, installNow);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not finish setup.");
    } finally { setSaving(false); }
  };

  return <main className="setup-shell">
    <div className="setup-brand"><img src="/favicon.png" alt="" /><strong>AvatarKit</strong><span>First-time setup</span></div>
    <section className="setup-card">
      <div className="setup-progress" aria-label={`Setup step ${step + 1} of 4`}>
        {[0, 1, 2, 3].map(item => <span key={item} className={item <= step ? "active" : ""} />)}
      </div>

      {step === 0 && <div className="setup-content">
        <span className="setup-icon"><Sparkle size={24} /></span><p className="eyebrow">Welcome to AvatarKit</p>
        <h1>Your local avatar studio,<br />set up your way.</h1>
        <p>Choose where files live, how AvatarKit uses your hardware, and when large AI models are downloaded.</p>
        <div className="setup-trust"><ShieldCheck size={22} weight="fill" /><span><strong>Private by design</strong><small>Your portraits, voices, and videos stay on this computer. No account and no telemetry.</small></span></div>
      </div>}

      {step === 1 && <div className="setup-content">
        <span className="setup-icon"><HardDrives size={24} /></span><p className="eyebrow">Storage</p><h1>Choose where your work is saved.</h1>
        <p>App data and models use the AvatarKit data folder. You can place finished videos somewhere easier to find.</p>
        <label className="field setup-path"><span>Finished video folder</span><input value={draft.output_directory} placeholder={storage.output_directory} onChange={event => setDraft({ ...draft, output_directory: event.target.value })} /><small>Leave blank to use the default folder below.</small></label>
        <div className="path-preview"><FolderOpen size={18} /><span><strong>App data & models</strong><code>{storage.data_directory}</code></span></div>
        <div className="setup-note">AI models can use 10–20 GB. You currently have {Math.round(storage.free_bytes / 1024 / 1024 / 1024)} GB free on this drive.</div>
      </div>}

      {step === 2 && <div className="setup-content">
        <span className="setup-icon"><Cpu size={24} /></span><p className="eyebrow">Performance</p><h1>How should AvatarKit run?</h1>
        <p>Auto is best for most people. You can change this at any time.</p>
        <div className="choice-grid">
          {[["auto", "Automatic", "Use NVIDIA GPU when available, otherwise CPU."], ["cuda", "NVIDIA GPU", "Fastest option. Requires a CUDA-capable GPU."], ["cpu", "CPU only", "Works on more computers, but generation is slower."]].map(([value, title, description]) => <button key={value} type="button" className={draft.device === value ? "choice-card selected" : "choice-card"} onClick={() => setDraft({ ...draft, device: value })}><span>{draft.device === value && <Check size={16} weight="bold" />}</span><strong>{title}</strong><small>{description}</small></button>)}
        </div>
      </div>}

      {step === 3 && <div className="setup-content">
        <span className="setup-icon"><Check size={24} /></span><p className="eyebrow">Models</p><h1>Download AI models now?</h1>
        <p>AvatarKit needs SadTalker for animation and Chatterbox for text-to-speech. Downloads run in the background with live logs.</p>
        <div className="choice-grid two">
          <button type="button" className={installNow ? "choice-card selected" : "choice-card"} onClick={() => setInstallNow(true)}><span>{installNow && <Check size={16} weight="bold" />}</span><strong>Install now</strong><small>Start the 10–20 GB download after setup.</small></button>
          <button type="button" className={!installNow ? "choice-card selected" : "choice-card"} onClick={() => setInstallNow(false)}><span>{!installNow && <Check size={16} weight="bold" />}</span><strong>Do it later</strong><small>Explore the app first, then install from Models.</small></button>
        </div>
      </div>}

      {error && <aside className="error">{error}</aside>}
      <footer className="setup-actions">
        <button className="secondary-button" type="button" disabled={step === 0 || saving} onClick={() => setStep(step - 1)}><ArrowLeft size={17} /> Back</button>
        {!last ? <button className="primary-button" type="button" onClick={() => setStep(step + 1)}>Continue <ArrowRight size={17} /></button> : <button className="primary-button" type="button" disabled={saving} onClick={() => void finish()}>{saving ? "Saving…" : "Open AvatarKit"} <ArrowRight size={17} /></button>}
      </footer>
    </section>
    <small className="setup-foot">All choices stay on this computer and can be changed later.</small>
  </main>;
}
