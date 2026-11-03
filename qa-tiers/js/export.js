// Exports: any chart card to a high-resolution PNG, and files saved through
// the host's download capability when the page runs as a published Artifact
// (plain browser download elsewhere).

import { store } from "./store.js";
import { toast, today } from "./ui.js";

/** Save a Blob as a file: the Artifact `downloads` capability, else a browser download. */
export async function saveFile(filename, blob) {
  const api = window.claude?.use ? await window.claude.use("downloads").catch(() => null) : null;
  if (api) {
    try { await api.save({ filename, data: blob }); toast(`${filename} saved`); }
    catch (e) { if (e?.code !== "declined") toast(e?.code === "rejected_extension" ? "This file type cannot be saved here" : "The file could not be saved here"); }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`${filename} saved`);
}

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
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "stroke-opacity",
  "paint-order", "text-anchor", "dominant-baseline", "transform", "transform-origin", "-webkit-line-clamp", "-webkit-box-orient",
];

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
  if (src.matches(".btn, select, input")) dst.setAttribute("data-drop", ""); // controls are for the screen, not the picture
  dst.removeAttribute("class");
  const a = src.children, b = dst.children;
  for (let i = 0; i < a.length; i++) inline(a[i], b[i]);
}

/** Render elements (a card, or a section made of several) to a PNG Blob. */
export async function renderPNG(elements, { scale = 3, footer = "", background = null } = {}) {
  const els = Array.isArray(elements) ? elements : [elements];
  const width = Math.ceil(Math.max(...els.map((e) => e.getBoundingClientRect().width)));
  const pad = 24;
  const body = getComputedStyle(document.body);
  const bg = background || body.backgroundColor;
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
    f.setAttribute("style", `font:12px ${body.fontFamily};color:${getComputedStyle(document.documentElement).getPropertyValue("--muted")}`);
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
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
}

const slug = (s) => String(s || "chart").toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function exportFooter() {
  const s = store.t2?.setup || {};
  return `QA Tier Boards · ${s.site || ""} · data as of ${s.statusDate || today()} · exported ${today()}`;
}

/** Add a "PNG" button to every chart on the page. */
export function decorateCharts(root) {
  const targets = [];
  root.querySelectorAll(".card").forEach((card) => {
    if (card.querySelector("svg.chart, .qcal") && !card.closest("[data-export-block]")) targets.push({ els: [card], head: card.querySelector(".card-head"), host: card });
  });
  root.querySelectorAll("[data-export-block]").forEach((block) => targets.push({ els: [block], head: block.querySelector(".card-head"), host: block }));
  for (const t of targets) {
    if (t.host.querySelector(":scope [data-png]")) continue;
    const h2 = t.head?.querySelector("h2")?.cloneNode(true);
    h2?.querySelectorAll(".sub, .mono").forEach((n) => n.remove());
    const title = (h2?.textContent || t.host.querySelector(".ring-label")?.textContent || "chart").replace(/[◆◎▮▤☀⇪⇧]/g, "").trim();
    const b = document.createElement("button");
    b.className = "btn sm ghost png-btn";
    b.dataset.png = "";
    b.dataset.noexport = "";
    b.type = "button";
    b.title = "Export this chart as a high-resolution PNG";
    b.innerHTML = `<span aria-hidden="true">⤓</span> PNG`;
    b.onclick = async () => {
      b.disabled = true;
      try { await saveFile(`${slug(title)}-${today()}.png`, await renderPNG(t.els, { footer: exportFooter() })); }
      catch { toast("This chart could not be exported"); }
      b.disabled = false;
    };
    if (t.head) t.head.append(b);
    else { t.host.style.position ||= "relative"; b.classList.add("png-float"); t.host.append(b); }
  }
}
