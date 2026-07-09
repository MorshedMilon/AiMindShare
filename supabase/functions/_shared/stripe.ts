// _shared/stripe.ts — minimal Stripe access with NO SDK (D-001/D-028).
// The secret key + webhook signing secret live in Supabase Vault (Law 3); we read
// them server-side and call the Stripe REST API with fetch. Webhook signatures are
// verified with Web Crypto HMAC-SHA256 (EDGE-FUNCTIONS-SPEC §4). Nothing here ever
// reaches the browser.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_API = "https://api.stripe.com/v1";

// Vault secret names (created once in the hosted project, same shape as the
// Session 0 placeholder — see 0005_cron_and_vault.sql / functions/health).
export const STRIPE_KEY_SECRET  = "stripe_secret_key";
export const STRIPE_WHSEC_SECRET = "stripe_webhook_secret";

// Read a decrypted secret from Vault via the service role. Returns null if absent
// (so callers can fail honestly with `stripe_unconfigured` rather than 500).
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

// Flatten a nested object into Stripe's bracketed x-www-form-urlencoded shape:
//   { metadata: { workspace_id: "w" } } → "metadata[workspace_id]=w"
//   { line_items: [{ price: "p", quantity: 1 }] } → "line_items[0][price]=p&line_items[0][quantity]=1"
export function toForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") {
          parts.push(toForm(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof v === "object") {
      parts.push(toForm(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

// POST to a Stripe REST endpoint. Throws a StripeError with the mapped code so the
// caller can map it to a safe envelope (never leak the raw provider error — §6).
export class StripeError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// `extra` is optional and additive (M03's existing 3-arg calls are unaffected):
//   • account         → Stripe-Account header (Standard Connect: charge on the
//                        workspace's connected account so funds never touch the
//                        platform — M28/M42; omitted = the platform account).
//   • idempotencyKey   → Idempotency-Key header (safe retries on double-click).
export async function stripePost(
  key: string, path: string, body: Record<string, unknown>,
  extra?: { account?: string; idempotencyKey?: string },
): Promise<any> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (extra?.account) headers["Stripe-Account"] = extra.account;
  if (extra?.idempotencyKey) headers["Idempotency-Key"] = extra.idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: toForm(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new StripeError(res.status, e.code ?? "stripe_error", e.message ?? "Stripe request failed");
  }
  return json;
}

// Constant-time hex compare (avoid timing oracles on the signature check).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify a Stripe webhook signature (scheme v1). Header shape:
//   Stripe-Signature: t=1690000000,v1=<hex hmac>,v1=<hex hmac>...
// Signed payload is `${t}.${rawBody}`; HMAC-SHA256 with the endpoint signing secret.
// `toleranceSec` guards against replay of very old events.
export async function verifyStripeSig(
  rawBody: string, sigHeader: string | null, secret: string, toleranceSec = 300,
): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=").map((s) => s.trim())) as [string, string][],
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  // Reject stale timestamps (replay guard). `nowSec` is passed in by the caller in
  // tests; defaults to wall clock in production.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${t}.${rawBody}`));
  return timingSafeEqual(toHex(mac), v1);
}

// Unix seconds → ISO timestamp (for current_period_end persistence). Null-safe.
export function unixToIso(sec: number | null | undefined): string | null {
  return sec ? new Date(sec * 1000).toISOString() : null;
}
