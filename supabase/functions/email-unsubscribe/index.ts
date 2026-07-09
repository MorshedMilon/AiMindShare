// functions/email-unsubscribe/index.ts — M16 public one-click unsubscribe.
// verify_jwt = false (a recipient has no session): the unguessable per-recipient
// send_events.token is the authorization. GET renders a branded confirm page with a
// POST form; POST (the form, or a List-Unsubscribe-Post one-click) records the opt-out.
// unsubscribe_email() (0020, D-090) dual-writes the suppression block list + an M05
// consent opt-out so both ledgers agree. All writes are service-role.
//   GET  ?token=<t>  → confirm page
//   POST  token=<t>  → unsubscribe + confirmation page
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function page(title: string, inner: string): Response {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;color:#1a1a1a;">
<div style="max-width:480px;margin:64px auto;background:#fff;border-radius:8px;padding:40px 32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
${inner}
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Resolve the recipient (email/ws/contact) from a token. Null on miss.
async function recipientForToken(svc: any, token: string) {
  const { data } = await svc.from("send_events")
    .select("workspace_id, campaign_id, step_id, enrollment_id, contact_id, email")
    .eq("token", token).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data ?? null;
}

async function doUnsubscribe(svc: any, seed: any) {
  if (seed.email) {
    await svc.rpc("unsubscribe_email", { p_ws: seed.workspace_id, p_email: seed.email, p_contact: seed.contact_id });
    // Ledger the event so campaign_stats.unsubscribed reflects it (0020 trigger).
    await svc.from("send_events").insert({
      workspace_id: seed.workspace_id, campaign_id: seed.campaign_id, step_id: seed.step_id,
      enrollment_id: seed.enrollment_id, contact_id: seed.contact_id, email: seed.email,
      type: "unsubscribed", provider_message_id: `unsub:${seed.email}`,
    });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  const url = new URL(req.url);
  const svc = serviceClient();

  // ── POST: perform the unsubscribe (HTML form or List-Unsubscribe one-click) ──
  if (req.method === "POST") {
    let token = url.searchParams.get("token");
    if (!token) {
      const form = await req.formData().catch(() => null);
      token = (form?.get("token") as string) ?? null;
    }
    if (!token) return page("Unsubscribe", `<h2>Invalid link</h2><p style="color:#6b7280;">This unsubscribe link is missing its token.</p>`);
    try {
      const seed = await recipientForToken(svc, token);
      if (seed) await doUnsubscribe(svc, seed);
    } catch (e) {
      console.error("email-unsubscribe POST:", e instanceof Error ? e.message : String(e));
      // Fall through to a confirmation regardless — never surface a raw error to the recipient.
    }
    return page("Unsubscribed",
      `<h2>You're unsubscribed</h2><p style="color:#6b7280;">You will no longer receive these emails. It may take a few minutes to take effect.</p>`);
  }

  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  // ── GET: render the confirm page with a POST form ───────────────────────────
  const token = url.searchParams.get("token");
  if (!token) return page("Unsubscribe", `<h2>Invalid link</h2><p style="color:#6b7280;">This unsubscribe link is missing its token.</p>`);

  const seed = await recipientForToken(svc, token).catch(() => null);
  if (!seed) return page("Unsubscribe", `<h2>Link expired</h2><p style="color:#6b7280;">We couldn't find this subscription. It may have already been removed.</p>`);

  const who = seed.email ? `<p style="color:#6b7280;">${esc(seed.email)}</p>` : "";
  const action = `${url.pathname}?token=${encodeURIComponent(token)}`;
  return page("Unsubscribe",
    `<h2>Unsubscribe?</h2>${who}
     <p style="color:#6b7280;">Click below to stop receiving these emails.</p>
     <form method="POST" action="${esc(action)}" style="margin-top:24px;">
       <input type="hidden" name="token" value="${esc(token)}" />
       <button type="submit" style="display:inline-block;padding:12px 28px;background:#dc2626;color:#fff;border:0;border-radius:6px;font-size:15px;font-weight:bold;cursor:pointer;">Unsubscribe</button>
     </form>`);
});
