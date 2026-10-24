// Minimal static file server so the ES modules load over http:// (browsers
// block module imports from file://). It also proxies the QE Investigator's
// Claude requests at /api/claude, so the Anthropic API key stays on the server
// (set ANTHROPIC_API_KEY, and run `npm install` once for the SDK).
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

// Only these models and request fields are forwarded to the API.
const MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
const FIELDS = ["model", "max_tokens", "system", "messages", "output_config", "thinking", "betas", "fallbacks"];
const MAX_BODY = 2 * 1024 * 1024;

let client = null;
async function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      client = { Anthropic, api: new Anthropic() };
    } catch {
      console.warn("ANTHROPIC_API_KEY is set but @anthropic-ai/sdk is not installed: run `npm install`.");
      return null;
    }
  }
  return client;
}

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleClaude(req, res) {
  const c = await anthropic();
  if (req.method === "GET") return json(res, 200, { available: Boolean(c) });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!c) return json(res, 503, { error: "The server has no Anthropic API key. Start it with ANTHROPIC_API_KEY=… npm start." });

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
  if (!MODELS.has(body.model)) return json(res, 400, { error: "Unsupported model" });
  const params = Object.fromEntries(FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));

  // Streaming avoids HTTP timeouts on long drafts; the browser gets the final message.
  const stream = c.api.beta.messages.stream(params);
  res.on("close", () => { if (!res.writableEnded) stream.abort(); });
  try {
    json(res, 200, await stream.finalMessage());
  } catch (err) {
    if (res.writableEnded || res.destroyed) return;
    const { Anthropic } = c;
    if (err instanceof Anthropic.AuthenticationError) return json(res, 502, { error: "The server's API key was rejected." });
    if (err instanceof Anthropic.RateLimitError) return json(res, 429, { error: "Rate limited by the API. Wait a minute and try again." });
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: `Claude API error ${err.status ?? ""}: ${err.message}` });
    console.error(err);
    return json(res, 500, { error: "Unexpected server error." });
  }
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/api/claude") return handleClaude(req, res);
  const filePath = normalize(join(root, urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath));
  if (!filePath.startsWith(root.endsWith(sep) ? root : root + sep) || filePath.includes(`${sep}node_modules${sep}`)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
    if (err.code === "EISDIR") res.writeHead(301, { Location: `${urlPath}/` }).end();
    else res.writeHead(404).end("Not found");
  }
}).listen(port, async () => {
  console.log(`Quality Risk Manager running at http://localhost:${port}`);
  console.log(`QE Investigator running at http://localhost:${port}/qe/`);
  console.log((await anthropic()) ? "Claude: API key found, /api/claude is enabled." : "Claude: no ANTHROPIC_API_KEY, the QE Investigator will ask for a key in the browser.");
});
