// functions/public-booking/index.ts — M14 the NO-AUTH public booking surface.
// A visitor on /book/[slug] has no session, so this runs with verify_jwt=false and
// authorizes reads/books by the calendar `slug` and self-service by the unguessable,
// single-purpose, expiring reschedule/cancel token (0017). All privileged work is
// service-role; slot math is the authoritative compute_slots() RPC with Google
// freebusy subtracted here (the token lives in Vault, unreadable by SQL).
//
// Routes (all under /functions/v1/public-booking):
//   GET  ?slug=SLUG                         → public calendar config + questions
//   GET  ?slug=SLUG&date=YYYY-MM-DD&tz=TZ   → available slots
//   POST {slug, start, end, tz, contact:{name,email,phone}, answers}  → book
//   POST {action:'reschedule', token, start, end}                     → reschedule
//   POST {action:'cancel', token}                                     → cancel
//
// Paid bookings are a SCAFFOLD: if a calendar has requires_payment=true this returns
// 409 payment_required (M28 PaymentIntent is Session 13, not built). The UI toggle is
// disabled, so this is defensive only (accept-when excludes paid bookings).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
import { subtractBusy } from "../_shared/slots.ts";
import { googleFreebusy, googlePushEvent, googleUpdateEvent, googleDeleteEvent } from "../_shared/google.ts";

const APP_ORIGIN = () => Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const admin = serviceClient();

  try {
    // ── GET: public config or slots ─────────────────────────────────────────────
    if (req.method === "GET") {
      const slug = url.searchParams.get("slug");
      if (!slug) return err(400, "bad_request", "slug is required");
      const cal = await loadCalendarBySlug(admin, slug);
      if (!cal) return err(404, "not_found", "No such booking page");

      const date = url.searchParams.get("date");
      const tz = url.searchParams.get("tz") || cal.timezone;
      if (!date) {
        const { data: questions } = await admin.from("appointment_questions")
          .select("id, label, type, required, sort_order")
          .eq("calendar_id", cal.id).order("sort_order");
        return ok({
          calendar: {
            id: cal.id, name: cal.name, type: cal.type, duration_min: cal.duration_min,
            timezone: cal.timezone, requires_payment: cal.requires_payment, color: cal.color,
          },
          questions: questions ?? [],
        });
      }

      // Slots: the authoritative SQL grid, then subtract Google busy for the day.
      const { data: slots, error: sErr } = await admin.rpc("compute_slots", {
        p_calendar: cal.id, p_date: date, p_tz: tz,
      });
      if (sErr) return err(500, "slots_failed", sErr.message);
      let out = slots ?? [];
      if (await googleConnected(admin, cal.workspace_id) && out.length) {
        const dayStart = out[0].slot_start;
        const dayEnd = out[out.length - 1].slot_end;
        const busy = await googleFreebusy(admin, cal.workspace_id, dayStart, dayEnd).catch(() => []);
        out = subtractBusy(out, busy);
      }
      return ok({ slots: out });
    }

    // ── POST: book / reschedule / cancel ────────────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action ?? "book";

      if (action === "reschedule") {
        if (!body.token || !body.start || !body.end) return err(400, "bad_request", "token, start and end are required");
        const { data: apptId, error: rErr } = await admin.rpc("reschedule_appointment", {
          p_token: body.token, p_start: body.start, p_end: body.end,
        });
        if (rErr) return err(403, "invalid_token", "This reschedule link is invalid or has expired");
        await syncGoogleForAppointment(admin, apptId, "update");
        return ok({ appointment_id: apptId, status: "rescheduled" });
      }

      if (action === "cancel") {
        if (!body.token) return err(400, "bad_request", "token is required");
        // Capture the google_event_id BEFORE cancel rotates the token.
        const { data: pre2 } = await admin.from("appointments")
          .select("id, workspace_id, google_event_id").eq("cancel_token", body.token).maybeSingle();
        const { data: apptId, error: cErr } = await admin.rpc("cancel_appointment", { p_token: body.token });
        if (cErr) return err(403, "invalid_token", "This cancel link is invalid or has expired");
        if (pre2?.google_event_id) await googleDeleteEvent(admin, pre2.workspace_id, pre2.google_event_id).catch(() => {});
        return ok({ appointment_id: apptId, status: "cancelled" });
      }

      // Default: book.
      const { slug, start, end, tz, contact, answers } = body ?? {};
      if (!slug || !start || !end || !contact?.email) {
        return err(400, "bad_request", "slug, start, end and a contact email are required");
      }
      const cal = await loadCalendarBySlug(admin, slug);
      if (!cal) return err(404, "not_found", "No such booking page");

      // Paid bookings scaffold — gated off until M28.
      if (cal.requires_payment) return err(409, "payment_required", "Paid bookings are not available yet");

      // Resolve/create the contact (upsert by email within the workspace — M09 shape).
      const contactId = await upsertContact(admin, cal.workspace_id, contact);

      // Book: the AFTER INSERT trigger (0017) does tag + timeline + reminders + bus.
      const { data: rows, error: bErr } = await admin.rpc("book_appointment", {
        p_ws: cal.workspace_id, p_calendar: cal.id, p_contact: contactId,
        p_start: start, p_end: end, p_tz: tz || cal.timezone, p_answers: answers ?? {},
      });
      if (bErr) return err(500, "book_failed", bErr.message);
      const row = Array.isArray(rows) ? rows[0] : rows;

      // Push to Google (best-effort; never blocks a confirmed booking).
      await syncGoogleForAppointment(admin, row.appointment_id, "create", contact).catch(() => {});

      const origin = APP_ORIGIN();
      return ok({
        appointment_id: row.appointment_id,
        // reschedule needs the slug to recompute slots; cancel needs only the token.
        reschedule_url: `${origin}/book.html?action=reschedule&slug=${encodeURIComponent(slug)}&token=${row.reschedule_token}`,
        cancel_url: `${origin}/book.html?action=cancel&token=${row.cancel_token}`,
      });
    }

    return err(405, "method_not_allowed", "GET or POST only");
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});

async function loadCalendarBySlug(admin: any, slug: string) {
  const { data } = await admin.from("calendars")
    .select("id, workspace_id, name, type, slug, duration_min, timezone, requires_payment, color, is_active")
    .eq("slug", slug).eq("is_active", true).maybeSingle();
  return data ?? null;
}

async function googleConnected(admin: any, workspaceId: string): Promise<boolean> {
  const { data } = await admin.from("integrations")
    .select("status").eq("provider", "google").eq("workspace_id", workspaceId).maybeSingle();
  return data?.status === "connected";
}

// Upsert a contact by email within the workspace (M09 contacts shape); returns id.
async function upsertContact(admin: any, workspaceId: string, c: { name?: string; email: string; phone?: string }) {
  const { data: existing } = await admin.from("contacts")
    .select("id").eq("workspace_id", workspaceId).eq("email", c.email).maybeSingle();
  if (existing?.id) {
    if (c.phone) await admin.from("contacts").update({ phone: c.phone }).eq("id", existing.id);
    return existing.id;
  }
  const [first, ...rest] = (c.name ?? "").trim().split(/\s+/);
  const { data: created, error } = await admin.from("contacts").insert({
    workspace_id: workspaceId, first_name: first || null, last_name: rest.join(" ") || null,
    email: c.email, phone: c.phone ?? null, source: "booking",
  }).select("id").single();
  if (error) throw error;
  return created.id;
}

// Reflect an appointment's create/update/delete into Google (if connected).
async function syncGoogleForAppointment(admin: any, apptId: string, op: "create" | "update", contact?: { email?: string }) {
  const { data: a } = await admin.from("appointments")
    .select("id, workspace_id, calendar_id, starts_at, ends_at, google_event_id").eq("id", apptId).maybeSingle();
  if (!a) return;
  if (!(await googleConnected(admin, a.workspace_id))) return;
  const { data: cal } = await admin.from("calendars").select("name").eq("id", a.calendar_id).maybeSingle();
  if (op === "create") {
    const eventId = await googlePushEvent(admin, a.workspace_id, {
      id: a.id, starts_at: a.starts_at, ends_at: a.ends_at,
      summary: cal?.name ?? "Appointment", attendeeEmail: contact?.email, withMeet: true,
    });
    if (eventId) await admin.from("appointments").update({ google_event_id: eventId }).eq("id", a.id);
  } else if (op === "update" && a.google_event_id) {
    await googleUpdateEvent(admin, a.workspace_id, a.google_event_id, { starts_at: a.starts_at, ends_at: a.ends_at });
  }
}
