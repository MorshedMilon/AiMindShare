// functions/automations-ai-generate/index.ts — M13 AI builder (SCAFFOLD, D-063).
// "Describe your automation" → a valid nodes/edges graph loaded onto the canvas for
// review (NEVER auto-activated — PRD_M13 §2). No LLM provider is chosen yet (the
// same open-decision situation as email/D-011): the real path is an Edge Fn that
// reads the provider key from Vault, calls the model with the node-schema system
// prompt, validates the JSON, and meters ai_tokens IN the success transaction
// (USAGE-METERING §9). Until a provider lands, this returns a deterministic
// keyword-derived starter graph and bills NOTHING — honest, never faked.
//
// Contract:  POST /functions/v1/automations-ai-generate   Bearer <jwt>
//   body { "workspace_id":"<uuid>", "prompt":"welcome new leads and tag them VIP" }
//   200 { ok:true, data:{ nodes, edges, generator:"scaffold", note } }
//   400 bad_request  401 unauthorized  403 forbidden
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, hasRole } from "../_shared/auth.ts";

// Deterministic keyword → node draft. This is the SCAFFOLD stand-in for the model:
// it inspects the prompt for well-known intents and assembles a plausible, valid
// graph the operator edits. The real generator replaces THIS function body only.
function draftFromPrompt(prompt: string) {
  const p = prompt.toLowerCase();
  const nodes: unknown[] = [{ id: "t", type: "trigger", config: {} }];
  const edges: unknown[] = [];
  let last = "t";
  let i = 0;
  const add = (type: string, config: Record<string, unknown> = {}) => {
    const id = `n${++i}`;
    nodes.push({ id, type, config });
    edges.push({ source: last, target: id });
    last = id;
  };
  // trigger inference
  const triggerType = /form/.test(p) ? "form.submitted"
    : /tag/.test(p) ? "tag.added"
    : /deal|stage|pipeline/.test(p) ? "deal.stage_changed"
    : /reply|message|sms|text/.test(p) ? "message.received"
    : "contact.created";
  (nodes[0] as Record<string, unknown>).config = { trigger_type: triggerType };

  if (/welcome|onboard|new lead|nurture/.test(p)) { add("send_email", { subject: "Welcome" }); add("wait", { amount: 2, unit: "days" }); }
  if (/tag/.test(p)) add("add_tag", { tag_name: /vip/.test(p) ? "VIP" : "New" });
  if (/task|follow ?up|call/.test(p)) add("create_task", { title: "Follow up", due_in_days: 1 });
  if (/notify|alert|team/.test(p)) add("internal_notification", { targets: ["manager"], title: "New activity" });
  if (/sms|text/.test(p)) add("send_sms", { body: "Thanks for reaching out!" });
  if (i === 0) { add("send_email", { subject: "Hello" }); add("wait", { amount: 1, unit: "days" }); add("internal_notification", { targets: ["all"], title: "Automation ran" }); }
  return { nodes, edges, triggerType };
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, prompt } = body ?? {};
    if (!workspace_id || !prompt) return err(400, "bad_request", "workspace_id and prompt are required");
    if (!(await hasRole(userClient(req), workspace_id, "manager"))) return err(403, "forbidden", "Requires manager+");

    const { nodes, edges, triggerType } = draftFromPrompt(String(prompt));
    // NOTE: no ai_tokens metered — no provider call happened (Gate-3). When a
    // provider is wired, meter_increment(ai_tokens) runs in this success path.
    return ok({
      nodes, edges, trigger_type: triggerType, generator: "scaffold",
      note: "Draft generated locally — no AI provider is connected yet (D-063). Review and edit before activating.",
    });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
