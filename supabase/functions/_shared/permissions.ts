// _shared/permissions.ts — the module.action permission REGISTRY (M02).
// Single source of truth for the fine-grained permission vocabulary. RLS enforces
// the coarse 5-tier matrix (owner>admin>manager>staff>client); THIS file enumerates
// the fine `module.action` grants that Edge Functions check via has_permission()
// (RLS-AND-SECURITY §2, DECISIONS D-023).
//
// As each module is built it APPENDS its own permissions here (and a migration
// extends the built-in role arrays). The seeded roles.permissions arrays in
// migration 0008 MUST stay a subset of PERMISSIONS and equal ROLE_MATRIX below —
// drift is guarded by workers/verify/m02probe.mjs (you can't import TS into SQL, so
// the probe is the guard).

// ── The vocabulary (foundation set) ─────────────────────────────────────────
export const PERMISSIONS = [
  // CRM (M09/M10) — the foundation module the Gate-2 delete/export test targets
  "crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export",
  // Pipeline (M11)
  "pipeline.view", "pipeline.manage",
  // Campaigns (M16)
  "campaigns.view", "campaigns.send",
  // Forms & Surveys (M15) — staff+ view/manage; export reuses crm.export (D-146)
  "forms.view", "forms.manage",
  // Reports / analytics (M08/M40)
  "reports.view",
  // Automations (M13)
  "automations.manage",
  // Workspace administration
  "team.manage", "billing.manage", "settings.manage",
  "workspace.delete", "whitelabel.manage",
  // Client portal (M37)
  "portal.view", "portal.approve", "portal.pay",
] as const;

export type Permission = typeof PERMISSIONS[number];

// ── Human labels + module grouping for the matrix UI (GET via permission-check?
//    no — the frontend mirrors this in js/permissions.js for the checkbox editor).
//    Kept here so the registry is one file; the module key is the string before ".".
export const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  pipeline: "Pipeline",
  campaigns: "Campaigns",
  forms: "Forms",
  reports: "Reports",
  automations: "Automations",
  team: "Team",
  billing: "Billing",
  settings: "Settings",
  workspace: "Workspace",
  whitelabel: "White-label",
  portal: "Client portal",
};

// ── The built-in role → permission arrays (mirror of migration 0008's seed) ──
// OWNER is short-circuited to all-true inside has_permission(); its array is kept
// complete for documentation + the matrix UI.
export const ROLE_MATRIX: Record<string, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [
    "crm.view", "crm.create", "crm.edit", "crm.delete", "crm.export",
    "pipeline.view", "pipeline.manage", "campaigns.view", "campaigns.send",
    "forms.view", "forms.manage",
    "reports.view", "automations.manage", "team.manage", "settings.manage",
    // NO billing.manage, NO workspace.delete, NO whitelabel.manage (matrix §2)
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
    // assigned-records focus; NO crm.delete, NO crm.export (the Gate-2 target)
  ],
  client: ["portal.view", "portal.approve", "portal.pay"],
};

// Is `perm` a known registry permission? (guards typos in Edge Functions.)
export function isPermission(perm: string): perm is Permission {
  return (PERMISSIONS as readonly string[]).includes(perm);
}
