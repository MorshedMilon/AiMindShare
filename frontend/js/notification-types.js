/* notification-types.js — browser mirror of _shared/notificationTypes.ts (M04).
   The vanilla page can't import a Deno .ts module, so this file mirrors the
   registry for the feed (icon/label per type) and the preference matrix
   (grouping by category). Keep it in lock-step with the TS source — same shapes.
   Exposes window.AIMS_NOTIF_TYPES = { TYPES, CATEGORIES, byType, forCategory }. */
(function (global) {
  "use strict";

  var CATEGORIES = [
    { key: "crm",       label: "CRM & deals" },
    { key: "inbox",     label: "Inbox & mentions" },
    { key: "calendar",  label: "Calendar" },
    { key: "marketing", label: "Marketing & growth" },
    { key: "payments",  label: "Payments" },
    { key: "system",    label: "System & automation" },
  ];

  var TYPES = [
    { type: "contact.assigned",       label: "Contact assigned",       description: "A contact was assigned to you.",                  icon: "👤", category: "crm",       defaultChannels: ["in_app", "email"] },
    { type: "deal.stage_changed",     label: "Deal stage changed",     description: "A deal moved to a new pipeline stage.",           icon: "📊", category: "crm",       defaultChannels: ["in_app"] },
    { type: "deal.won",               label: "Deal won",               description: "A deal was marked won.",                          icon: "🏆", category: "crm",       defaultChannels: ["in_app", "email"] },
    { type: "inbox.new_message",      label: "New message",            description: "A new message arrived in a conversation.",        icon: "💬", category: "inbox",     defaultChannels: ["in_app"] },
    { type: "mention",                label: "You were mentioned",     description: "Someone @mentioned you in a note or comment.",    icon: "@",  category: "inbox",     defaultChannels: ["in_app", "email"] },
    { type: "appointment.booked",     label: "Appointment booked",     description: "A new appointment was scheduled.",                icon: "📅", category: "calendar",  defaultChannels: ["in_app", "email"] },
    { type: "appointment.cancelled",  label: "Appointment cancelled",  description: "An appointment was cancelled.",                   icon: "🚫", category: "calendar",  defaultChannels: ["in_app", "email"] },
    { type: "form.submitted",         label: "Form submitted",         description: "A form was submitted on one of your sites.",      icon: "📝", category: "marketing", defaultChannels: ["in_app", "email"] },
    { type: "campaign.finished",      label: "Campaign finished",      description: "A campaign send completed.",                      icon: "📣", category: "marketing", defaultChannels: ["in_app"] },
    { type: "review.new",             label: "New review",             description: "A new review was posted about you.",              icon: "⭐", category: "marketing", defaultChannels: ["in_app", "email"] },
    { type: "rank.change_major",      label: "Rank movement",          description: "A tracked keyword moved more than 10 positions.", icon: "🔎", category: "marketing", defaultChannels: ["in_app"] },
    { type: "article.awaiting_review",label: "Article awaiting review",description: "Content is waiting for your approval.",           icon: "📄", category: "marketing", defaultChannels: ["in_app", "email"] },
    { type: "payment.received",       label: "Payment received",       description: "An inbound payment cleared.",                     icon: "💰", category: "payments",  defaultChannels: ["in_app"] },
    { type: "payment.failed",         label: "Payment failed",         description: "A payment attempt failed.",                       icon: "❌", category: "payments",  defaultChannels: ["in_app", "email"] },
    { type: "automation.failed",      label: "Automation failed",      description: "An automation run errored.",                      icon: "⚠️", category: "system",    defaultChannels: ["in_app", "email"] },
    { type: "usage.limit_warning",    label: "Usage limit warning",    description: "You're approaching a plan quota.",                icon: "📈", category: "system",    defaultChannels: ["in_app", "email"] },
  ];

  var byId = {};
  TYPES.forEach(function (t) { byId[t.type] = t; });

  global.AIMS_NOTIF_TYPES = {
    TYPES: TYPES,
    CATEGORIES: CATEGORIES,
    byType: function (type) { return byId[type] || null; },
    forCategory: function (key) { return TYPES.filter(function (t) { return t.category === key; }); },
    icon: function (type) { return (byId[type] && byId[type].icon) || "🔔"; },
    label: function (type) { return (byId[type] && byId[type].label) || type; },
  };
})(window);
