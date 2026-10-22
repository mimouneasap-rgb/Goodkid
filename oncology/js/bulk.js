// Bulk insert into any table: paste rows copied from Excel (first line = column names) or pick a CSV / XLSX
// file, check how its columns map to the table, preview what will be added or updated, then save in one go.
import { h, fmtNum, esc } from "./ui.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { SPECS, tableLabel } from "./editing.js";
import { parseDelimited, matchColumns, prepBulkRow, upsertRows, readSheetRows, dmy } from "./importers.js";

// rows that are the same record: updated rather than added
export const BULK_KEYS = {
  apqrTasks: ["Reference ID", "Task Title"], apqrPlan: ["Code"], apqrSys: ["Product"], apqr: ["Product", "Period"], apqrSections: ["Product", "Section"],
  fivesAreas: ["Area"], fivesTpl: ["Area", "No"], fivesItems: ["Audit ID", "No"], training: ["Training ID"], metrics: ["Metric", "Period"],
};
export const bulkKeys = (table) => BULK_KEYS[table] ?? (SPECS[table]?.id ? [SPECS[table].id] : []);

/**
 * Open the bulk-insert drawer.
 * @param {object} o title, defaults ({column: value} filled into empty cells), keyCols
 */
export function openBulk(ctx, table, o = {}) {
  const cols = ctx.data[table]?.cols;
  if (!cols) return;
  const keyCols = o.keyCols ?? bulkKeys(table);
  const types = Object.fromEntries((SPECS[table]?.fields ?? []).map(([c, ty]) => [c, ty]));
  const st = { grid: null, map: [], mode: keyCols.length ? "merge" : "add", useDefaults: true, busy: false };
  const msg = h("p.form-msg", { role: "status" });
  const area = h("textarea.bulk-paste", { rows: 7, placeholder: t("bulk_paste_ph"), spellcheck: "false" });
  const file = h("input", { type: "file", accept: ".xlsx,.xls,.xlsm,.csv,.txt", hidden: true });
  const out = h("div.bulk-out");

  const objects = () => {
    if (!st.grid) return [];
    const [, ...body] = st.grid;
    return body.map((r) => {
      const x = {};
      st.map.forEach((c, i) => { if (c && r[i] !== "" && r[i] != null) x[c] = convert(types[c], r[i]); });
      if (st.useDefaults && o.defaults) for (const [c, v] of Object.entries(o.defaults)) if (v != null && (x[c] == null || x[c] === "")) x[c] = v;
      return prepBulkRow(table, x);
    }).filter((x) => Object.keys(x).length);
  };
  const load = (grid) => {
    st.grid = grid.length ? grid : null;
    st.map = st.grid ? matchColumns(st.grid[0], cols, table) : [];
    draw();
  };
  const draw = () => {
    if (!st.grid) { out.replaceChildren(); return; }
    const objs = objects();
    const tbl = ctx.data[table];
    const plan = upsertRows(tbl.cols, tbl.rows, objs, st.mode === "merge" ? keyCols : []);
    const header = st.grid[0];
    const missingKeys = st.mode === "merge" && keyCols.some((k) => !st.map.includes(k) && !(st.useDefaults && o.defaults?.[k] != null));
    out.replaceChildren(
      h("h3", t("bulk_columns")),
      h("div.bulk-map", header.map((hd, i) => h("label.field", h("span", { title: hd }, hd || `#${i + 1}`),
        h("select", { onchange: (e) => { st.map[i] = e.target.value || null; draw(); } },
          h("option", { value: "" }, t("bulk_ignore")),
          cols.map((c) => h("option", { value: c, selected: st.map[i] === c ? true : null }, c)))))),
      h("div.bulk-opts",
        keyCols.length ? h("label.check", h("input", { type: "radio", name: `bm-${table}`, checked: st.mode === "merge" ? true : null, onchange: () => { st.mode = "merge"; draw(); } }), h("span", t("bulk_mode_merge", keyCols.join(" + ")))) : null,
        h("label.check", h("input", { type: "radio", name: `bm-${table}`, checked: st.mode === "add" ? true : null, onchange: () => { st.mode = "add"; draw(); } }), h("span", t("bulk_mode_add"))),
        o.defaults ? h("label.check", h("input", { type: "checkbox", checked: st.useDefaults ? true : null, onchange: (e) => { st.useDefaults = e.target.checked; draw(); } }),
          h("span", t("bulk_defaults"), " ", Object.entries(o.defaults).filter(([, v]) => v != null).map(([c, v]) => h("span.tag", `${c}: ${String(v).slice(0, 40)}`)))) : null),
      missingKeys ? h("p.banner.warn", icon("alert", 16), t("bulk_missing_keys", keyCols.join(" + "))) : null,
      h("div.bulk-summary",
        h("span.chip", h("b", fmtNum(objs.length)), ` ${t("rows")}`),
        h("span.chip.add", h("b", fmtNum(plan.added)), ` ${t("bulk_new")}`),
        h("span.chip.upd", h("b", fmtNum(plan.updated)), ` ${t("bulk_updated")}`),
        plan.unchanged ? h("span.chip", h("b", fmtNum(plan.unchanged)), ` ${t("bulk_same")}`) : null),
      objs.length ? h("div.table-scroll", h("table.data.compact.bulk-preview",
        h("thead", h("tr", cols.filter((c) => objs.some((x) => x[c] != null)).map((c) => h("th", c)))),
        h("tbody", objs.slice(0, 8).map((x) => h("tr", cols.filter((c) => objs.some((y) => y[c] != null)).map((c) => h("td", String(x[c] ?? "").slice(0, 60)))))))) : null,
      objs.length > 8 ? h("p.fine", t("bulk_more", fmtNum(objs.length - 8))) : null);
    save.disabled = st.busy || !(plan.added + plan.updated) || !ctx.canEdit;
  };
  area.addEventListener("input", () => load(parseDelimited(area.value)));
  const readFile = async (f) => {
    if (!f) return;
    msg.className = "form-msg"; msg.textContent = t("bulk_reading");
    try {
      const grid = /\.(csv|txt)$/i.test(f.name) ? parseDelimited(await f.text()) : (await readSheetRows(f)).map((r) => r.map((c) => (c == null ? "" : c)));
      area.value = "";
      load(grid);
      msg.textContent = `${f.name} · ${fmtNum(Math.max(0, grid.length - 1))} ${t("rows")}`;
    } catch (e) { msg.className = "form-msg warn-text"; msg.textContent = e.message ?? String(e); }
  };
  file.addEventListener("change", () => readFile(file.files?.[0]));
  area.addEventListener("dragover", (e) => { e.preventDefault(); area.classList.add("over"); });
  area.addEventListener("dragleave", () => area.classList.remove("over"));
  area.addEventListener("drop", (e) => { e.preventDefault(); area.classList.remove("over"); readFile(e.dataTransfer?.files?.[0]); });
  const save = h("button.btn.primary", {
    type: "button", disabled: true,
    onclick: async () => {
      st.busy = true; save.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
      try {
        const res = await ctx.bulkUpsert(table, objects(), st.mode === "merge" ? keyCols : [], (n, total) => { msg.textContent = `${t("ws_saving")} ${n}/${total}`; });
        ctx.toast(t("bulk_done", fmtNum(res.added), fmtNum(res.updated)));
        ctx.closeDrawer();
      } catch (e) { msg.className = "form-msg warn-text"; msg.textContent = e.message ?? String(e); st.busy = false; save.disabled = false; }
    },
  }, icon("upload", 15), t("bulk_save"));

  const content = () => [
    h("div.d-head", h("span.d-ref", tableLabel(table)), h("h2", o.title ?? `${t("bulk_insert")} · ${tableLabel(table)}`)),
    h("p.fine", t("bulk_intro")),
    h("details.bulk-cols", h("summary", t("bulk_expected", fmtNum(cols.length))), h("p.mono.small", cols.map((c) => esc(c)).join(" · "))),
    h("div.bulk-in", area, h("div.bulk-in-side", h("button.btn", { type: "button", onclick: () => file.click() }, icon("upload", 15), t("bulk_file")), h("small", t("bulk_file_hint"))), file),
    out, msg,
    h("div.form-actions", save, h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel"))),
  ];
  ctx.open.drawer(content, { form: true });
}

/** Cell text → stored value for the column's editor type (dates to ISO, numbers to numbers). */
function convert(type, v) {
  if (typeof v !== "string") return v;
  if (type === "date") return dmy(v) ?? v;
  if (type === "month") { const m = v.match(/^(\d{1,2})\/(\d{4})$/); return m ? `${m[2]}-${m[1].padStart(2, "0")}` : v; }
  if (type === "number" || type === "score") { const n = Number(v.replace(",", ".")); return v !== "" && !isNaN(n) ? n : v; }
  return v;
}
