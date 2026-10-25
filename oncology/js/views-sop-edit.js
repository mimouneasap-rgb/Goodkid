// Editing an SOP's résumé and its forms in the app: every part of the résumé, and each form's definition (title, type,
// revision, owner SOP, sections, fields, columns). Changes are saved directly for everyone and logged in the audit trail;
// the SOP files in Drive are never changed.
import { h } from "./ui.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { summaryOf, formKey } from "./sopkit.js";
import { editSummary, linesOf, textOf, codesOf, SUMMARY_PARTS, FORM_TYPES, REMOVED, formRow } from "./sopwork.js";
import { fieldPicker } from "./editing.js";

const isoToday = () => new Date().toISOString().slice(0, 10);
let uid = 0;

/** Rows of inputs with add, insert, move and remove; `get()` returns the edited items. */
function listEditor({ items, blank, row, addLabel, name }) {
  const xs = items.map((x) => ({ ...x }));
  const box = h("div.le-list", { role: "list", "aria-label": name });
  const tool = (label, ic, fn, attrs = {}) => h("button.icon-btn.le-tool", { type: "button", title: label, "aria-label": label, onclick: fn, ...attrs }, icon(ic, 15));
  const draw = (focus) => {
    box.replaceChildren(
      ...xs.map((x, i) => h("div.le-row", { role: "listitem" },
        h("span.le-n", String(i + 1)),
        h("div.le-fields", row(x, i)),
        h("div.le-tools",
          tool(t("ed_up"), "up", () => { [xs[i - 1], xs[i]] = [xs[i], xs[i - 1]]; draw(i - 1); }, { disabled: i === 0 ? true : null }),
          tool(t("ed_down"), "down", () => { [xs[i + 1], xs[i]] = [xs[i], xs[i + 1]]; draw(i + 1); }, { disabled: i === xs.length - 1 ? true : null }),
          tool(t("ed_insert"), "plus", () => { xs.splice(i + 1, 0, blank(x)); draw(i + 1); }),
          tool(t("ed_remove"), "trash", () => { xs.splice(i, 1); draw(Math.min(i, xs.length - 1)); }, { class: "danger" })))),
      xs.length ? null : h("p.muted.le-empty", t("ed_list_empty")),
      h("button.btn.compact.ghost.le-add", { type: "button", onclick: () => { xs.push(blank(xs.at(-1))); draw(xs.length - 1); } }, icon("plus", 14), addLabel));
    if (focus != null && focus >= 0) box.querySelectorAll(".le-row")[focus]?.querySelector("input, textarea")?.focus();
  };
  draw();
  return { el: box, get: () => xs };
}
const bind = (x, k) => (e) => { x[k] = e.target.value; };

/** The résumé editor: one part (`part`) or all of them. */
export function openResumeEditor(ctx, s, part) {
  const old = summaryOf(s) ?? {};
  const only = SUMMARY_PARTS.includes(part) ? part : null;
  const show = (k) => !only || only === k;
  const n = ++uid;
  const area = (k, label, hint, rows = 3) => {
    const el = h("textarea", { id: `rs${n}-${k}`, rows }, old[k] ?? "");
    return { k, el, view: h("label.field.wide", { for: el.id }, h("span", label), el, hint ? h("small.fine", hint) : null) };
  };
  const texts = [area("purpose", t("sum_purpose"), t("ed_purpose_h")), area("scope", t("sum_scope")), area("trigger", t("sum_trigger"), t("ed_trigger_h"), 2), area("training", t("ed_training"), t("ed_training_h"), 2)];
  const phases = [...new Set((old.steps ?? []).map((x) => x.phase).filter(Boolean))];
  const codes = [...new Set([...(s.formList ?? []).map((f) => f.code), ...(old.steps ?? []).flatMap((x) => x.records ?? [])])];
  const roles = listEditor({
    name: t("sum_roles"), items: old.roles ?? [], blank: () => ({ role: "", duties: "" }), addLabel: t("ed_add_role"),
    row: (x) => [h("input", { value: x.role ?? "", placeholder: t("ed_role_ph"), "aria-label": t("ed_role"), oninput: bind(x, "role") }),
      h("textarea", { rows: 2, placeholder: t("ed_duties_ph"), "aria-label": t("ed_duties"), oninput: bind(x, "duties") }, x.duties ?? "")],
  });
  const steps = listEditor({
    name: t("sum_steps"), items: (old.steps ?? []).map((x) => ({ ...x, records: (x.records ?? []).join(", ") })), addLabel: t("ed_add_step"),
    blank: (prev) => ({ phase: prev?.phase ?? "", do: "", who: "", records: "" }),
    row: (x) => [
      h("div.le-line",
        h("input.le-phase", { value: x.phase ?? "", list: `rs${n}-phases`, placeholder: t("ed_phase_ph"), "aria-label": t("ed_phase"), oninput: bind(x, "phase") }),
        h("input.le-who", { value: x.who ?? "", placeholder: t("ed_who_ph"), "aria-label": t("ed_who"), oninput: bind(x, "who") })),
      h("textarea", { rows: 2, placeholder: t("ed_do_ph"), "aria-label": t("ed_do"), oninput: bind(x, "do") }, x.do ?? ""),
      h("input.le-recs.mono", { value: x.records ?? "", list: `rs${n}-forms`, placeholder: t("ed_records_ph"), "aria-label": t("ed_records"), oninput: bind(x, "records") })],
  });
  const critical = listEditor({
    name: t("sum_critical"), items: (old.critical ?? []).map((c) => ({ text: c })), blank: () => ({ text: "" }), addLabel: t("ed_add_point"),
    row: (x) => [h("textarea", { rows: 2, placeholder: t("ed_point_ph"), "aria-label": t("sum_critical"), oninput: bind(x, "text") }, x.text ?? "")],
  });
  const block = (k, title, sub, ed) => (show(k) ? h("section.ed-block", h("h3", title), sub ? h("p.fine", sub) : null, ed.el) : null);
  const msg = h("p.form-msg", { role: "status" });
  const save = h("button.btn.primary", { type: "submit" }, t("save"));
  let armed = false;
  const reset = old.edited ? h("button.btn.ghost", {
    type: "button", title: t("ed_reset_t"),
    onclick: async () => {
      if (!armed) { armed = true; reset.textContent = t("ed_reset_confirm"); setTimeout(() => { armed = false; reset.replaceChildren(icon("undo", 15), t("ed_reset")); }, 4000); return; }
      reset.disabled = true;
      try { await ctx.saveObj("sop", s.__key, { Summary: null }, false, "reset"); ctx.closeDrawer(); ctx.rerender(); } catch (e) { msg.className = "form-msg warn-text"; msg.textContent = e.message ?? String(e); reset.disabled = false; }
    },
  }, icon("undo", 15), t("ed_reset")) : null;
  const form = h("form.row-form.ed-form", {
    onsubmit: async (e) => {
      e.preventDefault();
      const patch = {};
      for (const x of texts) if (show(x.k)) patch[x.k] = x.el.value;
      if (show("roles")) patch.roles = roles.get();
      if (show("steps")) patch.steps = steps.get().map((x) => ({ ...x, records: codesOf(x.records) }));
      if (show("critical")) patch.critical = critical.get().map((x) => x.text);
      const sum = editSummary(old, patch, ctx.me, isoToday(), s["Drive modified"] ?? null);
      sum.lang ??= /French/i.test(s.Language ?? "") ? "FR" : "EN";
      sum.rev ??= s.Revision ?? null;
      save.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
      try { await ctx.saveObj("sop", s.__key, { Summary: JSON.stringify(sum) }); ctx.closeDrawer(); ctx.rerender(); }
      catch (err) { msg.className = "form-msg warn-text"; msg.textContent = err.message ?? String(err); save.disabled = false; }
    },
  },
    h("div.form-grid", texts.filter((x) => show(x.k) && x.k !== "training").map((x) => x.view)),
    block("roles", t("sum_roles"), t("ed_roles_sub"), roles),
    block("steps", t("sum_steps"), t("ed_steps_sub"), steps),
    block("critical", t("sum_critical"), t("ed_critical_sub"), critical),
    show("training") ? h("div.form-grid", texts.find((x) => x.k === "training").view) : null,
    h("datalist", { id: `rs${n}-phases` }, phases.map((p) => h("option", { value: p }))),
    h("datalist", { id: `rs${n}-forms` }, codes.map((c) => h("option", { value: c }))),
    msg,
    h("div.form-actions", save, h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel")), h("span.spacer"), reset));
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${t("sum_title")} · ${s.Code}`), h("h2", only ? t("ed_part_title", partName(only)) : t("ed_title"))),
    h("p.fine", t("ed_note")),
    only ? h("p", h("button.link", { type: "button", onclick: () => openResumeEditor(ctx, s) }, t("ed_all_parts"), " →")) : null,
    form,
  ], { form: true });
}
export const partName = (k) => t({ purpose: "sum_purpose", scope: "sum_scope", trigger: "sum_trigger", roles: "sum_roles", steps: "sum_steps", critical: "sum_critical", training: "ed_training" }[k] ?? k);

// ---------- forms, templates and attachments ----------
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** The editor of one form's definition, or of a new form (`f` null; `owner` the SOP it is added to). */
export function openFormEditor(ctx, X, f, { owner } = {}) {
  const isNew = !f;
  const reg = f?.register ?? null;
  const read = f?.read ?? {};
  const n = ++uid;
  const base = (owner ?? f?.owner)?.Code?.replace(/^SOP/, "").replace(/\/Onc$/i, "") ?? "";
  const input = (k, label, value, { wide, hint, ...attrs } = {}) => { const el = h("input", { id: `fe${n}-${k}`, value: value ?? "", ...attrs }); return [el, h(`label.field${wide ? ".wide" : ""}`, { for: el.id }, h("span", label), el, hint ? h("small.fine", hint) : null)]; };
  const area = (k, label, value, hint) => { const el = h("textarea", { id: `fe${n}-${k}`, rows: 4 }, textOf(value)); return [el, h("label.field.wide", { for: el.id }, h("span", label), el, hint ? h("small.fine", hint) : null)]; };
  const [code, codeF] = input("code", t("col_code"), f?.code ?? (base ? `${base}/Onc/F` : ""), { class: "mono", readonly: isNew ? null : true, hint: isNew ? t("fe_code_h") : t("fe_code_fixed") });
  const [title, titleF] = input("title", t("col_title"), f?.title ?? "", { wide: true });
  const kind = h("select", { id: `fe${n}-kind` }, FORM_TYPES.map(([k]) => h("option", { value: k, selected: (f?.kind ?? "form") === k ? true : null }, t(`frm_k_${k}`))));
  const [rev, revF] = input("rev", t("fe_rev"), f?.rev ?? "", { inputmode: "numeric", hint: f?.mismatch ? t("frm_rev_mismatch", f.citedRev, f.attachedRev) : null });
  const opts = ctx.options;
  const pick = (kind, k, label, value, wide) => { const el = fieldPicker(kind, opts, value, `fe${n}-${k}`); return [el, h(`label.field${wide ? ".wide" : ""}`, { for: `fe${n}-${k}` }, h("span", label), el)]; };
  const [own, ownF] = pick("sop", "owner", t("fe_owner"), (owner ?? f?.owner)?.Code ?? "");
  const [room, roomF] = pick("room", "room", t("col_room"), reg?.["Linked room"] ?? "");
  const [equip, equipF] = pick("assets", "equip", t("sop_equipment"), reg?.["Linked equipment"] ?? "", true);
  const [secs, secsF] = area("sections", t("frm_sections"), f?.sections, t("fe_lines_h"));
  const [flds, fldsF] = area("fields", t("frm_fields"), f?.fields, t("fe_lines_h"));
  const [cols, colsF] = area("columns", t("frm_columns"), f?.columns, t("fe_lines_h"));
  const [note, noteF] = area("comment", t("fe_comment"), reg?.Comment ? [reg.Comment] : []);
  const msg = h("p.form-msg", { role: "status" });
  const save = h("button.btn.primary", { type: "submit" }, isNew ? t("fe_add") : t("save"));
  const fail = (text) => { msg.className = "form-msg warn-text"; msg.textContent = text; };
  let armed = false;
  const remove = !isNew ? h("button.btn.danger", {
    type: "button",
    onclick: async () => {
      if (!armed) { armed = true; remove.textContent = t("fe_remove_confirm"); setTimeout(() => { armed = false; remove.replaceChildren(icon("trash", 15), t("fe_remove")); }, 4000); return; }
      remove.disabled = true;
      try { await setRemoved(ctx, f, true); ctx.closeDrawer(); ctx.rerender(); } catch (e) { fail(e.message ?? String(e)); remove.disabled = false; }
    },
  }, icon("trash", 15), t("fe_remove")) : null;
  const form = h("form.row-form.ed-form", {
    onsubmit: async (e) => {
      e.preventDefault();
      const c = code.value.trim().replace(/\s+/g, "");
      const key = formKey(c);
      if (!key) return fail(t("fe_code_bad"));
      const clash = X.formsByKey?.get(key);
      if (isNew && clash && !clash.removed) return fail(t("fe_code_taken", clash.code));
      const ownerCode = own.value.trim();
      if (ownerCode && !X.list.some((x) => x.Code === ownerCode)) return fail(t("fe_owner_bad", ownerCode));
      const v = { title: title.value, kind: kind.value, rev: rev.value, sections: linesOf(secs.value), fields: linesOf(flds.value), columns: linesOf(cols.value) };
      // only what differs from the SOP file is stored, so a corrected file still shows through for the rest
      const keep = (k, x) => (isNew || !same(x, read[k]) ? x : null);
      const row = formRow({
        code: isNew ? c : reg?.["Form code"] ?? f.code, title: keep("title", v.title.trim() || null), kind: keep("kind", v.kind), rev: keep("rev", v.rev.trim() || null),
        owner: ownerCode && ownerCode !== f?.homeOwner?.Code ? ownerCode : null, room: room.value, equipment: equip.value, comment: note.value.replace(/\s*\n\s*/g, " "),
        sections: keep("sections", v.sections), fields: keep("fields", v.fields), columns: keep("columns", v.columns),
        had: { sections: Boolean(read.sections?.length), fields: Boolean(read.fields?.length), columns: Boolean(read.columns?.length) },
        status: reg?.Status && !f?.removed ? reg.Status : null, source: reg?.Source ?? "App",
      });
      if (!isNew && !reg && row.Title == null && row.Type == null && row.Revision == null && row["Owner SOP"] == null && row.Sections == null && row.Fields == null && row.Columns == null && !row["Linked room"] && !row["Linked equipment"] && !row.Comment) { ctx.closeDrawer(); return; }
      save.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
      try { await ctx.saveObj("forms", reg?.__key ?? null, row); ctx.closeDrawer(); ctx.rerender(); }
      catch (err) { fail(err.message ?? String(err)); save.disabled = false; }
    },
  },
    h("div.form-grid", codeF, h("label.field", { for: kind.id }, h("span", t("col_type")), kind), titleF, revF, ownF, roomF, equipF),
    h("div.form-grid", secsF, fldsF, colsF, noteF),
    msg,
    h("div.form-actions", save, h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel")), h("span.spacer"), remove));
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", isNew ? `${t("frm_title")} · ${owner?.Code ?? ""}` : `${t(`frm_k_${f.kind ?? "form"}`)} · ${f.code}`), h("h2", isNew ? t("fe_new_title") : t("fe_title"))),
    h("p.fine", isNew ? t("fe_new_note") : t("fe_note")),
    form,
  ], { form: true });
}

/** Hide a form wrongly found in an SOP file (or show it again): its register row carries Status "Removed". */
export async function setRemoved(ctx, f, removed) {
  const reg = f.register;
  if (reg) return ctx.saveObj("forms", reg.__key, { Status: removed ? REMOVED : null });
  if (removed) return ctx.saveObj("forms", null, { "Form code": f.code, Status: REMOVED, Source: "App" });
  return null;
}
