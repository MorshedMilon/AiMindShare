// functions/site-track/index.ts — M19 the first-party analytics pixel (D-106,
// verify_jwt=false). The published page beacons here on view. Runs service-role,
// upserts a visitor_sessions row per (site_id, visitor_id), appends the page view,
// and — when the visitor is IDENTIFIED (a contact_id, e.g. from a form-submit
// linkage or a ?ce= param) — calls record_page_visit() which writes the M09
// timeline (log_activity) + fires the M13 bus emit_trigger('page.visited'). The
// browser never writes visitor_sessions directly (RLS: service-role only).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";

// A 1×1 transparent GIF so this can be used as an <img> pixel too.
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const pixel = () => new Response(GIF, {
  status: 200,
  headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
  }
  const admin = serviceClient();
  try {
    const body = await req.json();
    const siteId = String(body.site_id ?? "");
    const visitorId = String(body.visitor_id ?? "");
    const slug = body.slug != null ? String(body.slug) : null;
    const contactId = body.contact_id ? String(body.contact_id) : null;
    if (!siteId || !visitorId) return pixel();

    // Resolve the site's workspace (needed for the tenant-scoped row + wiring).
    const { data: site } = await admin.from("sites").select("workspace_id").eq("id", siteId).maybeSingle();
    if (!site) return pixel();
    const ws = (site as any).workspace_id;

    // Upsert the session; append the page view.
    const view = { slug, at: new Date().toISOString() };
    const { data: existing } = await admin.from("visitor_sessions")
      .select("id, pages").eq("site_id", siteId).eq("visitor_id", visitorId).maybeSingle();
    if (existing) {
      const pages = Array.isArray((existing as any).pages) ? (existing as any).pages : [];
      pages.push(view);
      const patch: Record<string, unknown> = { pages, last_seen_at: new Date().toISOString() };
      if (contactId) patch.contact_id = contactId;
      await admin.from("visitor_sessions").update(patch).eq("id", (existing as any).id);
    } else {
      await admin.from("visitor_sessions").insert({
        workspace_id: ws, site_id: siteId, visitor_id: visitorId,
        contact_id: contactId, pages: [view],
        utm: parseUtm(String(body.utm ?? "")),
      });
    }

    // Identified visitor → CRM timeline + trigger bus (idempotency handled downstream).
    if (contactId) {
      await admin.rpc("record_page_visit", { p_ws: ws, p_site: siteId, p_contact: contactId, p_slug: slug });
    }
  } catch { /* pixels never error to the client */ }
  return pixel();
});

function parseUtm(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const p = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = p.get(k); if (v) out[k] = v;
    }
  } catch { /* ignore */ }
  return out;
}
