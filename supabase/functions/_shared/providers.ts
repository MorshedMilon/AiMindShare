// _shared/providers.ts — the M41 provider registry (INTEGRATIONS-SPEC §7).
// Static config the Edge Functions read; the browser mirror is frontend/js/providers.js
// (kept in lock-step — you can't import TS into a no-build browser page; m41probe's
// drift guard asserts the two key sets stay equal). Adding a provider is one row here
// + one in the mirror + (oauth2) its scopes — the "<30 lines" acceptance criterion.
//
// The row carries only NON-secret metadata: which secret FIELDS the connect form
// collects (api_key/basic), which consent SCOPES to request (oauth2), the default
// scope (platform default vs per-workspace override), and whether the provider emits
// an inbound webhook (wiring deferred to that provider's session). No secret, ever.

export type AuthType = "api_key" | "oauth2" | "basic";
export type ProviderScope = "platform" | "workspace";

export interface Provider {
  key: string;            // stable registry id (also the Vault name segment, §3)
  name: string;           // display name
  category: string;       // UI grouping
  auth: AuthType;
  scope: ProviderScope;   // default scope (a per-workspace override is always allowed)
  fields?: string[];      // api_key/basic: the secret fields the connect form collects
  scopes?: string[];      // oauth2: consent scopes requested
  webhookIn?: boolean;    // emits an inbound webhook (Edge Fn wired at its session)
  usedBy?: string[];      // modules that consume it (from §7 "first wired") — UI chips
}

export const PROVIDERS: Provider[] = [
  { key: "stripe",      name: "Stripe",         category: "Payments",     auth: "api_key", scope: "workspace", fields: ["api_key"],                          webhookIn: true,  usedBy: ["M03", "M28"] },
  { key: "twilio",      name: "Twilio",         category: "SMS / Voice",  auth: "api_key", scope: "workspace", fields: ["account_sid", "auth_token"],        webhookIn: true,  usedBy: ["M12"] },
  { key: "resend",      name: "Resend",         category: "Email",        auth: "api_key", scope: "platform",  fields: ["api_key"],                          webhookIn: true,  usedBy: ["M04", "M16"] },
  { key: "sendgrid",    name: "SendGrid",       category: "Email",        auth: "api_key", scope: "platform",  fields: ["api_key", "event_webhook_verification_key"], webhookIn: true,  usedBy: ["M04", "M16"] },
  { key: "openai",      name: "OpenAI",         category: "AI",           auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M08", "M13", "M16", "M22", "M33"] },
  { key: "anthropic",   name: "Anthropic",      category: "AI",           auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M08", "M20", "M33"] },
  { key: "dataforseo",  name: "DataForSEO",     category: "SEO data",     auth: "basic",   scope: "platform",  fields: ["login", "password"],                usedBy: ["M21"] },
  { key: "serpapi",     name: "SerpApi",        category: "SEO data",     auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M21"] },
  { key: "pagespeed",   name: "PageSpeed Insights", category: "SEO data", auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M21"] },
  { key: "google",      name: "Google",         category: "OAuth suites", auth: "oauth2",  scope: "workspace", scopes: ["calendar", "business.manage", "adwords"], usedBy: ["M14", "M26", "M27"] },
  { key: "meta",        name: "Meta",           category: "OAuth suites", auth: "oauth2",  scope: "workspace", scopes: ["pages_show_list", "whatsapp_business_messaging"], webhookIn: true, usedBy: ["M12", "M27"] },
  { key: "pinterest",   name: "Pinterest",      category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["boards:read", "pins:write"],        usedBy: ["M24"] },
  { key: "linkedin",    name: "LinkedIn",       category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["w_member_social"],                  usedBy: ["M23"] },
  { key: "x",           name: "X",              category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["tweet.write", "tweet.read"],        usedBy: ["M23"] },
  { key: "tiktok",      name: "TikTok",         category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["video.publish"],                    usedBy: ["M23"] },
  { key: "elevenlabs",  name: "ElevenLabs",     category: "Voice TTS",    auth: "api_key", scope: "platform",  fields: ["api_key"],                          usedBy: ["M25", "M34"] },
  { key: "amazon_paapi",name: "Amazon PA-API",  category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["access_key", "secret_key", "partner_tag"], usedBy: ["M29"] },
  { key: "clickbank",   name: "ClickBank",      category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["api_key"],                          usedBy: ["M29"] },
  { key: "shareasale",  name: "ShareASale",     category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["api_token", "secret_key"],          usedBy: ["M29"] },
  { key: "impact",      name: "Impact",         category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["account_sid", "auth_token"],        usedBy: ["M29"] },
  { key: "cj",          name: "CJ",             category: "Affiliate",    auth: "oauth2",  scope: "workspace", scopes: ["read_commissions"],                usedBy: ["M29"] },
];

export const PROVIDER_BY_KEY: Record<string, Provider> =
  Object.fromEntries(PROVIDERS.map((p) => [p.key, p]));

export const CATEGORIES: string[] = [...new Set(PROVIDERS.map((p) => p.category))];

export function isProvider(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVIDER_BY_KEY, key);
}
