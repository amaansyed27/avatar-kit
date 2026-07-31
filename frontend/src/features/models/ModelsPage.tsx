import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  Cube,
  DownloadSimple,
  FileText,
  HardDrive,
  ShieldCheck,
  SpinnerGap,
  TerminalWindow,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { Engine, EngineOperation } from "../../lib/api";

const modelDetails: Record<string, { role: string; storage: string; description: string }> = {
  sadtalker: {
    role: "Face animation",
    storage: "About 6–8 GB installed",
    description: "Animates a still portrait from speech using the pinned official SadTalker runtime.",
  },
  chatterbox: {
    role: "Voice synthesis",
    storage: "About 4–6 GB installed",
    description: "Creates consented speech from text and a clean reference recording.",
  },
};

function setupLabel(engine: Engine, operation?: EngineOperation) {
  if (operation?.state === "queued" || operation?.state === "running") return operation.phase;
  if (engine.installed && engine.models_ready) return "Installed and ready";
  if (engine.installed) return "Download model files";
  return "Install engine and models";
}

export function ModelsPage() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [operations, setOperations] = useState<EngineOperation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [nextEngines, nextOperations] = await Promise.all([
        api.get<Engine[]>("/engines"),
        api.get<EngineOperation[]>("/engine-operations"),
      ]);
      setEngines(nextEngines);
      setOperations(nextOperations);
      setSelected(current => current ?? nextOperations[0]?.id ?? null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load model status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const fetchLog = () => fetch(`/api/v1/engine-operations/${selected}/log`)
      .then(response => response.ok ? response.text() : "Setup is queued. The log will appear when work begins.")
      .then(setLog)
      .catch(() => setLog("Could not read the local setup log."));
    void fetchLog();
    const timer = window.setInterval(() => void fetchLog(), 1500);
    return () => window.clearInterval(timer);
  }, [selected]);

  const latestByEngine = useMemo(() => Object.fromEntries(
    engines.map(engine => [engine.engine_id, operations.find(item => item.engine_id === engine.engine_id)]),
  ) as Record<string, EngineOperation | undefined>, [engines, operations]);

  const startSetup = async (engine: Engine) => {
    setError("");
    try {
      const operation = await api.post<EngineOperation>(`/engines/${engine.engine_id}/setup`);
      setSelected(operation.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Model setup could not start.");
    }
  };

  const selectedOperation = operations.find(item => item.id === selected);
  const readyCount = engines.filter(engine => engine.installed && engine.models_ready).length;

  return <main className="models-page">
    <header className="page-heading">
      <div><span className="eyebrow">Local model library</span><h1>Models & engines</h1><p>Install, monitor, and troubleshoot the private AI components that power AvatarKit.</p></div>
      <button className="secondary-action" type="button" disabled={loading} onClick={() => void load()}><ArrowClockwise className={loading ? "spin" : ""} size={18} /> Refresh status</button>
    </header>

    {error && <aside className="error">{error}</aside>}

    <section className="model-overview">
      <div><span className="model-overview-icon"><Cube size={24} weight="fill" /></span><div><strong>{readyCount === engines.length && engines.length ? "Your studio is ready" : `${readyCount} of ${engines.length || 2} engines ready`}</strong><span>Downloads stay on this computer and can exceed 10 GB in total.</span></div></div>
      <span><ShieldCheck size={17} weight="fill" /> Verified upstream sources</span>
    </section>

    <div className="model-grid">{engines.map(engine => {
      const operation = latestByEngine[engine.engine_id];
      const active = operation?.state === "queued" || operation?.state === "running";
      const ready = engine.installed && engine.models_ready;
      const details = modelDetails[engine.engine_id];
      return <article className={`model-card ${ready ? "ready" : ""}`} key={engine.engine_id}>
        <header>
          <span className="model-logo"><Cube size={24} weight={ready ? "fill" : "regular"} /></span>
          <div><span>{details?.role}</span><h2>{engine.display_name}</h2></div>
          <b className={ready ? "ready" : active ? "working" : "needed"}>{ready ? <CheckCircle size={16} weight="fill" /> : active ? <SpinnerGap className="spin" size={16} /> : <WarningCircle size={16} weight="fill" />}{ready ? "Ready" : active ? "Installing" : "Setup needed"}</b>
        </header>
        <p>{details?.description ?? engine.detail}</p>
        <div className="model-storage"><HardDrive size={16} /><span>{details?.storage}</span></div>
        <div className="model-steps" aria-label={`${engine.display_name} setup progress`}>
          <div className={engine.installed ? "done" : active ? "active" : ""}><span>1</span><b>Runtime</b><small>{engine.installed ? "Installed" : "Python environment"}</small></div>
          <i />
          <div className={engine.models_ready ? "done" : engine.installed && active ? "active" : ""}><span>2</span><b>Weights</b><small>{engine.models_ready ? "Downloaded" : "Official model files"}</small></div>
          <i />
          <div className={ready ? "done" : ""}><span>3</span><b>Ready</b><small>Verified locally</small></div>
        </div>
        {operation?.state === "failed" && <p className="model-error"><WarningCircle size={16} /> {operation.error || "Setup failed. Open the log for details."}</p>}
        <footer>
          <button className="model-setup-button" type="button" disabled={active || ready} onClick={() => void startSetup(engine)}>
            {active ? <SpinnerGap className="spin" size={18} /> : ready ? <CheckCircle size={18} weight="fill" /> : <DownloadSimple size={18} />}
            {setupLabel(engine, operation)}
          </button>
          {operation && <button className="model-log-button" type="button" onClick={() => setSelected(operation.id)}><TerminalWindow size={18} /> View setup log</button>}
        </footer>
      </article>;
    })}</div>

    {selectedOperation && <section className="setup-console">
      <header><div><TerminalWindow size={20} /><span><strong>{engines.find(engine => engine.engine_id === selectedOperation.engine_id)?.display_name} setup log</strong><small>{selectedOperation.phase} · {new Date(selectedOperation.started_at).toLocaleString()}</small></span></div><a href={`/api/v1/engine-operations/${selectedOperation.id}/log?download=true`} download><FileText size={17} /> Download log</a></header>
      <pre>{log || "Waiting for setup output…"}</pre>
    </section>}
  </main>;
}
