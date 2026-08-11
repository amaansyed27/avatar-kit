import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle, DownloadSimple, FileAudio, ImageSquare, Info, MagicWand, ShieldCheck, Sparkle, SquaresFour, UploadSimple, VideoCamera, X } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Engine, Job, Settings } from "../../lib/api";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const audioTypes = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac", "audio/ogg", "audio/webm"];
const finishedStates = ["completed", "failed", "cancelled"];

function useObjectUrl(file: File | null) { const url = useMemo(() => file ? URL.createObjectURL(file) : "", [file]); useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]); return url; }
function HiddenFileInput({ accept, onFile, children, className }: { accept: string; onFile: (file: File | null) => void; children: ReactNode; className: string }) { const select = (event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0] ?? null); return <label className={className}><input className="visually-hidden" type="file" accept={accept} onChange={select} />{children}</label>; }
function formatFileSize(file: File) { return file.size < 1024 ** 2 ? `${Math.round(file.size / 1024)} KB` : `${(file.size / 1024 ** 2).toFixed(1)} MB`; }

export function CreatePage({ engines, checkingEngines, onOpenLibrary, onOpenModels }: { engines: Engine[]; checkingEngines: boolean; onOpenLibrary: () => void; onOpenModels: () => void }) {
  const [step, setStep] = useState(0);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [mode, setMode] = useState<"speech" | "clone">("speech");
  const [script, setScript] = useState("");
  const [preset, setPreset] = useState("balanced");
  const [watermark, setWatermark] = useState(true);
  const [consent, setConsent] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const portraitUrl = useObjectUrl(portrait);
  const speechFile = mode === "speech" ? audio : reference;
  const speechUrl = useObjectUrl(speechFile);

  useEffect(() => { void api.get<Settings>("/settings").then(value => { setSettings(value); setPreset(value.default_preset); setWatermark(value.watermark_enabled); }); }, []);
  useEffect(() => { const load = () => api.get<Job[]>("/jobs").then(value => setRecentJobs(value.slice(0, 3))).catch(() => undefined); void load(); const timer = window.setInterval(() => void load(), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!job || finishedStates.includes(job.state)) return; const timer = window.setInterval(() => void api.get<Job>(`/jobs/${job.id}`).then(setJob), 1500); return () => clearInterval(timer); }, [job]);

  const sadReady = engines.some(engine => engine.engine_id === "sadtalker" && engine.installed && engine.models_ready);
  const chatterReady = engines.some(engine => engine.engine_id === "chatterbox" && engine.installed && engine.models_ready);
  const enginesReady = sadReady && (mode === "speech" || chatterReady);
  const voiceReady = Boolean(mode === "speech" ? audio : reference && script.trim());
  const jobActive = Boolean(job && !finishedStates.includes(job.state));
  const ready = Boolean(portrait && voiceReady && consent && enginesReady && !jobActive);
  const canContinue = step === 0 ? Boolean(portrait) : step === 1 ? voiceReady : ready;

  const setImage = (file: File | null) => { if (!file || imageTypes.includes(file.type)) { setPortrait(file); setError(""); } else setError("Choose a PNG, JPG, or WEBP portrait."); };
  const setSpeech = (file: File | null, target: "speech" | "reference") => { if (file && !audioTypes.includes(file.type)) return setError("Choose a supported audio file."); if (target === "speech") setAudio(file); else setReference(file); setError(""); };
  async function create() { let next: Job | null = null; try { setError(""); next = await api.post<Job>("/jobs", { workflow: mode, preset, watermark }); const send = async (kind: string, file: File) => { const form = new FormData(); form.append("file", file); const response = await fetch(`/api/v1/jobs/${next!.id}/inputs/${kind}`, { method: "POST", body: form }); if (!response.ok) throw new Error(await response.text()); }; await send("portrait", portrait!); await send(mode === "speech" ? "audio" : "reference", speechFile!); setJob(await api.post<Job>(`/jobs/${next.id}/start`)); } catch { if (next) void api.delete(`/jobs/${next.id}`); setError("AvatarKit could not queue these files. Check Diagnostics for details."); } }

  return <main className="studio-page guided-create">
    <header className="create-heading"><div><span className="eyebrow">New generation</span><h1>Create a talking avatar</h1><p>Three simple steps. Everything is processed locally.</p></div><div className="create-stepper">{["Portrait", "Voice", "Review"].map((label, index) => <span key={label} className={index === step ? "active" : index < step ? "done" : ""}><b>{index < step ? <Check size={13} weight="bold" /> : index + 1}</b>{label}</span>)}</div></header>
    {error && <aside className="error">{error}</aside>}
    {!checkingEngines && !enginesReady && <aside className="model-blocker"><span><Info size={19} /><span><strong>Models need attention</strong><small>{mode === "clone" ? "SadTalker and Chatterbox must be ready." : "SadTalker must be ready before generation."}</small></span></span><button onClick={onOpenModels}>Manage models <ArrowRight size={16} /></button></aside>}

    <section className="guided-card">
      {step === 0 && <div className="guided-step"><div className="guided-copy"><span className="step-number">01</span><h2>Choose a clear portrait</h2><p>Use a front-facing photo with one visible person and even lighting.</p><ul><li>PNG, JPG, or WEBP</li><li>Face should not be obstructed</li><li>Head-and-shoulders framing works best</li></ul></div><div className="portrait-picker">{portrait ? <div className="portrait-preview"><img src={portraitUrl} alt="Selected portrait" /><HiddenFileInput accept=".png,.jpg,.jpeg,.webp" onFile={setImage} className="replace-control"><UploadSimple size={16} /> Replace portrait</HiddenFileInput></div> : <HiddenFileInput accept=".png,.jpg,.jpeg,.webp" onFile={setImage} className="large-upload"><span><ImageSquare size={30} /></span><strong>Choose a portrait</strong><small>or drop an image here</small></HiddenFileInput>}</div></div>}

      {step === 1 && <div className="guided-step"><div className="guided-copy"><span className="step-number">02</span><h2>Add the voice</h2><p>Use finished speech audio, or create speech from text with a voice reference.</p><div className="mode-cards"><button className={mode === "speech" ? "selected" : ""} onClick={() => setMode("speech")}><FileAudio size={20} /><span><strong>Existing speech</strong><small>Animate with a recording</small></span></button><button className={mode === "clone" ? "selected" : ""} onClick={() => setMode("clone")}><MagicWand size={20} /><span><strong>Clone from text</strong><small>Reference voice + script</small></span></button></div></div><div className="voice-picker">{mode === "clone" && <label className="script-field"><span>What should the avatar say?</span><textarea value={script} onChange={event => setScript(event.target.value)} placeholder="Write the script…" /></label>}{speechFile ? <div className="selected-audio"><audio controls src={speechUrl} /><span><strong>{speechFile.name}</strong><small>{formatFileSize(speechFile)} · stays local</small></span><button aria-label="Remove audio" onClick={() => mode === "speech" ? setAudio(null) : setReference(null)}><X size={17} /></button></div> : <HiddenFileInput accept="audio/*" onFile={file => setSpeech(file, mode === "speech" ? "speech" : "reference")} className="large-upload audio"><span><UploadSimple size={27} /></span><strong>{mode === "speech" ? "Choose speech audio" : "Choose a voice sample"}</strong><small>WAV, MP3, M4A, FLAC, OGG, WEBM</small></HiddenFileInput>}</div></div>}

      {step === 2 && <div className="review-step"><div className="review-preview"><img src={portraitUrl} alt="Portrait to animate" /><span><VideoCamera size={17} weight="fill" /> Ready to animate</span></div><div className="review-details"><span className="step-number">03</span><h2>Review and generate</h2><div className="review-summary"><div><span>Voice</span><strong>{mode === "speech" ? "Existing speech" : "Cloned from text"}</strong></div><div><span>Audio</span><strong>{speechFile?.name}</strong></div><div><span>Compute</span><strong>{settings?.device === "cpu" ? "CPU only" : settings?.device === "cuda" ? "NVIDIA GPU" : "Automatic"}</strong></div></div><details className="advanced-settings"><summary>Advanced settings</summary><label className="field"><span>Quality</span><select value={preset} onChange={event => setPreset(event.target.value)}><option value="fast">Fast preview</option><option value="balanced">Balanced</option><option value="best">Best quality</option></select></label><label className="switch-row"><span><strong>Visible watermark</strong><small>Mark output as AI-generated</small></span><input type="checkbox" checked={watermark} onChange={event => setWatermark(event.target.checked)} /></label></details><label className="consent-card"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><ShieldCheck size={21} /><span><strong>I have permission to use this face and voice.</strong><small>Only create avatars with explicit consent.</small></span></label><button className="generate-button" disabled={!ready} onClick={() => void create()}>{jobActive ? <span className="spinner" /> : <Sparkle size={20} weight="fill" />}<span><strong>{jobActive ? "Generating…" : "Generate avatar"}</strong><small>Creates and saves an MP4 locally</small></span></button></div></div>}

      <footer className="guided-actions"><button className="secondary-button" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={17} /> Back</button>{step < 2 && <button className="primary-button" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continue <ArrowRight size={17} /></button>}</footer>
    </section>

    {job && <section className={`job-progress ${job.state}`}><span className="job-icon"><MagicWand size={21} /></span><div><strong>{job.state === "completed" ? "Generation complete" : job.phase}</strong><small>Job #{job.id.slice(0, 8)}{job.error_message ? ` · ${job.error_message}` : ""}</small></div>{!finishedStates.includes(job.state) && <button onClick={async () => setJob(await api.post<Job>(`/jobs/${job.id}/cancel`))}>Cancel</button>}</section>}
    {recentJobs.length > 0 && <section className="recent-strip"><div className="recent-strip-heading"><span><SquaresFour size={18} /><strong>Recent generations</strong></span><button onClick={onOpenLibrary}>View library</button></div><div className="recent-items">{recentJobs.map(recent => <article key={recent.id}><div className="recent-thumb">{recent.portrait_path ? <img src={`/api/v1/jobs/${recent.id}/portrait`} alt="" /> : <VideoCamera size={20} />}</div><div><strong>{recent.workflow === "clone" ? "Cloned voice avatar" : "Recorded speech avatar"}</strong><small>{new Date(recent.created_at).toLocaleString()}</small></div><span className={`recent-state ${recent.state}`}>{recent.state === "completed" ? "Ready" : recent.phase}</span></article>)}</div></section>}
    {job?.state === "completed" && <section className="result-panel"><div className="result-heading"><div><CheckCircle size={22} weight="fill" /><span><strong>Your avatar is ready</strong><small>Saved to your local library</small></span></div><a href={`/api/v1/jobs/${job.id}/output`} download><DownloadSimple size={18} /> Download MP4</a></div><video controls src={`/api/v1/jobs/${job.id}/output`} /></section>}
  </main>;
}
