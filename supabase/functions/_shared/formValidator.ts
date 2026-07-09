// _shared/formValidator.ts — the TS mirror of submit_form()'s SQL validation +
// logic-drop rules (0020_m15_forms.sql §7, steps 2-3). Two pure, dependency-free
// functions the public-form Edge Fn uses for a fast pre-check, and (shape-shared)
// the Task-7 browser renderer uses for live UX. Deno-import-friendly (no imports).
//
// AUTHORITY NOTE: the server's authoritative validation is the SQL inside
// submit_form — this module is a FAST PRE-CHECK / UX mirror, never the gate. Keep
// the rules byte-for-byte with the SQL so a client-passed field can't fail the DB.

// A form field as stored in forms.fields_json. Only the keys the rules read are typed;
// the renderer carries the rest (label, options, …) opaquely.
export interface FormField {
  key: string;
  type?: string;        // text | email | number | phone | consent | textarea | …
  required?: boolean;
  [k: string]: unknown; // label/options/etc. pass through untouched
}

// A logic rule as stored in forms.logic_json:
//   { target, action:'hide'|'show', when:{ field, op:'eq'|'neq', value } }
export interface LogicRule {
  target?: string;
  action?: string;
  when?: { field?: string; op?: string; value?: unknown };
}

export type Answers = Record<string, unknown>;

// The email shape submit_form enforces: ^[^@\s]+@[^@\s]+\.[^@\s]+$ (SQL line 293).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// number: ^-?[0-9]+(\.[0-9]+)?$ (SQL line 295).
const NUMBER_RE = /^-?[0-9]+(\.[0-9]+)?$/;

// Coerce an answer value to the string form the SQL sees via `answers->>key`
// (jsonb ->> yields text; a JS string maps 1:1, anything else is stringified so an
// accidental number/boolean answer validates the same as its text form).
function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

// visibleFields — apply logic_json show/hide against answers; return the fields that
// remain VISIBLE (mirrors submit_form step 3's hidden-set computation, SQL 258-277).
// hide-set membership: (hide-rule whose condition holds) OR (show-rule whose
// condition fails). A rule missing target or when.field is skipped (SQL `continue`).
export function visibleFields(
  fields: FormField[],
  logic: LogicRule[],
  answers: Answers,
): FormField[] {
  const hidden = new Set<string>();
  for (const rule of logic ?? []) {
    const target = rule?.target ?? null;
    const action = (rule?.action ?? "hide").toLowerCase();
    const wfield = rule?.when?.field ?? null;
    const wop = (rule?.when?.op ?? "eq").toLowerCase();
    const wval = rule?.when?.value;
    if (target == null || wfield == null) continue;
    const actual = asText(answers?.[wfield]);
    // SQL compares r_actual (text, '' when absent) to r_wval (text). `neq` uses IS
    // DISTINCT FROM; with both coerced to strings that's a plain `!==`.
    const wvalText = asText(wval);
    const match = wop === "neq" ? actual !== wvalText : actual === wvalText;
    if ((action === "hide" && match) || (action === "show" && !match)) {
      hidden.add(target);
    }
  }
  return (fields ?? []).filter((f) => f?.key != null && !hidden.has(f.key));
}

// validate — required (present + non-empty after trim) + basic type checks on the
// VISIBLE fields, mirroring submit_form step 3's per-field loop (SQL 279-306).
// Returns { ok, errors } where errors maps field.key → machine error code, matching
// the SQL codes: 'required' | 'invalid_email' | 'invalid_number' | 'invalid_phone'.
export function validate(
  fields: FormField[],
  answers: Answers,
  logic: LogicRule[] = [],
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  // Only VISIBLE fields are validated (a hidden field is dropped, never checked).
  const visible = visibleFields(fields ?? [], logic ?? [], answers ?? {});

  for (const field of visible) {
    const key = field?.key;
    if (key == null) continue;
    const type = (field?.type ?? "text").toLowerCase();
    const raw = answers?.[key];
    const ans = raw === null || raw === undefined ? null : asText(raw);
    const empty = ans == null || ans.trim() === "";

    if (field?.required && empty) {
      errors[key] = "required";
      continue; // SQL `continue`: skip type checks on an empty required field
    }

    if (!empty) {
      const v = ans as string;
      if (type === "email" && !EMAIL_RE.test(v)) {
        errors[key] = "invalid_email";
      } else if (type === "number" && !NUMBER_RE.test(v)) {
        errors[key] = "invalid_number";
      } else if (type === "phone" && v.replace(/[^0-9]/g, "").length < 7) {
        errors[key] = "invalid_phone";
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
