// _shared/google.ts — Google Calendar two-way sync, service-role only. Reads the
// workspace's Google OAuth token bundle from Vault (the M41 contract: one JSON
// secret {access_token, refresh_token, expires_in} under the §3 base name, exactly
// as integrations-callback writes it), refreshes it when expiring, and talks to the
// Google Calendar REST API for freebusy (read) + events (create/update/delete).
//
// Vault Law 1/3/4: a credential is NEVER returned to the browser and is only read
// here under the service role. The `integrations` row holds a reference only. M14 is
// the FIRST OAuth provider wired, so this is where the near-expiry refresh (left as
// a scaffold in resolveCredential, D-034) becomes concrete — kept local to M14 so
// the shared M41 helper is untouched.
//
// LIVE PATH, "ready, not run": no Google OAuth app / tokens / Deno toolchain exist
// on the build machine, so this is verified by code review + the m14 probe's RPC
// contract, not executed. Wiring it live = create a Google OAuth client and let a
// workspace connect; nothing here changes (mirrors M12 Twilio / M03 Stripe).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { expiringSoon, NotConnectedError, NeedsReauthError } from "./integrations.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface TokenBundle { access_token?: string; refresh_token?: string; expires_in?: number }

// Read + parse the JSON token bundle stored under a Vault name (service role only).
async function readBundle(admin: SupabaseClient, name: string): Promise<TokenBundle | null> {
  const { data } = await admin.schema("vault").from("decrypted_secrets")
    .select("decrypted_secret").eq("name", name).maybeSingle();
  const raw = (data as any)?.decrypted_secret;
  if (!raw) return null;
  try { return JSON.parse(raw) as TokenBundle; } catch { return null; }
}

// Overwrite a Vault secret by name (look up its id, then vault.update_secret).
async function writeBundle(admin: SupabaseClient, name: string, bundle: TokenBundle): Promise<void> {
  const { data: row } = await admin.schema("vault").from("secrets")
    .select("id").eq("name", name).maybeSingle();
  if (!(row as any)?.id) return;
  await admin.schema("vault").rpc("update_secret", {
    id: (row as any).id,
    new_secret: JSON.stringify(bundle),
  });
}

// Resolve a usable access token for the workspace's Google connection, refreshing
// (and re-writing Vault + the integration expiry) when within 24h of expiry (§5).
export async function googleAccessToken(admin: SupabaseClient, workspaceId: string): Promise<string> {
  const { data: integ } = await admin.from("integrations")
    .select("id, status, vault_secret_name, token_expires_at")
    .eq("provider", "google").eq("workspace_id", workspaceId).maybeSingle();
  if (!integ || integ.status !== "connected" || !integ.vault_secret_name) {
    throw new NotConnectedError("google");
  }
  const base = integ.vault_secret_name as string;
  const bundle = await readBundle(admin, base);
  if (!bundle) throw new NotConnectedError("google");

  if (!expiringSoon(integ.token_expires_at) && bundle.access_token) return bundle.access_token;

  // Refresh.
  if (!bundle.refresh_token) {
    await admin.from("integrations").update({ status: "needs_reauth" }).eq("id", integ.id);
    throw new NeedsReauthError("google");
  }
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: bundle.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!resp.ok) {
    await admin.from("integrations").update({ status: "needs_reauth" }).eq("id", integ.id);
    throw new NeedsReauthError("google");
  }
  const tok = await resp.json();
  const next: TokenBundle = {
    access_token: tok.access_token,
    refresh_token: bundle.refresh_token, // Google omits refresh_token on refresh — keep the original
    expires_in: tok.expires_in ?? 3600,
  };
  await writeBundle(admin, base, next);
  await admin.from("integrations").update({
    token_expires_at: new Date(Date.now() + (next.expires_in ?? 3600) * 1000).toISOString(),
    status: "connected",
  }).eq("id", integ.id);
  return next.access_token!;
}

// Google busy intervals for a window — subtracted from the SQL slot grid.
export async function googleFreebusy(
  admin: SupabaseClient, workspaceId: string, timeMin: string, timeMax: string,
): Promise<{ start: string; end: string }[]> {
  const access = await googleAccessToken(admin, workspaceId);
  const resp = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: "primary" }] }),
  });
  if (!resp.ok) return []; // fail-open on availability read: never block booking on a Google hiccup
  const data = await resp.json();
  return data?.calendars?.primary?.busy ?? [];
}

// Push an appointment to the owner's primary Google calendar. Returns the event id
// to store on appointments.google_event_id. Optionally requests a Meet link.
export async function googlePushEvent(
  admin: SupabaseClient, workspaceId: string,
  appt: { id: string; starts_at: string; ends_at: string; summary: string; description?: string; attendeeEmail?: string; withMeet?: boolean },
): Promise<string | null> {
  const access = await googleAccessToken(admin, workspaceId);
  const body: Record<string, unknown> = {
    summary: appt.summary,
    description: appt.description ?? "",
    start: { dateTime: appt.starts_at },
    end: { dateTime: appt.ends_at },
    ...(appt.attendeeEmail ? { attendees: [{ email: appt.attendeeEmail }] } : {}),
    ...(appt.withMeet ? { conferenceData: { createRequest: { requestId: appt.id } } } : {}),
  };
  const resp = await fetch(`${EVENTS_URL}?conferenceDataVersion=${appt.withMeet ? 1 : 0}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.id ?? null;
}

export async function googleUpdateEvent(
  admin: SupabaseClient, workspaceId: string, eventId: string,
  patch: { starts_at?: string; ends_at?: string },
): Promise<void> {
  const access = await googleAccessToken(admin, workspaceId);
  const body: Record<string, unknown> = {};
  if (patch.starts_at) body.start = { dateTime: patch.starts_at };
  if (patch.ends_at) body.end = { dateTime: patch.ends_at };
  await fetch(`${EVENTS_URL}/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function googleDeleteEvent(admin: SupabaseClient, workspaceId: string, eventId: string): Promise<void> {
  const access = await googleAccessToken(admin, workspaceId);
  await fetch(`${EVENTS_URL}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${access}` },
  });
}

// The Google-specific OAuth scope URLs (the registry stores short keys; this maps
// M14's needs). calendar.events = read/write events; calendar.readonly = freebusy.
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];
