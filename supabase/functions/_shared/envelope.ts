// _shared/envelope.ts — the standard AiMindShare Edge Function response envelope.
// Success: { ok: true,  data: {...} }
// Failure: { ok: false, error: "machine_code", message: "human hint" }
// CORS is permissive here so the browser console (any localhost port) can call
// stub functions during Session 0; tighten allow-origin per deployment later.

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export function ok(data: unknown, status = 200): Response {
  return json(status, { ok: true, data });
}

export function err(status: number, error: string, message = ""): Response {
  return json(status, { ok: false, error, message });
}

// Handle CORS preflight; return null for non-OPTIONS requests.
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return null;
}
