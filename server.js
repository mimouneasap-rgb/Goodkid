// Minimal static file server so the ES modules load over http:// (browsers
// block module imports from file://). No dependencies.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const filePath = normalize(join(root, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath));
  if (!filePath.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    // "/apqr" -> "/apqr/" so relative paths in the page resolve
    if (!extname(urlPath)) { res.writeHead(301, { Location: urlPath + "/" }).end(); return; }
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`Quality Risk Manager running at http://localhost:${port}`));
