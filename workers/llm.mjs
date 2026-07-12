// llm.mjs — Node-side Anthropic adapter for M22-auto real article generation
// (D-190). Mirrors supabase/functions/_shared/llm.ts's Vault convention exactly
// (same secret names, same fallback order) but lives in Node since the worker
// process can't import a Deno esm.sh-style module. `fetchImpl` is injectable so
// llmprobe.mjs can test this with zero network calls.
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 20_000;   // longer than M20's 10s — articles are longer than blueprints

export const anthropicKeyName = (workspaceId) =>
  workspaceId ? `ws_${workspaceId}__anthropic__api_key` : `plat__anthropic__api_key`;

export async function getVaultSecret(db, name) {
  const { data, error } = await db
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", name)
    .maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  return data.decrypted_secret;
}

export async function resolveAnthropicKey(db, workspaceId) {
  return (await getVaultSecret(db, anthropicKeyName(workspaceId)))
    ?? (await getVaultSecret(db, anthropicKeyName(null)));
}

// callAnthropicForArticle — one blocking call, returns a discriminated result, never
// throws. `fetchImpl` defaults to the global fetch (Node 18+ has it built in); tests
// inject a fake.
export async function callAnthropicForArticle(db, workspaceId, systemPrompt, userPrompt, model, fetchImpl = fetch) {
  const apiKey = await resolveAnthropicKey(db, workspaceId);
  if (!apiKey) return { kind: "unavailable", reason: "no_key" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4096, system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return { kind: "unavailable", reason: "provider_error" };

    const body = await resp.json().catch(() => null);
    const text = body?.content?.[0]?.text;
    const tokensUsed = (body?.usage?.input_tokens ?? 0) + (body?.usage?.output_tokens ?? 0);
    if (!text || !text.trim()) return { kind: "unavailable", reason: "bad_response" };

    return { kind: "html", content_html: text.trim(), tokensUsed, model };
  } catch (e) {
    return { kind: "unavailable", reason: e?.name === "AbortError" ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}
