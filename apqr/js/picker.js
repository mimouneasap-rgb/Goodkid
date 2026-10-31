// Searchable drop-downs. Any <select> with many options opens a picker with a
// search box instead of the native list: type a few letters to jump to the
// match, then tap or press Enter. The <select> stays the source of truth: the
// picker sets its value and fires "change", so every existing handler works.
const MIN_OPTIONS = 8;
let pop = null;
let current = null;
let touch = null;
let openedAt = 0;

/** Scroll an option into view inside the picker list only (never the page). */
function reveal(el) {
  const list = el?.closest(".pk-list");
  if (!list) return;
  const top = el.offsetTop, bottom = top + el.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top - 4;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
}
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function enhanced(el) {
  return el && el.tagName === "SELECT" && !el.disabled && !el.multiple && el.options.length >= MIN_OPTIONS && !el.hasAttribute("data-native");
}

function items(sel) {
  const out = [];
  for (const node of sel.children) {
    if (node.tagName === "OPTGROUP") {
      out.push({ header: node.label });
      for (const o of node.children) out.push({ value: o.value, label: o.textContent, disabled: o.disabled });
    } else if (node.tagName === "OPTION") out.push({ value: node.value, label: node.textContent, disabled: node.disabled });
  }
  return out;
}

function close() {
  if (!pop) return;
  try { if (pop.matches(":popover-open")) pop.hidePopover(); } catch { /* ignore */ }
  pop.remove();
  pop = null;
  const s = current;
  current = null;
  s?.focus({ preventScroll: true });
}

function choose(value) {
  const sel = current;
  if (!sel) return;
  const changed = sel.value !== value;
  sel.value = value;
  close();
  if (changed) {
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function render(q) {
  const list = pop.querySelector(".pk-list");
  const all = items(current);
  const f = fold(q).trim();
  const words = f.split(/\s+/).filter(Boolean);
  let html = "";
  let pendingHeader = null;
  let n = 0;
  for (const it of all) {
    if (it.header !== undefined) { pendingHeader = it.header; continue; }
    const hay = fold(it.label);
    if (words.length && !words.every((w) => hay.includes(w))) continue;
    if (pendingHeader !== null) { html += `<div class="pk-h">${escH(pendingHeader)}</div>`; pendingHeader = null; }
    let label = escH(it.label);
    if (words.length) {
      // highlight the first word typed
      const i = hay.indexOf(words[0]);
      if (i >= 0) label = `${escH(it.label.slice(0, i))}<mark>${escH(it.label.slice(i, i + words[0].length))}</mark>${escH(it.label.slice(i + words[0].length))}`;
    }
    html += `<button type="button" class="pk-opt${it.value === current.value ? " sel" : ""}${it.disabled ? " dis" : ""}" data-v="${escH(it.value)}" role="option" aria-selected="${it.value === current.value}" ${it.disabled ? "disabled" : ""}>${label}</button>`;
    n++;
  }
  list.innerHTML = html || `<div class="pk-empty">No match for “${escH(q)}”</div>`;
  const first = list.querySelector(f ? ".pk-opt:not(.dis)" : ".pk-opt.sel") || list.querySelector(".pk-opt:not(.dis)");
  list.querySelectorAll(".pk-opt.act").forEach((b) => b.classList.remove("act"));
  if (first) { first.classList.add("act"); reveal(first); }
  pop.querySelector(".pk-count").textContent = `${n} of ${all.filter((x) => x.header === undefined).length}`;
}

function move(dir) {
  const opts = [...pop.querySelectorAll(".pk-opt:not(.dis)")];
  if (!opts.length) return;
  let i = opts.findIndex((b) => b.classList.contains("act"));
  opts[i]?.classList.remove("act");
  i = Math.max(0, Math.min(opts.length - 1, i + dir));
  opts[i].classList.add("act");
  reveal(opts[i]);
}

export function openPicker(sel) {
  close();
  current = sel;
  openedAt = performance.now();
  pop = document.createElement("div");
  pop.className = "picker";
  pop.setAttribute("role", "dialog");
  const label = sel.getAttribute("aria-label") || sel.closest("label")?.childNodes[0]?.textContent?.trim() || "Choose";
  pop.innerHTML = `<div class="pk-top"><input type="search" class="pk-q" placeholder="Type to search…" aria-label="Search ${escH(label)}" autocomplete="off" enterkeyhint="done"><span class="pk-count"></span></div><div class="pk-list" role="listbox" aria-label="${escH(label)}"></div>`;
  // Inside a modal dialog the picker must live in the dialog and in the top layer to sit above it.
  (sel.closest("dialog") || document.body).append(pop);
  if (typeof pop.showPopover === "function") { pop.setAttribute("popover", "manual"); try { pop.showPopover(); } catch { /* ignore */ } }
  // place under (or above) the select, inside the viewport
  const r = sel.getBoundingClientRect();
  const w = Math.min(Math.max(r.width, 280), innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  const spaceBelow = innerHeight - r.bottom - 8, spaceAbove = r.top - 8;
  const maxH = Math.min(420, Math.max(spaceBelow, spaceAbove));
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.maxHeight = `${maxH}px`;
  if (spaceBelow >= Math.min(300, maxH) || spaceBelow >= spaceAbove) pop.style.top = `${r.bottom + 4}px`;
  else pop.style.bottom = `${innerHeight - r.top + 4}px`;
  const q = pop.querySelector(".pk-q");
  render("");
  q.addEventListener("input", () => render(q.value));
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); const a = pop.querySelector(".pk-opt.act"); if (a) choose(a.dataset.v); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close();
  });
  pop.addEventListener("click", (e) => { const b = e.target.closest(".pk-opt"); if (b && !b.disabled) choose(b.dataset.v); });
  setTimeout(() => q.focus({ preventScroll: true }), 0);
}

export function initPicker() {
  // desktop: stop the native list and open the picker
  document.addEventListener("mousedown", (e) => {
    if (pop && !pop.contains(e.target) && e.target !== current) close();
    const sel = e.target.closest?.("select");
    if (!enhanced(sel) || e.button !== 0) return;
    e.preventDefault();
    if (current === sel && pop) { close(); return; }
    openPicker(sel);
  }, true);
  // touch: open on a tap (not on a scroll that started on the select)
  document.addEventListener("touchstart", (e) => {
    const sel = e.target.closest?.("select");
    touch = enhanced(sel) ? { sel, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    if (pop && !pop.contains(e.target) && !sel) close();
  }, { capture: true, passive: true });
  document.addEventListener("touchend", (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const moved = Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10;
    const sel = touch.sel;
    touch = null;
    if (moved || !enhanced(sel)) return;
    e.preventDefault();
    openPicker(sel);
  }, { capture: true, passive: false });
  document.addEventListener("click", (e) => { if (enhanced(e.target.closest?.("select"))) e.preventDefault(); }, true);
  // keyboard: Enter / Space / Alt+Down open the picker; typing letters keeps the native jump
  document.addEventListener("keydown", (e) => {
    const sel = e.target.closest?.("select");
    if (!enhanced(sel)) return;
    if (e.key === "Enter" || e.key === " " || (e.altKey && e.key === "ArrowDown") || e.key === "F4") { e.preventDefault(); openPicker(sel); }
  }, true);
  // On touch devices the on-screen keyboard resizes and scrolls the page, so only desktop closes on scroll.
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (!coarse) document.addEventListener("scroll", (e) => { if (pop && !pop.contains(e.target) && performance.now() - openedAt > 400) close(); }, true);
}
