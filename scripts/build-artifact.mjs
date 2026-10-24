// Packs the QE Investigator into one self-contained HTML file (styles and
// scripts inline) for publishing as a claude.ai artifact: dist/qe-investigator.html.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFile(root + p, "utf8");

const bundle = await build({
  entryPoints: [root + "qe/js/app.js"], bundle: true, format: "esm", platform: "browser",
  target: "es2022", minify: true, write: false, legalComments: "none",
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = (await read("css/styles.css")) + "\n" + (await read("qe/css/qe.css"));
const html = await read("qe/index.html");

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/\s*<script type="module" src="js\/app\.js"><\/script>/, "");

// The publish step adds the doctype, head and body skeleton itself.
const page = `${title}
${fonts}
<style>
${css.replace(/<\/style/gi, "<\\/style")}
</style>
${body.trim()}
<script type="module">
${js}
</script>
`;
await mkdir(root + "dist", { recursive: true });
await writeFile(root + "dist/qe-investigator.html", page);
console.log(`dist/qe-investigator.html: ${(page.length / 1024).toFixed(0)} KB`);
