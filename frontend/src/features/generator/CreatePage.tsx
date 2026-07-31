import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Check,
  CheckCircle,
  Cpu,
  DownloadSimple,
  FileAudio,
  ImageSquare,
  Info,
  MagicWand,
  Play,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  UploadSimple,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Engine, Job, Settings } from "../../lib/api";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const audioTypes = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac", "audio/ogg", "audio/webm"];
const finishedStates = ["completed", "failed", "cancelled"];

function useObjectUrl(file: File | null) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function HiddenFileInput({
  accept,
  onFile,
  children,
  className,
}: {
  accept: string;
  onFile: (file: File | null) => void;
  children: ReactNode;
  className: string;
}) {
  const select = (event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0] ?? null);
  return <label className={className}>
    <input className="visually-hidden" type="file" accept={accept} onChange={select} />
    {children}
  </label>;
}

function formatFileSize(file: File) {
  return file.size < 1024 * 1024
    ? `${Math.round(file.size / 1024)} KB`
    : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
}

export function CreatePage({ engines, checkingEngines, onOpenLibrary }: { engines: Engine[]; checkingEngines: boolean; onOpenLibrary: () => void }) {
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

  useEffect(() => {
    api.get<Settings>("/settings")
      .then(value => {
        setSettings(value);
        setPreset(value.default_preset);
        setWatermark(value.watermark_enabled);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const loadRecent = () => api.get<Job[]>("/jobs").then(value => setRecentJobs(value.slice(0, 3))).catch(() => undefined);
    void loadRecent();
    const timer = window.setInterval(() => void loadRecent(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!job || finishedStates.includes(job.state)) return;
    const timer = window.setInterval(() => {
      api.get<Job>(`/jobs/${job.id}`).then(setJob).catch(() => setError("Could not refresh the running generation."));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  const sadTalkerReady = engines.some(engine => engine.engine_id === "sadtalker" && engine.installed && engine.models_ready);
  const chatterboxReady = engines.some(engine => engine.engine_id === "chatterbox" && engine.installed && engine.models_ready);
  const enginesReady = sadTalkerReady && (mode === "speech" || chatterboxReady);
  const inputsReady = Boolean(portrait && (mode === "speech" ? audio : reference && script.trim()));
  const jobActive = Boolean(job && !finishedStates.includes(job.state));
  const readyToGenerate = inputsReady && consent && enginesReady && !jobActive;

  const setImage = (file: File | null) => {
    if (!file || imageTypes.includes(file.type)) {
      setPortrait(file);
      setError("");
      return;
    }
    setError("Choose a PNG, JPG, or WEBP portrait.");
  };

  const setSpeech = (file: File | null, target: "speech" | "reference") => {
    if (file && !audioTypes.includes(file.type)) {
      setError("Choose a supported audio file.");
      return;
    }
    if (target === "speech") setAudio(file);
    else setReference(file);
    setError("");
  };

  async function create() {
    let next: Job | null = null;
    try {
      setError("");
      next = await api.post<Job>("/jobs", { workflow: mode, preset, watermark });
      const send = async (kind: string, file: File) => {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(`/api/v1/jobs/${next!.id}/inputs/${kind}`, { method: "POST", body: form });
        if (!response.ok) throw new Error(await response.text());
      };
      await send("portrait", portrait!);
      await send(mode === "speech" ? "audio" : "reference", mode === "speech" ? audio! : reference!);
      setJob(await api.post<Job>(`/jobs/${next.id}/start`));
    } catch {
      if (next) void api.delete(`/jobs/${next.id}`).catch(() => undefined);
      setError("AvatarKit could not validate or queue these local files. Check Diagnostics and media guidance.");
    }
  }

  return <main className="studio-page">
    {checkingEngines && <aside className="warning">Checking local generation engines…</aside>}
    {!checkingEngines && !enginesReady && <aside className="warning">
      {mode === "speech"
        ? "SadTalker is not ready. Open Diagnostics before generating."
        : "SadTalker and Chatterbox must both be ready for cloned speech."}
    </aside>}
    {error && <aside className="error">{error}</aside>}

    <div className="studio-toolbar">
      <div className="source-steps" aria-label="Input readiness">
        <span className={portrait ? "source-step ready" : "source-step active"}>
          {portrait ? <Check size={14} weight="bold" /> : "1"} Portrait
        </span>
        <span className={speechFile ? "source-step ready" : portrait ? "source-step active" : "source-step"}>
          {speechFile ? <Check size={14} weight="bold" /> : "2"} Voice
        </span>
      </div>
      <span className="source-guide"><Info size={16} /> Clear, front-facing portraits work best</span>
    </div>

    <div className="create-workspace">
      <div className="stage-column">
        <section className="media-stage" aria-label="Portrait preview">
          {portrait
            ? <>
              <img src={portraitUrl} alt="Selected portrait preview" />
              <div className="stage-overlay">
                <span><VideoCamera size={17} weight="fill" /> Portrait source</span>
                <HiddenFileInput accept=".png,.jpg,.jpeg,.webp" onFile={setImage} className="stage-replace">
                  <UploadSimple size={16} /> Replace
                </HiddenFileInput>
              </div>
            </>
            : <HiddenFileInput accept=".png,.jpg,.jpeg,.webp" onFile={setImage} className="stage-upload">
              <span className="upload-icon"><ImageSquare size={32} /></span>
              <strong>Add a portrait</strong>
              <span>Choose a clear PNG, JPG, or WEBP</span>
              <small>Front-facing · even lighting · one visible person</small>
            </HiddenFileInput>}
        </section>

        <section className="audio-deck">
          <div className="deck-heading">
            <div>
              <span className="deck-icon"><FileAudio size={19} /></span>
              <div><strong>{mode === "speech" ? "Voice audio" : "Voice reference"}</strong><small>{mode === "speech" ? "Existing speech" : "Cloned speech source"}</small></div>
            </div>
            {speechFile && <button className="icon-text-button" type="button" onClick={() => mode === "speech" ? setAudio(null) : setReference(null)}><X size={15} /> Remove</button>}
          </div>

          {mode === "clone" && <label className="script-field">
            <span>Script <small>{script.length} characters</small></span>
            <textarea value={script} onChange={event => setScript(event.target.value)} placeholder="Write what your avatar should say…" />
          </label>}

          {speechFile
            ? <div className="audio-source">
              <audio controls src={speechUrl} />
              <div><strong>{speechFile.name}</strong><small>{formatFileSize(speechFile)} · processed locally</small></div>
            </div>
            : <HiddenFileInput
              accept="audio/*"
              onFile={file => setSpeech(file, mode === "speech" ? "speech" : "reference")}
              className="audio-upload"
            >
              <UploadSimple size={18} />
              <span><strong>{mode === "speech" ? "Add speech audio" : "Add a clean voice sample"}</strong><small>WAV, MP3, M4A, FLAC, OGG, or WEBM</small></span>
            </HiddenFileInput>}
        </section>
      </div>

      <aside className="inspector-panel" aria-label="Generation settings">
        <section className="inspector-section">
          <div className="inspector-heading"><strong>Voice mode</strong><Info size={15} /></div>
          <div className="segmented-control">
            <button type="button" className={mode === "speech" ? "selected" : ""} onClick={() => setMode("speech")}>Existing speech</button>
            <button type="button" className={mode === "clone" ? "selected" : ""} onClick={() => setMode("clone")}>Clone from text</button>
          </div>
          <p>{mode === "speech" ? "Animate the portrait with your finished recording." : "Generate speech locally from a reference voice and script."}</p>
        </section>

        <section className="inspector-section">
          <div className="inspector-heading"><strong>Quality</strong><Info size={15} /></div>
          <div className="quality-options">
            {[
              ["fast", "Fast", "Preview"],
              ["balanced", "Balanced", "Default"],
              ["best", "Best", "Slower"],
            ].map(([id, title, detail]) => <button
              type="button"
              key={id}
              className={preset === id ? "quality-option selected" : "quality-option"}
              onClick={() => setPreset(id)}
            >
              <strong>{title}</strong><small>{detail}</small>
            </button>)}
          </div>
        </section>

        <section className="inspector-section">
          <div className="inspector-heading"><strong>Compute</strong></div>
          <div className="compute-summary">
            <Cpu size={19} />
            <div><strong>{settings?.device === "cpu" ? "CPU only" : settings?.device === "cuda" ? "NVIDIA CUDA" : "Auto · GPU preferred"}</strong><small>{settings?.device === "cpu" ? "Compatible, but substantially slower" : "Falls back to CPU when needed"}</small></div>
            <CheckCircle size={18} weight="fill" />
          </div>
        </section>

        <section className="inspector-section">
          <label className="switch-row">
            <span><strong>Visible watermark</strong><small>Mark output as AI-generated</small></span>
            <input type="checkbox" checked={watermark} onChange={event => setWatermark(event.target.checked)} />
          </label>
        </section>

        <section className="inspector-section output-limits">
          <div className="inspector-heading"><strong>Local limits</strong></div>
          <p><span>Max file size</span><b>{settings?.max_upload_mb ?? "—"} MB</b></p>
          <p><span>Max audio length</span><b>{settings?.max_audio_seconds ?? "—"} sec</b></p>
        </section>
      </aside>
    </div>

    <section className="generation-dock">
      <label className="consent-control">
        <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
        <span><ShieldCheck size={21} /><span><strong>I have permission to use this face and voice.</strong><small>Only create avatars with explicit consent.</small></span></span>
      </label>
      <div className={`readiness-summary ${readyToGenerate ? "ready" : ""}`}>
        {readyToGenerate ? <CheckCircle size={21} weight="fill" /> : <Sparkle size={21} />}
        <span><strong>{readyToGenerate ? "Ready to generate" : "Complete the required inputs"}</strong><small>Portrait, voice, consent, and engines</small></span>
      </div>
      <button className="generate-action" type="button" disabled={!readyToGenerate} onClick={() => void create()}>
        {jobActive ? <span className="spinner" /> : <Play size={20} weight="fill" />}
        <span><strong>{jobActive ? "Generating…" : "Generate avatar"}</strong><small>Creates video locally</small></span>
      </button>
    </section>

    {job && <section className={`job-progress ${job.state}`}>
      <span className="job-icon"><MagicWand size={21} /></span>
      <div><strong>{job.state === "completed" ? "Generation complete" : job.phase}</strong><small>Job #{job.id.slice(0, 8)}{job.error_message ? ` · ${job.error_message}` : ""}</small></div>
      {!finishedStates.includes(job.state) && <button type="button" onClick={async () => setJob(await api.post<Job>(`/jobs/${job.id}/cancel`))}>Cancel</button>}
    </section>}

    {recentJobs.length > 0 && <section className="recent-strip">
      <div className="recent-strip-heading"><span><SquaresFour size={18} /><strong>Recent and queued</strong></span><button type="button" onClick={onOpenLibrary}>View library</button></div>
      <div className="recent-items">{recentJobs.map(recent => <article key={recent.id}>
        <div className="recent-thumb">{recent.portrait_path ? <img src={`/api/v1/jobs/${recent.id}/portrait`} alt="" /> : <VideoCamera size={20} />}</div>
        <div><strong>{recent.workflow === "clone" ? "Cloned voice avatar" : "Recorded speech avatar"}</strong><small>{new Date(recent.created_at).toLocaleString()} · {recent.preset}</small></div>
        <span className={`recent-state ${recent.state}`}>{recent.state === "completed" ? "Ready" : recent.phase}</span>
        {recent.state === "completed" && <a href={`/api/v1/jobs/${recent.id}/output`} aria-label="Play recent generation"><Play size={15} weight="fill" /></a>}
      </article>)}</div>
    </section>}

    {job?.state === "completed" && <section className="result-panel">
      <div className="result-heading"><div><CheckCircle size={22} weight="fill" /><span><strong>Your avatar is ready</strong><small>Saved to your local library</small></span></div><a href={`/api/v1/jobs/${job.id}/output`} download><DownloadSimple size={18} /> Download MP4</a></div>
      <video controls src={`/api/v1/jobs/${job.id}/output`} />
    </section>}
  </main>;
}
