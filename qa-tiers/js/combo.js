/**
 * Searchable drop-down lists.
 * A `<select data-combo>` gets a text box over it: type a few letters, the list narrows, pick with the mouse or
 * the arrow keys + Enter. The select stays in the form (hidden), so saving and every other code path are unchanged.
 * A `<input data-combo="text">` keeps free typing and proposes the values of its `<datalist>`; with `data-multi`
 * a pick is added to a comma-separated list (e.g. several batch numbers).
 */
import { esc } from "./ui.js";

const fold = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAX = 250;
let open = null; // the combo whose list is showing

function itemsOfSelect(sel) {
  const out = [];
  for (const node of sel.children) {
    if (node.tagName === "OPTGROUP") {
      if (node.hidden) continue;
      for (const o of node.children) out.push({ value: o.value, text: o.textContent, group: node.label });
    } else if (node.value !== "__add__") out.push({ value: node.value, text: node.value === "" ? "— none —" : node.textContent, group: "" });
  }
  return out;
}
function itemsOfList(input) {
  const dl = document.getElementById(input.dataset.src);
  return dl ? [...dl.options].map((o) => ({ value: o.value, text: o.label && o.label !== o.value ? `${o.value} — ${o.label}` : o.value, group: "" })) : [];
}

function closeOpen() {
  if (!open) return;
  open.pop.remove();
  open.box.classList.remove("open");
  open.input.setAttribute("aria-expanded", "false");
  open = null;
}
document.addEventListener("mousedown", (e) => { if (open && !open.box.contains(e.target) && !open.pop.contains(e.target)) closeOpen(); }, true);
window.addEventListener("resize", closeOpen);
document.addEventListener("scroll", (e) => { if (open && !open.pop.contains(e.target)) closeOpen(); }, true);

function place(c) {
  const r = c.input.getBoundingClientRect();
  const below = window.innerHeight - r.bottom, up = below < 240 && r.top > below;
  Object.assign(c.pop.style, { left: `${Math.max(8, r.left)}px`, width: `${Math.max(r.width, 260)}px`, maxHeight: `${Math.min(340, (up ? r.top : below) - 16)}px` });
  if (up) { c.pop.style.top = ""; c.pop.style.bottom = `${window.innerHeight - r.top + 4}px`; }
  else { c.pop.style.bottom = ""; c.pop.style.top = `${r.bottom + 4}px`; }
}

function makeCombo(el) {
  const isSelect = el.tagName === "SELECT";
  const multi = el.hasAttribute("data-multi");
  const canAdd = isSelect && !!el.querySelector('option[value="__add__"]');
  const box = document.createElement("div");
  box.className = "cb";
  let input;
  if (isSelect) {
    input = document.createElement("input");
    input.type = "text";
    input.className = `cb-in ${el.className}`;
    input.autocomplete = "off";
    input.placeholder = "Type to search…";
    el.before(box); box.append(input, el);
    el.hidden = true; el.tabIndex = -1;
  } else {
    input = el; input.classList.add("cb-in");
    el.before(box); box.append(el);
  }
  input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "false"); input.setAttribute("aria-autocomplete", "list");
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "cb-btn"; btn.tabIndex = -1; btn.setAttribute("aria-label", "Show the list"); btn.textContent = "▾";
  box.append(btn);
  const pop = document.createElement("div");
  pop.className = "cb-pop"; pop.setAttribute("role", "listbox");
  const c = { box, input, pop, active: 0, shown: [] };

  const label = () => { const o = el.selectedOptions?.[0]; return !o || o.value === "" || o.value === "__add__" ? "" : o.textContent; };
  const sync = () => { if (isSelect) input.value = label(); };
  el._cbSync = sync;
  sync();
  const token = () => (multi ? input.value.split(",").pop().trim() : input.value.trim());

  const render = (q) => {
    const items = isSelect ? itemsOfSelect(el) : itemsOfList(input);
    const f = fold(q);
    let list = items;
    if (f) {
      list = items.filter((x) => x.value !== "" && fold(x.text).includes(f));
      list.sort((a, b) => (fold(b.text).startsWith(f) - fold(a.text).startsWith(f)));
    }
    if (multi) { const have = new Set(input.value.split(",").map((x) => x.trim())); list = list.filter((x) => !have.has(x.value) || x.value === token()); }
    const more = list.length - MAX;
    list = list.slice(0, MAX);
    const exact = items.some((x) => fold(x.value) === f);
    c.shown = list.map((x) => ({ ...x, add: false }));
    if (canAdd && q.trim() && !exact) c.shown.push({ value: q.trim(), text: `＋ Add “${q.trim()}” to the list`, group: "", add: true });
    c.active = Math.min(c.active, Math.max(0, c.shown.length - 1));
    let lastG = null, html = "";
    c.shown.forEach((x, i) => {
      if (x.group && x.group !== lastG) { html += `<div class="cb-g">${esc(x.group)}</div>`; lastG = x.group; }
      const t = esc(x.text);
      const hl = f && !x.add ? t.replace(new RegExp(`(${esc(q.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"), "<mark>$1</mark>") : t;
      const cur = isSelect ? el.value === x.value && x.value !== "" : false;
      html += `<div class="cb-o${i === c.active ? " act" : ""}${x.add ? " add" : ""}${cur ? " cur" : ""}" role="option" data-i="${i}">${hl}</div>`;
    });
    if (!c.shown.length) html = `<div class="cb-empty">No match${canAdd ? "" : " — this list is fixed"}</div>`;
    if (more > 0) html += `<div class="cb-empty">${more} more — type to narrow</div>`;
    pop.innerHTML = html;
    pop.querySelector(".act")?.scrollIntoView({ block: "nearest" });
  };
  const show = (q = "") => {
    if (open !== c) { closeOpen(); document.body.append(pop); open = c; box.classList.add("open"); input.setAttribute("aria-expanded", "true"); }
    place(c); render(q);
  };
  const choose = (x) => {
    if (!x) return;
    if (isSelect) {
      if (x.add) { el.dataset.addValue = x.value; el.value = "__add__"; }
      else el.value = x.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
    } else {
      if (multi) { const parts = input.value.split(","); parts[parts.length - 1] = ` ${x.value}`; input.value = parts.map((p) => p.trim()).filter(Boolean).join(", "); }
      else input.value = x.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    closeOpen();
  };

  input.addEventListener("focus", () => { if (isSelect) input.select(); });
  input.addEventListener("click", () => show(isSelect ? "" : token()));
  input.addEventListener("input", (e) => { if (e.isTrusted !== false) { c.active = 0; show(isSelect ? input.value : token()); } });
  btn.addEventListener("click", () => { if (open === c) closeOpen(); else { input.focus(); show(""); } });
  pop.addEventListener("mousedown", (e) => e.preventDefault()); // keep the focus in the box
  pop.addEventListener("click", (e) => { const o = e.target.closest("[data-i]"); if (o) choose(c.shown[+o.dataset.i]); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (open !== c) { show(isSelect ? "" : token()); return; }
      c.active = Math.max(0, Math.min(c.shown.length - 1, c.active + (e.key === "ArrowDown" ? 1 : -1)));
      render(isSelect && input.value !== label() ? input.value : isSelect ? "" : token());
    } else if (e.key === "Enter" && open === c) {
      e.preventDefault(); choose(c.shown[c.active]);
    } else if (e.key === "Escape" && open === c) {
      e.preventDefault(); e.stopPropagation(); closeOpen(); sync();
    } else if (e.key === "Tab" && open === c && isSelect && input.value !== label() && input.value.trim()) {
      choose(c.shown.find((x) => !x.add) || null);
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement === input) return;
      if (isSelect) {
        const typed = input.value.trim();
        if (!typed && el.value) { el.value = ""; el.dispatchEvent(new Event("change", { bubbles: true })); }
        else if (typed && typed !== label()) {
          const hit = itemsOfSelect(el).find((x) => fold(x.value) === fold(typed) || fold(x.text) === fold(typed));
          if (hit) { el.value = hit.value; el.dispatchEvent(new Event("change", { bubbles: true })); }
        }
        sync();
      }
      if (open === c) closeOpen();
    }, 120);
  });
  el.addEventListener("change", () => setTimeout(sync, 0));
  el.dataset.cb = "1";
}

/** Turn every list of a container into a searchable one (short lists stay plain drop-downs). */
export function enhanceCombos(root, min = 7) {
  root.querySelectorAll("select[data-combo]:not([data-cb])").forEach((sel) => {
    if (sel.options.length >= min || sel.querySelector('option[value="__add__"]')) makeCombo(sel);
  });
  root.querySelectorAll("input[data-combo]:not([data-cb])").forEach(makeCombo);
}
