// functions/public-funnel/index.ts — M20 Funnels. The NO-AUTH public funnel backend.
// verify_jwt = false: a visitor moving through a funnel has no session. Authorization
// is the funnel_id (a funnel resolves to exactly one workspace) — the workspace is
// resolved SERVER-SIDE from the funnel row and NEVER trusted from the body. Runs the
// service role; funnel_visits are service-role writes (RLS: service-role-only, D-094)
// so a browser can never forge an event or an order total (M28's invoices trigger
// recomputes the total). Two actions:
//   { "action":"track", "funnel_id", "step_id"?, "visitor_id", "event",       → { visit_id }
//     "variant"?, "contact_id"?, "email"?, "name"?, "utm"? }
//   { "action":"order", "funnel_id", "step_id", "items":[{description,qty,      → { order:{ public_token, total, currency, number } }
//     unit_price(minor)}], "bump"?, "currency"?, "email"?, "name"?, "visitor_id"? }
//
// The order action creates an M28 invoice (source_type='order') and hands payment off
// to the proven M28 hosted pay flow via the returned invoice public_token — the funnel
// order page collects the card through public-invoice's `intent` action. No Stripe code
// is duplicated here (D-096).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const body = (await req.json().catch(() => ({}))) ?? {};
    const {
      action = "track", funnel_id, step_id, visitor_id, event, variant,
      contact_id, email, name, items, bump, currency, utm,
    } = body as Record<string, unknown>;

    if (!funnel_id) return err(400, "bad_request", "funnel_id is required");

    const svc = serviceClient();
    // Resolve the workspace from the funnel — never trust a body workspace_id. One row.
    const { data: funnel } = await svc
      .from("funnels").select("id, workspace_id, status")
      .eq("id", funnel_id).maybeSingle();
    if (!funnel) return err(404, "not_found", "This funnel link is invalid or has expired");
    const ws = funnel.workspace_id as string;

    if (action === "track") {
      if (!event) return err(400, "bad_request", "event is required");
      const { data, error } = await svc.rpc("record_funnel_event", {
        p_ws: ws, p_funnel: funnel_id, p_step: step_id ?? null,
        p_visitor: (visitor_id as string) ?? "anon", p_event: event,
        p_variant: variant ?? null, p_contact: contact_id ?? null,
        p_email: email ?? null, p_name: name ?? null, p_utm: utm ?? {},
      });
      if (error) return err(500, "track_failed", error.message);
      return ok({ visit_id: data });
    }

    if (action === "order") {
      if (!step_id) return err(400, "bad_request", "step_id is required");
      if (!Array.isArray(items) || items.length === 0) return err(400, "bad_request", "items is required");

      // Resolve/create the buyer. An email opts the contact in (M09 upsert + funnel tag)
      // and links the order to a real contact; otherwise the order is anonymous.
      let cid: string | null = (contact_id as string) ?? null;
      if (!cid && email) {
        await svc.rpc("record_funnel_event", {
          p_ws: ws, p_funnel: funnel_id, p_step: step_id, p_visitor: (visitor_id as string) ?? "anon",
          p_event: "optin", p_variant: variant ?? null, p_contact: null,
          p_email: email, p_name: name ?? null, p_utm: utm ?? {},
        });
        const { data: c } = await svc
          .from("contacts").select("id").eq("workspace_id", ws).ilike("email", String(email)).maybeSingle();
        cid = c?.id ?? null;
      }

      const { data: inv, error } = await svc.rpc("create_funnel_order", {
        p_ws: ws, p_funnel: funnel_id, p_step: step_id, p_contact: cid,
        p_items: items, p_currency: (currency as string) ?? "USD", p_bump: bump ?? null,
      });
      if (error) return err(500, "order_failed", error.message);

      // inv = the M28 invoices row. Hand payment to the M28 hosted pay flow (public-invoice).
      return ok({ order: { public_token: inv.public_token, total: inv.total, currency: inv.currency, number: inv.number } });
    }

    return err(400, "bad_action", "Unknown action");
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
