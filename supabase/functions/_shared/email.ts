// _shared/email.ts — SendGrid access with NO SDK (D-011 RESOLVED → SendGrid; the
// D-028 pattern). The API key + the Signed-Event-Webhook verification key live in
// Supabase Vault (Law 3); we read them server-side and call the SendGrid REST API
// with fetch. Event-webhook signatures are verified with Web Crypto ECDSA-P256
// (SendGrid's scheme). Nothing here ever reaches the browser.
//
// This module also owns compileEmail() — the D-087 replacement for the MJML
// library: it compiles the builder's block-JSON into responsive, inline-CSS,
// table-based HTML (600px) directly, interpolates merge tags, appends the CAN-SPAM
// footer if absent, and wraps every link/adds the open pixel for tracking.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API = "https://api.sendgrid.com/v3";

// Vault secret names (M41 §3 deterministic naming). SendGrid is a platform-default
// provider (providers.ts scope 'platform'), but a workspace override is always
// allowed — resolve the ws override first, then the plat default.
//   workspace override :  ws_<uuid>__sendgrid__api_key / __event_webhook_verification_key
//   platform default   :  plat__sendgrid__api_key / __event_webhook_verification_key
export const sendgridKeyName = (workspaceId: string | null): string =>
  workspaceId
    ? `ws_${workspaceId}__sendgrid__api_key`
    : `plat__sendgrid__api_key`;
export const sendgridWebhookKeyName = (workspaceId: string | null): string =>
  workspaceId
    ? `ws_${workspaceId}__sendgrid__event_webhook_verification_key`
    : `plat__sendgrid__event_webhook_verification_key`;

// Read a decrypted secret from Vault via the service role. Returns null if absent
// (so callers fail honestly with `sendgrid_unconfigured` rather than 500). Mirrors
// getVaultSecret in stripe.ts (re-implemented here to keep _shared/email.ts a
// self-contained provider adapter, matching stripe.ts's own shape).
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

// Resolve the SendGrid key: workspace override → platform default → null.
export async function resolveSendgridKey(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  return (await getVaultSecret(db, sendgridKeyName(workspaceId)))
    ?? (await getVaultSecret(db, sendgridKeyName(null)));
}
export async function resolveSendgridWebhookKey(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  return (await getVaultSecret(db, sendgridWebhookKeyName(workspaceId)))
    ?? (await getVaultSecret(db, sendgridWebhookKeyName(null)));
}

// Thrown on a non-2xx SendGrid response so the caller maps it to a safe envelope
// (never leak the raw provider error). Mirrors StripeError.
export class EmailError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface EmailMessage {
  to: string;
  from: { email: string; name?: string };
  subject: string;
  html: string;
  unsubUrl?: string;   // List-Unsubscribe one-click header target
  token?: string;      // per-recipient send_events.token → SendGrid custom_args (event correlation)
}

// POST /v3/mail/send. Returns SendGrid's X-Message-Id (correlates delivery events).
// Throws EmailError on non-2xx. The LIVE path (no creds are connected this slice).
export async function sendEmail(key: string, msg: EmailMessage): Promise<string | null> {
  const headers: Record<string, string> = {};
  if (msg.unsubUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: msg.to }] }],
    from: { email: msg.from.email, ...(msg.from.name ? { name: msg.from.name } : {}) },
    subject: msg.subject,
    content: [{ type: "text/html", value: msg.html }],
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(msg.token ? { custom_args: { token: msg.token } } : {}),
  };
  const res = await fetch(`${SENDGRID_API}/mail/send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmailError(res.status, "sendgrid_error", `SendGrid rejected the message (${res.status}) ${detail.slice(0, 160)}`);
  }
  return res.headers.get("x-message-id");
}

// ── compileEmail — block-JSON → responsive inline-CSS HTML (D-087, MJML replacement) ──
// PURE function (no I/O): the same body_json always compiles to the same HTML for a
// given ctx. `ctx.contact` drives merge-tag interpolation; `ctx.trackBase` is the
// email-track endpoint URL; `ctx.token` is the recipient's send_events.token.
export interface CompileContext {
  contact?: Record<string, unknown> | null;   // first_name, company, custom:{...}
  token: string;                                // send_events.token (tracking key)
  trackBase: string;                            // …/functions/v1/email-track
  unsubBase?: string;                           // …/functions/v1/email-unsubscribe (footer link)
  footer_address?: string | null;               // CAN-SPAM postal address
}

// Escape user/merge text for safe inclusion in HTML.
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Interpolate {{first_name}} {{company}} {{custom.x}} from ctx.contact, with graceful
// fallbacks ({{first_name}} → 'there', others → ''). Unknown tags collapse to ''.
function interpolate(text: string, ctx: CompileContext): string {
  const c = (ctx.contact ?? {}) as Record<string, any>;
  return String(text ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, raw) => {
    const key = String(raw);
    if (key === "unsubscribe_link") return "{{unsubscribe_link}}"; // resolved later (see below)
    if (key.startsWith("custom.")) return String(c.custom?.[key.slice(7)] ?? "");
    if (key === "first_name") return String(c.first_name ?? c.firstName ?? "there");
    if (key === "company") return String(c.company ?? "");
    return String(c[key] ?? "");
  });
}

// Wrap an outbound href with the click-redirect so opens/clicks are tracked, unless it
// is a mailto:/tel: or an already-tracked/unsubscribe control link.
function wrapHref(href: string, ctx: CompileContext): string {
  if (!href || /^(mailto:|tel:|#)/i.test(href)) return href;
  if (href.includes("{{unsubscribe_link}}")) return href;
  return `${ctx.trackBase}?c=${encodeURIComponent(ctx.token)}&u=${encodeURIComponent(href)}`;
}

// A single content cell wrapper (padding + font defaults) used by most blocks.
function cell(inner: string, style = ""): string {
  return `<tr><td style="padding:8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;${style}">${inner}</td></tr>`;
}

// Compile one block to a table row (or rows). Unknown types render nothing.
function block(b: any, ctx: CompileContext): string {
  const type = b?.type;
  switch (type) {
    case "section": {
      const inner = Array.isArray(b.blocks) ? b.blocks.map((x: any) => block(x, ctx)).join("") : "";
      const bg = b.background ? `background:${esc(b.background)};` : "";
      return `<tr><td style="padding:0;${bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td></tr>`;
    }
    case "columns": {
      const cols: any[] = Array.isArray(b.columns) ? b.columns : [];
      const w = cols.length ? Math.floor(100 / cols.length) : 100;
      const tds = cols.map((col) => {
        const inner = Array.isArray(col.blocks) ? col.blocks.map((x: any) => block(x, ctx)).join("") : "";
        return `<td width="${w}%" valign="top" style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${inner}</table></td>`;
      }).join("");
      return `<tr><td style="padding:0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table></td></tr>`;
    }
    case "text": {
      const align = b.align ? `text-align:${esc(b.align)};` : "";
      return cell(interpolate(String(b.text ?? ""), ctx), align);
    }
    case "image": {
      const src = esc(b.src ?? "");
      const alt = esc(b.alt ?? "");
      const img = `<img src="${src}" alt="${alt}" width="100%" style="max-width:100%;height:auto;display:block;border:0;" />`;
      const wrapped = b.href ? `<a href="${esc(wrapHref(String(b.href), ctx))}">${img}</a>` : img;
      return cell(wrapped, "padding:8px 24px;");
    }
    case "button": {
      const href = esc(wrapHref(String(b.href ?? "#"), ctx));
      const label = esc(interpolate(String(b.label ?? "Click here"), ctx));
      const color = esc(b.color ?? "#2563eb");
      const btn = `<a href="${href}" style="display:inline-block;padding:12px 28px;background:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">${label}</a>`;
      return cell(btn, "text-align:center;padding:16px 24px;");
    }
    case "divider":
      return `<tr><td style="padding:8px 24px;"><hr style="border:0;border-top:1px solid #e5e7eb;margin:0;" /></td></tr>`;
    case "social": {
      const links: any[] = Array.isArray(b.links) ? b.links : [];
      const items = links.map((l) =>
        `<a href="${esc(wrapHref(String(l.href ?? "#"), ctx))}" style="margin:0 6px;color:#2563eb;text-decoration:none;">${esc(l.label ?? l.network ?? "link")}</a>`
      ).join("");
      return cell(items, "text-align:center;padding:12px 24px;");
    }
    case "spacer": {
      const h = Number.isFinite(Number(b.height)) ? Number(b.height) : 16;
      return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;
    }
    case "html":
      // Raw author-supplied HTML block — merge-tag interpolated but not escaped (D-087).
      return cell(interpolate(String(b.html ?? ""), ctx));
    default:
      return "";
  }
}

export function compileEmail(bodyJson: any, ctx: CompileContext): string {
  const blocks: any[] = Array.isArray(bodyJson?.blocks) ? bodyJson.blocks : [];
  let rows = blocks.map((b) => block(b, ctx)).join("");

  // Resolve the unsubscribe link. If the body never referenced {{unsubscribe_link}},
  // append a compliant CAN-SPAM footer (unsub link + postal address) automatically.
  const unsubUrl = ctx.unsubBase
    ? `${ctx.unsubBase}?token=${encodeURIComponent(ctx.token)}`
    : "#";
  const hasUnsub = rows.includes("{{unsubscribe_link}}");
  if (!hasUnsub) {
    const addr = ctx.footer_address ? `<br />${esc(ctx.footer_address)}` : "";
    rows += cell(
      `<a href="${esc(unsubUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>${addr}`,
      "text-align:center;color:#6b7280;font-size:12px;padding:24px;",
    );
  } else {
    rows = rows.replaceAll("{{unsubscribe_link}}", esc(unsubUrl));
  }

  // Open pixel (tracked open beacon) — last row, invisible.
  const pixel = `<tr><td style="padding:0;font-size:0;line-height:0;"><img src="${esc(ctx.trackBase)}?o=${esc(ctx.token)}" width="1" height="1" alt="" style="display:block;border:0;" /></td></tr>`;

  return [
    `<!DOCTYPE html><html><head><meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `</head><body style="margin:0;padding:0;background:#f3f4f6;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">`,
    `<tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:8px;">`,
    rows,
    pixel,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

// Plain-text extraction from compiled HTML — for the spam-score heuristic (link/text
// ratio, all-caps ratio). Strips tags and collapses whitespace.
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── verifySendgridEvent — SendGrid Signed Event Webhook (ECDSA P-256, SHA-256) ──
// The signed payload is `timestamp + rawBody`. The verification key is the ECDSA
// public key (base64 SPKI DER) shown in the SendGrid Mail Settings → Signed Event
// Webhook UI. Returns false (never throws) if any header/key is missing so the
// webhook can ack-and-drop rather than 500 to the provider.
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifySendgridEvent(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
  verificationKeySpkiB64: string | null,
): Promise<boolean> {
  if (!signatureB64 || !timestamp || !verificationKeySpkiB64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      b64ToBytes(verificationKeySpkiB64),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64ToBytes(signatureB64),
      data,
    );
  } catch {
    return false;
  }
}
