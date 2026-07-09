// serve.mjs — tiny static server for the Session 0 console (dev only, no deps).
//   node scripts/serve.mjs   →   http://localhost:5173
// Needed because the console fetch()es data/verify-status.json (blocked on file://).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), "..", "frontend"));
const PORT = process.env.PORT || 5173;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".gif": "image/gif", ".png": "image/png" };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/session-0-supabase-project-setup.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
  }
}).listen(PORT, () => console.log(`serving frontend on http://localhost:${PORT}`));
