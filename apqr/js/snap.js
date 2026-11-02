// High-resolution image export of any chart card.
// The card is redrawn as one self-contained SVG (backgrounds, borders, text
// lines, hatch and sheen, and every inline chart SVG with its computed styles
// inlined), with the page fonts embedded, then rasterised on a canvas at 3x.
// No library: works in the claude.ai viewer and in the stand-alone app.
import { download, toast, icon, esc } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const xe = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SKIP = ".tools, .seg-toggle, .png-btn, [data-noexport], button.btn, select, input, textarea, .tip";

/* ------------------------------------------------------------------ fonts */

let fontCss = null;
/** Google-Fonts CSS of the page with the latin woff2 files inlined as data URLs (cached). */
function embeddedFonts() {
  if (fontCss) return fontCss;
  fontCss = (async () => {
    try {
      const link = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis"]');
      if (!link) return "";
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const css = await (await fetch(link.href, { signal: ctl.signal })).text();
      const blocks = css.split("/*").map((b) => "/*" + b).filter((b) => /\/\*\s*latin\s*\*\//.test(b));
      const out = [];
      for (const b of blocks) {
        const m = b.match(/url\((https:[^)]+\.woff2)\)/);
        if (!m) continue;
        const buf = await (await fetch(m[1], { signal: ctl.signal })).arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        out.push(b.replace(/^\/\*[^*]*\*\//, "").replace(m[1], `data:font/woff2;base64,${btoa(bin)}`));
      }
      clearTimeout(timer);
      return out.join("\n");
    } catch { return ""; }
  })();
  return fontCss;
}

/* ------------------------------------------------------------- colour bits */

const alpha = (c) => { if (!c || c === "transparent") return 0; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
const firstColor = (s) => (s.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i) || [])[0];

/* -------------------------------------------------------------- walker */

function buildSvg(root, pad) {
  const R = root.getBoundingClientRect();
  const W = Math.ceil(R.width), H = Math.ceil(R.height);
  const out = [];
  const defs = new Map();
  let clipN = 0;
  const ox = (x) => (x - R.left + pad).toFixed(2);
  const oy = (y) => (y - R.top + pad).toFixed(2);
  const hatchId = (bg, line) => {
    const k = `h${defs.size}`;
    defs.set(k, `<pattern id="${k}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${bg}"/><rect width="1.6" height="5" fill="${line}"/></pattern>`);
    return k;
  };
  if (!defs.has("sheen")) defs.set("sheen", `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>`);

  // rad: number or [tl, tr, br, bl]
  const rectPath = (r, rad) => {
    const lim = Math.min(r.width / 2, r.height / 2);
    const [tl, tr, br, bl] = (Array.isArray(rad) ? rad : [rad, rad, rad, rad]).map((v) => Math.max(0, Math.min(v || 0, lim)));
    if (tl === tr && tr === br && br === bl) return `<rect x="${ox(r.left)}" y="${oy(r.top)}" width="${r.width.toFixed(2)}" height="${r.height.toFixed(2)}" rx="${tl.toFixed(2)}"`;
    const L = +ox(r.left), T = +oy(r.top), Rr = L + r.width, B = T + r.height;
    const f = (n) => n.toFixed(2);
    return `<path d="M${f(L + tl)},${f(T)} H${f(Rr - tr)} Q${f(Rr)},${f(T)} ${f(Rr)},${f(T + tr)} V${f(B - br)} Q${f(Rr)},${f(B)} ${f(Rr - br)},${f(B)} H${f(L + bl)} Q${f(L)},${f(B)} ${f(L)},${f(B - bl)} V${f(T + tl)} Q${f(L)},${f(T)} ${f(L + tl)},${f(T)} Z"`;
  };

  function text(node, cs, el) {
    const str = node.textContent;
    if (!str.trim()) return;
    const range = document.createRange();
    const parts = str.split(/(\s+)/);
    let pos = 0;
    const lines = [];
    for (const part of parts) {
      const start = pos; pos += part.length;
      if (!part.trim()) continue;
      range.setStart(node, start); range.setEnd(node, pos);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = rects[0];
      if (r.width === 0) continue;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - r.top) < r.height * 0.5) { last.text += (start > last.end ? " " : "") + part; last.right = r.right; last.end = pos; }
      else lines.push({ text: part, left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, end: pos });
    }
    // clip to an ellipsis container
    const clipEl = el.closest ? el : null;
    let clipRight = Infinity;
    if (clipEl) { const pcs = getComputedStyle(clipEl); if (pcs.textOverflow === "ellipsis" || pcs.overflow === "hidden") clipRight = clipEl.getBoundingClientRect().right; }
    const size = parseFloat(cs.fontSize);
    const tt = cs.textTransform;
    for (const l of lines) {
      let t = tt === "uppercase" ? l.text.toUpperCase() : l.text;
      if (l.right > clipRight + 1) {
        const ratio = (clipRight - l.left) / Math.max(1, l.right - l.left);
        t = t.slice(0, Math.max(1, Math.floor(t.length * ratio) - 1)) + "…";
      }
      const base = l.top + l.height / 2 + size * 0.35;
      out.push(`<text x="${ox(l.left)}" y="${oy(base)}" fill="${cs.color}" font-family="${xe(cs.fontFamily)}" font-size="${size}" font-weight="${cs.fontWeight}"${cs.letterSpacing !== "normal" ? ` letter-spacing="${cs.letterSpacing}"` : ""}${cs.fontStyle === "italic" ? ' font-style="italic"' : ""}${cs.fontVariantNumeric?.includes("tabular") ? ' style="font-variant-numeric:tabular-nums"' : ""}>${xe(t)}</text>`);
    }
  }

  const SVG_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight", "letter-spacing", "stop-color", "stop-opacity", "visibility"];
  function inlineSvg(svg) {
    const r = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll("*")];
    const dst = [clone, ...clone.querySelectorAll("*")];
    src.forEach((s, i) => {
      const d = dst[i];
      const cs = getComputedStyle(s);
      const st = SVG_PROPS.map((p) => { const v = cs.getPropertyValue(p); return v ? `${p}:${v}` : ""; }).filter(Boolean);
      if (s.tagName === "text" || s.tagName === "tspan") st.push(`font-variant-numeric:${cs.fontVariantNumeric}`);
      d.setAttribute("style", st.join(";"));
      d.removeAttribute("class");
      d.removeAttribute("data-tip");
    });
    clone.setAttribute("x", ox(r.left)); clone.setAttribute("y", oy(r.top));
    clone.setAttribute("width", r.width.toFixed(2)); clone.setAttribute("height", r.height.toFixed(2));
    clone.removeAttribute("class");
    clone.setAttribute("overflow", "visible");
    // unique ids per export, and url(...) references normalised to local ids
    const pre = `x${++clipN}`;
    let str = new XMLSerializer().serializeToString(clone);
    str = str.replace(/url\((?:&quot;|"|')?[^)#]*#([A-Za-z0-9_-]+)(?:&quot;|"|')?\)/g, (_, id) => `url(#${pre}${id})`).replace(/\sid="([^"]+)"/g, (_, id) => ` id="${pre}${id}"`);
    out.push(str);
  }

  function walk(el) {
    if (el.nodeType !== 1) return;
    if (el.matches(SKIP)) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;
    if (el instanceof SVGSVGElement) { inlineSvg(el); return; }
    const r = el.getBoundingClientRect();
    const rad = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((p) => parseFloat(cs[p]) || 0);
    if (r.width > 0 && r.height > 0) {
      const bg = cs.backgroundColor;
      const img = cs.backgroundImage;
      let fill = alpha(bg) > 0 ? bg : null;
      if (!fill && img && img !== "none" && !/repeating/.test(img) && !/255,\s*255,\s*255|255 255 255/.test(img)) fill = firstColor(img);
      if (fill) out.push(`${rectPath(r, rad)} fill="${fill}"/>`);
      if (img && /repeating-linear-gradient/.test(img)) {
        const line = firstColor(img) || "rgba(13,19,48,.16)";
        out.push(`${rectPath(r, rad)} fill="url(#${hatchId(fill || "transparent", line)})"/>`);
      } else if (img && /255,\s*255,\s*255|255 255 255/.test(img) && fill) {
        out.push(`${rectPath(r, rad)} fill="url(#sheen)"/>`);
      }
      const bw = parseFloat(cs.borderTopWidth), bc = cs.borderTopColor;
      const same = ["Right", "Bottom", "Left"].every((sd) => cs[`border${sd}Width`] === cs.borderTopWidth && cs[`border${sd}Color`] === bc);
      if (same && bw > 0 && alpha(bc) > 0) out.push(`${rectPath({ left: r.left + bw / 2, top: r.top + bw / 2, width: r.width - bw, height: r.height - bw }, rad.map((v) => Math.max(0, v - bw / 2)))} fill="none" stroke="${bc}" stroke-width="${bw}"/>`);
      else {
        for (const [sd, x1, y1, x2, y2] of [["Top", r.left, r.top, r.right, r.top], ["Bottom", r.left, r.bottom, r.right, r.bottom], ["Left", r.left, r.top, r.left, r.bottom], ["Right", r.right, r.top, r.right, r.bottom]]) {
          const w = parseFloat(cs[`border${sd}Width`]), c = cs[`border${sd}Color`];
          if (w > 0 && alpha(c) > 0 && cs[`border${sd}Style`] !== "none") out.push(`<line x1="${ox(x1)}" y1="${oy(y1)}" x2="${ox(x2)}" y2="${oy(y2)}" stroke="${c}" stroke-width="${w}"/>`);
        }
      }
      // inset bottom shadow used by the department cells
      const sh = cs.boxShadow;
      const ins = sh && sh.match(/(rgba?\([^)]*\)|#[0-9a-f]+)\s+0px\s+-(\d+)px\s+0px\s+(?:0px\s+)?inset|inset\s+0px\s+-(\d+)px\s+0px\s+(?:0px\s+)?(rgba?\([^)]*\)|#[0-9a-f]+)/i);
      if (ins) { const h = +(ins[2] || ins[3]); const c = ins[1] || ins[4]; out.push(`<rect x="${ox(r.left)}" y="${oy(r.bottom - h)}" width="${r.width.toFixed(2)}" height="${h}" fill="${c}"/>`); }
    }
    for (const n of el.childNodes) {
      if (n.nodeType === 3) text(n, cs, el);
      else walk(n);
    }
  }
  walk(root);
  return { W, H, body: out.join("\n"), defs: [...defs.values()].join("") };
}

/**
 * Render an element to a PNG Blob.
 * opts: { scale = 3, pad = 28, footer = "", background }
 */
export async function elementToPng(el, { scale = 3, pad = 28, footer = "", background } = {}) {
  const fonts = await embeddedFonts();
  const { W, H, body, defs } = buildSvg(el, pad);
  const cs = getComputedStyle(document.body);
  const bg = background || cs.backgroundColor || "#f3f5fa";
  const footH = footer ? 26 : 0;
  const TW = W + pad * 2, TH = H + pad * 2 + footH;
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#6b7290";
  const svg = `<svg xmlns="${NS}" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><style>${fonts}</style><defs>${defs}</defs><rect width="100%" height="100%" fill="${bg}"/>${body}${footer ? `<text x="${pad}" y="${TH - pad / 2 - 4}" fill="${muted}" font-family="Manrope, Segoe UI, Arial, sans-serif" font-size="${Math.min(11, Math.max(8, (W / Math.max(1, footer.length)) * 1.8)).toFixed(1)}" font-weight="600">${xe(footer)}</text>` : ""}</svg>`;
  const img = new Image();
  img.decoding = "sync";
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    img.src = url;
    await img.decode();
    scale = Math.max(scale, Math.min(5, 2400 / TW));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(TW * scale);
    canvas.height = Math.round(TH * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, TW, TH);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    return { blob, width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}

const slug = (s) => String(s || "chart").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "chart";

let footerText = () => "APQR Master Tracker";
export function setExportFooter(fn) { footerText = fn; }

/** Save one card as PNG. */
export async function exportCardPng(card) {
  const title = card.querySelector(".card-h h3, .card-h h2, h3, h2")?.textContent.trim() || "chart";
  const btn = card.querySelector(".png-btn");
  btn?.classList.add("busy");
  try {
    const { blob, width, height } = await elementToPng(card, { footer: footerText(title) });
    const ok = await download(blob, `APQR_${slug(title)}.png`);
    if (ok) toast(`Saved “${title}” as PNG (${width} × ${height} px).`, { kind: "success" });
  } catch (e) {
    console.error(e);
    toast("The image couldn’t be created in this browser.", { kind: "error" });
  } finally { btn?.classList.remove("busy"); }
}

/** Add a PNG button to every card that holds a chart. */
export function enhanceCards(root) {
  for (const card of root.querySelectorAll(".card")) {
    if (card.querySelector(".png-btn")) continue;
    if (!card.querySelector("svg.chart, .hbars, .segbar, svg.ring, .heat, .slots")) continue;
    let head = card.querySelector(".card-h");
    if (!head) continue;
    let tools = head.querySelector(".tools");
    if (!tools) { tools = document.createElement("div"); tools.className = "tools"; head.append(tools); }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "png-btn";
    b.title = "Download as PNG (high resolution)";
    b.setAttribute("aria-label", `Download “${head.querySelector("h3,h2")?.textContent.trim() || "chart"}” as PNG`);
    b.innerHTML = String(icon("image"));
    tools.prepend(b);
  }
}
export function bindCardExport() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".png-btn");
    if (!b) return;
    e.preventDefault();
    const card = b.closest(".card");
    if (card) exportCardPng(card);
  });
}
export { esc };
