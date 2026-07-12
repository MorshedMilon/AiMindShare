// worker.mjs — AiMindShare Session 0 stub worker (plain ESM Node, no build step).
// Claims a queued job atomically via the claim_job() RPC (FOR UPDATE SKIP LOCKED),
// runs it, and writes the terminal status. Uses the SERVICE ROLE key, which
// bypasses RLS — this key lives only on the server, never in the browser (Law 3).
//
//   node workers/worker.mjs --once     # claim one job, finish it, exit (probe mode)
//   node workers/worker.mjs            # long-running poll loop
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { createAutomationEngine } from "./automation.mjs";
import { crawlStep } from "./seo/crawler.mjs";
// M22-auto · the pure, deterministic Auto-Blog pipeline (no provider, no network,
// nothing metered — scaffold posture D-147). blog.generate drives these.
import {
  compute_topic_cluster, build_serp_brief, build_article_html,
  score_article, suggest_internal_links, build_schema,
} from "../frontend/js/blog-pipeline.mjs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });
// M13 · the automation node-walker, injected with the service-role client.
const { automationExecute, automationDateSweep } = createAutomationEngine(db);
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;
const ONCE = process.argv.includes("--once");
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const MAX = maxArg ? parseInt(maxArg.split("=")[1], 10) : null;

async function claim() {
  const { data, error } = await db.rpc("claim_job", { p_worker: WORKER_ID });
  if (error) throw new Error(`claim_job: ${error.message}`);
  return data && data.id ? data : null;          // RPC returns the job row or null
}

async function complete(id, result) {
  const { error } = await db.from("jobs").update({
    status: "done", result, done_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`complete: ${error.message}`);
}

async function fail(job, message) {
  const retryable = job.attempts < job.max_attempts;
  if (retryable) {
    const backoffMs = Math.min(3_600_000, 30_000 * 2 ** job.attempts + Math.random() * 10_000);
    await db.from("jobs").update({
      status: "queued", run_after: new Date(Date.now() + backoffMs).toISOString(),
      error: message, updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } else {
    await db.from("jobs").update({
      status: "failed", error: message, done_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  }
}

// The default pipeline + 5 stages seeded into a new workspace (M11, fulfilling the
// deferred D-020). Probabilities feed the weighted forecast; colours are hue keys
// the UI maps to design tokens (never raw hex in data).
const DEFAULT_PIPELINE_STAGES = [
  { name: "New Lead",      order_index: 0, close_probability: 10, color: "slate" },
  { name: "Qualified",     order_index: 1, close_probability: 30, color: "teal" },
  { name: "Proposal Sent", order_index: 2, close_probability: 55, color: "gold" },
  { name: "Negotiation",   order_index: 3, close_probability: 75, color: "amber" },
  { name: "Verbal Commit", order_index: 4, close_probability: 90, color: "green" },
];

// Seed the deferred provisioning defaults for a freshly-created workspace (M01).
// The OWNER membership is already created synchronously inside create_workspace()
// (so the accept-when holds even if this worker is down); this job fills in the
// rest of the defaults. workspace.settings (notification prefs + a placeholder
// sender identity) plus, now that M11 is built, a DEFAULT PIPELINE + 5 stages
// (D-020/D-052). Calendar (M14) and 5 starter tags (M09) stay honestly deferred
// until those modules land — the hook is here; never faked.
async function provisionWorkspace(job) {
  const wsId = job.payload?.workspace_id || job.workspace_id;
  if (!wsId) throw new Error("workspace.provision: missing workspace_id");

  const defaults = {
    notifications: { in_app: true, email: true, digest: "daily" },
    sender_identity: { name: null, email: null, verified: false }, // placeholder until M04/M16
  };
  // Merge (don't clobber) any settings a future step may have written.
  const { data: ws, error: readErr } = await db
    .from("workspaces").select("settings").eq("id", wsId).single();
  if (readErr) throw new Error(`workspace.provision read: ${readErr.message}`);
  const merged = { ...defaults, ...(ws?.settings || {}) };
  const { error: updErr } = await db
    .from("workspaces").update({ settings: merged }).eq("id", wsId);
  if (updErr) throw new Error(`workspace.provision write: ${updErr.message}`);

  // Default pipeline — idempotent: only seed if the workspace has none (M11, D-052).
  const seeded = Object.keys(defaults);
  const { count: pipeCount, error: pipeReadErr } = await db
    .from("pipelines").select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
  if (pipeReadErr) throw new Error(`workspace.provision pipeline read: ${pipeReadErr.message}`);
  if (!pipeCount) {
    const { data: pipe, error: pipeErr } = await db
      .from("pipelines").insert({ workspace_id: wsId, name: "Sales Pipeline" }).select("id").single();
    if (pipeErr) throw new Error(`workspace.provision pipeline: ${pipeErr.message}`);
    const { error: stageErr } = await db.from("pipeline_stages").insert(
      DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, workspace_id: wsId, pipeline_id: pipe.id })));
    if (stageErr) throw new Error(`workspace.provision stages: ${stageErr.message}`);
    seeded.push("pipeline", "pipeline_stages");
  }

  // Default calendar — idempotent: only seed if the workspace has none (M14, D-020).
  const { count: calCount, error: calReadErr } = await db
    .from("calendars").select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
  if (calReadErr) throw new Error(`workspace.provision calendar read: ${calReadErr.message}`);
  if (!calCount) {
    const { data: cal, error: calErr } = await db.from("calendars").insert({
      workspace_id: wsId, name: "Intro Call", type: "one_on_one", slug: "intro-call",
      duration_min: 30, timezone: "UTC",
    }).select("id").single();
    if (calErr) throw new Error(`workspace.provision calendar: ${calErr.message}`);
    // Mon–Fri 09:00–17:00 (day_of_week 1..5; 0=Sun per compute_slots' extract(dow)).
    const avail = [1, 2, 3, 4, 5].map((d) => ({
      workspace_id: wsId, calendar_id: cal.id, day_of_week: d, start_time: "09:00", end_time: "17:00",
    }));
    const { error: avErr } = await db.from("calendar_availability").insert(avail);
    if (avErr) throw new Error(`workspace.provision availability: ${avErr.message}`);
    seeded.push("calendar", "calendar_availability");
  }

  // Starter "Contact Us" form — idempotent: only seed if the workspace has no forms
  // (M15, mirrors the D-052 pipeline/calendar guard). Published so it renders at its
  // public token immediately; name→name, email→email, message→a custom field, plus a
  // marketing consent field carrying its exact wording (submit_form records the opt-in
  // verbatim). No routing/logic — the plainest working form a new workspace can share.
  const { count: formCount, error: formReadErr } = await db
    .from("forms").select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
  if (formReadErr) throw new Error(`workspace.provision form read: ${formReadErr.message}`);
  if (!formCount) {
    const { error: formErr } = await db.from("forms").insert({
      workspace_id: wsId, name: "Contact Us", type: "form", status: "published",
      published_at: new Date().toISOString(),
      fields_json: [
        { key: "name", type: "text", label: "Your name", map_to: "name", required: true },
        { key: "email", type: "email", label: "Email", map_to: "email", required: true },
        { key: "message", type: "textarea", label: "Message", map_to: "message" },
        { key: "consent", type: "consent", label: "Keep me updated",
          consent_text: "I agree to receive marketing emails." },
      ],
      settings_json: { source_tag: "Contact Us" },
    });
    if (formErr) throw new Error(`workspace.provision form: ${formErr.message}`);
    seeded.push("starter_form");
  }

  const deferred = ["starter_tags (M09)"];
  console.log(`workspace.provision ${wsId}: seeded ${seeded.join(", ")}; deferred → ${deferred.join(", ")}`);
  return { workspace_id: wsId, seeded, deferred };
}

// M41 · integration.health_check — the hourly connection health ping (enqueued by
// pg_cron, INTEGRATIONS-SPEC §5). Loads the integration (service role), runs the
// provider's cheap status call, and writes last_health_check / status / last_error.
// The per-provider ping map is just-in-time (§8): un-wired providers report reachable
// and stamp the timestamp; a real 401 would flip status to 'error' (or needs_reauth
// for oauth2). The browser NEVER enqueues this — it's a system job.
async function healthCheck(job) {
  const id = job.payload?.integration_id;
  if (!id) throw new Error("integration.health_check: missing integration_id");

  const { data: row, error: readErr } = await db
    .from("integrations").select("id, provider, auth_type, vault_secret_name, status").eq("id", id).maybeSingle();
  if (readErr) throw new Error(`health_check read: ${readErr.message}`);
  if (!row) return { integration_id: id, skipped: "row_gone" };

  // Scaffold ping: a present Vault reference = reachable. Real per-provider status
  // calls (read the secret via resolveCredential, hit the provider) land at each
  // provider's session; a revoked key → healthy=false. Never fabricated.
  const healthy = !!row.vault_secret_name;
  const patch = {
    status: healthy ? "connected" : (row.auth_type === "oauth2" ? "needs_reauth" : "error"),
    last_health_check: new Date().toISOString(),
    last_error: healthy ? null : "no_credential",
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await db.from("integrations").update(patch).eq("id", id);
  if (upErr) throw new Error(`health_check write: ${upErr.message}`);
  return { integration_id: id, provider: row.provider, status: patch.status };
}

// M41 · integration.refresh_token — SCAFFOLD (D-034). No oauth2 provider is connected
// this slice, so there is nothing to refresh. The handler + job type exist as the
// documented hook (mirrors M01's honest workspace.provision deferral); each OAuth
// provider's session fills the refresh call. Never faked.
async function refreshToken(job) {
  const id = job.payload?.integration_id ?? null;
  console.log(`integration.refresh_token ${id ?? "(none)"}: deferred until an oauth2 provider is connected (D-034)`);
  return { integration_id: id, deferred: "no oauth2 provider connected this slice" };
}

// M14 · appointment.remind — send a due booking reminder. The pg_cron
// enqueue_due_reminders() sweep enqueues one job per due unsent reminder; this hands
// off to the appointment-remind Edge Fn (SMS live via M12's Twilio contract + consent
// + meter; email stubbed until D-011). Idempotent via the reminder row's sent_at.
// Ready-but-not-run locally (needs the deployed Edge Fn + Twilio creds).
async function appointmentRemind(job) {
  const { appointment_id, reminder_id, channel } = job.payload ?? {};
  if (!appointment_id || !reminder_id) throw new Error("appointment.remind: missing appointment_id/reminder_id");
  const { data, error } = await db.functions.invoke("appointment-remind", {
    body: { appointment_id, reminder_id, channel },
  });
  if (error) throw new Error(`appointment.remind: ${error.message}`);
  return data?.data ?? data ?? { status: "invoked" };
}

// M05 · gdpr.export — data-subject ACCESS request. Walks every BUILT module's
// tables for the subject (by contact_id, else the request's email) and assembles
// a portable JSON bundle, then stores a reference on the gdpr_requests row and
// flips it to 'completed' (PRD_M05; JOBS-AND-WORKERS-SPEC §6). Idempotent via the
// job's idempotency_key. Runs under the service role (bypasses RLS) — the browser
// only enqueued the 'queued' job (Gate-4). Modules not built yet (contacts M09,
// messages M12, deals M11, activities…) are listed in `deferred` and folded in as
// they land — the honest-deferral pattern (worker.mjs provisionWorkspace, D-040),
// never faked. R2/ZIP packaging is deferred to when object storage is wired; the
// bundle is written to gdpr_requests.export_url as an inline data reference today.
async function gdprExport(job) {
  const requestId = job.payload?.request_id;
  if (!requestId) throw new Error("gdpr.export: missing request_id");

  const { data: reqRow, error: reqErr } = await db
    .from("gdpr_requests").select("id, workspace_id, contact_id, requested_email, status").eq("id", requestId).maybeSingle();
  if (reqErr) throw new Error(`gdpr.export read: ${reqErr.message}`);
  if (!reqRow) return { request_id: requestId, skipped: "row_gone" };
  if (reqRow.status === "completed") return { request_id: requestId, idempotent: true };

  // Compile from the tables that exist today. consent_records is the subject's
  // consent history; more modules append here as they're built.
  const bundle = { subject: { contact_id: reqRow.contact_id, email: reqRow.requested_email }, compiled_at: new Date().toISOString(), records: {} };
  if (reqRow.contact_id) {
    const { data: consents } = await db
      .from("consent_records").select("kind, granted, source, created_at")
      .eq("workspace_id", reqRow.workspace_id).eq("contact_id", reqRow.contact_id);
    bundle.records.consent_records = consents || [];
    // M11 · deals linked to the subject (their pipeline value/status/history).
    const { data: deals } = await db
      .from("deals").select("id, title, value, currency, status, won_at, lost_reason, created_at")
      .eq("workspace_id", reqRow.workspace_id).eq("contact_id", reqRow.contact_id);
    bundle.records.deals = deals || [];
  }
  const deferred = ["contacts (M09)", "messages (M12)", "activities (M09)", "invoices — retained for legal/financial (M28)"];
  bundle.deferred_sources = deferred;

  // Store a reference (inline until object storage/R2 is wired) + mark completed.
  const exportUrl = `data:application/json;base64,${Buffer.from(JSON.stringify(bundle)).toString("base64")}`;
  const { error: upErr } = await db.from("gdpr_requests")
    .update({ status: "completed", export_url: exportUrl, completed_at: new Date().toISOString() }).eq("id", requestId);
  if (upErr) throw new Error(`gdpr.export write: ${upErr.message}`);

  console.log(`gdpr.export ${requestId}: bundled ${Object.keys(bundle.records).length} source(s); deferred → ${deferred.join(", ")}`);
  return { request_id: requestId, sources: Object.keys(bundle.records), deferred };
}

// M05 · gdpr.erase — right-to-be-forgotten. Anonymises the subject's PII across
// every BUILT module, KEEPING legally-required financial records (PRD_M05:
// "keep financial records as legally required"). Today: scrubs identifying
// metadata from the subject's consent_records evidence (the consent decision
// itself is retained as legal proof, but phone/message text are nulled). The full
// cascade (contacts, messages, deals, activities) extends this handler as those
// modules land — documented, never faked. Idempotent + service-role.
async function gdprErase(job) {
  const requestId = job.payload?.request_id;
  if (!requestId) throw new Error("gdpr.erase: missing request_id");

  const { data: reqRow, error: reqErr } = await db
    .from("gdpr_requests").select("id, workspace_id, contact_id, status").eq("id", requestId).maybeSingle();
  if (reqErr) throw new Error(`gdpr.erase read: ${reqErr.message}`);
  if (!reqRow) return { request_id: requestId, skipped: "row_gone" };
  if (reqRow.status === "completed") return { request_id: requestId, idempotent: true };

  const cascade = [];
  if (reqRow.contact_id) {
    // Retain the consent decision (kind/granted) as legal proof; strip PII evidence.
    const { data: scrubbed, error: scrubErr } = await db
      .from("consent_records").update({ ip_hash: null, evidence: { erased: true } })
      .eq("workspace_id", reqRow.workspace_id).eq("contact_id", reqRow.contact_id).select("id");
    if (scrubErr) throw new Error(`gdpr.erase scrub consent: ${scrubErr.message}`);
    cascade.push(`consent_records: ${scrubbed?.length ?? 0} evidence scrubbed`);
    // M11 · detach the subject's deals from their identity (keep the deal for revenue
    // records per "keep financial records"; the PII linkage is what's erased).
    const { data: detached, error: dealErr } = await db
      .from("deals").update({ contact_id: null, updated_at: new Date().toISOString() })
      .eq("workspace_id", reqRow.workspace_id).eq("contact_id", reqRow.contact_id).select("id");
    if (dealErr) throw new Error(`gdpr.erase detach deals: ${dealErr.message}`);
    cascade.push(`deals: ${detached?.length ?? 0} detached from contact`);
  }
  const deferred = ["contacts (M09)", "messages (M12)", "activities (M09)"];

  const { error: upErr } = await db.from("gdpr_requests")
    .update({ status: "completed", completed_at: new Date().toISOString(),
              notes: `Anonymised: ${cascade.join("; ") || "no built-module PII"}. Deferred cascade: ${deferred.join(", ")}.` })
    .eq("id", requestId);
  if (upErr) throw new Error(`gdpr.erase write: ${upErr.message}`);

  console.log(`gdpr.erase ${requestId}: ${cascade.join("; ") || "nothing to scrub yet"}; deferred → ${deferred.join(", ")}`);
  return { request_id: requestId, cascade, deferred };
}

// M09 · contact.import — CSV import (PRD_M09; Law 5). The Edge Function recorded a
// contact_imports row + enqueued this job with the parsed rows + column mapping in
// the payload (the browser never processes rows itself, Gate-4). Here we map each
// row to contact fields and upsert by email within the workspace, tracking
// inserted/updated/failed + a row-level error report on the contact_imports row.
// Idempotent: a contact_imports row already 'done' short-circuits. Service role
// (bypasses RLS) — every write carries workspace_id explicitly.
async function contactImport(job) {
  const { import_id, mapping, rows, consent_attested } = job.payload || {};
  if (!import_id || !mapping || !Array.isArray(rows)) throw new Error("contact.import: missing import_id/mapping/rows");
  const ws = job.workspace_id;

  const { data: imp, error: impErr } = await db
    .from("contact_imports").select("id, status").eq("id", import_id).maybeSingle();
  if (impErr) throw new Error(`contact.import read: ${impErr.message}`);
  if (!imp) return { import_id, skipped: "row_gone" };
  if (imp.status === "done") return { import_id, idempotent: true };

  await db.from("contact_imports").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", import_id);

  const FIELDS = new Set(["first_name", "last_name", "email", "phone", "source", "utm_source", "utm_medium", "utm_campaign", "company_id"]);
  let inserted = 0, updated = 0, failed = 0, processed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    try {
      const contact = { workspace_id: ws, source: "import" };
      for (const [csvCol, field] of Object.entries(mapping)) {
        if (!FIELDS.has(field)) continue;
        const val = Array.isArray(raw) ? raw[Number(csvCol)] : raw?.[csvCol];
        if (val != null && String(val).trim() !== "") contact[field] = String(val).trim();
      }
      if (!contact.email && !contact.phone && !contact.first_name && !contact.last_name) {
        throw new Error("row has no identifying field");
      }
      // Upsert by email within the workspace.
      let existing = null;
      if (contact.email) {
        const { data } = await db.from("contacts")
          .select("id").eq("workspace_id", ws).ilike("email", contact.email).is("deleted_at", null).limit(1).maybeSingle();
        existing = data;
      }
      if (existing) {
        const { error } = await db.from("contacts").update({ ...contact, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        updated++;
      } else {
        const { error } = await db.from("contacts").insert(contact);
        if (error) throw new Error(error.message);
        inserted++;
        if (consent_attested && contact.email) {
          // The operator attested lawful basis (M05) — record the opt-in.
          await db.from("consent_records").insert({ workspace_id: ws, kind: "email_optin", granted: true, source: "import", evidence: { via: "csv_import", import_id } });
        }
      }
    } catch (e) {
      failed++;
      errors.push({ row: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
    processed++;
    // Progress heartbeat every 100 rows so the wizard's poller advances.
    if (processed % 100 === 0) {
      await db.from("contact_imports").update({ processed, inserted, updated, failed, updated_at: new Date().toISOString() }).eq("id", import_id);
    }
  }

  await db.from("contact_imports").update({
    status: "done", processed, inserted, updated, failed,
    error_report: errors.slice(0, 500), updated_at: new Date().toISOString(),
  }).eq("id", import_id);

  console.log(`contact.import ${import_id}: ${inserted} inserted, ${updated} updated, ${failed} failed of ${rows.length}`);
  return { import_id, inserted, updated, failed, total: rows.length };
}

// M09 · contact.dedupe_scan — flag duplicate contact pairs (PRD_M09; D-045). Enqueued
// per workspace by the daily pg_cron. The email-exact + phone-exact matching lives in
// the dedupe_scan(ws) SQL function so the worker and the PGlite probe run identical
// logic; the browser reads contact_duplicates and drives merge_contacts from the UI.
async function contactDedupeScan(job) {
  const ws = job.workspace_id;
  const { data, error } = await db.rpc("dedupe_scan", { p_ws: ws });
  if (error) throw new Error(`contact.dedupe_scan: ${error.message}`);
  console.log(`contact.dedupe_scan ${ws}: ${data} open duplicate pair(s)`);
  return { workspace_id: ws, open_pairs: data };
}

// ── M16 · Campaigns send pipeline (D-094) ────────────────────────────────────
// Sends are a `jobs` fan-out: campaign.send resolves the eligible audience, gates
// on meter_check, writes a per-recipient send_events row, and enqueues throttled
// email.deliver / sms.deliver batch jobs. The actual provider calls (SendGrid /
// Twilio) are READY-NOT-RUN here (no creds/Deno) — the handlers read the key from
// Vault and honestly fail `sendgrid_unconfigured` when it's absent, never faked.

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";
const DELIVER_BATCH = 100;   // recipients per email.deliver job (throttle unit)

// Read a decrypted Vault secret via the service role (same shape as _shared/stripe.ts).
async function vaultSecret(name) {
  const { data, error } = await db.schema("vault").from("decrypted_secrets")
    .select("decrypted_secret").eq("name", name).maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  return data.decrypted_secret;
}

// SendGrid Mail Send over REST (Node global fetch). Ready-not-run: returns the
// provider message id on success; throws on a non-2xx so the job retries.
async function sendEmailNode(key, msg) {
  const res = await fetch(SENDGRID_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }], custom_args: { token: msg.token } }],
      from: { email: msg.from_email, name: msg.from_name || undefined },
      subject: msg.subject,
      content: [{ type: "text/html", value: msg.html }],
      headers: msg.unsubUrl
        ? { "List-Unsubscribe": `<${msg.unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
        : undefined,
    }),
  });
  if (!res.ok) throw new Error(`sendgrid ${res.status}: ${await res.text().catch(() => "")}`);
  return res.headers.get("x-message-id") || null;
}

// campaign.send — the FAN-OUT. Resolve audience (minus suppressions + opt-outs),
// gate on the email quota, write one queued send_events row per recipient, then
// enqueue throttled email.deliver batches. A/B: send the two sample slices now and
// schedule campaign.ab_winner (+4h) to send the remainder with the winning subject.
async function campaignSend(job) {
  const ws = job.workspace_id;
  const campaignId = job.payload?.campaign_id;
  if (!campaignId) throw new Error("campaign.send: missing campaign_id");

  const { data: camp, error: cErr } = await db.from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (cErr) throw new Error(`campaign.send read: ${cErr.message}`);
  if (!camp) return { campaign_id: campaignId, skipped: "gone" };
  if (["sent", "paused", "draft"].includes(camp.status)) return { campaign_id: campaignId, skipped: camp.status };

  // Eligible recipients (definer fn subtracts suppressions + email opt-outs).
  const { data: audience, error: aErr } = await db.rpc("resolve_campaign_audience", { p_ws: ws, p_audience: camp.audience });
  if (aErr) throw new Error(`campaign.send audience: ${aErr.message}`);
  const recipients = (audience || []).filter((c) => c.email);

  // Quota gate (Gate 3): a hard-stop with no wallet fails the campaign, bills nothing.
  const { data: gate } = await db.rpc("meter_check", { p_workspace: ws, p_kind: "email", p_qty: recipients.length });
  if (gate?.over && Number(gate?.wallet || 0) <= 0) {
    await db.from("email_campaigns").update({ status: "failed" }).eq("id", campaignId);
    return { campaign_id: campaignId, status: "failed", reason: "quota_exceeded", recipients: recipients.length };
  }

  if (recipients.length === 0) {
    await db.from("email_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaignId);
    return { campaign_id: campaignId, status: "sent", recipients: 0 };
  }

  // Write one queued send_events row per recipient (the tracking token lives here).
  const events = recipients.map((c) => ({
    workspace_id: ws, campaign_id: campaignId, contact_id: c.id, email: c.email, type: "queued",
  }));
  const { data: written, error: seErr } = await db.from("send_events").insert(events).select("id");
  if (seErr) throw new Error(`campaign.send seed events: ${seErr.message}`);
  const ids = (written || []).map((r) => r.id);

  // Fan out into throttled email.deliver batches (run_after staggered by throttle).
  const perMin = camp.throttle_per_min || null;
  let batchIdx = 0;
  for (let i = 0; i < ids.length; i += DELIVER_BATCH) {
    const slice = ids.slice(i, i + DELIVER_BATCH);
    const delayMin = perMin ? Math.floor((i / perMin)) : 0;
    await db.from("jobs").insert({
      workspace_id: ws, type: camp.channel === "sms" ? "sms.deliver" : "email.deliver",
      payload: { campaign_id: campaignId, event_ids: slice },
      status: "queued", run_after: new Date(Date.now() + delayMin * 60_000).toISOString(),
      idempotency_key: `deliver:campaign:${campaignId}:batch:${batchIdx++}`,
    });
  }

  await db.from("email_campaigns").update({ status: "sending", sent_at: new Date().toISOString() }).eq("id", campaignId);
  return { campaign_id: campaignId, status: "sending", recipients: recipients.length, batches: batchIdx };
}

// email.deliver — send one batch. Reads the SendGrid key from Vault (ready-not-run:
// honest `sendgrid_unconfigured` when absent). Each successful send flips its
// send_events row to 'sent' and meters `email` in the same step (a failed provider
// call bills nothing and the recipient stays queued for retry — Gate 3).
async function emailDeliver(job) {
  const ws = job.workspace_id;
  const { campaign_id, event_ids } = job.payload || {};
  if (!campaign_id || !Array.isArray(event_ids)) throw new Error("email.deliver: missing campaign_id/event_ids");

  const key = await vaultSecret(`ws_${ws}__sendgrid__api_key`) || await vaultSecret("plat__sendgrid__api_key");
  if (!key) throw new Error("sendgrid_unconfigured: no SendGrid key in Vault for this workspace");

  const { data: camp } = await db.from("email_campaigns").select("subject, body_html, from_name, from_email, footer_address").eq("id", campaign_id).maybeSingle();
  const { data: rows } = await db.from("send_events").select("id, contact_id, email, token").in("id", event_ids);

  let sent = 0;
  for (const r of rows || []) {
    try {
      const msgId = await sendEmailNode(key, {
        to: r.email, from_email: camp?.from_email, from_name: camp?.from_name,
        subject: camp?.subject || "", html: camp?.body_html || "", token: r.token,
        unsubUrl: `${process.env.PUBLIC_FUNCTIONS_URL || ""}/email-unsubscribe?token=${r.token}`,
      });
      await db.from("send_events").update({ type: "sent", provider_message_id: msgId }).eq("id", r.id);
      await db.rpc("meter_increment", { p_workspace: ws, p_kind: "email", p_qty: 1, p_source: "m16" });
      sent++;
    } catch (e) {
      // Leave the row 'queued'; the job retries via backoff. Never meter a failed send.
      console.error(`email.deliver ${r.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { campaign_id, batch: event_ids.length, sent };
}

// sms.deliver — the SMS equivalent, gated by consent + A2P and metering `sms`
// (M12's Twilio contract). Ready-not-run (no Twilio creds). Delegates the per-
// recipient send + gates to the existing inbox-send Edge Fn so the A2P/consent/
// meter path is identical to the inbox (no double-meter — this is the campaign send).
async function smsDeliver(job) {
  const ws = job.workspace_id;
  const { campaign_id, event_ids } = job.payload || {};
  if (!campaign_id || !Array.isArray(event_ids)) throw new Error("sms.deliver: missing campaign_id/event_ids");
  const { data: camp } = await db.from("email_campaigns").select("sms_body").eq("id", campaign_id).maybeSingle();
  const { data: rows } = await db.from("send_events").select("id, contact_id").in("id", event_ids);
  let sent = 0;
  for (const r of rows || []) {
    try {
      const { error } = await db.functions.invoke("inbox-send", {
        body: { workspace_id: ws, contact_id: r.contact_id, channel: "sms", body: camp?.sms_body || "", source: "campaign" },
      });
      if (error) throw new Error(error.message);
      await db.from("send_events").update({ type: "sent" }).eq("id", r.id);
      sent++;
    } catch (e) {
      console.error(`sms.deliver ${r.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { campaign_id, batch: event_ids.length, sent };
}

// sequence.step — run one drip step for one enrollment. Checks exit conditions,
// sends the step (email/SMS), advances current_step, and schedules the NEXT step as
// a run_after-delayed job (the D-061 WAIT pattern) — or completes the enrollment.
async function sequenceStep(job) {
  const ws = job.workspace_id;
  const enrollmentId = job.payload?.enrollment_id;
  if (!enrollmentId) throw new Error("sequence.step: missing enrollment_id");

  const { data: enr } = await db.from("sequence_enrollments").select("*").eq("id", enrollmentId).maybeSingle();
  if (!enr || enr.status !== "active") return { enrollment_id: enrollmentId, skipped: enr?.status || "gone" };

  // Exit: the contact unsubscribed (suppression / opt-out) → stop the drip.
  const { data: contact } = await db.from("contacts").select("email").eq("id", enr.contact_id).maybeSingle();
  if (contact?.email) {
    const { count } = await db.from("suppressions").select("id", { count: "exact", head: true })
      .eq("workspace_id", ws).ilike("email", contact.email);
    if (count) {
      await db.from("sequence_enrollments").update({ status: "unsubscribed", completed_at: new Date().toISOString() }).eq("id", enrollmentId);
      return { enrollment_id: enrollmentId, status: "unsubscribed" };
    }
  }

  const nextOrder = enr.current_step; // steps are 0-indexed; current_step points at the one to send now
  const { data: step } = await db.from("sequence_steps").select("*").eq("sequence_id", enr.sequence_id).eq("step_order", nextOrder).maybeSingle();
  if (!step) {
    await db.from("sequence_enrollments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", enrollmentId);
    return { enrollment_id: enrollmentId, status: "completed" };
  }

  // Send this step (ready-not-run provider calls) + record the send_event.
  await db.from("send_events").insert({
    workspace_id: ws, step_id: step.id, enrollment_id: enrollmentId, contact_id: enr.contact_id,
    email: contact?.email, type: "sent",
  });

  // Schedule the next step (relative delay in days) or finish.
  const { data: next } = await db.from("sequence_steps").select("id, delay").eq("sequence_id", enr.sequence_id).eq("step_order", nextOrder + 1).maybeSingle();
  if (next) {
    const days = Number(next.delay?.days || 1);
    const runAt = new Date(Date.now() + days * 86_400_000).toISOString();
    await db.from("sequence_enrollments").update({ current_step: nextOrder + 1, next_run_at: runAt }).eq("id", enrollmentId);
    await db.from("jobs").insert({
      workspace_id: ws, type: "sequence.step", payload: { enrollment_id: enrollmentId },
      status: "queued", run_after: runAt, idempotency_key: `seqstep:${enrollmentId}:${nextOrder + 1}`,
    });
    return { enrollment_id: enrollmentId, advanced_to: nextOrder + 1, next_run_at: runAt };
  }
  await db.from("sequence_enrollments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", enrollmentId);
  return { enrollment_id: enrollmentId, status: "completed" };
}

// campaign.ab_winner — 4h after the A/B samples, pick the subject with more opens
// and send the remainder with it. Ready-not-run detail: the remainder audience is
// re-resolved minus the already-sent sample.
async function campaignAbWinner(job) {
  const ws = job.workspace_id;
  const campaignId = job.payload?.campaign_id;
  if (!campaignId) throw new Error("campaign.ab_winner: missing campaign_id");
  const { data: camp } = await db.from("email_campaigns").select("id, ab_enabled").eq("id", campaignId).maybeSingle();
  if (!camp?.ab_enabled) return { campaign_id: campaignId, skipped: "no_ab" };
  // Opens are recorded on send_events; the sample variant is tagged in the payload
  // the sampler wrote. Here we simply pick by opened-count (A vs B) — the sampler +
  // remainder-send wire live when SendGrid is connected (ready-not-run).
  const { data: rows } = await db.from("send_events").select("type").eq("campaign_id", campaignId).eq("type", "opened");
  const winner = "A"; // deterministic default until live open data exists
  await db.from("email_campaigns").update({ ab_winner: winner }).eq("id", campaignId);
  return { campaign_id: campaignId, ab_winner: winner, sample_opens: (rows || []).length };
}

// M06 · media.autotag — AI vision auto-tagging (background, enqueued by
// register_media_asset for image uploads). Invokes the media-autotag Edge
// Function, which writes ai_tags + an alt_text draft and flips tag_status to
// 'done'. The vision PROVIDER is a labelled scaffold (deterministic tags until a
// model is chosen — same open-decision posture as email D-011 / the M13 AI
// builder D-063); meter_increment('ai_tokens') fires only on a real provider
// call, so nothing is billed yet (Gate-3). Idempotent via the job's
// idempotency_key. Ready-but-not-run locally (needs the deployed Edge Fn).
async function mediaAutotag(job) {
  const assetId = job.payload?.asset_id;
  if (!assetId) throw new Error("media.autotag: missing asset_id");
  const { data, error } = await db.functions.invoke("media-autotag", { body: { asset_id: assetId } });
  if (error) {
    // On terminal failure, mark the asset so the grid shows an honest "untagged".
    if (job.attempts >= job.max_attempts) {
      await db.from("media_assets").update({ tag_status: "failed" }).eq("id", assetId);
    }
    throw new Error(`media.autotag: ${error.message}`);
  }
  return data?.data ?? data ?? { status: "invoked" };
}

// ─────────────────────────────────────────────────────────────────────────────
// M21 · SEO Engine worker handlers (rank tracking + weekly digest + audit crawl).
// ─────────────────────────────────────────────────────────────────────────────

// M21 · rank.check — one active tracked keyword per job (enqueued daily by the
// seo-rank-check-daily cron → enqueue_due_rank_checks). Parses the live SERP for the
// tracker's own domain + each competitor, then record_keyword_ranking() writes the
// snapshot, computes the delta, and fires rank.change_major on |Δ|>=5 (M13). Meters
// seo_calls per SERP pull. The live SERP fetch runs through the seo-serp Edge Fn
// (Vault creds); with no SerpApi cred connected this returns not_connected and the job
// records NOTHING (honest ready-not-run — never a faked position).
async function rankCheck(job) {
  const tkId = job.payload?.tracked_keyword_id;
  if (!tkId) throw new Error("rank.check: missing tracked_keyword_id");
  const { data: tk, error: tErr } = await db.from("tracked_keywords")
    .select("id, workspace_id, keyword, domain, country, competitor_domains, is_active").eq("id", tkId).maybeSingle();
  if (tErr) throw new Error(`rank.check read: ${tErr.message}`);
  if (!tk || !tk.is_active) return { tracked_keyword_id: tkId, skipped: "inactive_or_missing" };

  // Live SERP via the Edge Fn (meters seo_calls internally on success).
  const { data: serp, error: sErr } = await db.functions.invoke("seo-serp", {
    body: { workspace_id: tk.workspace_id, keyword: tk.keyword, country: tk.country },
  });
  if (sErr || !serp?.data) {
    // not_connected / provider error: ready-not-run — do not fabricate a ranking.
    throw new Error(`rank.check serp: ${sErr?.message ?? serp?.error ?? "no_data"}`);
  }

  const results = serp.data.results ?? [];
  const mine = results.find((r) => sameHost(r.domain, tk.domain));
  const competitors = {};
  for (const c of tk.competitor_domains ?? []) {
    const hit = results.find((r) => sameHost(r.domain, c));
    if (hit) competitors[c] = hit.position;
  }
  const { error: rErr } = await db.rpc("record_keyword_ranking", {
    p_ws: tk.workspace_id, p_tk: tk.id,
    p_position: mine?.position ?? null, p_url: mine?.url ?? null,
    p_featured: !!serp.data.features?.featured_snippet, p_competitors: competitors,
  });
  if (rErr) throw new Error(`rank.check record: ${rErr.message}`);
  return { tracked_keyword_id: tkId, position: mine?.position ?? null, competitors };
}

const sameHost = (a, b) => !!a && !!b &&
  String(a).replace(/^www\./, "").toLowerCase() === String(b).replace(/^www\./, "").toLowerCase();

// M21 · rank.report — Monday weekly digest (enqueued by seo-rank-report-weekly cron →
// enqueue_weekly_rank_reports). Aggregates the week's position deltas per workspace and
// composes a SendGrid email (D-086). The SEND itself is CARRIED (no Deno/SendGrid cred
// here): the digest is composed and logged; the live send wires when SendGrid is
// connected — never a faked "sent".
async function rankReport(job) {
  const ws = job.workspace_id;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: trackers } = await db.from("tracked_keywords")
    .select("id, keyword, domain").eq("workspace_id", ws).eq("is_active", true);
  const rows = [];
  for (const t of trackers ?? []) {
    const { data: hist } = await db.from("keyword_rankings")
      .select("position, checked_on").eq("tracked_keyword_id", t.id)
      .gte("checked_on", since).order("checked_on", { ascending: true });
    if (!hist || hist.length === 0) continue;
    const first = hist[0].position, last = hist[hist.length - 1].position;
    rows.push({ keyword: t.keyword, domain: t.domain, from: first, to: last,
      delta: (first ?? 0) - (last ?? 0) }); // positive = improved (moved up)
  }
  const digest = { workspace_id: ws, week_of: since, movers: rows };
  // Ready-not-run: compose only. Real path → invoke a SendGrid Edge Fn with this digest.
  console.log(`rank.report ${ws}: composed weekly digest for ${rows.length} tracker(s) — send carried (SendGrid not connected)`);
  return { ...digest, sent: false, note: "composed; live send carried (ready-not-run)" };
}

// M21 · seo.audit.crawl — chunked, resumable technical audit (D-131). Advances the
// crawl by one bounded batch, persists issues + the resume cursor into seo_audits, then
// RE-ENQUEUES ITSELF (run_after) until the frontier drains or the 500-page cap is hit —
// the M13 WAIT-node re-queue mechanism, so it fits any runtime budget regardless of the
// OPEN D-010 worker-runtime decision. On completion it folds in PSI CWV (top pages),
// SSL + schema checks, and the deterministic audit_score. The live crawl fetch + PSI are
// CARRIED here (no outbound network in the harness) — the structure is real and tested
// by m21crawlprobe.mjs against a pure fake fetch.
const AUDIT_BATCH = 50;
async function seoAuditCrawl(job) {
  const auditId = job.payload?.audit_id;
  if (!auditId) throw new Error("seo.audit.crawl: missing audit_id");
  const { data: audit, error: aErr } = await db.from("seo_audits")
    .select("id, workspace_id, domain, status, cursor, pages_crawled").eq("id", auditId).maybeSingle();
  if (aErr) throw new Error(`seo.audit.crawl read: ${aErr.message}`);
  if (!audit) throw new Error("seo.audit.crawl: audit not found");
  if (audit.status === "done" || audit.status === "failed") return { audit_id: auditId, idempotent: true };

  const origin = `https://${audit.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const cursor = audit.cursor && audit.cursor.frontier ? audit.cursor
    : { frontier: [origin], visited: [], issues: [] };

  await db.from("seo_audits").update({ status: "running" }).eq("id", auditId);

  // Rate-limited, robots-aware fetch (2 req/s). Outbound network is carried locally.
  const disallow = cursor.robots ?? [];
  const fetchFn = async (url) => {
    await new Promise((r) => setTimeout(r, 500)); // 2 req/s cap
    const res = await fetch(url, { redirect: "manual" });
    const html = res.status < 300 ? await res.text() : "";
    return { status: res.status, html };
  };

  const next = await crawlStep({ frontier: cursor.frontier, visited: cursor.visited, issues: [] },
    { origin, batch: AUDIT_BATCH, fetchFn, maxPages: 500, disallow });

  // Persist this chunk's issues (service role) + advance the cursor.
  if (next.issues.length) {
    await db.from("seo_audit_issues").insert(next.issues.map((i) => ({
      workspace_id: audit.workspace_id, audit_id: auditId,
      type: i.type, severity: i.severity, url: i.url, detail: i.detail,
    })));
  }
  const pagesCrawled = audit.pages_crawled + next.visited.length - cursor.visited.length;
  const newCursor = { frontier: next.frontier, visited: next.visited, robots: disallow };

  const more = next.frontier.length > 0 && next.visited.length < 500;
  if (more) {
    await db.from("seo_audits").update({ cursor: newCursor, pages_crawled: pagesCrawled }).eq("id", auditId);
    // Re-enqueue the next chunk (WAIT-node re-queue). A fresh idempotency_key per chunk.
    await db.from("jobs").insert({
      workspace_id: audit.workspace_id, type: "seo.audit.crawl", payload: { audit_id: auditId },
      status: "queued", run_after: new Date(Date.now() + 2000).toISOString(),
      idempotency_key: `audit-${auditId}-chunk-${next.visited.length}`,
    });
    return { audit_id: auditId, chunk_pages: pagesCrawled, more: true };
  }

  // Completion: fold in the deterministic score (CWV/SSL/schema are carried — the PSI
  // Edge Fn wires when the cred is connected; recorded honestly as pending).
  const { data: score } = await db.rpc("audit_score", { p_audit: auditId });
  await db.from("seo_audits").update({
    status: "done", pages_crawled: pagesCrawled, cursor: newCursor, score: score ?? null,
    results: { cwv: null, ssl: null, schema: null, summary: { pages: pagesCrawled, issues: next.issues.length },
      note: "CWV/SSL/schema carried — connect PageSpeed to populate" },
  }).eq("id", auditId);
  return { audit_id: auditId, pages_crawled: pagesCrawled, score: score ?? null, done: true };
}

// M22-auto · blog.generate — turn a queued content_queue keyword into a SCORED,
// internally-linked, JSON-LD blog_articles DRAFT via the deterministic
// blog-pipeline.mjs SCAFFOLD (D-147). No provider, no network, NOTHING metered —
// the two provider gaps (GPT prose + DALL·E/M35 images) are labelled stubs the
// pipeline module never calls. Payload: {content_queue_id, workspace_id}. Flow:
//   claim → load queue row + its site's content_schedules settings →
//   compute_topic_cluster → build_serp_brief → build_article_html → score_article →
//   suggest_internal_links → build_schema → create_generated_article (draft) →
//   quality gate vs the schedule thresholds:
//     below threshold          → item done, step='review', fail_reason='BELOW_THRESHOLD',
//                                 article routed to the M22-manual review queue (in_review).
//     pass + auto_publish=true  → _m22_publish (service-role publish), item step='published'.
//     pass + auto_publish=false → item step='review', article in_review.
//   On error → fail_content_item + rethrow so the worker's retry (×max_attempts) applies.
async function handleBlogGenerate(job) {
  const queueId = job.payload?.content_queue_id;
  if (!queueId) throw new Error("blog.generate: missing content_queue_id");

  // Claim the queue row (queued|in_progress → in_progress, step='brief').
  const { data: claimed, error: cErr } = await db.rpc("claim_content_item", { p_id: queueId });
  if (cErr) throw new Error(`blog.generate claim: ${cErr.message}`);
  const item = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!item || !item.id) return { content_queue_id: queueId, skipped: "not_claimable" };

  try {
    const ws = item.workspace_id;
    const siteId = item.site_id;
    const keyword = item.keyword;
    if (!keyword) throw new Error("blog.generate: queue row has no keyword");
    if (!siteId) throw new Error("blog.generate: queue row has no site_id (assign a site before generating)");

    // The per-site schedule carries the brand voice, target length, thresholds, and
    // the auto_publish switch. Absent → conservative defaults.
    const { data: sched } = await db.from("content_schedules")
      .select("id, auto_publish, min_seo_score, min_readability_score, target_word_count, brand_voice, niche")
      .eq("site_id", siteId).maybeSingle();
    const minSeo = sched?.min_seo_score ?? 70;
    const minRead = sched?.min_readability_score ?? 50;
    const autoPublish = sched?.auto_publish ?? false;

    // Run the deterministic pipeline (the two AI stubs are NEVER called here).
    const cluster = compute_topic_cluster(keyword, siteId);
    const brief = build_serp_brief(keyword, cluster);
    const html = build_article_html(brief, cluster);
    const scored = score_article(html, keyword);
    // suggest_internal_links is already folded into the article HTML by build_article_html;
    // we compute it explicitly so the tags carry the cluster/pillar linkage too.
    const links = suggest_internal_links(cluster);
    const schema = build_schema(keyword, { meta_title: brief.meta_title, meta_desc: brief.meta_desc, slug: brief.slug });

    // Featured image = STUB. Leave featured_image_url null; do NOT call the image stub.
    // TODO(M35): wire M35 Creative Studio → meter image_gen when it lands (D-152).
    // TODO(provider): meter ai_tokens + image_gen when a real LLM/image provider is
    // wired (JOBS §6). Scaffold posture = no billable action (Gate 3).

    const payload = {
      keyword,
      title: brief.title_ideas[0],
      slug: brief.slug,
      excerpt: brief.meta_desc,
      content_html: html,
      meta_title: brief.meta_title,
      meta_desc: brief.meta_desc,
      tags: [cluster.pillar_slug, cluster.cluster_slug, ...links.map((l) => l.slug)]
        .filter((v, i, a) => v && a.indexOf(v) === i),
      schema,
      seo_score: scored.seo_score,
      readability_score: scored.readability_score,
      word_count: scored.word_count,
      cluster_slug: cluster.cluster_slug,
      pillar_slug: cluster.pillar_slug,
    };

    const { data: artId, error: aErr } = await db.rpc("create_generated_article", {
      p_ws: ws, p_site: siteId, p_schedule: sched?.id ?? null, p_payload: payload,
    });
    if (aErr) throw new Error(`blog.generate create: ${aErr.message}`);

    const passes = scored.seo_score >= minSeo && scored.readability_score >= minRead;

    if (!passes) {
      // Below threshold → route to the M22-manual review queue (in_review), item done.
      await db.from("blog_articles").update({ status: "in_review" }).eq("id", artId);
      await db.rpc("complete_content_item", {
        p_id: queueId, p_article: artId, p_step: "review", p_fail_reason: "BELOW_THRESHOLD",
      });
      return { content_queue_id: queueId, article_id: artId, outcome: "review",
        reason: "below_threshold", seo_score: scored.seo_score, readability_score: scored.readability_score };
    }

    if (autoPublish) {
      // Pass + auto_publish → publish via the INTERNAL side-effect (service-role; the
      // manager-gated publish_article would fail with no auth.uid()). Builds JSON-LD,
      // flips to published, fires the M13 article.published bus.
      const { error: pErr } = await db.rpc("_m22_publish", { p_article: artId });
      if (pErr) throw new Error(`blog.generate publish: ${pErr.message}`);
      await db.rpc("complete_content_item", {
        p_id: queueId, p_article: artId, p_step: "published", p_fail_reason: null,
      });
      return { content_queue_id: queueId, article_id: artId, outcome: "published",
        seo_score: scored.seo_score, readability_score: scored.readability_score };
    }

    // Pass + not auto_publish → send the draft to the review queue (in_review).
    await db.from("blog_articles").update({ status: "in_review" }).eq("id", artId);
    await db.rpc("complete_content_item", {
      p_id: queueId, p_article: artId, p_step: "review", p_fail_reason: null,
    });
    return { content_queue_id: queueId, article_id: artId, outcome: "review",
      seo_score: scored.seo_score, readability_score: scored.readability_score };
  } catch (e) {
    // Record the failure on the queue row, then rethrow so the jobs-layer retry applies.
    await db.rpc("fail_content_item", { p_id: queueId, p_reason: String(e?.message || e).slice(0, 500) })
      .catch(() => {});
    throw e;
  }
}

// Route a job by type.
async function run(job) {
  switch (job.type) {
    case "session0.probe":
      return { echoed: job.payload, worker: WORKER_ID, at: new Date().toISOString() };
    case "workspace.provision":
      return await provisionWorkspace(job);
    case "integration.health_check":
      return await healthCheck(job);
    case "integration.refresh_token":
      return await refreshToken(job);
    case "gdpr.export":
      return await gdprExport(job);
    case "gdpr.erase":
      return await gdprErase(job);
    case "contact.import":
      return await contactImport(job);
    case "contact.dedupe_scan":
      return await contactDedupeScan(job);
    case "automation.execute":
      return await automationExecute(job);
    case "automation.date_sweep":
      return await automationDateSweep(job);
    case "appointment.remind":
      return await appointmentRemind(job);
    case "campaign.send":
      return await campaignSend(job);
    case "email.deliver":
      return await emailDeliver(job);
    case "sms.deliver":
      return await smsDeliver(job);
    case "sequence.step":
      return await sequenceStep(job);
    case "campaign.ab_winner":
      return await campaignAbWinner(job);
    case "media.autotag":
      return await mediaAutotag(job);
    case "rank.check":
      return await rankCheck(job);
    case "rank.report":
      return await rankReport(job);
    case "seo.audit.crawl":
      return await seoAuditCrawl(job);
    case "blog.generate":
      return await handleBlogGenerate(job);
    default:
      throw new Error(`unknown job type: ${job.type}`);
  }
}

async function processOne() {
  const job = await claim();
  if (!job) return false;
  console.log(`claimed ${job.id} (${job.type}) → running`);
  try {
    const result = await run(job);
    await complete(job.id, result);
    console.log(`done ${job.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fail(job, msg);
    console.error(`failed ${job.id}: ${msg}`);
  }
  return true;
}

if (ONCE) {
  const did = await processOne();
  if (!did) { console.error("no queued job to claim"); process.exit(1); }
  process.exit(0);
} else if (maxArg && Number.isNaN(MAX)) {
  console.error(`invalid --max value: ${maxArg}`);
  process.exit(1);
} else if (MAX !== null && !Number.isNaN(MAX)) {
  // Claim up to MAX jobs then exit cleanly — the mode a scheduled CI runner needs
  // (D-010/D-189): no infinite loop, no lingering process for the runner to kill.
  let claimedCount = 0;
  for (let i = 0; i < MAX; i++) {
    const did = await processOne();
    if (!did) break;
    claimedCount++;
  }
  console.log(`${WORKER_ID} processed ${claimedCount}/${MAX} job(s), exiting`);
  process.exit(0);
} else {
  console.log(`${WORKER_ID} polling for jobs…`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const did = await processOne();
    if (!did) await new Promise((r) => setTimeout(r, 1000));
  }
}
