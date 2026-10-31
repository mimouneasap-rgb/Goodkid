// Lists page: edit the managed drop-down lists (add, rename, delete, reorder).
import { esc, icon, fmtN, debounce } from "./ui.js";
import { DEPARTMENTS, SLOTS } from "./engine.js";
import * as store from "./store.js";
import * as act from "./actions.js";
import { LIST_DEFS, LIST_BY_KEY, isLocked, usageCounts, defaultLists } from "./lists.js";

const lv = { key: "people", q: "" };
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(label)}</option>`;
const TITLE_SLOTS = [...SLOTS.map((s) => s.key), "Final QA"];

export const listsView = {
  id: "lists",
  title: "Lists",
  sub: () => "The drop-down values used across the app. Add, rename, reorder or delete them here.",
  params(p) { if (p.list && LIST_BY_KEY[p.list]) lv.key = p.list; },
  render() {
    const L = store.lists();
    const st = store.getState();
    const def = LIST_BY_KEY[lv.key];
    const fromData = defaultLists(st);
    const missing = LIST_DEFS.reduce((n, d) => {
      const have = new Set(L[d.key].map((x) => (d.kind === "titles" ? `${x.slot}|${x.name}` : x.name)));
      return n + fromData[d.key].filter((x) => !have.has(d.kind === "titles" ? `${x.slot}|${x.name}` : x.name)).length;
    }, 0);
    return `
    <div class="chips" style="margin-bottom:16px">${LIST_DEFS.map((d) => `<button type="button" class="chipf ${d.key === lv.key ? "on" : ""}" data-lv-key="${d.key}">${esc(d.label)}<b>${fmtN(L[d.key].length)}</b></button>`).join("")}</div>
    ${missing ? `<div class="callout" style="margin-bottom:16px">${icon("info")}<div style="flex:1">${fmtN(missing)} value(s) in the data aren’t in the lists yet (for example people from a new Scigeniq export).</div><button class="btn btn-sm" data-lv-missing>Add them</button></div>` : ""}
    <section class="card reveal">
      <div class="card-h"><div><h3>${esc(def.label)}</h3><p>${esc(def.desc)}</p></div><div class="tools">${L[lv.key].length > 12 ? `<label class="field">${icon("search")}<input data-lv-q type="search" placeholder="Filter…" value="${esc(lv.q)}" aria-label="Filter list" style="width:160px"></label>` : ""}</div></div>
      <div data-region="items">${this.items()}</div>
      <form data-lv-add class="toolbar" style="margin:14px 0 0;padding-top:14px;border-top:1px solid var(--line)">
        <label class="field" style="flex:1;min-width:220px">${icon("plus")}<input name="name" id="lv-new-name" placeholder="New ${esc(def.kind === "people" ? "person, group or role" : "value")}…" style="flex:1" aria-label="New value"></label>
        ${def.kind === "people" ? `<label class="field"><select name="type" aria-label="Type">${opt("user", "Person", "user")}${opt("group", "Group", "")}${opt("role", "Role", "")}</select></label><label class="field"><select name="dept" aria-label="Department">${opt("", "No department", "")}${DEPARTMENTS.map((x) => opt(x, x, "")).join("")}</select></label>` : ""}
        ${def.kind === "titles" ? `<label class="field"><select name="slot" aria-label="Annexe">${TITLE_SLOTS.map((x) => opt(x, x, "QA")).join("")}</select></label>` : ""}
        <button class="btn btn-sm btn-primary">${icon("plus")}Add</button>
      </form>
    </section>
    <p class="muted" style="font-size:12px;margin:14px 2px 0">Renaming an entry updates every record that uses it, and is recorded in the audit trail. Deleting one lets you replace it in those records or keep the old value, which then shows as “not in list”. Entries marked BUILT IN drive the calculations and can’t be changed. Lists are saved with the data, published with the team version and exported to Excel.</p>`;
  },
  items() {
    const L = store.lists();
    const def = LIST_BY_KEY[lv.key];
    const counts = usageCounts(store.getState(), lv.key);
    const q = lv.q.toLowerCase();
    const items = L[lv.key].map((x, i) => ({ x, i })).filter(({ x }) => !q || `${x.name} ${x.dept || ""} ${x.slot || ""} ${x.type || ""}`.toLowerCase().includes(q));
    const head = `<th style="width:64px"></th><th>Value</th>${def.kind === "people" ? "<th>Type</th><th>Department</th>" : ""}${def.kind === "titles" ? "<th>Annexe</th>" : ""}<th class="r">Used in</th><th></th>`;
    return `<div class="table-wrap" style="max-height:620px"><table class="data"><thead><tr>${head}</tr></thead><tbody>
      ${items.map(({ x, i }) => {
        const locked = isLocked(lv.key, x.name);
        return `<tr>
          <td style="white-space:nowrap"><button type="button" class="icon-btn sm" data-lv-move="${i}|-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${icon("arrowUp")}</button> <button type="button" class="icon-btn sm" data-lv-move="${i}|1" aria-label="Move down" ${i === L[lv.key].length - 1 ? "disabled" : ""}>${icon("arrowDown")}</button></td>
          <td>${locked ? `<b>${esc(x.name)}</b> <span class="tag" title="Built in: used by the calculations">BUILT IN</span>` : `<input class="inline" data-lv-name="${i}" value="${esc(x.name)}" aria-label="Rename" style="max-width:none;width:100%;min-width:220px;font-weight:600">`}</td>
          ${def.kind === "people" ? `<td><select class="inline" data-lv-meta="${i}|type" aria-label="Type" ${locked ? "disabled" : ""}>${opt("user", "Person", x.type)}${opt("group", "Group", x.type)}${opt("role", "Role", x.type)}</select></td><td><select class="inline" data-lv-meta="${i}|dept" aria-label="Department" ${locked ? "disabled" : ""}>${opt("", "—", x.dept || "")}${DEPARTMENTS.map((d) => opt(d, d, x.dept || "")).join("")}</select></td>` : ""}
          ${def.kind === "titles" ? `<td><select class="inline" data-lv-meta="${i}|slot" aria-label="Annexe">${TITLE_SLOTS.map((sl) => opt(sl, sl, x.slot)).join("")}</select></td>` : ""}
          <td class="r num">${fmtN(counts.get(x.name) || 0)}</td>
          <td>${locked ? "" : `<button type="button" class="icon-btn sm" data-lv-del="${i}" aria-label="Delete ${esc(x.name)}">${icon("trash")}</button>`}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="6" class="empty-row">${q ? "No entries match." : "The list is empty."}</td></tr>`}
    </tbody></table></div>`;
  },
  bind(root, rerender) {
    const region = () => { const r = root.querySelector('[data-region="items"]'); if (r) r.innerHTML = this.items(); };
    root.querySelectorAll("[data-lv-key]").forEach((b) => b.addEventListener("click", () => { lv.key = b.dataset.lvKey; lv.q = ""; rerender(); }));
    root.querySelector("[data-lv-q]")?.addEventListener("input", debounce((e) => { lv.q = e.target.value; region(); }, 120));
    root.querySelector("[data-lv-missing]")?.addEventListener("click", () => act.addMissingListValues());
    root.querySelector("[data-lv-add]").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const item = { name: String(f.get("name") || "") };
      const def = LIST_BY_KEY[lv.key];
      if (def.kind === "people") { item.type = String(f.get("type") || "user"); item.dept = String(f.get("dept") || ""); }
      if (def.kind === "titles") item.slot = String(f.get("slot") || "QA");
      if (act.addListItem(lv.key, item)) setTimeout(() => document.getElementById("lv-new-name")?.focus(), 50);
    });
    root.addEventListener("change", (e) => {
      const n = e.target.closest("[data-lv-name]");
      if (n) { act.renameListItem(lv.key, +n.dataset.lvName, n.value).then((ok) => { if (!ok) region(); }); return; }
      const m = e.target.closest("[data-lv-meta]");
      if (m) { const [i, field] = m.dataset.lvMeta.split("|"); act.updateListItem(lv.key, +i, { [field]: m.value }); }
    });
    root.addEventListener("click", (e) => {
      const mv = e.target.closest("[data-lv-move]");
      if (mv) { const [i, d] = mv.dataset.lvMove.split("|"); act.moveListItem(lv.key, +i, +d); return; }
      const del = e.target.closest("[data-lv-del]");
      if (del) act.deleteListItem(lv.key, +del.dataset.lvDel);
    });
  },
};
