// functions/funnel-ai-generate/index.ts — M20 AI Funnel Studio's generation
// endpoint (D-186). Calls a real LLM (Anthropic) when a key is configured and
// the workspace is under its rate limit + ai_tokens quota; otherwise falls
// back to the existing deterministic recommend_funnel_blueprint RPC (0034/
// 0036) so generation never hard-fails just because AI isn't configured yet.
//
// Contract:  POST /functions/v1/funnel-ai-generate   Bearer <jwt>
//   body { workspace_id, prompt?, guided_answers?, funnel_type_hint? }
//     (prompt and guided_answers: at least one required)
//   200 { ok:true, data:{ kind:'blueprint', blueprint, generation_source, model, tokens_used } }
//     | { ok:true, data:{ kind:'clarify', questions, generation_source:'llm' } }
//   400 bad_request · 401 unauthorized · 403 forbidden · 429 rate_limited
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { authUser, userClient, serviceClient, hasRole } from "../_shared/auth.ts";
import { incrementMeter, checkMeter } from "../_shared/meter.ts";
import { resolveAnthropicKey, generateFunnelBlueprint } from "../_shared/llm.ts";

const ESTIMATED_TOKENS_PER_CALL = 1200;

async function logGeneration(
  admin: any, workspace_id: string, user_id: string, generation_source: "llm" | "llm_clarify" | "deterministic",
  model: string | null, tokensUsed: number | null, promptLength: number,
) {
  const { error } = await admin.from("funnel_ai_generation_log").insert({
    workspace_id, user_id, generation_source, model, tokens_used: tokensUsed, prompt_length: promptLength,
  });
  if (error) console.error("funnel_ai_generation_log insert failed:", error.message);
}

async function isRateLimited(admin: any, workspace_id: string): Promise<boolean> {
  const { data, error } = await admin.rpc("funnel_ai_rate_limited", { p_workspace: workspace_id });
  return !error && data === true;
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const user = await authUser(req);
    if (!user) return err(401, "unauthorized", "No valid session");

    const body = await req.json().catch(() => ({}));
    const { workspace_id, prompt, guided_answers, funnel_type_hint } = body ?? {};
    const promptText = typeof prompt === "string" ? prompt.trim() : "";
    const answers = guided_answers && typeof guided_answers === "object" ? guided_answers : {};
    if (!workspace_id || (!promptText && Object.keys(answers).length === 0)) {
      return err(400, "bad_request", "workspace_id and (prompt or guided_answers) are required");
    }

    const udb = userClient(req);
    if (!(await hasRole(udb, workspace_id, "staff"))) {
      return err(403, "forbidden", "Generating a funnel blueprint requires staff access or higher");
    }

    const admin = serviceClient();
    const mergedAnswers = { ...answers, ...(funnel_type_hint ? { funnel_type_hint } : {}) };
    const promptLength = promptText.length;

    const apiKey = await resolveAnthropicKey(admin, workspace_id);
    let fallbackReason: string | null = apiKey ? null : "no_key";

    if (apiKey && !fallbackReason) {
      if (await isRateLimited(admin, workspace_id)) {
        return err(429, "rate_limited", "You've hit the generation rate limit — try again in a few minutes.");
      }
      const meter = await checkMeter(admin, workspace_id, "ai_tokens", ESTIMATED_TOKENS_PER_CALL);
      if (meter?.over === true && (meter.remaining ?? 0) <= 0) {
        fallbackReason = "quota_exceeded";
      }
    }

    if (apiKey && !fallbackReason) {
      const result = await generateFunnelBlueprint(apiKey, promptText || null, Object.keys(mergedAnswers).length ? mergedAnswers : null);
      if (result.kind === "clarify") {
        await logGeneration(admin, workspace_id, user.id, "llm_clarify", null, result.tokensUsed, promptLength);
        return ok({ kind: "clarify", questions: result.questions, generation_source: "llm" });
      }
      if (result.kind === "blueprint") {
        await logGeneration(admin, workspace_id, user.id, "llm", result.model, result.tokensUsed, promptLength);
        const met = await incrementMeter(admin, workspace_id, "ai_tokens", result.tokensUsed, "m20-studio", null, null);
        if (!met.ok) console.error("meter_increment failed (blueprint generated):", met.error);
        return ok({ kind: "blueprint", blueprint: result.blueprint, generation_source: "llm", model: result.model, tokens_used: result.tokensUsed });
      }
      // result.kind === "unavailable" -> fall through to the deterministic path below.
    }

    // ── Deterministic fallback (no key / over quota / provider error) ─────────
    const { data: blueprint, error: rpcErr } = await admin.rpc("recommend_funnel_blueprint", { p_answers: mergedAnswers });
    if (rpcErr) return err(500, "generation_failed", rpcErr.message);
    await logGeneration(admin, workspace_id, user.id, "deterministic", null, null, promptLength);
    return ok({ kind: "blueprint", blueprint, generation_source: "deterministic", model: null, tokens_used: null });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
