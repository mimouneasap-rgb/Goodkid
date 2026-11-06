// Exports: every chart as a high-resolution PNG (screen 2×, high 3× or print
// 4×, in the light print theme or as on screen, on its card, white or
// transparent), copied to the clipboard, as a vector SVG or as the CSV table
// behind it — and every chart of a page in one ZIP. Files are saved through
// the host's download capability when the page runs as a published Artifact
// (plain browser download elsewhere).

import { store } from "./store.js";
import { toast, today, esc, toCSV } from "./ui.js";

/** Save a Blob as a file: the Artifact `downloads` capability, else a browser download. */
export async function saveFile(filename, blob) {
  const api = window.claude?.use ? await window.claude.use("downloads").catch(() => null) : null;
  if (api) {
    try { await api.save({ filename, data: blob }); toast(`${filename} saved`); return true; }
    catch (e) {
      if (e?.code === "declined") return false;
      if (e?.code !== "unavailable" && e?.code !== "not_granted") { toast(e?.code === "rejected_extension" ? "This file type cannot be saved here" : "The file could not be saved here"); return false; }
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast(`${filename} saved`);
  return true;
}

/** Load a library from a CDN once (docx, JSZip). */
const scripts = new Map();
export function loadScript(url, global) {
  if (window[global]) return Promise.resolve(window[global]);
  if (!scripts.has(url)) scripts.set(url, new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => (window[global] ? res(window[global]) : rej(new Error(`${global} library missing`)));
    s.onerror = () => { scripts.delete(url); rej(new Error("A library could not be loaded — check the connection and try again.")); };
    document.head.append(s);
  }));
  return scripts.get(url);
}
export const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
export const loadZip = () => loadScript(JSZIP_URL, "JSZip");

/** The table behind each analytics chart, for the CSV export: id → {title, head, rows, filters}. */
export const CHART_DATA = new Map();

// Computed properties copied onto the clone so the picture looks exactly like the screen.
const PROPS = [
  "display", "position", "top", "right", "bottom", "left", "box-sizing", "width", "height", "min-width", "min-height", "max-width",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style",
  "border-bottom-style", "border-left-style", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "background-color", "background-image", "box-shadow", "color", "opacity", "visibility", "overflow", "overflow-x", "overflow-y",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform", "text-align",
  "text-decoration-line", "white-space", "text-overflow", "word-break", "vertical-align", "list-style-type",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-items", "align-content", "align-self",
  "justify-content", "justify-items", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows",
  "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end", "grid-auto-flow", "aspect-ratio",
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-opacity",
  "paint-order", "text-anchor", "dominant-baseline", "transform", "transform-origin", "-webkit-line-clamp", "-webkit-box-orient",
];
const SVG_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "font-family", "font-size", "font-weight", "paint-order", "text-anchor", "dominant-baseline"];

function inline(src, dst) {
  if (src.nodeType !== 1) return;
  const cs = getComputedStyle(src);
  // boxes that hold text keep their natural width: the picture uses a fallback
  // font, and a width measured in the web font would make the text overflow
  const hasText = [...src.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const svg = src instanceof SVGElement;
  let css = "";
  for (const p of PROPS) {
    if (hasText && !svg && (p === "width" || p === "min-width" || p === "max-width")) continue;
    const v = cs.getPropertyValue(p);
    if (v) css += `${p}:${v};`;
  }
  dst.setAttribute("style", css);
  if (src.matches(".btn, select, input, [data-noexport]")) dst.setAttribute("data-drop", ""); // controls are for the screen, not the picture
  dst.removeAttribute("class");
  const a = src.children, b = dst.children;
  for (let i = 0; i < a.length; i++) inline(a[i], b[i]);
}

/** Run `fn` with the page drawn in another theme ("light", "dark"), then restore it. */
async function inTheme(theme, fn) {
  const root = document.documentElement;
  if (!theme || theme === "screen") return fn();
  const before = root.getAttribute("data-theme");
  root.dataset.theme = theme;
  void root.offsetHeight; // apply the theme before reading styles
  try { return await fn(); }
  finally { if (before == null) root.removeAttribute("data-theme"); else root.dataset.theme = before; }
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Render elements (a card, or a section made of several) to a PNG Blob.
 * background: a colour, "page", "card" or "transparent"; theme: "screen" | "light" | "dark". */
export async function renderPNG(elements, { scale = 3, footer = "", background = null, theme = "screen" } = {}) {
  const els = Array.isArray(elements) ? elements : [elements];
  return inTheme(theme, async () => {
    const width = Math.ceil(Math.max(...els.map((e) => e.getBoundingClientRect().width)));
    const pad = 24;
    const body = getComputedStyle(document.body);
    const bg = background === "transparent" ? "transparent" : background === "card" ? (cssVar("--surface") || "#ffffff") : background && background !== "page" ? background : body.backgroundColor;
    const wrap = document.createElement("div");
    wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    wrap.setAttribute("style", `width:${width}px;padding:${pad}px;box-sizing:content-box;background:${bg};font-family:${body.fontFamily};display:flex;flex-direction:column;gap:14px`);
    let height = pad * 2;
    for (const el of els) {
      const clone = el.cloneNode(true);
      inline(el, clone);
      clone.style.width = `${el.getBoundingClientRect().width}px`;
      clone.style.margin = "0";
      clone.querySelectorAll("[data-drop]").forEach((n) => n.remove()); // day tiles are buttons too: they stay
      wrap.append(clone);
      height += el.getBoundingClientRect().height + 14;
    }
    if (footer) {
      const f = document.createElement("div");
      f.textContent = footer;
      f.setAttribute("style", `font:12px ${body.fontFamily};color:${cssVar("--muted")}`);
      wrap.append(f);
      height += 22;
    }
    const xml = new XMLSerializer().serializeToString(wrap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + pad * 2}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`;
    const img = new Image();
    img.decoding = "sync";
    const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("render failed")); });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((width + pad * 2) * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (bg !== "transparent") { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
  });
}

/** The chart drawing of a card as a stand-alone vector SVG (styles inlined). */
export async function renderSVG(svgEl, { title = "", footer = "", theme = "light" } = {}) {
  return inTheme(theme, () => {
    const clone = svgEl.cloneNode(true);
    const walk = (a, b) => {
      if (a.nodeType !== 1) return;
      const cs = getComputedStyle(a);
      b.setAttribute("style", SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
      b.removeAttribute("class"); b.removeAttribute("data-tip");
      for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]);
    };
    walk(svgEl, clone);
    const vb = (svgEl.getAttribute("viewBox") || "0 0 600 300").split(/\s+/).map(Number);
    const [w, h] = [vb[2], vb[3]];
    const top = title ? 30 : 0, bottom = footer ? 22 : 0;
    const font = getComputedStyle(document.body).fontFamily.replace(/"/g, "'");
    const ink = cssVar("--ink") || "#1b2433", muted = cssVar("--muted") || "#6b7689", surface = cssVar("--surface") || "#ffffff";
    clone.removeAttribute("style");
    clone.setAttribute("x", "0"); clone.setAttribute("y", String(top)); clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
    const inner = new XMLSerializer().serializeToString(clone);
    const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + top + bottom}" viewBox="0 0 ${w} ${h + top + bottom}">
<rect width="100%" height="100%" fill="${surface}"/>
${title ? `<text x="0" y="20" style="font:600 15px ${font};fill:${ink}">${esc(title)}</text>` : ""}
${inner}
${footer ? `<text x="0" y="${h + top + 16}" style="font:10px ${font};fill:${muted}">${esc(footer)}</text>` : ""}
</svg>`;
    return new Blob([out], { type: "image/svg+xml" });
  });
}

export const slug = (s) => String(s || "chart").toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function exportFooter(extra = "") {
  const s = store.t2?.setup || {};
  const view = store.viewing ? ` · ${store.viewing.label}` : "";
  return `QA Tier Boards · ${s.site || ""} · data as of ${s.statusDate || today()}${view}${extra ? ` · ${extra}` : ""} · exported ${today()}`;
}

/** PNG options, remembered per viewer. */
export const pngPrefs = () => ({ scale: 3, theme: "light", bg: "card", footer: true, ...(store.prefs.png || {}) });
const setPngPrefs = (p) => { store.prefs.png = p; store.save(); };
const SCALES = [[2, "Screen · 2×"], [3, "High · 3×"], [4, "Print · 4× (≈ 300 dpi)"]];
const THEMES = [["light", "Light (print)"], ["screen", "As on screen"], ["dark", "Dark"]];
const BGS = [["card", "Card colour"], ["page", "Page colour"], ["white", "White"], ["transparent", "Transparent"]];

function titleOf(t) {
  const h2 = t.head?.querySelector("h2")?.cloneNode(true);
  h2?.querySelectorAll(".sub, .mono").forEach((n) => n.remove());
  return (h2?.textContent || t.host.querySelector(".ring-label")?.textContent || "chart").replace(/[◆◎▮▤☀⇪⇧]/g, "").trim();
}

function pngOf(t, p = pngPrefs()) {
  return renderPNG(t.els, { scale: p.scale, theme: p.theme, background: p.bg === "white" ? "#ffffff" : p.bg, footer: p.footer ? exportFooter() : "" });
}

function csvOf(id) {
  const d = CHART_DATA.get(id);
  if (!d?.head) return null;
  const pre = [[d.title], [exportFooter()], ...(d.filters?.length ? [[`Filters: ${d.filters.join(" · ")}`]] : []), []];
  return new Blob(["﻿" + toCSV([...pre, d.head, ...d.rows])], { type: "text/csv" });
}

function exportTargets(root) {
  const targets = [];
  root.querySelectorAll(".card").forEach((card) => {
    if (card.querySelector("svg.chart, .qcal") && !card.closest("[data-export-block]") && !card.closest(".report-host")) targets.push({ els: [card], head: card.querySelector(".card-head"), host: card });
  });
  root.querySelectorAll("[data-export-block]").forEach((block) => targets.push({ els: [block], head: block.querySelector(".card-head"), host: block }));
  return targets;
}

/** The small export menu of one chart. */
function openMenu(btn, t) {
  document.querySelectorAll(".xmenu").forEach((m) => m.remove());
  const p = pngPrefs();
  const title = titleOf(t);
  const id = t.host.dataset.chart;
  const svgEl = t.host.querySelector("svg.chart");
  const radio = (name, list, cur) => list.map(([v, l]) => `<label class="xopt"><input type="radio" name="${name}" value="${v}" ${String(cur) === String(v) ? "checked" : ""}>${esc(l)}</label>`).join("");
  const m = document.createElement("div");
  m.className = "xmenu";
  m.dataset.noexport = "";
  m.innerHTML = `<b class="xm-t">Export “${esc(title)}”</b>
    <div class="xm-g"><span>Resolution</span>${radio("scale", SCALES, p.scale)}</div>
    <div class="xm-g"><span>Colours</span>${radio("theme", THEMES, p.theme)}</div>
    <div class="xm-g"><span>Background</span>${radio("bg", BGS, p.bg)}</div>
    <label class="xopt"><input type="checkbox" name="footer" ${p.footer ? "checked" : ""}>Footer: site, data date, export date</label>
    <div class="xm-actions">
      <button class="btn sm primary" data-x="png">⤓ Save PNG</button>
      <button class="btn sm" data-x="copy">⧉ Copy picture</button>
      ${svgEl ? `<button class="btn sm" data-x="svg" title="Vector drawing of the chart: scales to any size">⤓ SVG vector</button>` : ""}
      ${id && CHART_DATA.get(id)?.head ? `<button class="btn sm" data-x="csv" title="The figures behind the chart">⤓ CSV data</button>` : ""}
    </div>`;
  document.body.append(m);
  const r = btn.getBoundingClientRect();
  m.style.top = `${Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6)}px`;
  m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  const read = () => ({ scale: +m.querySelector("[name=scale]:checked").value, theme: m.querySelector("[name=theme]:checked").value, bg: m.querySelector("[name=bg]:checked").value, footer: m.querySelector("[name=footer]").checked });
  m.addEventListener("change", () => setPngPrefs(read()));
  const close = () => { m.remove(); document.removeEventListener("pointerdown", away, true); };
  const away = (e) => { if (!m.contains(e.target) && e.target !== btn) close(); };
  setTimeout(() => document.addEventListener("pointerdown", away, true));
  m.addEventListener("click", async (e) => {
    const x = e.target.closest("[data-x]")?.dataset.x;
    if (!x) return;
    const opts = read();
    close();
    btn.disabled = true;
    try {
      const name = `${slug(title)}-${today()}`;
      if (x === "png") await saveFile(`${name}.png`, await pngOf(t, opts));
      if (x === "svg") await saveFile(`${name}.svg`, await renderSVG(svgEl, { title, footer: opts.footer ? exportFooter() : "", theme: opts.theme === "screen" ? null : opts.theme }));
      if (x === "csv") await saveFile(`${name}.csv`, csvOf(id));
      if (x === "copy") {
        try {
          // ClipboardItem accepts a promise, so the copy keeps the click's permission
          await navigator.clipboard.write([new ClipboardItem({ "image/png": pngOf(t, opts) })]);
          toast("Picture copied — paste it into a slide, an e-mail or a chat");
        } catch { toast("This browser blocked the copy here — use Save PNG instead"); }
      }
    } catch { toast("This chart could not be exported"); }
    btn.disabled = false;
  });
}

/** Every chart of a page in one ZIP: PNG pictures (+ the CSV tables of analytics charts). */
export async function exportAll(root, { name = "charts" } = {}) {
  const targets = exportTargets(root);
  if (!targets.length) { toast("No chart on this page"); return; }
  toast(`Preparing ${targets.length} charts…`);
  const JSZip = await loadZip();
  const zip = new JSZip();
  const p = pngPrefs();
  let n = 0;
  for (const t of targets) {
    n++;
    const base = `${String(n).padStart(2, "0")}-${slug(titleOf(t))}`;
    zip.file(`${base}.png`, await pngOf(t, p));
    const csv = t.host.dataset.chart ? csvOf(t.host.dataset.chart) : null;
    if (csv) zip.file(`${base}.csv`, csv);
  }
  zip.file("README.txt", `${exportFooter()}\r\n${targets.length} charts · PNG ${p.scale}× · ${THEMES.find(([v]) => v === p.theme)?.[1]} colours.\r\nThe eQMS remains the GMP record of truth: these pictures are a visual-management aid.\r\n`);
  const blob = await zip.generateAsync({ type: "blob" });
  await saveFile(`${slug(name)}-${today()}.zip`, blob);
}

/** Add an export button to every chart on the page. */
export function decorateCharts(root) {
  for (const t of exportTargets(root)) {
    if (t.host.querySelector(":scope [data-png]")) continue;
    const b = document.createElement("button");
    b.className = "btn sm ghost png-btn";
    b.dataset.png = "";
    b.dataset.noexport = "";
    b.type = "button";
    b.title = "Export this chart: PNG (high resolution), copy, SVG or CSV";
    b.innerHTML = `<span aria-hidden="true">⤓</span> Export`;
    b.onclick = (e) => { e.stopPropagation(); openMenu(b, t); };
    if (t.head) t.head.append(b);
    else { t.host.style.position ||= "relative"; t.host.classList.add("has-float"); b.classList.add("png-float"); t.host.append(b); }
  }
  root.querySelectorAll("[data-export-all]").forEach((b) => {
    if (b._wired) return;
    b._wired = true;
    b.onclick = async () => { b.disabled = true; try { await exportAll(root, { name: b.dataset.exportAll || document.title.split("·")[0] }); } catch (e) { toast(e.message || "The charts could not be exported"); } b.disabled = false; };
  });
}
