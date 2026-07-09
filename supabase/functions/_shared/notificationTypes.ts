// _shared/notificationTypes.ts — the notification type REGISTRY (M04).
// Single source of truth for every typed event the platform can raise. notify()
// (migration 0009) writes the rows; this registry declares, per type: a human
// label + description, an icon, the category it groups under in the preference
// matrix, its DEFAULT channels, and the deep-link pattern the feed row points at.
//
// As each later module lands it APPENDS its own types here (and, if it wants a new
// group, a category). The frontend mirrors this file in js/notification-types.js
// (you can't import a Deno .ts module into a vanilla browser page); keep the two in
// sync — the shapes are identical on purpose. Email/push are recorded as intent;
// email delivery is deferred until the provider decision D-011, push until M43.

export type Channel = "in_app" | "email" | "push";

export interface NotificationType {
  type: string;              // stable id, e.g. "contact.assigned" (module.event)
  label: string;             // human title for the matrix + feed grouping
  description: string;       // one line explaining when it fires
  icon: string;              // emoji glyph shown in the feed lead
  category: string;          // a NOTIFICATION_CATEGORIES key
  defaultChannels: Channel[];// seeded defaults before the user customises
  deepLink: string;          // route pattern; :params filled from the row's data
}

// Ordered groups for the preference matrix (label + display order).
export const NOTIFICATION_CATEGORIES = [
  { key: "crm",       label: "CRM & deals" },
  { key: "inbox",     label: "Inbox & mentions" },
  { key: "calendar",  label: "Calendar" },
  { key: "marketing", label: "Marketing & growth" },
  { key: "payments",  label: "Payments" },
  { key: "system",    label: "System & automation" },
] as const;

// The 16 foundation seed types (PRD_M04 §2). Future modules append below.
export const NOTIFICATION_TYPES: NotificationType[] = [
  // ── CRM & deals ─────────────────────────────────────────────────────────────
  { type: "contact.assigned", label: "Contact assigned", description: "A contact was assigned to you.",
    icon: "👤", category: "crm", defaultChannels: ["in_app", "email"], deepLink: "m09-crm.html#/contacts/:contactId" },
  { type: "deal.stage_changed", label: "Deal stage changed", description: "A deal moved to a new pipeline stage.",
    icon: "📊", category: "crm", defaultChannels: ["in_app"], deepLink: "m11-pipeline.html#/deals/:dealId" },
  { type: "deal.won", label: "Deal won", description: "A deal was marked won. 🎉",
    icon: "🏆", category: "crm", defaultChannels: ["in_app", "email"], deepLink: "m11-pipeline.html#/deals/:dealId" },

  // ── Inbox & mentions ────────────────────────────────────────────────────────
  { type: "inbox.new_message", label: "New message", description: "A new message arrived in a conversation.",
    icon: "💬", category: "inbox", defaultChannels: ["in_app"], deepLink: "m12-inbox.html#/threads/:threadId" },
  { type: "mention", label: "You were mentioned", description: "Someone @mentioned you in a note or comment.",
    icon: "@", category: "inbox", defaultChannels: ["in_app", "email"], deepLink: ":link" },

  // ── Calendar ────────────────────────────────────────────────────────────────
  { type: "appointment.booked", label: "Appointment booked", description: "A new appointment was scheduled.",
    icon: "📅", category: "calendar", defaultChannels: ["in_app", "email"], deepLink: "m14-calendar.html#/appointments/:appointmentId" },
  { type: "appointment.cancelled", label: "Appointment cancelled", description: "An appointment was cancelled.",
    icon: "🚫", category: "calendar", defaultChannels: ["in_app", "email"], deepLink: "m14-calendar.html#/appointments/:appointmentId" },

  // ── Marketing & growth ──────────────────────────────────────────────────────
  { type: "form.submitted", label: "Form submitted", description: "A form was submitted on one of your sites.",
    icon: "📝", category: "marketing", defaultChannels: ["in_app", "email"], deepLink: "m15-forms.html#/submissions/:submissionId" },
  { type: "campaign.finished", label: "Campaign finished", description: "A campaign send completed.",
    icon: "📣", category: "marketing", defaultChannels: ["in_app"], deepLink: "m16-campaigns.html#/campaigns/:campaignId" },
  { type: "review.new", label: "New review", description: "A new review was posted about you.",
    icon: "⭐", category: "marketing", defaultChannels: ["in_app", "email"], deepLink: "m30-reputation.html#/reviews/:reviewId" },
  { type: "rank.change_major", label: "Rank movement", description: "A tracked keyword moved more than 10 positions.",
    icon: "🔎", category: "marketing", defaultChannels: ["in_app"], deepLink: "m21-seo.html#/keywords/:keywordId" },
  { type: "article.awaiting_review", label: "Article awaiting review", description: "Content is waiting for your approval.",
    icon: "📄", category: "marketing", defaultChannels: ["in_app", "email"], deepLink: "m22-content.html#/articles/:articleId" },

  // ── Payments ────────────────────────────────────────────────────────────────
  { type: "payment.received", label: "Payment received", description: "An inbound payment cleared.",
    icon: "💰", category: "payments", defaultChannels: ["in_app"], deepLink: "m28-payments.html#/payments/:paymentId" },
  { type: "payment.failed", label: "Payment failed", description: "A payment attempt failed.",
    icon: "❌", category: "payments", defaultChannels: ["in_app", "email"], deepLink: "m28-payments.html#/payments/:paymentId" },

  // ── System & automation ─────────────────────────────────────────────────────
  { type: "automation.failed", label: "Automation failed", description: "An automation run errored.",
    icon: "⚠️", category: "system", defaultChannels: ["in_app", "email"], deepLink: "m13-automations.html#/runs/:runId" },
  { type: "usage.limit_warning", label: "Usage limit warning", description: "You're approaching a plan quota.",
    icon: "📈", category: "system", defaultChannels: ["in_app", "email"], deepLink: "m03-billing.html#/usage" },
];

// Lookup by type id (returns undefined for unknown types — callers should tolerate
// that so a newer emitter can't break an older reader).
export function notificationType(type: string): NotificationType | undefined {
  return NOTIFICATION_TYPES.find((t) => t.type === type);
}

export function isNotificationType(type: string): boolean {
  return NOTIFICATION_TYPES.some((t) => t.type === type);
}
