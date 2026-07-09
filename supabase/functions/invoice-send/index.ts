// functions/invoice-send/index.ts — M28. Authorize + mark an invoice sent, and hand
// back the shareable public pay link. verify_jwt = true (staff+ member).
//
// Delivery split (D-076), matching how M04/M12 handled the open D-011 email provider:
//   • link  → returns the public pay URL (copy-to-clipboard / QR). Always available.
//   • sms   → Text-to-Pay. This function does NOT send the SMS itself — it returns
//             sms_ready so the browser composes it through the existing M12
//             `inbox-send` function, which already gates on A2P + consent.check (M05)
//             and METERS the sms in ITS success path. Keeping the send in M12 means
//             M28 introduces no new metered action (Gate-3) and consent stays enforced.
//   • email → DEFERRED behind OPEN D-011 (Resend vs SendGrid). We mark the invoice
//             sent and return email_deferred:true; the UI shows a "delivery pending"
//             banner. No fake green — nothing is emailed until D-011 lands.
//
// Contract:  POST /functions/v1/invoice-send   Bearer <jwt>
//   body { "workspace_id":"<uuid>", "invoice_id":"<uuid>", "channel":"link|sms|email",
//          "return_url":"<abs base>"? }
//   200 { ok:true, data:{ url, channel, sms_ready?, email_deferred?, contact_phone? } }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const { workspace_id, invoice_id, channel = "link", return_url } =
      (await req.json().catch(() => ({}))) ?? {};
    if (!workspace_id || !invoice_id) return err(400, "bad_request", "workspace_id and invoice_id are required");

    if (!(await hasRole(userClient(req), workspace_id, "staff"))) {
      return err(403, "forbidden", "Not a member of this workspace");
    }

    const svc = serviceClient();
    const { data: inv } = await svc.from("invoices")
      .select("id, status, public_token, contact_id, kind")
      .eq("id", invoice_id).eq("workspace_id", workspace_id).maybeSingle();
    if (!inv) return err(404, "not_found", "Invoice not found");
    if (inv.status === "void") return err(409, "invoice_void", "This invoice is void");

    // Mark sent (idempotent-ish): draft → sent; already-sent invoices keep their status.
    await svc.from("invoices").update({
      status: inv.status === "draft" ? "sent" : inv.status,
      sent_at: new Date().toISOString(),
    }).eq("id", invoice_id);

    const base = String(return_url || req.headers.get("origin") || "").replace(/\/$/, "");
    const url = `${base}/pay/${inv.public_token}`;

    if (channel === "sms") {
      // Consent + A2P + metering are enforced by M12 inbox-send; here we only surface
      // the payer's number + readiness so the UI can invoke it. No consent = no send.
      let contact_phone: string | null = null;
      if (inv.contact_id) {
        const { data: c } = await svc.from("contacts").select("phone").eq("id", inv.contact_id).maybeSingle();
        contact_phone = c?.phone ?? null;
      }
      return ok({ url, channel, sms_ready: !!contact_phone, contact_phone });
    }

    if (channel === "email") {
      // OPEN D-011 — no provider wired. Marked sent; nothing is delivered yet.
      return ok({ url, channel, email_deferred: true });
    }

    return ok({ url, channel: "link" });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
