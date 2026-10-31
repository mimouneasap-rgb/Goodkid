// Small DOM helpers shared by every view: escaping, formatting, toasts,
// dialogs, the hover tooltip and icons.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/** Tagged template that escapes interpolations unless they are wrapped with raw(). */
export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v && v.__raw !== undefined) out += v.__raw;
      else if (Array.isArray(v)) out += v.map((x) => (x && x.__raw !== undefined ? x.__raw : esc(x))).join("");
      else out += esc(v);
    }
  });
  return { __raw: out, toString() { return out; } };
}
export const raw = (s) => ({ __raw: String(s ?? ""), toString() { return String(s ?? ""); } });

const nf = new Intl.NumberFormat("en-GB");
export const fmtN = (n) => (n === null || n === undefined || Number.isNaN(n) ? "–" : nf.format(n));
export const fmtPct = (x, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(d)}%`);
export function fmtDate(iso, withTime = false) {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const t = withTime && iso.length > 10 ? ` ${iso.slice(11, 16)}` : "";
  return `${d}/${m}/${y}${t}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtMonth = (iso) => (iso ? `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "–");
export const fmtMonthShort = (iso) => (iso ? `${MONTHS[+iso.slice(5, 7) - 1]} ’${iso.slice(2, 4)}` : "–");
export function fmtDays(n) {
  if (n === null || n === undefined) return "–";
  if (n === 0) return "today";
  return n > 0 ? `in ${n} d` : `${-n} d ago`;
}
export const plural = (n, one, many = one + "s") => `${fmtN(n)} ${n === 1 ? one : many}`;

/* ---------------------------------------------------------------- icons */

const ICONS = {
  dashboard: '<path d="M3 13h7V3H3zm0 8h7v-6H3zm11 0h7V11h-7zm0-18v6h7V3z"/>',
  tracker: '<path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z"/>',
  plan: '<path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v9H5zm2 2v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2z"/>',
  annexes: '<path d="M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z"/>',
  tasks: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
  workload: '<path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3m-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3m0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13m8 0c-.3 0-.6 0-1 .1a4.2 4.2 0 0 1 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5"/>',
  insights: '<path d="M12 2 1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z"/>',
  data: '<path d="M12 3C7 3 3 4.8 3 7v10c0 2.2 4 4 9 4s9-1.8 9-4V7c0-2.2-4-4-9-4m0 2c4.4 0 7 1.4 7 2s-2.6 2-7 2-7-1.4-7-2 2.6-2 7-2M5 9.7C6.6 10.5 9.2 11 12 11s5.4-.5 7-1.3V12c0 .6-2.6 2-7 2s-7-1.4-7-2zm0 5C6.6 15.5 9.2 16 12 16s5.4-.5 7-1.3V17c0 .6-2.6 2-7 2s-7-1.4-7-2z"/>',
  upload: '<path d="M5 20h14v-2H5zm7-16-5.5 5.5 1.4 1.4L11 7.8V16h2V7.8l3.1 3.1 1.4-1.4z"/>',
  download: '<path d="M5 20h14v-2H5zm7-4 5.5-5.5-1.4-1.4L13 12.2V4h-2v8.2L7.9 9.1 6.5 10.5z"/>',
  search: '<path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 4.5-4.5A4.5 4.5 0 0 1 9.5 14"/>',
  close: '<path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/>',
  sun: '<path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5M2 13h2v-2H2zm18 0h2v-2h-2zM11 2v2h2V2zm0 18v2h2v-2zM5.6 4.2 4.2 5.6l1.4 1.4L7 5.6zm12.8 12.8L17 18.4l1.4 1.4 1.4-1.4zM18.4 4.2 17 5.6l1.4 1.4 1.4-1.4zM5.6 17 4.2 18.4l1.4 1.4L7 18.4z"/>',
  moon: '<path d="M12.3 2a10 10 0 1 0 9.7 12.6A8 8 0 0 1 12.3 2"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>',
  edit: '<path d="M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z"/>',
  trash: '<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
  alert: '<path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8m.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7z"/>',
  dot: '<circle cx="12" cy="12" r="5"/>',
  arrowUp: '<path d="M4 12l1.4 1.4L11 7.8V20h2V7.8l5.6 5.6L20 12l-8-8z"/>',
  arrowDown: '<path d="M20 12l-1.4-1.4L13 16.2V4h-2v12.2l-5.6-5.6L4 12l8 8z"/>',
  flat: '<path d="M4 11h16v2H4z"/>',
  menu: '<path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>',
  back: '<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/>',
  people: '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4m0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4"/>',
  info: '<path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8"/>',
  table: '<path d="M3 3h18v18H3zm2 2v4h6V5zm8 0v4h6V5zm-8 6v4h6v-4zm8 0v4h6v-4zm-8 6v2h6v-2zm8 0v2h6v-2z"/>',
  chart: '<path d="M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z"/>',
  print: '<path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3m-3 11H8v-5h8zm3-7a1 1 0 1 1 1-1 1 1 0 0 1-1 1m-1-9H6v4h12z"/>',
  undo: '<path d="M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0 1 20.1 16l2.4-.8A10.5 10.5 0 0 0 12.5 8"/>',
  sparkle: '<path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7zM19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  history: '<path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2 4.9l-1.4 1.4A9 9 0 1 0 13 3m-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z"/>',
  filter: '<path d="M3 5h18l-7 8.5V20l-4-2v-4.5z"/>',
  link: '<path d="M10.6 13.4a1 1 0 0 0 1.4 1.4l4.6-4.6a3 3 0 0 0-4.2-4.2l-2 2 1.4 1.4 2-2a1 1 0 1 1 1.4 1.4zm2.8-2.8a1 1 0 0 0-1.4-1.4l-4.6 4.6a3 3 0 0 0 4.2 4.2l2-2-1.4-1.4-2 2a1 1 0 1 1-1.4-1.4z"/>',
};
export const icon = (name, cls = "") => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`);

/* ---------------------------------------------------------------- status */

export const RAG_META = {
  COMPLETE: { cls: "complete", label: "Complete", icon: "check" },
  "ON TRACK": { cls: "ontrack", label: "On track", icon: "dot" },
  "DUE SOON": { cls: "duesoon", label: "Due soon", icon: "clock" },
  OVERDUE: { cls: "overdue", label: "Overdue", icon: "alert" },
  "No tasks": { cls: "none", label: "No tasks", icon: "dot" },
  "NOT STARTED - overdue": { cls: "notstarted", label: "Not started, overdue", icon: "alert" },
  "Not yet due": { cls: "notyet", label: "Not yet triggered", icon: "clock" },
};
export const FQ_META = {
  Complete: { cls: "complete", label: "Final QA done", icon: "check" },
  "Raised, not complete": { cls: "ontrack", label: "Final QA raised", icon: "dot" },
  "NOT TRIGGERED - data ready": { cls: "overdue", label: "Raise Final QA", icon: "alert" },
  "Waiting on data collection": { cls: "none", label: "Waiting on annexes", icon: "clock" },
  "Not triggered": { cls: "notyet", label: "Not triggered", icon: "dot" },
};
export function fqPill(sig) {
  const m = FQ_META[sig] || FQ_META["Not triggered"];
  return html`<span class="pill pill-${m.cls}">${icon(m.icon)}${m.label}</span>`;
}
const SLOT_CLS = { OK: "ok", open: "open", MISSING: "missing", "Not triggered": "nt" };
export const slotCls = (st) => SLOT_CLS[st] || "nt";
export function slotChip(st) {
  const label = { OK: "OK", open: "Open", MISSING: "Missing", "Not triggered": "Not triggered" }[st] || st;
  return `<span class="stat-chip ${slotCls(st)}">${esc(label)}</span>`;
}
export function ragPill(rag) {
  const m = RAG_META[rag] || RAG_META["No tasks"];
  return html`<span class="pill pill-${m.cls}">${icon(m.icon)}${m.label}</span>`;
}
export function trackingPill(s) {
  const cls = /NOT STARTED - overdue/.test(s) ? "notstarted" : /past due|OVERDUE/i.test(s) ? "overdue" : /due soon|Partly/i.test(s) ? "duesoon" : /complete/i.test(s) ? "complete" : /Not yet|Not started/i.test(s) ? "none" : "ontrack";
  const ic = { overdue: "alert", notstarted: "alert", duesoon: "clock", complete: "check", none: "dot", ontrack: "dot" }[cls];
  return html`<span class="pill pill-${cls}">${icon(ic)}${s}</span>`;
}
export function movementBadge(mv) {
  if (mv === "UP") return html`<span class="mv mv-up" title="Up since baseline">${icon("arrowUp")}</span>`;
  if (mv === "DOWN") return html`<span class="mv mv-down" title="Down since baseline">${icon("arrowDown")}</span>`;
  if (mv === "flat") return html`<span class="mv mv-flat" title="No change since baseline">${icon("flat")}</span>`;
  return html`<span class="mv mv-new" title="New since baseline">new</span>`;
}

/* ---------------------------------------------------------------- toasts */

export function toast(message, { action, onAction, kind = "info", timeout = 5200 } = {}) {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `${icon(kind === "error" ? "alert" : kind === "success" ? "check" : "info")}<span>${esc(message)}</span>${action ? `<button class="toast-action">${esc(action)}</button>` : ""}`;
  host.append(el);
  const close = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 250); };
  el.querySelector(".toast-action")?.addEventListener("click", () => { onAction?.(); close(); });
  setTimeout(close, timeout);
}

/* --------------------------------------------------------------- dialogs */

/** Open a modal built from an HTML string. Returns the <dialog>. */
export function openDialog(content, { wide = false, onClose } = {}) {
  const d = document.createElement("dialog");
  d.className = `modal${wide ? " modal-wide" : ""}`;
  d.innerHTML = String(content);
  document.body.append(d);
  d.addEventListener("close", () => { onClose?.(d.returnValue); d.remove(); });
  d.addEventListener("click", (e) => { if (e.target === d) d.close("cancel"); });
  d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close("cancel")));
  d.showModal();
  return d;
}

export function confirmDialog({ title, body, confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const d = openDialog(html`<form method="dialog" class="modal-body">
      <h2 class="modal-title">${title}</h2>
      <p class="muted">${body}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" value="cancel" data-close type="button">Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" value="ok">${confirm}</button>
      </div></form>`, { onClose: (v) => resolve(v === "ok") });
    d.querySelector(".btn-primary, .btn-danger")?.focus();
  });
}

/* --------------------------------------------------------------- tooltip */

let tipEl;
export function initTooltip() {
  tipEl = document.createElement("div");
  tipEl.className = "tip";
  tipEl.setAttribute("role", "tooltip");
  document.body.append(tipEl);
  const show = (target, x, y) => {
    tipEl.innerHTML = target.getAttribute("data-tip");
    tipEl.classList.add("on");
    const r = tipEl.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    tipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  };
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) { tipEl.classList.remove("on"); return; }
    show(t, e.clientX, e.clientY);
  });
  document.addEventListener("focusin", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (t) { const r = t.getBoundingClientRect(); show(t, r.right, r.top); }
  });
  document.addEventListener("focusout", () => tipEl.classList.remove("on"));
  document.addEventListener("scroll", () => tipEl.classList.remove("on"), true);
}
/** Build tooltip HTML (escaped) from a title and rows of [label, value]. */
export function tip(title, rows = [], swatch) {
  const sw = swatch ? `<i class="tip-sw" style="background:${swatch}"></i>` : "";
  return esc(`<div class="tip-h">${sw}${esc(title)}</div>${rows.map(([k, v]) => `<div class="tip-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}`);
}

/**
 * Offer a file to the user. Inside the claude.ai viewer this goes through the
 * viewer's save prompt (the page cannot download directly there). Resolves
 * true when the file was handed over.
 */
export async function download(blob, filename) {
  if (typeof window.claude?.use === "function") {
    const dl = await window.claude.use("downloads").catch(() => null);
    if (!dl) { toast("Saving files isn’t available in this view.", { kind: "error" }); return false; }
    try { await dl.save({ filename, data: blob }); return true; }
    catch (e) {
      if (e?.code !== "declined") toast(e?.code === "rate_limited" ? "A save prompt is already open." : `The file couldn’t be saved (${e?.code || "error"}).`, { kind: "error" });
      return false;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}

export function debounce(fn, ms = 160) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
