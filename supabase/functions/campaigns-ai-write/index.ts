// functions/campaigns-ai-write/index.ts — M16 AI copywriter (SCAFFOLD, D-093).
// "Draft a campaign" → deterministic subject options + a body draft assembled from
// the operator's inputs, loaded into the builder for review (NEVER auto-sent). No LLM
// provider is chosen yet (the same open decision as M13/automations-ai-generate): the
// real path reads the provider key from Vault, calls the model with the block-schema
// system prompt, validates the JSON, and meters ai_tokens IN the success transaction
// (USAGE-METERING §9). Until then this bills NOTHING — honest, never faked.
//
// AI drafting is a scaffold until an LLM provider is decided (D-093) — swap this body
// for the model call + meter_increment('ai_tokens') when it lands.
//
// Contract:  POST /functions/v1/campaigns-ai-write   Bearer <jwt>
//   body { workspace_id, goal, audience?, tone? }
//   200 { ok:true, data:{ subjects, body_json, generator:'scaffold', note } }
//   400 bad_request · 401 unauthorized · 403 forbidden
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole } from "../_shared/auth.ts";

// Deterministic draft from the inputs. This is the SCAFFOLD stand-in for the model:
// subject options + a plausible block-JSON body the operator edits. The real
// generator replaces THIS function body only.
function draft(goal: string, audience: string, tone: string) {
  const g = goal.trim() || "your latest update";
  const who = audience.trim();
  const t = (tone.trim() || "friendly").toLowerCase();
  const excite = /excit|bold|urgent|playful/.test(t) ? "!" : ".";

  const subjects = [
    `${cap(g)}${excite}`,
    `A quick note about ${lower(g)}`,
    who ? `${cap(who)}, ${lower(g)} is here` : `Introducing ${lower(g)}`,
    `Don't miss: ${lower(g)}`,
    `${cap(t)} update — ${lower(g)}`,
  ];

  const body_json = {
    blocks: [
      { type: "text", text: `Hi {{first_name}},` },
      { type: "text", text: `We wanted to reach out about ${lower(g)}.` },
      who ? { type: "text", text: `As one of ${lower(who)}, we think this is especially relevant to you.` } : null,
      { type: "button", label: "Learn more", href: "#" },
      { type: "text", text: `Thanks,\nThe {{company}} team` },
    ].filter(Boolean),
  };

  return { subjects, body_json };
}

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const lower = (s: string) => s ? s[0].toLowerCase() + s.slice(1) : s;

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, goal, audience, tone } = body ?? {};
    if (!workspace_id || !goal) return err(400, "bad_request", "workspace_id and goal are required");
    if (!(await hasRole(userClient(req), workspace_id, "manager"))) return err(403, "forbidden", "Requires manager+");

    const { subjects, body_json } = draft(String(goal), String(audience ?? ""), String(tone ?? ""));
    // NOTE: no ai_tokens metered — no provider call happened (Gate-3). When a provider
    // is wired, meter_increment('ai_tokens') runs in this success path (D-093).
    return ok({
      subjects, body_json, generator: "scaffold",
      note: "Draft generated locally — no AI provider is connected yet (D-093). Review and edit before sending.",
    });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
