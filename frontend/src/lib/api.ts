const root = "/api/v1";
export type Engine = { engine_id: string; display_name: string; installed: boolean; models_ready: boolean; detail: string };
export type EngineOperation = { id: string; engine_id: string; action: string; state: "queued" | "running" | "completed" | "failed"; phase: string; started_at: string; finished_at?: string | null; error?: string | null };
export type Job = { id: string; state: string; phase: string; workflow: string; preset: string; watermark: number; created_at: string; portrait_path?: string; output_path?: string; error_message?: string };
export type LibrarySummary = { total: number; completed: number; active: number; failed: number; output_bytes: number; data_directory: string };
export type Settings = { default_preset: string; watermark_enabled: boolean; max_upload_mb: number; max_audio_seconds: number; device: string; cleanup_failed: boolean; open_after_generation: boolean; log_level: string };
export const api = {
  get: <T,>(path: string) => fetch(`${root}${path}`).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() as Promise<T>; }),
  post: <T,>(path: string, body?: unknown) => fetch(`${root}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() as Promise<T>; }),
  put: <T,>(path: string, body: unknown) => fetch(`${root}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json() as Promise<T>),
  delete: <T = void,>(path: string) => fetch(`${root}${path}`, { method: "DELETE" }).then(async r => { if (!r.ok) throw new Error(await r.text()); return (r.status === 204 ? undefined : await r.json()) as T; }),
};
