// Small DOM helpers shared by every view: escaping, formatting, toasts,
// confirm dialogs, the record drawer and the hover tooltip.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Replace an element by a listener-free copy (views that re-render themselves). */
export function fresh(el) {
  const n = el.cloneNode(false);
  el.replaceWith(n);
  return n;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}-${MON[+iso.slice(5, 7) - 1]}-${iso.slice(2, 4)}` : "");
export function fmtLong(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()]} ${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}
export const fmtMonth = (iso) => (iso ? `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "");
export const dow = (iso) => DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function pct(v, digits = 0) {
  if (v === "" || v == null || Number.isNaN(+v)) return "—";
  return `${(v * 100).toFixed(digits)} %`;
}
export function fmtNum(v, digits = 1) {
  if (v === "" || v == null || Number.isNaN(+v)) return "—";
  return Number.isInteger(+v) ? String(v) : (+v).toFixed(digits);
}
/** Format a KPI actual by its unit (count · % · ratio · r · n). */
export function fmtKpi(value, unit) {
  if (value === "" || value == null) return "—";
  if (unit === "%") return pct(value);
  if (unit === "ratio" || unit === "r") return fmtNum(value, 2);
  if (typeof value === "number") return fmtNum(value, 1);
  return esc(value);
}

/** Status / live-status → pill class. */
export function statusClass(s) {
  if (!s) return "";
  if (/overdue|critical|rejected|failed|^no$|overloaded|^red$|absent|off target/i.test(s)) return "R";
  if (/closed|released|completed|done|resolved|implemented|passed|^yes$|normal|^green$|^ok$|on target|present/i.test(s)) return "G";
  if (/hold|high load|^amber$|returned|watch|effectiveness|approval|review|pending|leave|training|in progress|in course/i.test(s)) return "A";
  return "info";
}
export const pill = (s, cls = statusClass(s)) => (s === "" || s == null ? "" : `<span class="pill ${cls}">${esc(s)}</span>`);

let toastTimer;
export function toast(msg, action) {
  $(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn sm">${esc(action.label)}</button>` : ""}`;
  if (action) t.querySelector("button").onclick = () => { action.run(); t.remove(); };
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 6000 : 2600);
}

/** Promise-based confirm dialog. */
export function confirmDialog({ title, body, ok = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    const d = document.createElement("div");
    d.className = "dialog";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.innerHTML = `<h2>${esc(title)}</h2><div>${body}</div><div class="actions">
      <button class="btn" data-no>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(ok)}</button></div>`;
    const close = (v) => { ov.remove(); d.remove(); document.removeEventListener("keydown", key); resolve(v); };
    const key = (e) => { if (e.key === "Escape") close(false); };
    d.querySelector("[data-no]").onclick = () => close(false);
    d.querySelector("[data-yes]").onclick = () => close(true);
    ov.onclick = () => close(false);
    document.addEventListener("keydown", key);
    document.body.append(ov, d);
    d.querySelector("[data-yes]").focus();
  });
}

/** Prompt for a single text value. */
export function promptDialog({ title, label, value = "", ok = "Add" }) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "overlay";
    const d = document.createElement("form");
    d.className = "dialog";
    d.innerHTML = `<h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input name="v" value="${esc(value)}" required autocomplete="off"></label>
      <div class="actions"><button type="button" class="btn" data-no>Cancel</button><button class="btn primary">${esc(ok)}</button></div>`;
    const close = (v) => { ov.remove(); d.remove(); resolve(v); };
    d.querySelector("[data-no]").onclick = () => close(null);
    ov.onclick = () => close(null);
    d.onsubmit = (e) => { e.preventDefault(); close(d.v.value.trim() || null); };
    d.onkeydown = (e) => { if (e.key === "Escape") close(null); };
    document.body.append(ov, d);
    d.v.focus();
  });
}

/** Large modal (stand-up mode, help). Returns { el, close }. */
export function modal(html, { onClose } = {}) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  const d = document.createElement("div");
  d.className = "dialog lg";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.innerHTML = html;
  const close = () => { ov.remove(); d.remove(); document.removeEventListener("keydown", key); onClose?.(); };
  const key = (e) => { if (e.key === "Escape") close(); };
  ov.onclick = close;
  document.addEventListener("keydown", key);
  document.body.append(ov, d);
  return { el: d, close };
}

/** Side drawer. Returns { el, close }. */
export function drawer({ title, sub = "", body, footer = "", wide = false, onClose }) {
  closeDrawer();
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.dataset.drawer = "";
  const d = document.createElement("aside");
  d.className = `drawer${wide ? " wide" : ""}`;
  d.dataset.drawer = "";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.innerHTML = `<header><div class="row"><h2>${title}</h2><span class="spacer"></span><button class="btn ghost sm" data-close aria-label="Close">✕</button></div>${sub}</header>
    <div class="body">${body}</div><footer>${footer}</footer>`;
  const close = () => { ov.remove(); d.remove(); document.removeEventListener("keydown", key); onClose?.(); };
  const key = (e) => { if (e.key === "Escape" && !document.querySelector(".dialog")) close(); };
  d.querySelector("[data-close]").onclick = close;
  ov.onclick = close;
  document.addEventListener("keydown", key);
  document.body.append(ov, d);
  d._close = close;
  return { el: d, close };
}
export function closeDrawer() {
  const d = document.querySelector("aside.drawer");
  if (d?._close) d._close();
}

/** Hover tooltips for any element carrying data-tip. */
export function initTooltips() {
  let tip;
  const hide = () => { tip?.remove(); tip = null; };
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) return hide();
    hide();
    tip = document.createElement("div");
    tip.className = "tip";
    tip.innerHTML = esc(t.dataset.tip).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    document.body.append(tip);
  });
  document.addEventListener("pointermove", (e) => {
    if (!tip) return;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
  document.addEventListener("pointerout", (e) => { if (e.target.closest?.("[data-tip]")) hide(); });
  addEventListener("scroll", hide, true);
}

/** Offer a file: a panel with Copy and Download, since some hosts block direct downloads. */
export function download(name, text, type = "text/plain") {
  const { el, close } = modal(`<div class="row"><h2>${esc(name)}</h2><span class="spacer"></span><button class="btn ghost" data-x aria-label="Close">✕</button></div>
    <p class="muted" style="margin:0">Copy the content and paste it into a file, or download it where your browser allows.</p>
    <textarea readonly id="export-text" class="input" style="width:100%;height:260px;font:12px var(--font-mono)">${esc(text)}</textarea>
    <div class="actions"><button class="btn" data-dl>Download</button><button class="btn primary" data-copy>Copy</button></div>`);
  const ta = el.querySelector("textarea");
  el.querySelector("[data-x]").onclick = close;
  el.querySelector("[data-copy]").onclick = () => {
    navigator.clipboard?.writeText(text).then(() => toast("Copied"), () => { ta.select(); toast("Press Ctrl + C to copy"); })
      ?? (ta.select(), toast("Press Ctrl + C to copy"));
  };
  el.querySelector("[data-dl]").onclick = () => saveFile(name, text, type);
}

function saveFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function toCSV(rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
