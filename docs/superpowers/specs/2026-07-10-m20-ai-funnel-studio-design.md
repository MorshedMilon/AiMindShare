# M20 AI Funnel Studio — Prompt-First Upgrade + LLM Provider Layer

Status: approved, ready for implementation planning
Date: 2026-07-10

## Context

A master prompt asked for a prompt-first "AI Funnel Studio": type a sentence, get a
funnel blueprint. Three prior uncommitted passes (M20 v2, M20 v3, M29 Affiliate Hub —
migrations 0029–0037) already built most of this: a full-page Studio at
`#/funnels/studio`, a guided Instant/Smart-Brief wizard, a deterministic 15-type
blueprint engine (`recommend_funnel_blueprint`), a blueprint review step, workspace
handoff (`approve_funnel_blueprint` → `convert_blueprint_to_funnel`), and an M29
affiliate deep-link that prefills the same Studio. None of it is committed to git yet.

What's actually missing:
1. No free-text prompt input anywhere — every field is structured. The repo has no
   LLM provider wired (documented posture D-063).
2. No visible funnel-type card selector — type is inferred, only shown after the fact.
3. No manual override of the inferred type.
4. The Studio's layout doesn't match the hero-led, prompt-first visual spec.

This spec covers closing all four gaps: a real LLM provider (Anthropic), wired through
the platform's existing usage-metering infrastructure, plus a Studio redesign that
makes the prompt the primary path while keeping guided fields as an equal, optional
alternative.

## Existing infrastructure this builds on (no reinvention)

- **`ai_tokens` meter kind** already exists platform-wide (`0000_extensions_enums.sql`,
  `0009_m03_billing.sql`), with real seeded per-tier quotas in `plans.included.ai_tokens`
  (starter 50k → scale 15M, `seed.sql`).
- **`meter_check(workspace, kind, qty)` / `meter_increment(...)`** — SECURITY DEFINER
  RPCs, already the platform convention for gating and recording usage
  (`inbox-send`, `campaigns` use this exact pattern for SMS/email).
- **Vault secret naming convention** — `ws_<workspace_id>__<provider>__api_key` with
  `plat__<provider>__api_key` platform-default fallback, already used for SendGrid
  (`_shared/email.ts`). Reused as-is for `anthropic`.
- **Auth pattern** — `authUser(req)` + `userClient(req)` + `hasRole(...)` from
  `_shared/auth.ts`, already the standard for Edge Functions that need workspace +
  role resolution.
- **Deterministic blueprint engine** (`recommend_funnel_blueprint`,
  `save_funnel_blueprint`, `approve_funnel_blueprint`, `convert_blueprint_to_funnel`)
  — unchanged, becomes the fallback path when no LLM is available.

No new billing tables, no new meter kind, no new plan-tier concept needed.

## Phase 1 — LLM Provider Layer

### `supabase/functions/_shared/llm.ts`

Provider-agnostic interface:

```ts
type BlueprintGenerationResult =
  | { kind: "blueprint"; blueprint: FunnelBlueprint; tokensUsed: number; model: string }
  | { kind: "clarify"; questions: ClarifyingQuestion[] /* max 3 */; tokensUsed: number }
  | { kind: "unavailable"; reason: "no_key" | "provider_error" | "timeout" };

generateFunnelBlueprint(prompt: string, context: GuidedAnswers | null): Promise<BlueprintGenerationResult>
```

First (only) implementation targets Anthropic's Messages API, prompted to return
strict JSON matching the same shape `recommend_funnel_blueprint` already produces
(funnel type, reasoning, ordered steps, bump/upsell suggestions, compliance notes),
or a clarifying-questions object when the prompt is too thin to infer type/audience/
offer. A 10s timeout wraps the call; any error, timeout, or missing key resolves to
`{ kind: "unavailable" }` — never a thrown error the caller has to handle specially.

### New Edge Function `funnel-ai-generate`

Request: `{ workspace_id, prompt?, guided_answers?, funnel_type_hint? }` (prompt and
guided_answers are both optional but at least one must be present).

Flow:
1. Auth + role check (same as `inbox-send`).
2. Resolve Anthropic key via Vault (`ws_<id>__anthropic__api_key` →
   `plat__anthropic__api_key` → none).
3. If no key → skip straight to fallback (step 6).
4. `meter_check(workspace, 'ai_tokens', ESTIMATED_TOKENS)` — if `over`, skip to
   fallback (step 6) rather than hard-blocking; the user still gets a blueprint, just
   via the deterministic engine, with a subtle "quota reached — using quick-match
   generation" note in the response.
5. Call `generateFunnelBlueprint`. On `clarify` → return the questions to the
   frontend as-is (no meter increment yet). On `blueprint` →
   `meter_increment(workspace, 'ai_tokens', tokensUsed, 'm20-studio', ...)`, return
   the blueprint tagged `generation_source: 'llm'`.
6. Fallback: run the free-text prompt (if present) through a small keyword/pattern
   parser (niche, audience, offer-type, "affiliate"/"promote" → affiliate branch,
   "webinar"/"quiz" → type hints) to fill whatever guided fields weren't already
   supplied, then call the existing `recommend_funnel_blueprint` RPC. Tag result
   `generation_source: 'deterministic'`. No meter increment (no provider call
   happened).

**Rate limit** (cost-control safeguard, independent of the token meter): max 20
`funnel-ai-generate` calls per workspace per rolling hour, enforced via a simple
count against `usage_events` filtered to `source = 'm20-studio'`. This exists because
metering fires on the LLM call itself (see below), so nothing else stops a workspace
from regenerating indefinitely within a single drafting session.

**Metering timing — meter on generation, not on approval.** Every other module in
this codebase meters on the successful provider call, not on a later user action, and
that's what this spec follows: `ai_tokens` decrements when the LLM actually runs,
whether or not the user ends up approving that particular blueprint. Approving still
works exactly as before (`approve_funnel_blueprint` unaffected) — it's just not the
metering trigger. Regenerating burns real tokens and is metered every time; the hourly
rate limit above is the backstop against runaway cost from repeated regenerates.

### Migration 0038 — additive only

- `funnel_blueprints`: add `generation_source text check (generation_source in
  ('llm','deterministic'))`, `llm_model text null`, `tokens_used integer null`.
- No new tables, no new meter kind, no RLS changes (existing `funnel_blueprints`
  policies already cover these new columns).

## Phase 2 — M20 Studio UX redesign

Rebuilds `viewStudio()`'s landing into the hero-led layout from the master prompt,
replacing the Instant/Smart-Brief mode-picker entry screen. Field logic from both
existing modes is preserved and reused inside the new guided-fields section — only
the layout/entry sequence changes.

Top to bottom:

1. **Header** — "AI Funnel Studio" title, one-line subtitle, breadcrumb back to
   Funnels landing.
2. **Hero** — headline, supporting paragraph, large prompt textarea, 4–5 example
   prompt chips (clicking one fills the textarea), primary CTA "Generate Funnel",
   secondary CTA "Start from scratch" (opens the existing blank-funnel modal).
3. **Funnel type selector** — card row: Lead Generation, Sales, Affiliate, Webinar,
   Quiz, plus a 6th "Let AI decide" card (selected by default). Selecting a type
   scrolls to and filters the guided fields below to that type's adaptive fields
   (reusing the existing per-type field sets from Smart-Brief). This is optional —
   generation works from the prompt alone with "Let AI decide" selected.
4. **Guided fields** — progressive disclosure: 2–3 essential fields shown first per
   selected type (or generic if "Let AI decide"), matching the master prompt's
   adaptive-field table (business/audience/offer for lead gen; product/price/
   objections for sales; offer/network/URL for affiliate; topic/date/speaker for
   webinar; purpose/audience/segments for quiz).
5. **Advanced options** — collapsed `<details>` section: audience, tone, domain,
   traffic source, CTA goal, language, compliance category — reuses existing
   Smart-Brief fields not promoted to step 4.
6. **How it works** — static 3-step strip (describe → AI generates → review & launch).
7. **Recent generations / templates** — list of the workspace's last few blueprint
   drafts (from `funnel_blueprints`) and template shortcuts, below the fold.

**Clarification flow**: if `funnel-ai-generate` returns `kind: 'clarify'`, render up
to 3 short questions inline directly beneath the prompt textarea, each with 2–4
quick-answer chips plus a free-text option. Answering all of them re-submits
automatically (prompt + answers merged) — no modal, no separate step, matches your
"short continuation of the original prompt" instruction.

**Blueprint review screen**: unchanged except one addition — a "Change type" control
next to the funnel-type badge that jumps back to the type-selector step with all
other answers retained, so a wrong inference doesn't require starting over. Also
surfaces `generation_source` (small "AI-generated" vs "quick-match" badge) so the
user knows which path produced this draft.

**M29 affiliate bridge**: mechanism unchanged (`localStorage` prefill key, consumed
on Studio load). On the new layout, consuming the prefill pre-selects the Affiliate
type card and pre-fills the prompt textarea with a generated sentence from the offer
data (e.g. "Build an affiliate funnel promoting {offer_name} via {vendor}"), rather
than jumping straight into a guided form.

## Error handling

- LLM unavailable/errors/times out → automatic, silent fallback to deterministic
  generation. User sees a small badge, never an error state, for this specific
  failure mode.
- Rate limit hit → explicit message ("You've hit the generation rate limit — try
  again in a few minutes"), since this is a real stop, not a silent degrade.
- Quota (`ai_tokens`) exhausted → automatic fallback to deterministic, same as
  provider-unavailable — not a hard block, per the design above.

## Testing / verification

- `funnel-ai-generate` gets a test double for `generateFunnelBlueprint` (no real
  Anthropic key needed in CI/local verify) exercising: happy path (blueprint),
  clarify path, and forced-unavailable → fallback path, asserting correct
  `generation_source` tagging and correct meter increments (or absence thereof on
  fallback/clarify).
- Extend `m20probe.mjs` with a new section covering: migration 0038 columns exist,
  fallback path produces a valid blueprint with no meter increment, rate-limit
  enforcement kicks in past 20 calls/hour.
- Preview-verify the new Studio layout: hero renders, type cards select and filter
  fields, advanced section collapses, clarification chips render and resubmit,
  blueprint review shows the new badge + "Change type" control, 0 horizontal scroll
  at 375/1200, both themes, no console errors.

## Out of scope / deferred

- BYOK UI (workspace-supplied API key management screen) — Vault naming convention
  supports it later, no UI for it now.
- Credit purchases / metered pay-as-you-go — plan-tier quota only, per your answer.
- Non-Anthropic providers.
- Other modules consuming `_shared/llm.ts` — built reusable, not wired elsewhere yet.
- Multi-turn chat refinement beyond the one clarification round.
- Real one-click upsell/downsell charging, full `funnel_access` RBAC enforcement,
  M29 Phase 1b (tracking links, earnings rollup, campaigns/creatives) — all
  pre-existing deferred items, unchanged by this spec.

## Open item carried into implementation planning

None — all product/UX/billing decisions above were confirmed during brainstorming.
The rate-limit safeguard and meter-on-generation timing were proposed by the
assistant as engineering judgment calls consistent with existing platform
conventions; flagged here for visibility, not blocking.
