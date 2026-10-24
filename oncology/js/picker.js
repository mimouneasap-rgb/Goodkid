// Picker: choose one or several values from the app's own data (rooms, assets, SOPs, people, positions, products…) by
// typing a few letters. A value already stored that is not in the list is kept and marked. `free` also accepts a value
// typed by hand (people imported from Scigeniq, for instance).
import { h } from "./ui.js";
import { t } from "./i18n.js";

let seq = 0;
const norm = (x) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const splitDefault = (v) => String(v ?? "").split(/\s*[;\n]\s*/).map((x) => x.trim()).filter(Boolean);

/**
 * options: [[value, label?, sub?]]; value: the stored text; multi: several values joined with `sep`; parse: stored text →
 * values (default: split on ";" and new lines). The element's `.value` is the stored text ("" when empty).
 */
export function picker({ id, options = [], value, multi = false, free = false, sep = "; ", parse = splitDefault, placeholder, onChange, max = 60 } = {}) {
  const n = ++seq;
  const opts = options.filter((o) => o?.[0] != null && o[0] !== "").map(([v, label, sub]) => ({ v: String(v), label: String(label ?? v), sub: sub ?? null, k: norm(`${v} ${label ?? ""} ${sub ?? ""}`) }));
  const byV = new Map(opts.map((o) => [o.v, o]));
  let sel = multi ? parse(value) : value == null || value === "" ? [] : [String(value)];
  let active = -1, shown = [];
  const listId = `pk${n}-list`;
  const input = h("input.pk-input", { id, type: "text", role: "combobox", autocomplete: "off", "aria-expanded": "false", "aria-controls": listId, "aria-autocomplete": "list",
    placeholder: placeholder ?? (multi ? t("pk_add") : t("pk_choose")) });
  const chips = h("span.pk-chips");
  const list = h("ul.pk-list", { id: listId, role: "listbox", hidden: true });
  const clear = h("button.pk-clear", { type: "button", tabindex: "-1", "aria-label": t("pk_clear"), title: t("pk_clear"), onclick: () => { set([]); input.value = ""; input.focus(); } }, "×");
  const box = h(`div.pk${multi ? ".pk-multi" : ""}`, chips, input, multi ? null : clear, list);
  const labelOf = (v) => byV.get(v)?.label ?? v;
  const emit = () => onChange?.(box.value);
  const set = (xs) => { sel = xs; draw(); emit(); };
  const draw = () => {
    if (multi) {
      chips.replaceChildren(...sel.map((v) => h("span.pk-chip", { class: byV.has(v) ? "" : "pk-unknown", title: byV.has(v) ? byV.get(v).sub ?? "" : t("pk_not_listed") }, labelOf(v),
        h("button", { type: "button", tabindex: "-1", "aria-label": `${t("pk_remove")} ${labelOf(v)}`, onclick: () => set(sel.filter((x) => x !== v)) }, "×"))));
    } else if (document.activeElement !== input) input.value = sel[0] != null ? labelOf(sel[0]) : "";
    box.classList.toggle("pk-has", sel.length > 0);
    box.classList.toggle("pk-unknown-one", !multi && sel.length > 0 && !byV.has(sel[0]));
  };
  const open = () => {
    const q = norm(input.value.trim());
    const pool = opts.filter((o) => !(multi && sel.includes(o.v)));
    // single choice: an untouched box shows the whole list
    const words = !multi && sel[0] != null && input.value === labelOf(sel[0]) ? [] : q.split(/\s+/).filter(Boolean);
    shown = pool.filter((o) => words.every((w) => o.k.includes(w))).slice(0, max);
    const typed = input.value.trim();
    const extra = free && typed && !opts.some((o) => norm(o.v) === norm(typed) || norm(o.label) === norm(typed)) ? [{ v: typed, label: t("pk_use", typed), free: true }] : [];
    shown = shown.length ? [...shown, ...extra] : extra;
    active = shown.length ? 0 : -1;
    list.replaceChildren(...(shown.length ? shown.map((o, i) => h("li", { id: `pk${n}-o${i}`, role: "option", class: i === active ? "on" : "", "aria-selected": String(i === active),
      onmousedown: (e) => { e.preventDefault(); pick(o); } }, h("b", o.label), o.sub ? h("small", o.sub) : null))
      : [h("li.pk-none", t("pk_none"))]));
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", `pk${n}-o${active}`);
  };
  const shut = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
  const pick = (o) => {
    if (multi) { set([...sel, o.v]); input.value = ""; } else { sel = [o.v]; input.value = o.label; draw(); emit(); }
    shut();
  };
  const move = (d) => {
    if (list.hidden) open();
    if (!shown.length) return;
    active = (active + d + shown.length) % shown.length;
    [...list.children].forEach((li, i) => { li.classList.toggle("on", i === active); li.setAttribute("aria-selected", String(i === active)); });
    input.setAttribute("aria-activedescendant", `pk${n}-o${active}`);
    list.children[active]?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("focus", open);
  input.addEventListener("click", () => { if (list.hidden) open(); });
  input.addEventListener("input", open);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && !list.hidden && active >= 0) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape" && !list.hidden) { e.preventDefault(); e.stopPropagation(); shut(); }
    else if (e.key === "Backspace" && multi && !input.value && sel.length) set(sel.slice(0, -1));
  });
  input.addEventListener("blur", () => {
    shut();
    const typed = input.value.trim();
    if (multi) { if (free && typed) { set([...sel, typed]); input.value = ""; } return; }
    if (!typed) { if (sel.length) set([]); return; }
    const hit = opts.find((o) => norm(o.label) === norm(typed) || norm(o.v) === norm(typed));
    if (hit) { if (sel[0] !== hit.v) { sel = [hit.v]; emit(); } input.value = hit.label; }
    else if (free) { if (sel[0] !== typed) { sel = [typed]; emit(); } }
    else input.value = sel[0] != null ? labelOf(sel[0]) : "";
    draw();
  });
  box.addEventListener("click", (e) => { if (e.target === box || e.target === chips) input.focus(); });
  Object.defineProperty(box, "value", { get: () => (multi ? sel.join(sep) : sel[0] ?? "") });
  Object.defineProperty(box, "values", { get: () => [...sel] });
  draw();
  return box;
}
