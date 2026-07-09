// functions/media-autotag/index.ts — M06 AI vision auto-tagging (background).
// Invoked by the worker for a `media.autotag` job (enqueued by register_media_asset
// on image upload). NOT a browser path (verify_jwt=false; service-side only).
//
// Contract (PRD_M06 §2): derive descriptive tags + an alt-text draft for an image
// and store them on the asset (searchable; reused by M19/M22 for SEO alt text).
//
//   POST { asset_id }
//   200 { ok:true, data:{ status:'tagged'|'skipped', tags:[...] } }
//
// PROVIDER-DEFERRED (D-117): the real GPT-4o vision call is a labelled scaffold.
// Until a vision/LLM provider is decided (the same open-decision posture as the
// M13 AI builder D-063), tags are derived deterministically from the
// filename + kind. meter_increment('ai_tokens') fires ONLY on a real provider call,
// so nothing is billed yet (DoD Gate 3). When a provider lands, replace the
// scaffold block and uncomment the meter call — no other change needed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";
// import { incrementMeter } from "../_shared/meter.ts";  // wired for the real provider

const STOP = new Set([
  "the", "a", "an", "and", "of", "for", "to", "in", "on", "img", "image",
  "photo", "pic", "final", "copy", "draft", "new", "untitled", "screenshot",
]);

function scaffoldTags(filename: string, kind: string | null, mime: string | null): string[] {
  const base = (filename || "").replace(/\.[a-z0-9]+$/i, "");
  const words = base.split(/[\s\-_.]+/)
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const tags = new Set<string>(words);
  if (kind) tags.add(kind);
  else if (mime?.startsWith("image/")) tags.add("image");
  return [...tags].slice(0, 8);
}

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST only");

  try {
    const { asset_id } = await req.json().catch(() => ({}));
    if (!asset_id) return err(400, "bad_request", "asset_id is required");

    const admin = serviceClient();
    const { data: asset } = await admin.from("media_assets")
      .select("id, workspace_id, filename, kind, mime, bucket").eq("id", asset_id).maybeSingle();
    if (!asset) return err(404, "not_found", "Asset not found");

    // Non-images are skipped (register_media_asset already set 'skipped'; defend here too).
    if (asset.kind && asset.kind !== "image" && !(asset.mime ?? "").startsWith("image/")) {
      await admin.from("media_assets").update({ tag_status: "skipped" }).eq("id", asset_id);
      return ok({ status: "skipped", reason: "not an image" });
    }

    // ── PROVIDER-DEFERRED scaffold (D-117) ──────────────────────────────────────
    // TODO(provider): call GPT-4o vision on the signed object URL → tags + alt text,
    // then meter the tokens used in THIS success path (a failed call bills nothing):
    //   await incrementMeter(admin, asset.workspace_id, "ai_tokens", tokensUsed,
    //                        "media.autotag", null, asset_id);
    const tags = scaffoldTags(asset.filename, asset.kind, asset.mime);
    const altDraft = tags.length ? `Image of ${tags.slice(0, 3).join(", ")}` : "Uploaded image";

    const { error: upErr } = await admin.from("media_assets")
      .update({ ai_tags: tags, alt_text: altDraft, tag_status: "done" }).eq("id", asset_id);
    if (upErr) return err(500, "write_failed", upErr.message);

    return ok({ status: "tagged", tags, alt_text: altDraft, provider: "scaffold" });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
