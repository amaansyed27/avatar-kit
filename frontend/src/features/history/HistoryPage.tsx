import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  DownloadSimple,
  FileText,
  FilmStrip,
  Plus,
  Trash,
  VideoCamera,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Job } from "../../lib/api";

type Filter = "all" | "ready" | "active" | "issues";
const activeStates = ["validating", "queued", "running", "cancelling"];

function matches(job: Job, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "ready") return job.state === "completed";
  if (filter === "active") return activeStates.includes(job.state);
  return !activeStates.includes(job.state) && job.state !== "completed";
}

function friendlyPreset(preset: string) {
  return preset === "fast" ? "Fast preview" : preset === "best" ? "Best quality" : "Balanced";
}

function stateLabel(job: Job) {
  if (job.state === "completed") return "Ready";
  if (job.state === "failed") return "Failed";
  if (job.state === "cancelled") return "Cancelled";
  return job.phase;
}

export function HistoryPage({ onChanged, onCreate }: { onChanged: () => void; onCreate: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [log, setLog] = useState<{ id: string; content: string } | null>(null);

  const load = () => api.get<Job[]>("/jobs").then(setJobs).catch(() => setError("Could not load the local library."));

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => jobs.filter(job => matches(job, filter)), [jobs, filter]);
  const counts = {
    all: jobs.length,
    ready: jobs.filter(job => job.state === "completed").length,
    active: jobs.filter(job => activeStates.includes(job.state)).length,
    issues: jobs.filter(job => !activeStates.includes(job.state) && job.state !== "completed").length,
  };

  const remove = async (job: Job) => {
    if (!window.confirm(`Delete this ${job.state === "completed" ? "generated video and its source files" : "job"}? This cannot be undone.`)) return;
    try {
      await api.delete(`/jobs/${job.id}`);
      await load();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this generation.");
    }
  };

  const showLog = async (job: Job) => {
    const response = await fetch(`/api/v1/jobs/${job.id}/log`);
    setLog({ id: job.id, content: response.ok ? await response.text() : "No local log is available for this job." });
  };

  return <main className="library-page">
    <header className="page-heading">
      <div><span className="eyebrow">Local library</span><h1>Generated avatars</h1><p>Preview, download, inspect, or remove every video stored on this machine.</p></div>
      <button className="primary-small" type="button" onClick={onCreate}><Plus size={18} weight="bold" /> New generation</button>
    </header>

    {error && <aside className="error">{error}</aside>}

    <div className="library-controls">
      <div className="filter-control" role="tablist" aria-label="Filter generations">
        {(["all", "ready", "active", "issues"] as Filter[]).map(item => <button
          key={item}
          type="button"
          role="tab"
          aria-selected={filter === item}
          className={filter === item ? "active" : ""}
          onClick={() => setFilter(item)}
        >
          {item === "all" ? "All" : item === "ready" ? "Ready" : item === "active" ? "In progress" : "Needs attention"}
          <b>{counts[item]}</b>
        </button>)}
      </div>
      <span className="library-privacy">Stored locally · never uploaded</span>
    </div>

    {visible.length ? <div className="generation-grid">{visible.map(job => <article className="generation-card" key={job.id}>
      <div className="generation-media">
        {job.state === "completed"
          ? <video controls preload="metadata" poster={`/api/v1/jobs/${job.id}/portrait`} src={`/api/v1/jobs/${job.id}/output`} />
          : job.portrait_path
            ? <img src={`/api/v1/jobs/${job.id}/portrait`} alt="Generation portrait" />
            : <div className="generation-placeholder"><VideoCamera size={30} /><span>No portrait uploaded</span></div>}
        <span className={`state-label ${job.state}`}>{stateLabel(job)}</span>
      </div>

      <div className="generation-body">
        <div className="generation-title">
          <div><strong>{job.workflow === "clone" ? "Cloned voice avatar" : "Recorded speech avatar"}</strong><span><Clock size={14} /> {new Date(job.created_at).toLocaleString()}</span></div>
          <button className="card-icon-button danger-icon" type="button" aria-label="Delete generation" title="Delete generation" onClick={() => void remove(job)}><Trash size={18} /></button>
        </div>
        <div className="generation-meta">
          <span>{friendlyPreset(job.preset)}</span>
          <span>{job.watermark ? "Watermarked" : "No watermark"}</span>
          <span>#{job.id.slice(0, 8)}</span>
        </div>
        {job.error_message && <p className="card-error"><WarningCircle size={16} /> {job.error_message}</p>}
        <div className="card-actions">
          {job.state === "completed" && <a className="button-link" href={`/api/v1/jobs/${job.id}/output`} download><DownloadSimple size={17} /> Download MP4</a>}
          <button type="button" onClick={() => void showLog(job)}><FileText size={17} /> View log</button>
        </div>
      </div>
    </article>)}</div> : <div className="empty-library">
      <span className="empty-icon"><FilmStrip size={30} /></span>
      <strong>No generations in this view</strong>
      <p>{filter === "all" ? "Create your first talking avatar and it will appear here." : "Try another filter or start a new generation."}</p>
      {filter === "all" && <button className="primary-small" type="button" onClick={onCreate}><Plus size={17} /> Create an avatar</button>}
    </div>}

    {log && <div className="modal-backdrop" role="presentation" onClick={() => setLog(null)}>
      <section className="log-modal" role="dialog" aria-modal="true" aria-label="Generation log" onClick={event => event.stopPropagation()}>
        <header><div><span className="eyebrow">Local engine log</span><h2>Job #{log.id.slice(0, 8)}</h2></div><button className="card-icon-button" type="button" aria-label="Close log" onClick={() => setLog(null)}><X size={19} /></button></header>
        <pre>{log.content}</pre>
      </section>
    </div>}
  </main>;
}
