/* providers.js — browser mirror of supabase/functions/_shared/providers.ts.
   The connections UI reads this to render every provider card (name, category,
   auth type, default scope, the secret fields the connect form collects, and the
   "used by" module chips). NON-secret metadata only — no keys, no consent URLs,
   no token endpoints (those live server-side in the Edge Functions). Kept in
   lock-step with the TS source of truth; workers/verify/m41probe.mjs asserts the
   two key sets are identical (you can't import TS into a no-build page). */
(function () {
  "use strict";

  var PROVIDERS = [
    { key: "stripe",       name: "Stripe",        category: "Payments",     auth: "api_key", scope: "workspace", fields: ["api_key"],                                webhookIn: true, usedBy: ["M03", "M28"] },
    { key: "twilio",       name: "Twilio",        category: "SMS / Voice",  auth: "api_key", scope: "workspace", fields: ["account_sid", "auth_token"],              webhookIn: true, usedBy: ["M12"] },
    { key: "resend",       name: "Resend",        category: "Email",        auth: "api_key", scope: "platform",  fields: ["api_key"],                                webhookIn: true, usedBy: ["M04", "M16"] },
    { key: "sendgrid",     name: "SendGrid",      category: "Email",        auth: "api_key", scope: "platform",  fields: ["api_key", "event_webhook_verification_key"], webhookIn: true, usedBy: ["M04", "M16"] },
    { key: "openai",       name: "OpenAI",        category: "AI",           auth: "api_key", scope: "platform",  fields: ["api_key"],                                usedBy: ["M08", "M13", "M16", "M22", "M33"] },
    { key: "anthropic",    name: "Anthropic",     category: "AI",           auth: "api_key", scope: "platform",  fields: ["api_key"],                                usedBy: ["M08", "M20", "M33"] },
    { key: "dataforseo",   name: "DataForSEO",    category: "SEO data",     auth: "basic",   scope: "platform",  fields: ["login", "password"],                      usedBy: ["M21"] },
    { key: "serpapi",      name: "SerpApi",       category: "SEO data",     auth: "api_key", scope: "platform",  fields: ["api_key"],                                usedBy: ["M21"] },
    { key: "pagespeed",    name: "PageSpeed Insights", category: "SEO data", auth: "api_key", scope: "platform", fields: ["api_key"],                                usedBy: ["M21"] },
    { key: "google",       name: "Google",        category: "OAuth suites", auth: "oauth2",  scope: "workspace", scopes: ["calendar", "business.manage", "adwords"], usedBy: ["M14", "M26", "M27"] },
    { key: "meta",         name: "Meta",          category: "OAuth suites", auth: "oauth2",  scope: "workspace", scopes: ["pages_show_list", "whatsapp_business_messaging"], webhookIn: true, usedBy: ["M12", "M27"] },
    { key: "pinterest",    name: "Pinterest",     category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["boards:read", "pins:write"],              usedBy: ["M24"] },
    { key: "linkedin",     name: "LinkedIn",      category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["w_member_social"],                        usedBy: ["M23"] },
    { key: "x",            name: "X",             category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["tweet.write", "tweet.read"],              usedBy: ["M23"] },
    { key: "tiktok",       name: "TikTok",        category: "Social",       auth: "oauth2",  scope: "workspace", scopes: ["video.publish"],                          usedBy: ["M23"] },
    { key: "elevenlabs",   name: "ElevenLabs",    category: "Voice TTS",    auth: "api_key", scope: "platform",  fields: ["api_key"],                                usedBy: ["M25", "M34"] },
    { key: "amazon_paapi", name: "Amazon PA-API", category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["access_key", "secret_key", "partner_tag"], usedBy: ["M29"] },
    { key: "clickbank",    name: "ClickBank",     category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["api_key"],                                usedBy: ["M29"] },
    { key: "shareasale",   name: "ShareASale",    category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["api_token", "secret_key"],                usedBy: ["M29"] },
    { key: "impact",       name: "Impact",        category: "Affiliate",    auth: "api_key", scope: "workspace", fields: ["account_sid", "auth_token"],              usedBy: ["M29"] },
    { key: "cj",           name: "CJ",            category: "Affiliate",    auth: "oauth2",  scope: "workspace", scopes: ["read_commissions"],                       usedBy: ["M29"] },
  ];

  var PROVIDER_BY_KEY = {};
  PROVIDERS.forEach(function (p) { PROVIDER_BY_KEY[p.key] = p; });

  var CATEGORIES = [];
  PROVIDERS.forEach(function (p) { if (CATEGORIES.indexOf(p.category) === -1) CATEGORIES.push(p.category); });

  window.AIMS_PROVIDERS = {
    PROVIDERS: PROVIDERS,
    PROVIDER_BY_KEY: PROVIDER_BY_KEY,
    CATEGORIES: CATEGORIES,
    isProvider: function (key) { return Object.prototype.hasOwnProperty.call(PROVIDER_BY_KEY, key); },
  };
})();
