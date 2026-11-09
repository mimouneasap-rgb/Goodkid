// Bundles the app into one self-contained page (styles, scripts and data inline)
// for publishing as a private claude.ai Artifact. Usage: node build-artifact.mjs <out.html>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const here = (f) => new URL(f, import.meta.url);
const read = (f) => readFileSync(here(f), "utf8");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
const out = process.argv[2] || "release-desk.html";
const index = read("index.html");
const shell = index.slice(index.indexOf("<!-- shell:start -->"), index.indexOf("<!-- shell:end -->"));
const data = existsSync(here("data.js")) ? read("data.js") : "";
const html = `<title>Batch Release Desk</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${read("styles.css")}
</style>
${shell}
<script>${safe(data)}</script>
<script>${safe(read("model.js"))}</script>
<script>${safe(read("app.js"))}</script>
`;
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
