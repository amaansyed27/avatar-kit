import { useEffect, useMemo, useState } from "react";
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
  return preset === "fast" ? "256px fast" : preset === "best" ? "512px best" : "balanced";
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
    <header className="split-header">
      <div><p className="eyebrow">LOCAL LIBRARY</p><h1>Generated avatars</h1><p className="intro">Play, download, inspect, or remove everything AvatarKit has created locally.</p></div>
      <button className="primary-small" onClick={onCreate}>New generation</button>
    </header>
    {error && <aside className="error">{error}</aside>}
    <div className="library-filters">
      {(["all", "ready", "active", "issues"] as Filter[]).map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
        {item === "all" ? "All" : item === "ready" ? "Ready" : item === "active" ? "In progress" : "Needs attention"} <b>{counts[item]}</b>
      </button>)}
    </div>
    {visible.length ? <div className="generation-grid">{visible.map(job => <article className="generation-card" key={job.id}>
      <div className="generation-media">
        {job.state === "completed"
          ? <video controls preload="metadata" poster={`/api/v1/jobs/${job.id}/portrait`} src={`/api/v1/jobs/${job.id}/output`} />
          : job.portrait_path
            ? <img src={`/api/v1/jobs/${job.id}/portrait`} alt="" />
            : <div className="generation-placeholder"><span>+</span><small>No portrait uploaded</small></div>}
        <span className={`state-pill ${job.state}`}>{job.state === "completed" ? "Ready" : job.phase}</span>
      </div>
      <div className="generation-body">
        <div className="generation-title"><div><b>{job.workflow === "clone" ? "Cloned voice avatar" : "Recorded speech avatar"}</b><small>{new Date(job.created_at).toLocaleString()}</small></div><button className="icon-button" aria-label="Delete generation" onClick={() => void remove(job)}>×</button></div>
        <div className="metadata"><span>{friendlyPreset(job.preset)}</span><span>{job.watermark ? "watermarked" : "no watermark"}</span><span>#{job.id.slice(0, 8)}</span></div>
        {job.error_message && <p className="card-error">{job.error_message}</p>}
        <div className="card-actions">
          {job.state === "completed" && <a className="button-link" href={`/api/v1/jobs/${job.id}/output`} download>Download MP4</a>}
          <button onClick={() => void showLog(job)}>View log</button>
        </div>
      </div>
    </article>)}</div> : <div className="empty-library"><b>No generations in this view</b><p>{filter === "all" ? "Create your first talking avatar to see it here." : "Try another filter."}</p></div>}
    {log && <div className="modal-backdrop" role="presentation" onClick={() => setLog(null)}><section className="log-modal" role="dialog" aria-modal="true" aria-label="Generation log" onClick={event => event.stopPropagation()}><header><div><p className="eyebrow">LOCAL ENGINE LOG</p><h2>Job #{log.id.slice(0, 8)}</h2></div><button className="icon-button" onClick={() => setLog(null)}>×</button></header><pre>{log.content}</pre></section></div>}
  </main>;
}
