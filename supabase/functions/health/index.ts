// functions/health/index.ts — Session 0 stub Edge Function.
// Proves the server can read a secret from Vault and return the standard
// envelope. Public read-proof (verify_jwt = false in config.toml): it never
// returns the secret value, only that Vault was reachable and the key exists.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, err, preflight } from "../_shared/envelope.ts";
import { serviceClient } from "../_shared/auth.ts";

const SECRET_NAME = "aimindshare_placeholder";

serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const db = serviceClient();

    // Read the placeholder secret from Vault (service-role context).
    const { data, error } = await db
      .schema("vault")
      .from("decrypted_secrets")
      .select("name, decrypted_secret")
      .eq("name", SECRET_NAME)
      .maybeSingle();

    if (error) return err(500, "vault_error", error.message);

    const secret_present = !!data?.decrypted_secret;
    return ok({
      service: "health",
      vault_ok: true,
      secret_name: SECRET_NAME,
      secret_present,           // never the value itself (Law 3)
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return err(500, "unhandled", e instanceof Error ? e.message : String(e));
  }
});
