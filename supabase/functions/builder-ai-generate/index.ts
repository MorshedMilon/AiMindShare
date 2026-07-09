// functions/builder-ai-generate/index.ts — M19 "AI generate → page_json" (D-103).
// No LLM provider is decided yet (OPEN, same posture as D-063 M13-AI / D-011 email),
// so this ships the DETERMINISTIC niche-template engine from page-builder.mjs:
// description + niche → validated `sections` → HTML/CSS the editor loads (the
// ≥95%-deserializable AC is met deterministically, 100%). It METERS NOTHING (no
// provider call bills nothing — Gate-3). When a provider lands, only the body of
// the `describe` branch changes: read the key from Vault, call the model with the
// section-schema system prompt, then validateSections()/repairSections() as now,
// and meter_increment('ai_tokens') in the success txn. Clone-URL + voice are
// honest labeled scaffolds. Auth: staff+ (coarse tier, D-105).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole } from "../_shared/auth.ts";
import { generateFromNiche, validateSections, repairSections, sectionsToHtml }
  from "../../../frontend/js/page-builder.mjs";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  const user = await authUser(req);
  if (!user) return err(401, "unauthorized", "Sign in required");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, "bad_request", "Invalid JSON"); }
  const ws = String(body.workspace_id ?? "");
  if (!ws) return err(400, "bad_request", "workspace_id is required");

  const userDb = userClient(req);
  if (!(await hasRole(userDb, ws, "staff"))) return err(403, "forbidden", "Requires staff+");

  const mode = String(body.mode ?? "describe");

  // Clone-URL + voice are scaffolds until a provider/scraper is wired.
  if (mode === "clone") {
    return ok({ scaffold: true, reason: "url_clone_pending",
      message: "URL cloning arrives with the AI provider (D-063 posture)." });
  }
  if (mode === "voice") {
    // The browser does speech→text (SpeechRecognition) and posts it as `description`.
    // Nothing extra server-side; fall through to describe if a transcript is present.
    if (!body.description) return ok({ scaffold: true, reason: "voice_pending",
      message: "Speak your description; transcription happens in the browser." });
  }

  const description = String(body.description ?? "");
  const niche = String(body.niche ?? "agency");

  // Deterministic engine (swap to an LLM call here when a provider is decided).
  const sections = repairSections(generateFromNiche(description, niche));
  const v = validateSections(sections);
  if (!v.ok) return err(422, "generation_invalid", v.errors.join("; "));
  const { html, css } = sectionsToHtml(sections);

  // No meter call — nothing billed until a real provider is wired (Gate-3).
  return ok({ page_json: { sections }, html, css, metered: false });
});
