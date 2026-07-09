// _shared/meter.ts — the one place every metered Edge Function increments M03.
// Wraps the SQL primitive meter_increment (migration 0009). Call it in the SAME
// path as recording the provider's success, so a billable action can never commit
// uncounted (Constitution Law 4 / USAGE-METERING §4). `db` should be the service
// client (the increment is a privileged server-side write).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type MeterKind =
  | "sms" | "email" | "ai_tokens" | "image_gen"
  | "enrichment" | "seo_calls" | "voice_minutes" | "video_render";

export async function incrementMeter(
  db: SupabaseClient,
  workspace_id: string,
  kind: MeterKind,
  qty: number,
  source: string | null = null,
  unitCost: number | null = null,
  refId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.rpc("meter_increment", {
    p_workspace: workspace_id,
    p_kind: kind,
    p_qty: qty,
    p_source: source,
    p_unit_cost: unitCost,
    p_ref: refId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Pre-flight gate. Returns meter_check's jsonb shape { included, used, wallet,
// remaining, over }. The caller applies the behaviour (HARD_STOP / SOFT_WARN /
// OVERAGE) from the meter registry (USAGE-METERING §2/§5).
export async function checkMeter(
  db: SupabaseClient, workspace_id: string, kind: MeterKind, qty = 1,
): Promise<{ included: number | null; used: number; wallet: number; remaining: number | null; over: boolean } | null> {
  const { data, error } = await db.rpc("meter_check", {
    p_workspace: workspace_id, p_kind: kind, p_qty: qty,
  });
  if (error) return null;
  return data as any;
}
