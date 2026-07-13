// genstudiopipelineprobe.mjs — pure unit tests for
// frontend/js/generation-studio-pipeline.mjs. No network, no PGlite.
import {
  STAGE_ORDER, nextStage, classifyLlmError,
  buildBriefSystemPrompt, buildBriefUserPrompt, generate_brief_with_ai,
  buildOutlineSystemPrompt, buildOutlineUserPrompt, generate_outline_with_ai,
} from "../../frontend/js/generation-studio-pipeline.mjs";

let pass = 0, fail = 0;
const assert = (c, l) => c
  ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m  ${l}`))
  : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m  ${l}`));

console.log("══ generation-studio-pipeline.mjs — stage order ══");
assert(STAGE_ORDER.join(",") === "research,brief,outline,draft,auto_link,score,ready_for_review",
  "STAGE_ORDER is the 7 stages in pipeline order");
assert(nextStage("research") === "brief", "nextStage: research -> brief");
assert(nextStage("score") === "ready_for_review", "nextStage: score -> ready_for_review");
assert(nextStage("ready_for_review") === null, "nextStage: ready_for_review is terminal (null)");
assert(nextStage("not_a_stage") === null, "nextStage: unknown stage -> null");

console.log("\n══ generation-studio-pipeline.mjs — classifyLlmError ══");
assert(classifyLlmError("no_key") === null, "no_key is not a failure (deterministic fallback path)");
assert(classifyLlmError("timeout") === "transient", "timeout is transient");
assert(classifyLlmError("bad_response") === "transient", "bad_response is transient");
assert(classifyLlmError("provider_error", 429) === "transient", "provider_error 429 is transient");
assert(classifyLlmError("provider_error", 500) === "transient", "provider_error 500 is transient");
assert(classifyLlmError("provider_error", 401) === "permanent", "provider_error 401 is permanent");
assert(classifyLlmError("provider_error", 403) === "permanent", "provider_error 403 is permanent");
assert(classifyLlmError("provider_error", 400) === "permanent", "provider_error 400 is permanent");
assert(classifyLlmError("provider_error", undefined) === "transient", "provider_error with no status defaults to transient");

console.log("\n══ generation-studio-pipeline.mjs — Brief stage ══");
{
  const sys = buildBriefSystemPrompt();
  assert(sys.toLowerCase().includes("brief"), "buildBriefSystemPrompt describes a content brief");
  const usr = buildBriefUserPrompt("best dua for travel");
  assert(usr.includes("best dua for travel"), "buildBriefUserPrompt includes the keyword");
}
{
  const result = await generate_brief_with_ai({ keyword: "best dua for travel" }, null);
  assert(result.kind === "unavailable" && result.reason === "no_key",
    "generate_brief_with_ai: no callLlm -> unavailable/no_key");
}
{
  const callLlm = async () => ({ kind: "html", content_html: "A short brief about travel duas.", tokensUsed: 120, model: "claude-3-5-haiku-20241022" });
  const result = await generate_brief_with_ai({ keyword: "best dua for travel" }, callLlm);
  assert(result.kind === "text" && result.text === "A short brief about travel duas.",
    "generate_brief_with_ai: happy path returns the LLM's text");
}
{
  const callLlm = async () => ({ kind: "unavailable", reason: "provider_error", status: 401 });
  const result = await generate_brief_with_ai({ keyword: "x" }, callLlm);
  assert(result.kind === "unavailable" && result.reason === "provider_error" && result.status === 401,
    "generate_brief_with_ai: propagates reason + status from callLlm");
}

console.log("\n══ generation-studio-pipeline.mjs — Outline stage ══");
{
  const usr = buildOutlineUserPrompt("best dua for travel", "A short brief about travel duas.");
  assert(usr.includes("best dua for travel") && usr.includes("A short brief about travel duas."),
    "buildOutlineUserPrompt includes the keyword and the prior Brief text");
}
{
  const callLlm = async () => ({ kind: "html", content_html: "1. Intro\n2. Duas for the road\n3. FAQs", tokensUsed: 90, model: "claude-3-5-haiku-20241022" });
  const result = await generate_outline_with_ai({ keyword: "best dua for travel", briefText: "A short brief." }, callLlm);
  assert(result.kind === "text" && result.text.includes("Duas for the road"),
    "generate_outline_with_ai: happy path returns the LLM's outline text");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
