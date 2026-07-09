// _shared/seo.ts — M21 provider clients (DataForSEO · SerpApi · PageSpeed Insights).
// The SOLE place M21 reaches an external SEO provider. Each call:
//   1. resolveCredential(admin, ws, provider) — Vault via M41 (throws NotConnectedError
//      when no cred is connected → the caller returns a 503 not_connected envelope).
//   2. real fetch() to the provider.
//   3. incrementMeter(admin, ws, 'seo_calls', 1, provider, cost, ref) IN the success
//      path only — a failed provider call bills NOTHING (D-132, USAGE-METERING §4).
//
// Ready-not-run: the code is complete and real. On this machine no SEO provider is
// connected and there is no Deno runtime, so the live round-trip is CARRIED, never
// faked. When creds land in the Vault these functions execute unchanged (D-135).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCredential } from "./integrations.ts";
import { incrementMeter } from "./meter.ts";

// DataForSEO uses HTTP Basic (login:password). The Vault stores the pair as
// "login:password"; we base64 it for the Authorization header.
function basicAuthHeader(secret: string): string {
  return "Basic " + btoa(secret);
}

export type KeywordData = {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  intent: "informational" | "commercial" | "transactional" | "navigational" | null;
  serp_features: string[];
  related: Array<{ keyword: string; volume: number | null }>;
  questions: Array<{ keyword: string; volume: number | null }>;
  longtail: Array<{ keyword: string; volume: number | null }>;
};

// ── DataForSEO: keyword overview + related/questions/long-tail ──────────────────
export async function dataForSeoKeywordData(
  admin: SupabaseClient, ws: string, seed: string, country = "us", lang = "en",
): Promise<KeywordData> {
  const { secret } = await resolveCredential(admin, ws, "dataforseo");
  const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
    method: "POST",
    headers: { "Authorization": basicAuthHeader(secret), "Content-Type": "application/json" },
    body: JSON.stringify([{ keywords: [seed], location_name: country, language_code: lang }]),
  });
  if (!res.ok) throw new Error(`dataforseo_error:${res.status}`);
  const json = await res.json();
  const out = mapDataForSeo(seed, json);
  await incrementMeter(admin, ws, "seo_calls", 1, "dataforseo", null, null);
  return out;
}

// ── DataForSEO ranked-keywords intersect → competitor gap ───────────────────────
export async function dataForSeoGap(
  admin: SupabaseClient, ws: string, yourDomain: string, rivalDomain: string, country = "us",
): Promise<{ gap: Array<{ keyword: string; volume: number | null; rival_position: number | null }> }> {
  const { secret } = await resolveCredential(admin, ws, "dataforseo");
  const call = (domain: string) => fetch(
    "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live",
    { method: "POST", headers: { "Authorization": basicAuthHeader(secret), "Content-Type": "application/json" },
      body: JSON.stringify([{ target: domain, location_name: country, limit: 1000 }]) });
  const [yr, rr] = await Promise.all([call(yourDomain), call(rivalDomain)]);
  if (!yr.ok || !rr.ok) throw new Error(`dataforseo_error:${yr.status}/${rr.status}`);
  const mine = new Set(rankedKeywords(await yr.json()).map((k) => k.keyword));
  const gap = rankedKeywords(await rr.json())
    .filter((k) => !mine.has(k.keyword))
    .map((k) => ({ keyword: k.keyword, volume: k.volume, rival_position: k.position }));
  await incrementMeter(admin, ws, "seo_calls", 2, "dataforseo", null, null); // two ranked-keyword calls
  return { gap };
}

// ── SerpApi: top-10 organic + SERP-feature flags ────────────────────────────────
export async function serpApiTop10(
  admin: SupabaseClient, ws: string, keyword: string, country = "us",
): Promise<{ results: Array<{ position: number; domain: string; title: string; url: string }>;
            features: { featured_snippet: boolean; people_also_ask: boolean; local_pack: boolean } }> {
  const { secret } = await resolveCredential(admin, ws, "serpapi");
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google");
  u.searchParams.set("q", keyword);
  u.searchParams.set("gl", country);
  u.searchParams.set("api_key", secret);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`serpapi_error:${res.status}`);
  const json = await res.json();
  const out = mapSerp(json);
  await incrementMeter(admin, ws, "seo_calls", 1, "serpapi", null, null);
  return out;
}

// ── PageSpeed Insights: Core Web Vitals for one URL ─────────────────────────────
export async function psiCoreWebVitals(
  admin: SupabaseClient, ws: string, url: string,
): Promise<{ lcp: number | null; inp: number | null; cls: number | null }> {
  const { secret } = await resolveCredential(admin, ws, "pagespeed");
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", url);
  u.searchParams.set("key", secret);
  u.searchParams.append("category", "performance");
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`psi_error:${res.status}`);
  const json = await res.json();
  const m = json?.loadingExperience?.metrics ?? {};
  await incrementMeter(admin, ws, "seo_calls", 1, "pagespeed", null, null);
  return {
    lcp: m.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    inp: m.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    cls: m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null,
  };
}

// ── Response mappers (pure — testable without the network) ───────────────────────
function intentFromKeyword(k: string): KeywordData["intent"] {
  const s = k.toLowerCase();
  if (/\b(buy|price|cost|cheap|deal|coupon|order)\b/.test(s)) return "transactional";
  if (/\b(best|top|review|vs|compare|alternative)\b/.test(s)) return "commercial";
  if (/^(www\.|https?:|login|sign in)/.test(s)) return "navigational";
  return "informational";
}

export function mapDataForSeo(seed: string, json: any): KeywordData {
  const item = json?.tasks?.[0]?.result?.[0] ?? {};
  return {
    keyword: seed,
    volume: item.search_volume ?? null,
    cpc: item.cpc ?? null,
    difficulty: item.competition_index ?? null,
    intent: intentFromKeyword(seed),
    serp_features: item.serp_features ?? [],
    related: (item.related ?? []).map((r: any) => ({ keyword: r.keyword, volume: r.search_volume ?? null })),
    questions: (item.questions ?? []).map((r: any) => ({ keyword: r.keyword, volume: r.search_volume ?? null })),
    longtail: (item.longtail ?? []).map((r: any) => ({ keyword: r.keyword, volume: r.search_volume ?? null })),
  };
}

function rankedKeywords(json: any): Array<{ keyword: string; volume: number | null; position: number | null }> {
  const items = json?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((it: any) => ({
    keyword: it.keyword_data?.keyword ?? it.keyword,
    volume: it.keyword_data?.keyword_info?.search_volume ?? null,
    position: it.ranked_serp_element?.serp_item?.rank_absolute ?? null,
  })).filter((k: any) => k.keyword);
}

export function mapSerp(json: any) {
  const organic = json?.organic_results ?? [];
  return {
    results: organic.slice(0, 10).map((r: any) => ({
      position: r.position, domain: hostOf(r.link), title: r.title, url: r.link,
    })),
    features: {
      featured_snippet: !!json?.answer_box,
      people_also_ask: Array.isArray(json?.related_questions) && json.related_questions.length > 0,
      local_pack: !!json?.local_results,
    },
  };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
