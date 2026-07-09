// _shared/integrations.ts — the SOLE credential access path (INTEGRATIONS-SPEC §4,
// Vault Law 4). Every module reaches a provider through resolveCredential() inside an
// Edge Function under the service role; no module hand-rolls credential loading, and a
// credential is NEVER returned to the browser (Law 1). This module also owns the §3
// deterministic Vault naming and the typed connect/re-auth errors the UI surfaces.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PROVIDER_BY_KEY } from "./providers.ts";

// Surfaced by the calling action as a connect / re-auth prompt (doc 7), never a raw failure.
export class NotConnectedError extends Error {
  constructor(public provider: string) { super(`not_connected:${provider}`); this.name = "NotConnectedError"; }
}
export class NeedsReauthError extends Error {
  constructor(public provider: string) { super(`needs_reauth:${provider}`); this.name = "NeedsReauthError"; }
}

// ── §3 Vault naming (deterministic — resolution needs no lookup table) ──────────
//   platform default :  plat__<provider>[__<field>]
//   workspace override:  ws_<workspace_uuid>__<provider>[__<field>]
//   webhook signing   :  <base>__whsec
export const vaultBaseName = (workspaceId: string | null, provider: string): string =>
  workspaceId ? `ws_${workspaceId}__${provider}` : `plat__${provider}`;
export const vaultFieldName = (base: string, field?: string): string =>
  field ? `${base}__${field}` : base;
export const vaultWebhookSecretName = (base: string): string => `${base}__whsec`;

// A token bundle is considered "expiring soon" (oauth2) when within 24h of expiry (§5).
export function expiringSoon(tokenExpiresAt: string | null | undefined): boolean {
  if (!tokenExpiresAt) return false;
  return new Date(tokenExpiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
}

// ── §4 resolveCredential (Edge-Function-internal, service role) ─────────────────
// Resolution order: workspace override → platform default → typed NotConnectedError.
// The row-selection SQL is proven in m41probe.mjs; the vault.decrypted_secrets read and
// the oauth2 refresh are live paths (Vault absent in the local PGlite harness).
export async function resolveCredential(
  admin: SupabaseClient,
  workspaceId: string,
  provider: string,
): Promise<{ secret: string; integrationId: string; vaultSecretName: string }> {
  // override beats default: order by workspace_id with NULLS LAST, take the first row.
  const { data: rows, error } = await admin
    .from("integrations")
    .select("id, provider, status, vault_secret_name, token_expires_at, workspace_id")
    .eq("provider", provider)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    .order("workspace_id", { ascending: true, nullsFirst: false })
    .limit(1);
  if (error) throw error;

  const row = rows?.[0];
  if (!row || row.status === "error" || row.status === "disconnected") throw new NotConnectedError(provider);
  if (row.status === "needs_reauth") throw new NeedsReauthError(provider);
  if (!row.vault_secret_name) throw new NotConnectedError(provider);

  // Service-role-only read of the live secret (Law 3).
  const { data: sec, error: vErr } = await admin
    .schema("vault").from("decrypted_secrets")
    .select("decrypted_secret").eq("name", row.vault_secret_name).maybeSingle();
  if (vErr || !sec?.decrypted_secret) throw new NotConnectedError(provider);

  // oauth2 near-expiry auto-refresh — scaffold (no oauth2 provider is connected this
  // slice, D-034). When the first OAuth provider lands it fills refreshNow(); on
  // refresh failure it marks needs_reauth, notifies M04, and throws NeedsReauthError.
  if (PROVIDER_BY_KEY[provider]?.auth === "oauth2" && expiringSoon(row.token_expires_at)) {
    // secret = await refreshNow(admin, provider, row, secret);
  }

  return { secret: sec.decrypted_secret, integrationId: row.id, vaultSecretName: row.vault_secret_name };
}
