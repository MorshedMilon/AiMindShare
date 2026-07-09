// js/permissions.js — browser mirror of supabase/functions/_shared/permissions.ts.
// The permission registry + the client-side gating helpers (can / effective set).
// UI hiding is COSMETIC — the server (has_permission via RLS + the permission-check
// Edge Fn) is the authoritative wall (DoD Gate 2). This file only decides what to
// show/enable; it never decides what is allowed. Kept in sync with the TS registry
// and the seeded roles.permissions arrays (drift guarded by m02probe).
(function (global) {
  "use strict";

  // ── Vocabulary (foundation set) — mirror of PERMISSIONS in the TS registry ──
  const PERMISSIONS = [
    "crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export",
    "pipeline.view", "pipeline.manage",
    "campaigns.view", "campaigns.send",
    "forms.view", "forms.manage",
    "reports.view",
    "automations.manage",
    "team.manage", "billing.manage", "settings.manage",
    "workspace.delete", "whitelabel.manage",
    "portal.view", "portal.approve", "portal.pay",
  ];

  // Module label + display order for the matrix rows.
  const MODULES = [
    { key: "crm",         label: "CRM" },
    { key: "pipeline",    label: "Pipeline" },
    { key: "campaigns",   label: "Campaigns" },
    { key: "forms",       label: "Forms" },
    { key: "reports",     label: "Reports" },
    { key: "automations", label: "Automations" },
    { key: "team",        label: "Team" },
    { key: "billing",     label: "Billing" },
    { key: "settings",    label: "Settings" },
    { key: "workspace",   label: "Workspace" },
    { key: "whitelabel",  label: "White-label" },
    { key: "portal",      label: "Client portal" },
  ];

  // Action column order (the union across modules; a module only lights the
  // actions it actually declares in PERMISSIONS).
  const ACTIONS = [
    { key: "view",    label: "View" },
    { key: "create",  label: "Create" },
    { key: "edit",    label: "Edit" },
    { key: "delete",  label: "Delete" },
    { key: "export",  label: "Export" },
    { key: "manage",  label: "Manage" },
    { key: "send",    label: "Send" },
    { key: "approve", label: "Approve" },
    { key: "pay",     label: "Pay" },
  ];

  // ── Built-in role → permission arrays (mirror of ROLE_MATRIX / migration 0008) ──
  const ROLE_MATRIX = {
    owner: PERMISSIONS.slice(),
    admin: [
      "crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export",
      "pipeline.view", "pipeline.manage", "campaigns.view", "campaigns.send",
      "forms.view", "forms.manage",
      "reports.view", "automations.manage", "team.manage", "settings.manage",
    ],
    manager: [
      "crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export",
      "pipeline.view", "pipeline.manage", "campaigns.view", "campaigns.send",
      "forms.view", "forms.manage",
      "reports.view", "automations.manage",
    ],
    staff: [
      "crm.view", "crm.create", "crm.edit",
      "pipeline.view", "campaigns.view", "reports.view",
      "forms.view", "forms.manage",
    ],
    client: ["portal.view", "portal.approve", "portal.pay"],
  };

  // Short human descriptions of the built-in roles (for the roles list UI).
  const ROLE_BLURB = {
    owner:   "Full control, including billing and workspace deletion. Immutable.",
    admin:   "Everything except billing and deleting the workspace.",
    manager: "Full access to all modules. No team, settings, or billing.",
    staff:   "Work assigned records — view, create, and edit. No delete or export.",
    client:  "Portal-only: view, approve, and pay. No workspace access.",
  };

  const permsForModule = (mod) => PERMISSIONS.filter((p) => p.split(".")[0] === mod);
  const hasAction = (mod, action) => PERMISSIONS.indexOf(mod + "." + action) !== -1;

  // Resolve a member's EFFECTIVE permission Set the same way the DB has_permission()
  // does: owner ⇒ all; client ⇒ portal.* ceiling; else role grant ∪ override.grant −
  // override.revoke. `rolePerms` is the array from the member's assigned role (custom
  // or built-in); `overrides` = memberships.permissions {grant:[],revoke:[]}.
  function effectiveSet(role, rolePerms, overrides) {
    if (role === "owner") return new Set(PERMISSIONS);
    const base = (rolePerms && rolePerms.length ? rolePerms : (ROLE_MATRIX[role] || [])).slice();
    const grant = (overrides && overrides.grant) || [];
    const revoke = new Set((overrides && overrides.revoke) || []);
    const set = new Set();
    base.concat(grant).forEach((p) => {
      if (revoke.has(p)) return;
      if (role === "client" && p.indexOf("portal.") !== 0) return; // client ceiling
      set.add(p);
    });
    return set;
  }

  // can(perm, effective) — is this permission present in the resolved Set?
  const can = (perm, effective) => !!effective && effective.has(perm);

  // Hydrate [data-can] elements: hide (or, with data-can-mode="disable", disable) any
  // control whose required permission is absent from the effective set. Purely
  // cosmetic — the server still enforces (Gate 2).
  function hydrate(root, effective) {
    (root || document).querySelectorAll("[data-can]").forEach((node) => {
      const need = node.getAttribute("data-can");
      if (can(need, effective)) return;
      if (node.getAttribute("data-can-mode") === "disable") {
        node.setAttribute("disabled", "disabled");
        node.setAttribute("aria-disabled", "true");
        node.classList.add("is-denied");
      } else {
        node.hidden = true;
      }
    });
  }

  global.AIMS_PERMISSIONS = {
    PERMISSIONS, MODULES, ACTIONS, ROLE_MATRIX, ROLE_BLURB,
    permsForModule, hasAction, effectiveSet, can, hydrate,
  };
})(window);
