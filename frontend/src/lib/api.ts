const root = "/api/v1";
export type Engine = { engine_id: string; display_name: string; installed: boolean; models_ready: boolean; detail: string };
export type Job = { id: string; state: string; phase: string; workflow: string; preset: string; created_at: string; output_path?: string };
export const api = {
  get: <T,>(path: string) => fetch(`${root}${path}`).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() as Promise<T>; }),
  post: <T,>(path: string, body?: unknown) => fetch(`${root}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() as Promise<T>; }),
  put: <T,>(path: string, body: unknown) => fetch(`${root}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json() as Promise<T>),
};
