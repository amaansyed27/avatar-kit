import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../../lib/api";
import type { Engine, Job } from "../../lib/api";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const audioTypes = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac", "audio/ogg", "audio/webm"];

function InputPreview({ file, kind, onRemove }: { file: File | null; kind: "image" | "audio"; onRemove: () => void }) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!file) return null;
  return <div className="preview">{kind === "image" ? <img src={url} alt="Portrait preview" /> : <audio controls src={url} />}<div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div><button className="quiet" onClick={onRemove}>Remove</button></div>;
}

function FileField({ accept, label, file, onChange, kind }: { accept: string; label: string; file: File | null; onChange: (file: File | null) => void; kind: "image" | "audio" }) {
  const select = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.files?.[0] ?? null);
  return <label className="dropzone"><input type="file" accept={accept} onChange={select} /><span>{label}</span><small>Choose a local file or drop it here</small><InputPreview file={file} kind={kind} onRemove={() => onChange(null)} /></label>;
}

export function CreatePage() {
  const [portrait, setPortrait] = useState<File | null>(null); const [audio, setAudio] = useState<File | null>(null); const [reference, setReference] = useState<File | null>(null);
  const [mode, setMode] = useState<"speech" | "clone">("speech"); const [script, setScript] = useState(""); const [preset, setPreset] = useState("balanced"); const [watermark, setWatermark] = useState(true); const [consent, setConsent] = useState(false);
  const [engines, setEngines] = useState<Engine[]>([]); const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState("");
  useEffect(() => { api.get<Engine[]>("/engines").then(setEngines).catch(() => setError("Backend is not available. Run scripts\\windows\\start.ps1.")); }, []);
  const ready = engines.length > 0 && engines.every(e => e.installed && e.models_ready); const fileValid = portrait && (mode === "speech" ? audio : reference && script.trim());
  async function create() { try { setError(""); const next = await api.post<Job>("/jobs", { workflow: mode, preset, watermark }); setJob(next); } catch { setError("AvatarKit could not create this job. Check Diagnostics for local requirements."); } }
  return <main className="create"><header><p className="eyebrow">LOCAL AVATAR STUDIO / V0.1</p><h1>Create a consented talking avatar.</h1><p className="intro">Your files remain on this computer. AvatarKit never uploads portraits or recordings.</p></header>
    {!ready && <aside className="warning">Engines are not ready. Install and verify SadTalker and Chatterbox in Diagnostics before generation.</aside>}{error && <aside className="error">{error}</aside>}
    <section><div className="step">01 / Portrait</div><h2>Start with one clear portrait.</h2><FileField accept=".png,.jpg,.jpeg,.webp" label="Drop a PNG, JPG, or WEBP" file={portrait} onChange={f => setPortrait(f && imageTypes.includes(f.type) ? f : null)} kind="image" /><p className="hint">Front-facing, evenly lit, unobstructed face; use only one visible person.</p></section>
    <section><div className="step">02 / Voice mode</div><div className="tabs"><button className={mode === "speech" ? "active" : ""} onClick={() => setMode("speech")}>Existing speech</button><button className={mode === "clone" ? "active" : ""} onClick={() => setMode("clone")}>Clone from text</button></div>{mode === "speech" ? <><h2>Use the words the avatar should speak.</h2><FileField accept="audio/*" label="Drop speech audio" file={audio} onChange={f => setAudio(f && audioTypes.includes(f.type) ? f : null)} kind="audio" /></> : <><label className="script"><span>Script <b>{script.length} characters</b></span><textarea value={script} onChange={e => setScript(e.target.value)} placeholder="Write what your avatar should say…" /></label><FileField accept="audio/*" label="Drop a clean voice reference" file={reference} onChange={f => setReference(f && audioTypes.includes(f.type) ? f : null)} kind="audio" /><p className="hint">Use 10–30 seconds of one person speaking in a quiet room. English is available with the v0.1 engine.</p></>}</section>
    <section><div className="step">03 / Generation</div><div className="presets">{[["fast", "Fast test", "Short validation clips"], ["balanced", "Balanced", "Default for 8 GB VRAM"], ["best", "Best quality", "Takes longer"]].map(([id, title, detail]) => <button key={id} className={preset === id ? "preset selected" : "preset"} onClick={() => setPreset(id)}><strong>{title}</strong><small>{detail}</small></button>)}</div><label className="check"><input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} /> Add visible AI-generated watermark</label></section>
    <section><div className="step">04 / Consent</div><label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I confirm that I own or have permission to use this face and voice.</label><p className="hint">Only create avatars of yourself or people who have explicitly consented.</p></section>
    <button className="generate" disabled={!fileValid || !consent || !ready} onClick={create}>Generate locally</button>{job && <aside className="job"><b>Job {job.id}</b><span>{job.phase}</span><button className="quiet" onClick={async () => setJob(await api.post<Job>(`/jobs/${job.id}/cancel`))}>Cancel</button></aside>}</main>;
}
