// generation-studio-pipeline.mjs — pure, dependency-injected logic for M22
// Generation Studio (the interactive keyword->article pipeline). No DOM, no
// network, no Supabase client — the actual Anthropic call is injected as
// `callLlm` (systemPrompt, userPrompt) => Promise<{kind:'html',content_html,
// tokensUsed,model} | {kind:'unavailable',reason,status?}>, same contract
// workers/llm.mjs's callAnthropicForArticle already returns. Mirrors
// blog-pipeline.mjs's generate_article_with_ai shape exactly.

export const STAGE_ORDER = ["research", "brief", "outline", "draft", "auto_link", "score", "ready_for_review"];

export function nextStage(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  if (i === -1 || i === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

// classifyLlmError — transient (Retry helps) vs permanent (Retry won't help).
// `no_key` returns null: it is NOT a failure, it's the deterministic-fallback
// path (D-063 posture) and the stage still completes successfully.
export function classifyLlmError(reason, status) {
  if (reason === "no_key") return null;
  if (reason === "provider_error") {
    if (status === 401 || status === 403 || status === 400) return "permanent";
    return "transient";
  }
  // timeout, bad_response, and any unrecognised reason default to transient —
  // worth a retry rather than blocking the user with no path forward.
  return "transient";
}

// ── Brief stage ──────────────────────────────────────────────────────────────
export function buildBriefSystemPrompt() {
  return "You write a short content brief (3-5 sentences) for a blog article targeting a given " +
    "keyword: the angle to take, the reader's intent, and 2-3 points the article must cover. " +
    "Output ONLY the brief text, no headings, no markdown, no commentary.";
}

export function buildBriefUserPrompt(keyword) {
  return `Target keyword: ${keyword}\n\nWrite the content brief now.`;
}

export async function generate_brief_with_ai(ctx, callLlm) {
  if (typeof callLlm !== "function") return { kind: "unavailable", reason: "no_key" };
  const systemPrompt = buildBriefSystemPrompt();
  const userPrompt = buildBriefUserPrompt(ctx.keyword);
  let result;
  try { result = await callLlm(systemPrompt, userPrompt); }
  catch { return { kind: "unavailable", reason: "bad_response" }; }
  if (!result || result.kind !== "html" || !result.content_html || !result.content_html.trim()) {
    return { kind: "unavailable", reason: result?.reason || "bad_response", status: result?.status };
  }
  return { kind: "text", text: result.content_html.trim(), tokensUsed: result.tokensUsed, model: result.model };
}

// ── Outline stage (builds on the Brief stage's text) ────────────────────────
export function buildOutlineSystemPrompt() {
  return "You write a numbered outline (5-8 sections) for a blog article, given its content brief. " +
    "Output ONLY the numbered outline, no markdown fences, no commentary.";
}

export function buildOutlineUserPrompt(keyword, briefText) {
  return `Target keyword: ${keyword}\n\nContent brief:\n${briefText}\n\nWrite the outline now.`;
}

export async function generate_outline_with_ai(ctx, callLlm) {
  if (typeof callLlm !== "function") return { kind: "unavailable", reason: "no_key" };
  const systemPrompt = buildOutlineSystemPrompt();
  const userPrompt = buildOutlineUserPrompt(ctx.keyword, ctx.briefText || "");
  let result;
  try { result = await callLlm(systemPrompt, userPrompt); }
  catch { return { kind: "unavailable", reason: "bad_response" }; }
  if (!result || result.kind !== "html" || !result.content_html || !result.content_html.trim()) {
    return { kind: "unavailable", reason: result?.reason || "bad_response", status: result?.status };
  }
  return { kind: "text", text: result.content_html.trim(), tokensUsed: result.tokensUsed, model: result.model };
}
