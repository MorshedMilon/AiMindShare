// _shared/llm.ts — provider-agnostic LLM adapter for AI-generated content across
// AiMindShare modules (first consumer: M20's funnel-ai-generate). Mirrors the
// self-contained-provider-adapter shape of _shared/email.ts (its own
// getVaultSecret, not a shared import) so this module has zero dependencies on
// any other provider file.
//
// Vault secret names (M41 §3 deterministic naming), same convention as SendGrid:
//   workspace override :  ws_<uuid>__anthropic__api_key
//   platform default   :  plat__anthropic__api_key
// No key configured (neither scope) → callers get { kind: "unavailable",
// reason: "no_key" } and the caller falls back to a deterministic path. This is
// the ENTIRE seam for turning AI generation on: set the platform secret,
// nothing else changes (D-186).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
const REQUEST_TIMEOUT_MS = 10_000;

export const anthropicKeyName = (workspaceId: string | null): string =>
  workspaceId ? `ws_${workspaceId}__anthropic__api_key` : `plat__anthropic__api_key`;

export async function getVaultSecret(db: SupabaseClient, name: string): Promise<string | null> {
  const { data, error } = await db
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", name)
    .maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  return data.decrypted_secret as string;
}

export async function resolveAnthropicKey(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  return (await getVaultSecret(db, anthropicKeyName(workspaceId)))
    ?? (await getVaultSecret(db, anthropicKeyName(null)));
}

export type ClarifyingQuestion = { question: string; chips: string[] };
export type FunnelBlueprint = {
  funnel_type: string; reasoning: string;
  steps: { step_type: string; role_label: string; cta_direction: string; purpose: string }[];
  order_bump_suggested: boolean; upsell_suggested: boolean; downsell_suggested: boolean;
  test_ideas: string[]; launch_checklist_emphasis: string[];
};
export type BlueprintGenerationResult =
  | { kind: "blueprint"; blueprint: FunnelBlueprint; tokensUsed: number; model: string }
  | { kind: "clarify"; questions: ClarifyingQuestion[]; tokensUsed: number }
  | { kind: "unavailable"; reason: "no_key" | "provider_error" | "timeout" | "bad_response" };

const VALID_STEP_TYPES = ["optin", "sales", "order", "upsell", "downsell", "thankyou"];
const VALID_FUNNEL_TYPES = [
  "lead_magnet", "webinar", "booking", "application", "vsl", "direct_checkout",
  "tripwire", "low_ticket", "course_membership", "product_launch", "quiz", "challenge",
  "affiliate_bridge", "affiliate_review", "affiliate_comparison",
];

const SYSTEM_PROMPT = `You are the funnel-planning engine inside AiMindShare's AI Funnel Studio.
Given a business description (free text) and/or structured answers, either:
(a) return a complete funnel blueprint, or
(b) if the business/offer/audience is too vague to plan confidently, ask up to 3 short
    clarifying questions instead.

If the structured answers include "funnel_type_hint", treat it as a strong steer toward
that category (lead_gen, sales, affiliate, webinar, or quiz) but still choose the exact
one of the 15 funnel_type values yourself within that family.

Respond with ONLY one JSON object, no prose, no markdown fences, matching exactly one
of these two shapes:

Blueprint:
{"kind":"blueprint","funnel_type":"<one of: ${VALID_FUNNEL_TYPES.join(", ")}>","reasoning":"<1-2 sentences>","steps":[{"step_type":"<one of: ${VALID_STEP_TYPES.join(", ")}>","role_label":"<short label>","cta_direction":"<button/CTA copy>","purpose":"<1 sentence>"}],"order_bump_suggested":<bool>,"upsell_suggested":<bool>,"downsell_suggested":<bool>,"test_ideas":["<idea>", "..."],"launch_checklist_emphasis":["<item>", "..."]}

Clarify:
{"kind":"clarify","questions":[{"question":"<short question>","chips":["<quick answer>", "<quick answer>", "<quick answer>"]}]}

Rules: at most 3 questions. Affiliate offers (mentions of "affiliate", "promote someone
else's product", "commission", or offer_source="affiliate") never get order/upsell/
downsell steps — the sale happens on the vendor's site, so order_bump_suggested,
upsell_suggested, and downsell_suggested must all be false and no step has step_type
"order". Prefer a blueprint over clarifying whenever you can make a reasonable inference
from what's given.`;

function buildUserMessage(prompt: string | null, answers: Record<string, unknown> | null): string {
  const parts: string[] = [];
  if (prompt) parts.push(`Business description: ${prompt}`);
  if (answers && Object.keys(answers).length) parts.push(`Structured answers: ${JSON.stringify(answers)}`);
  return parts.join("\n\n") || "No information given.";
}

function validateBlueprint(raw: any): FunnelBlueprint | null {
  if (!raw || typeof raw !== "object") return null;
  if (!VALID_FUNNEL_TYPES.includes(raw.funnel_type)) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) return null;
  if (!raw.steps.every((s: any) => s && VALID_STEP_TYPES.includes(s.step_type) && typeof s.role_label === "string")) return null;
  const isAffiliate = String(raw.funnel_type).startsWith("affiliate_");
  if (isAffiliate && raw.steps.some((s: any) => s.step_type === "order")) return null;
  return {
    funnel_type: raw.funnel_type,
    reasoning: String(raw.reasoning ?? ""),
    steps: raw.steps.map((s: any) => ({
      step_type: s.step_type, role_label: String(s.role_label ?? ""),
      cta_direction: String(s.cta_direction ?? ""), purpose: String(s.purpose ?? ""),
    })),
    order_bump_suggested: isAffiliate ? false : !!raw.order_bump_suggested,
    upsell_suggested: isAffiliate ? false : !!raw.upsell_suggested,
    downsell_suggested: isAffiliate ? false : !!raw.downsell_suggested,
    test_ideas: Array.isArray(raw.test_ideas) ? raw.test_ideas.map(String) : [],
    launch_checklist_emphasis: Array.isArray(raw.launch_checklist_emphasis) ? raw.launch_checklist_emphasis.map(String) : [],
  };
}

function validateClarify(raw: any): ClarifyingQuestion[] | null {
  if (!raw || !Array.isArray(raw.questions) || raw.questions.length === 0 || raw.questions.length > 3) return null;
  if (!raw.questions.every((q: any) => q && typeof q.question === "string" && Array.isArray(q.chips))) return null;
  return raw.questions.map((q: any) => ({ question: q.question, chips: q.chips.map(String).slice(0, 4) }));
}

export async function generateFunnelBlueprint(
  apiKey: string | null, prompt: string | null, answers: Record<string, unknown> | null,
): Promise<BlueprintGenerationResult> {
  if (!apiKey) return { kind: "unavailable", reason: "no_key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 1024, system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(prompt, answers) }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return { kind: "unavailable", reason: "provider_error" };

    const body = await resp.json().catch(() => null);
    const text = body?.content?.[0]?.text;
    const tokensUsed = (body?.usage?.input_tokens ?? 0) + (body?.usage?.output_tokens ?? 0);
    if (!text) return { kind: "unavailable", reason: "bad_response" };

    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return { kind: "unavailable", reason: "bad_response" }; }

    if (parsed.kind === "clarify") {
      const questions = validateClarify(parsed);
      if (!questions) return { kind: "unavailable", reason: "bad_response" };
      return { kind: "clarify", questions, tokensUsed };
    }
    const blueprint = validateBlueprint(parsed);
    if (!blueprint) return { kind: "unavailable", reason: "bad_response" };
    return { kind: "blueprint", blueprint, tokensUsed, model: ANTHROPIC_MODEL };
  } catch (e) {
    return { kind: "unavailable", reason: e instanceof Error && e.name === "AbortError" ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}
