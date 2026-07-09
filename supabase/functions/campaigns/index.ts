// functions/campaigns/index.ts — M16 campaign actions the browser drives directly:
// a self test-send, a heuristic spam-score, and send-now (which enqueues the fan-out
// job the worker owns — the browser never sends a broadcast, Law 5). Authorization is
// re-checked inside on a caller-scoped client (RLS + has_role); the SendGrid key is
// read from Vault under the service role and NEVER returned to the browser (Law 3).
//
// Contract:  POST /functions/v1/campaigns   Bearer <jwt>
//   body { workspace_id, campaign_id, action:'test-send'|'spam-check'|'send-now' }
//   200 { ok:true, data:{…} }
//   400 bad_request · 401 unauthorized · 403 forbidden · 404 not_found
//   409 not_sendable · 503 sendgrid_unconfigured · 502 provider_error
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";
import { incrementMeter } from "../_shared/meter.ts";
import {
  compileEmail, sendEmail, EmailError, htmlToText, resolveSendgridKey, type CompileContext,
} from "../_shared/email.ts";

// The public function base for tracking/unsub links baked into a compiled email.
function fnBase(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
}

// Compile a campaign body for a given recipient context (shared by test-send/send-now checks).
function compileFor(campaign: any, ctx: Partial<CompileContext> & { token: string }): string {
  const full: CompileContext = {
    contact: ctx.contact ?? null,
    token: ctx.token,
    trackBase: `${fnBase()}/email-track`,
    unsubBase: `${fnBase()}/email-unsubscribe`,
    footer_address: campaign.footer_address ?? null,
  };
  return compileEmail(campaign.body_json ?? { blocks: [] }, full);
}

// Heuristic spam scorer (0 clean → 10 spammy). D-092: a real SpamAssassin/provider
// API is a ready-not-run hook — swap this body for the provider call when it lands.
function spamScore(subject: string, text: string): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;
  const subj = subject ?? "";
  const hay = `${subj} ${text}`.toLowerCase();

  const spammy = ["free", "winner", "guarantee", "act now", "click here", "cash", "cheap",
    "risk-free", "no cost", "limited time", "buy now", "$$$", "viagra", "congratulations"];
  const hits = spammy.filter((w) => hay.includes(w));
  if (hits.length) { score += Math.min(4, hits.length); warnings.push(`Spam-trigger words: ${hits.join(", ")}`); }

  const bangs = (subj.match(/!/g) || []).length;
  if (bangs >= 3 || /!!!/.test(subj)) { score += 2; warnings.push("Excessive exclamation marks in the subject"); }

  const letters = subj.replace(/[^A-Za-z]/g, "");
  const caps = subj.replace(/[^A-Z]/g, "");
  if (letters.length >= 6 && caps.length / letters.length > 0.6) { score += 2; warnings.push("Subject is mostly ALL-CAPS"); }

  const links = (text.match(/https?:\/\//g) || []).length;
  const words = Math.max(1, text.split(/\s+/).filter(Boolean).length);
  if (links > 0 && links / words > 0.05) { score += 2; warnings.push("High link-to-text ratio"); }

  if (!/unsubscribe/i.test(text)) { score += 2; warnings.push("No unsubscribe link found in the body"); }
  if (!subj.trim()) { score += 1; warnings.push("Empty subject line"); }

  return { score: Math.min(10, score), warnings };
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, campaign_id, action } = body ?? {};
    if (!workspace_id || !campaign_id || !action) {
      return err(400, "bad_request", "workspace_id, campaign_id and action are required");
    }

    // Campaign edits/sends are a staff+ tier action (email_campaigns RLS, D-057-style).
    const udb = userClient(req);
    if (!(await hasRole(udb, workspace_id, "staff"))) {
      return err(403, "forbidden", "Managing a campaign requires staff access or higher");
    }

    // Load the campaign under RLS (caller-scoped) so cross-tenant reads can't happen.
    const { data: campaign, error: cErr } = await udb.from("email_campaigns")
      .select("id, workspace_id, name, subject, body_json, from_identity_id, from_name, from_email, footer_address, status")
      .eq("id", campaign_id).eq("workspace_id", workspace_id).maybeSingle();
    if (cErr) return err(500, "read_failed", cErr.message);
    if (!campaign) return err(404, "not_found", "Campaign not found in this workspace");

    const admin = serviceClient();

    // ── test-send: compile for the caller's own email and send to self ──────────
    if (action === "test-send") {
      const key = await resolveSendgridKey(admin, workspace_id);
      if (!key) return err(503, "sendgrid_unconfigured", "Connect SendGrid first");

      // Resolve the from-identity (snapshot on the campaign, or its sender_identity row).
      const from = await resolveFrom(admin, campaign, workspace_id);
      if (!from) return err(409, "no_sender", "Set a from-identity on the campaign before sending");

      // A throwaway token so the test's opens/clicks don't pollute a real campaign's stats.
      const token = crypto.randomUUID();
      const html = compileFor(campaign, { token, contact: { first_name: "there" } });
      try {
        await sendEmail(key, {
          to: user.email!, from, subject: campaign.subject ?? `[Test] ${campaign.name}`, html,
          unsubUrl: `${fnBase()}/email-unsubscribe?token=${token}`, token,
        });
      } catch (e) {
        if (e instanceof EmailError) return err(502, "provider_error", e.message);
        throw e;
      }
      // A real send happened → meter it in this success path (reuse the 'email' meter, D-088).
      const met = await incrementMeter(admin, workspace_id, "email", 1, "m16");
      if (!met.ok) console.error("meter_increment failed (test email sent):", met.error);
      return ok({ sent: true });
    }

    // ── spam-check: heuristic score on subject + compiled text (D-092) ──────────
    if (action === "spam-check") {
      const html = compileFor(campaign, { token: crypto.randomUUID(), contact: { first_name: "there" } });
      const { score, warnings } = spamScore(campaign.subject ?? "", htmlToText(html));
      return ok({ score, warnings });
    }

    // ── send-now: verify sendable, mark 'sending', enqueue the fan-out job ───────
    if (action === "send-now") {
      if (!(campaign.status === "draft" || campaign.status === "scheduled")) {
        return err(409, "not_sendable", `A campaign in status '${campaign.status}' cannot be sent`);
      }
      if (!campaign.from_identity_id && !(campaign.from_name && campaign.from_email)) {
        return err(409, "no_sender", "Set a from-identity on the campaign before sending");
      }
      // A compiled body MUST carry an unsubscribe link (CAN-SPAM). compileEmail always
      // appends the footer when {{unsubscribe_link}} is absent, so this is a belt-and-braces guard.
      const html = compileFor(campaign, { token: crypto.randomUUID(), contact: { first_name: "there" } });
      if (!/unsubscribe/i.test(html)) {
        return err(409, "no_unsubscribe", "The compiled email is missing an unsubscribe link");
      }

      // Flip to 'sending' under RLS (staff+ enforced by the update policy).
      const { error: uErr } = await udb.from("email_campaigns")
        .update({ status: "sending" }).eq("id", campaign_id).eq("workspace_id", workspace_id);
      if (uErr) return err(500, "write_failed", uErr.message);

      // Enqueue the fan-out job via the SERVICE client (the browser never enqueues jobs).
      // Idempotent on the campaign id (mirrors dispatch_scheduled_broadcasts, 0020 §7).
      const { error: jErr } = await admin.from("jobs").insert({
        workspace_id, type: "campaign.send",
        payload: { campaign_id }, status: "queued", idempotency_key: `campaign:${campaign_id}`,
      });
      if (jErr && (jErr as any).code !== "23505") return err(500, "enqueue_failed", jErr.message);

      return ok({ queued: true });
    }

    return err(400, "bad_request", `Unknown action '${action}'`);
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

// Resolve the campaign's From {email,name}: the linked sender_identity wins; else the
// campaign's snapshot columns (service-role read — identity is workspace-scoped).
async function resolveFrom(admin: any, campaign: any, workspace_id: string): Promise<{ email: string; name?: string } | null> {
  if (campaign.from_identity_id) {
    const { data: id } = await admin.from("sender_identities")
      .select("from_email, from_name").eq("id", campaign.from_identity_id).eq("workspace_id", workspace_id).maybeSingle();
    if (id?.from_email) return { email: id.from_email, name: id.from_name ?? undefined };
  }
  if (campaign.from_email) return { email: campaign.from_email, name: campaign.from_name ?? undefined };
  return null;
}
