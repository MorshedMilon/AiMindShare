// functions/public-form/index.ts — M15 the NO-AUTH public form/survey/quiz surface
// (verify_jwt=false). A visitor on /f/[token] has no session, so this runs
// service-role and authorizes every path by the unguessable forms.public_token. All
// writes (views, submissions) go through the service role — the browser can never
// forge a view or a submission (RLS: service-role-only, D-055 / Gate-4). The
// authoritative validation, spam gate, scoring, contact-upsert, consent, routing and
// bus emit all live in the submit_form() SQL (0020); this function is the thin,
// public-safe HTTP shell around it — mirrors public-booking / public-invoice.
//
// Routes (all under /functions/v1/public-form):
//   GET  ?token=<uuid>[&visitor=<id>]      → public-safe form config (+ assigned A/B variant)
//   GET  ?action=confirm&token=<uuid>      → double-opt-in confirm (HTML page, or JSON if Accept:json)
//   POST ?action=view    {token,visitor,variant,event,step}          → funnel beacon row
//   POST ?action=submit  {token,answers,utm,visitor,variant,spam}    → submit_form() → typed outcome
//
// PUBLIC-SAFE CONTRACT (GET ?token): only { id, name, type, fields_json (map_to
// stripped per field), logic_json, settings_json→{design,steps,spam:{honeypot,min_ms}},
// variant } ever reach the wire. routing_json, the raw settings_json, field map_to
// targets, ab_split internals and workspace_id are NEVER exposed (Gate-7).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight, cors } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { validate } from "../_shared/formValidator.ts";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const admin = serviceClient();

  try {
    // ── GET ?action=confirm — double opt-in confirmation page ────────────────────
    if (req.method === "GET" && action === "confirm") {
      const token = url.searchParams.get("token");
      if (!token) return err(400, "bad_request", "token is required");
      const { data: r, error: cErr } = await admin.rpc("form_confirm_optin", { p_token: token });
      if (cErr) return err(500, "confirm_failed", cErr.message);
      const status = (r as any)?.status ?? "already_confirmed";
      // Embeds ask for JSON; a browser click gets a small self-contained HTML page.
      if ((req.headers.get("accept") ?? "").includes("application/json")) {
        return ok({ status });
      }
      return confirmPage(status);
    }

    // ── GET ?token — public-safe form config (+ optional A/B variant) ────────────
    if (req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return err(400, "bad_request", "token is required");

      const { data: form } = await admin.from("forms")
        // narrow select — never pull routing_json/ab_split/variant_of_id onto the wire.
        .select("id, name, type, fields_json, logic_json, settings_json, status")
        .eq("public_token", token).eq("status", "published").maybeSingle();
      if (!form) return err(404, "not_found", "This form is unavailable");

      // A/B: deterministic assignment for a known visitor; null when no A/B in play.
      let variant: string | null = null;
      const visitor = url.searchParams.get("visitor");
      if (visitor) {
        const { data: v } = await admin.rpc("assign_form_variant", { p_form: (form as any).id, p_visitor: visitor });
        variant = (v as string) ?? null;
      }

      return ok({ form: publicForm(form as any), variant });
    }

    // ── POST ─────────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) ?? {};
      const token = body?.token;
      if (!token) return err(400, "bad_request", "token is required");

      // ── POST ?action=view — the funnel beacon (view | start | complete) ────────
      if (action === "view") {
        // Resolve form_id + workspace_id from the token (the browser never supplies
        // workspace_id — it can't be trusted, and views are service-role-write-only).
        const { data: form } = await admin.from("forms")
          .select("id, workspace_id").eq("public_token", token).eq("status", "published").maybeSingle();
        if (!form) return err(404, "not_found", "This form is unavailable");
        const event = ["view", "start", "complete"].includes(String(body.event)) ? String(body.event) : "view";
        const step = Number.isInteger(body.step) ? body.step : null;
        await admin.from("form_views").insert({
          form_id: (form as any).id,
          workspace_id: (form as any).workspace_id,
          visitor_id: String(body.visitor ?? "anon"),
          variant: body.variant ?? null,
          step,
          event,
        });
        return ok({ tracked: true });
      }

      // ── POST ?action=submit — the authoritative submission pipeline ────────────
      if (action === "submit") {
        const answers = body.answers ?? {};
        const utm = body.utm ?? {};
        const visitor = body.visitor ?? null;
        const variant = body.variant ?? null;
        const spam = body.spam ?? {};

        // Turnstile verify — SCAFFOLDED, no key on this deployment. If a Turnstile
        // secret is configured (env var TURNSTILE_SECRET_KEY, or the platform Vault
        // secret `plat__turnstile__secret` read below), verify body.spam.turnstile
        // against Cloudflare's siteverify. When ABSENT we SKIP verification (this is
        // an honest scaffold — the DB spam gate honeypot + time-trap still apply).
        // Mirrors the M13 "AI provider not wired yet" / M28 stripe-unconfigured shape.
        const turnstileSecret = await turnstileKey(admin);
        if (turnstileSecret) {
          const passed = await verifyTurnstile(turnstileSecret, spam?.turnstile, spam?.ip_hash);
          if (!passed) return ok({ status: "spam_rejected" }); // non-leaky, same shape as the SQL gate
        }
        // else: no Turnstile key on this deployment → skip (scaffold).

        // Fast, non-authoritative pre-check (UX parity with the browser renderer).
        // The SQL inside submit_form re-runs the SAME rules and is the real gate;
        // this only saves a round-trip on an obviously-invalid payload. We honor the
        // SQL's ORDERING — spam gate (honeypot + time-trap) BEFORE validation — so a
        // spam submit is never mislabeled validation_failed (which would leak "this
        // field is required" to a bot instead of a silent spam_rejected).
        const { data: pf } = await admin.from("forms")
          .select("fields_json, logic_json, settings_json").eq("public_token", token).eq("status", "published").maybeSingle();
        if (pf) {
          const s = ((pf as any).settings_json ?? {}) as Record<string, any>;
          const honeypot = s.spam?.honeypot || null;
          const minMs = Number.isFinite(s.spam?.min_ms) ? Number(s.spam.min_ms) : 1500;
          const hpFilled = honeypot && String((answers as any)?.[honeypot] ?? "") !== "";
          // elapsed_ms is only checked when the client reported it (absent → passes, as in SQL).
          const tooFast = spam && "elapsed_ms" in spam && Number(spam.elapsed_ms ?? 0) < minMs;
          if (hpFilled || tooFast) return ok({ status: "spam_rejected" });

          const pre = validate((pf as any).fields_json ?? [], answers, (pf as any).logic_json ?? []);
          if (!pre.ok) {
            // Shape mirrors submit_form's validation_failed (errors as [{field,error}]).
            const errors = Object.entries(pre.errors).map(([field, error]) => ({ field, error }));
            return ok({ status: "validation_failed", errors });
          }
        }

        const { data: result, error: sErr } = await admin.rpc("submit_form", {
          p_token: token,
          p_answers: answers,
          p_utm: utm,
          p_visitor: visitor,
          p_variant: variant,
          p_spam: spam,
        });
        // A raised exception (form_not_found / form_not_published) → non-leaky 404.
        if (sErr) return err(404, "not_found", "This form is unavailable");

        const status = (result as any)?.status ?? "complete";
        // Typed outcomes returned as 200 with {status} (public-booking-style), so the
        // renderer branches on status without treating a spam/validation reject as a
        // transport error. No secret or internal detail ever leaves in the envelope.
        return ok(result);
      }

      return err(400, "bad_action", "Unknown action");
    }

    return err(405, "method_not_allowed", "GET or POST only");
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

// ── public-safe projection of a forms row ──────────────────────────────────────
// Strips map_to from every field and reduces settings_json to ONLY the keys the
// public renderer needs: design (styling), steps (multi-step layout), and a spam
// hint reduced to { honeypot, min_ms } so the client can wire the decoy + time-trap.
// NEVER returns routing_json, raw settings_json, scoring/tiers, or workspace_id.
function publicForm(form: {
  id: string; name: string; type: string;
  fields_json: unknown; logic_json: unknown; settings_json: unknown;
}) {
  const fields = Array.isArray(form.fields_json) ? form.fields_json : [];
  const safeFields = fields.map((f: any) => {
    const { map_to, ...rest } = f ?? {}; // drop the CRM mapping target — client never needs it
    void map_to;
    return rest;
  });
  const s = (form.settings_json ?? {}) as Record<string, any>;
  const safeSettings: Record<string, unknown> = {};
  if (s.design !== undefined) safeSettings.design = s.design;
  if (s.steps !== undefined) safeSettings.steps = s.steps;
  if (s.spam) {
    // expose ONLY the honeypot field name + the time-trap floor (both are client-side).
    safeSettings.spam = {
      honeypot: s.spam.honeypot ?? null,
      min_ms: s.spam.min_ms ?? null,
    };
  }
  return {
    id: form.id,               // needed for the POST ?action=view calls
    name: form.name,
    type: form.type,
    fields_json: safeFields,   // map_to stripped
    logic_json: form.logic_json ?? [],
    settings_json: safeSettings,
  };
}

// ── Turnstile scaffold ─────────────────────────────────────────────────────────
// Resolve a Turnstile secret: env var first (the simplest deployment), else a
// platform-default Vault secret read (same service-role vault.decrypted_secrets path
// resolveCredential uses). Returns null when neither exists → verification is SKIPPED
// (honest scaffold; no Turnstile key is provisioned on this deployment yet).
async function turnstileKey(admin: ReturnType<typeof serviceClient>): Promise<string | null> {
  const envKey = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (envKey) return envKey;
  try {
    const { data } = await admin.schema("vault").from("decrypted_secrets")
      .select("decrypted_secret").eq("name", "plat__turnstile__secret").maybeSingle();
    return (data as any)?.decrypted_secret ?? null;
  } catch {
    return null; // Vault absent (e.g. local) → scaffold skips verification
  }
}

// Cloudflare Turnstile siteverify. Only reached when a secret exists (scaffold live path).
async function verifyTurnstile(secret: string, token: unknown, ipHash: unknown): Promise<boolean> {
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", String(token));
    if (ipHash) form.set("remoteip", String(ipHash));
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const j = await resp.json().catch(() => ({}));
    return !!(j as any)?.success;
  } catch {
    return false;
  }
}

// ── Minimal self-contained confirmation page (no external deps) ─────────────────
function confirmPage(status: string): Response {
  const confirmed = status === "complete";
  const title = confirmed ? "Subscription confirmed" : "Already confirmed";
  const body = confirmed
    ? "Thanks — your email is confirmed. You're all set."
    : "This link has already been used. You're all set — nothing more to do.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#1a1a2e}
  .card{max-width:420px;padding:2.5rem 2rem;background:#fff;border-radius:14px;
    box-shadow:0 6px 30px rgba(0,0,0,.08);text-align:center}
  .mark{width:56px;height:56px;border-radius:50%;margin:0 auto 1.2rem;display:flex;
    align-items:center;justify-content:center;background:#e8f6ee;color:#1a9d54;font-size:28px}
  h1{margin:0 0 .5rem;font-size:1.35rem}
  p{margin:0;color:#555}
  @media(prefers-color-scheme:dark){body{background:#14151a;color:#eaeaf0}.card{background:#1e2028}p{color:#a9adbb}}
</style></head><body>
  <div class="card"><div class="mark">&#10003;</div><h1>${title}</h1><p>${body}</p></div>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
  });
}
