// config.example.js — copy to config.js and fill in for a LIVE connection.
// Only the project URL and the PUBLIC anon key belong here. The privileged
// service-role key must NEVER appear in any browser file (Constitution Law 3);
// it lives only in the worker/Edge Function server environment.
//
// You can also enter these at runtime via the console's "Connect" drawer —
// no file needed for a quick test.
window.AIMINDSHARE_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-PUBLIC-ANON-KEY",
};
