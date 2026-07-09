// functions/email-track/index.ts — M16 open-pixel + click-redirect endpoint.
// verify_jwt = false (a recipient's mail client has no session): the unguessable
// per-recipient send_events.token is the authorization. GET only.
//   ?o=<token>            → record an 'opened' send_event, return a 1×1 GIF
//   ?c=<token>&u=<url>    → record a 'clicked' send_event, 302 to decoded url
// A logging error must NEVER block the pixel/redirect (the recipient's experience
// wins) — every write is wrapped in try/catch. Writes are service-role; the 'opened'/
// 'clicked' inserts roll into campaign_stats via the 0020 trigger.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";

// 43-byte transparent 1×1 GIF (base64) — the tracking pixel body.
const PIXEL_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
function pixelBytes(): Uint8Array {
  const bin = atob(PIXEL_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function gifResponse(): Response {
  return new Response(pixelBytes(), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Look up the seed row for a token (ws/campaign/step/contact/email). Null on miss.
async function seedForToken(svc: any, token: string) {
  const { data } = await svc.from("send_events")
    .select("workspace_id, campaign_id, step_id, enrollment_id, contact_id, email")
    .eq("token", token).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data ?? null;
}

// Best-effort side channels (M13 trigger + M09 activity) — never block on their absence.
async function sideEffects(svc: any, seed: any, kind: string, url: string | null) {
  try {
    const { error } = await svc.rpc("emit_trigger", {
      p_ws: seed.workspace_id, p_type: `email.${kind}`,
      p_payload: { contact_id: seed.contact_id, campaign_id: seed.campaign_id, url },
    });
    if (error && !/does not exist|undefined/i.test(error.message)) console.error("emit_trigger", error.message);
  } catch (_e) { /* tolerate */ }
  try {
    if (seed.contact_id) {
      await svc.rpc("log_activity", {
        p_ws: seed.workspace_id, p_contact: seed.contact_id, p_type: `email_${kind}`,
        p_description: url ? `Clicked ${url}` : `Opened email`,
        p_metadata: { campaign_id: seed.campaign_id },
      });
    }
  } catch (_e) { /* tolerate */ }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  if (req.method !== "GET") return gifResponse();

  const url = new URL(req.url);
  const openTok = url.searchParams.get("o");
  const clickTok = url.searchParams.get("c");
  const svc = serviceClient();

  // ── open pixel ──────────────────────────────────────────────────────────────
  if (openTok) {
    try {
      const seed = await seedForToken(svc, openTok);
      if (seed) {
        await svc.from("send_events").insert({
          workspace_id: seed.workspace_id, campaign_id: seed.campaign_id, step_id: seed.step_id,
          enrollment_id: seed.enrollment_id, contact_id: seed.contact_id, email: seed.email,
          type: "opened", provider_message_id: `track:o:${openTok}`,
        });
        await sideEffects(svc, seed, "opened", null);
      }
    } catch (e) {
      console.error("email-track open:", e instanceof Error ? e.message : String(e));
    }
    return gifResponse();   // always return the pixel, logged or not
  }

  // ── click redirect ──────────────────────────────────────────────────────────
  if (clickTok) {
    const target = url.searchParams.get("u");
    let dest = "/";
    try { dest = target ? decodeURIComponent(target) : "/"; } catch { dest = target ?? "/"; }
    try {
      const seed = await seedForToken(svc, clickTok);
      if (seed) {
        await svc.from("send_events").insert({
          workspace_id: seed.workspace_id, campaign_id: seed.campaign_id, step_id: seed.step_id,
          enrollment_id: seed.enrollment_id, contact_id: seed.contact_id, email: seed.email,
          type: "clicked", url: dest, provider_message_id: `track:c:${clickTok}`,
        });
        await sideEffects(svc, seed, "clicked", dest);
      }
    } catch (e) {
      console.error("email-track click:", e instanceof Error ? e.message : String(e));
    }
    return new Response(null, { status: 302, headers: { Location: dest, "Cache-Control": "no-store" } });
  }

  return new Response("Bad Request", { status: 400 });
});
