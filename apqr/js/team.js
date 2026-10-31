// Team publishing: when the tracker runs as a claude.ai page, an editor can
// publish the current data as the page's new version, so everyone who opens
// the link sees the same tracker. The page rebuilds its own document: the
// fixed head, its stylesheet, the pristine app shell, the data as a JSON
// block and its own script. Outside claude.ai none of this is shown.

// The skeleton claude.ai wraps every page in (kept byte-identical so later
// publishes from the tool replace it instead of nesting it).
const SKELETON_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';

export const PAGE_HEAD = `<title>APQR Master Tracker</title>
<meta name="description" content="APQR programme tracker">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap">
<meta name="theme-color" content="#0a1230">`;
export const THEME_SCRIPT = `<script>try { const t = localStorage.getItem("apqr-theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>`;

// Capture the untouched shell before the app renders into it.
let shellHtml = null;
if (typeof document !== "undefined") {
  const el = document.getElementById("apqr-shell");
  if (el) shellHtml = el.outerHTML;
}

export const inViewer = () => typeof window !== "undefined" && typeof window.claude?.use === "function";

/** Can this copy rebuild itself? (Only the published single-file page can.) */
export function canRebuild() {
  return !!(shellHtml && document.getElementById("apqr-css") && document.getElementById("apqr-app"));
}

export function buildDocument(state) {
  const css = document.getElementById("apqr-css")?.textContent;
  const app = document.getElementById("apqr-app")?.textContent;
  if (!css || !app || !shellHtml) throw new Error("This copy of the page can’t republish itself.");
  const seed = JSON.stringify(state).replace(/</g, "\\u003c");
  return `${SKELETON_HEAD}\n${PAGE_HEAD}\n<style id="apqr-css">${css}</style>\n${THEME_SCRIPT}\n${shellHtml}\n<script type="application/json" id="apqr-seed">${seed}</script>\n<script type="module" id="apqr-app">${app}</script>\n</body></html>`;
}

/** { available, canEdit } — available: the viewer can republish this page at all. */
export async function teamStatus() {
  if (!inViewer() || !canRebuild()) return { available: false, canEdit: false };
  const [art, user] = await Promise.all([window.claude.use("artifact").catch(() => null), window.claude.use("user").catch(() => null)]);
  if (!art) return { available: false, canEdit: false };
  let canEdit = null;
  try { canEdit = user ? await user.canEdit() : null; } catch { canEdit = null; }
  return { available: true, canEdit };
}

/** Publish the state as the page's new version. Every open view reloads to it. */
export async function publishForTeam(state) {
  const art = await window.claude.use("artifact");
  if (!art) throw Object.assign(new Error("Publishing isn’t available in this view."), { code: "unavailable" });
  await art.publish(buildDocument(state));
}
