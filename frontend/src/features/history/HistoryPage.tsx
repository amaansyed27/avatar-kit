import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Job } from "../../lib/api";

export function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => api.get<Job[]>("/jobs").then(value => {
      if (active) setJobs(value);
    });
    void load();
    const timer = window.setInterval(load, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return <main>
    <header><p className="eyebrow">LOCAL HISTORY</p><h1>Previous generations</h1></header>
    {jobs.length ? <div className="history">{jobs.map(job => <article key={job.id}>
      <b>{job.workflow === "clone" ? "Cloned voice" : "Recorded speech"}</b>
      <span>{job.state} · {job.phase}</span>
      {job.error_message && <small>{job.error_message}</small>}
      <small>{new Date(job.created_at).toLocaleString()}</small>
      {job.state === "completed" && <a href={`/api/v1/jobs/${job.id}/output`}>Play or download MP4</a>}
    </article>)}</div> : <p className="empty">No local jobs yet. Completed jobs and their media will appear here.</p>}
  </main>;
}
