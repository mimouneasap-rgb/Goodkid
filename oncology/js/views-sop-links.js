// An SOP's links to the rest of the app, editable from its page: the rooms, equipment and products it governs, the pages
// of the app it applies to and the job positions that must be trained on it (its line in the training matrix) — each
// chosen from the data already in the app — with what already points at it (forms, critical control points, trainings).
import { h, card, fmtDate, fmtNum, fmtPct } from "./ui.js";
import { t, tv, getLang } from "./i18n.js";
import { icon } from "./icons.js";
import { SOP_TOPICS, ROUTE_TOPICS } from "./catalogs.js";
import { SOP_DEPTS, sopKey } from "./sopkit.js";
import { picker } from "./picker.js";
import { fieldPicker } from "./editing.js";
import { sopTraining, openTraining, newUnplanned, fromNeed, TR_COLOR, trStatus } from "./views-training.js";

const FR = () => getLang() === "FR";
const codes = (v) => String(v ?? "").split(/\s*[;,\n]\s*/).map((x) => x.trim()).filter(Boolean);
const topicName = (id) => { const x = SOP_TOPICS.find(([k]) => k === id); return x ? x[FR() ? 2 : 1] : id; };
const ROUTE_OF = Object.entries(ROUTE_TOPICS).reduce((a, [r, ts]) => { for (const x of ts) (a[x] ??= r); return a; }, {});
const norm = (x) => String(x ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function linksCard(ctx, X, s) {
  const m = ctx.m;
  const rooms = codes(s["Linked rooms"]), assets = codes(s["Linked equipment"]), products = codes(s["Linked products"]);
  const T = sopTraining(m.x.trainingX, s);
  const forms = (m.forms ?? []).filter((f) => sopKey(f["Linked SOP"]) === s.key || sopKey(f["Owner SOP"]) === s.key);
  const ccps = (m.ccp ?? []).filter((c) => sopKey(c["Linked SOP"]) === s.key);
  const chip = (label, onclick, title, known = true) => h(onclick ? "button.lk-chip" : "span.lk-chip", { type: onclick ? "button" : null, onclick, title, class: known ? "" : "lk-unknown" }, label);
  const group = (ic, label, items, empty) => h("div.lk-group", h("h4", icon(ic, 14), label, h("b", fmtNum(items.length))), items.length ? h("div.lk-chips", items) : h("p.muted", empty));
  const body = h("div.lk-grid",
    group("room", t("lk_rooms"), rooms.map((c) => { const r = m.roomByCode.get(c); return chip(r ? `${c} · ${r.Name ?? ""}` : c, () => ctx.go("rooms", { room: c }), r?.Area ?? t("pk_not_listed"), Boolean(r)); }), t("lk_none")),
    group("equipment", t("lk_equipment"), assets.map((a) => { const e = m.equip.find((x) => x["Asset no"] === a); return chip(e ? `${a} · ${e.Description ?? ""}` : a, e ? () => ctx.open.asset(a) : null, e?.["Room code"] ?? t("pk_not_listed"), Boolean(e)); }), t("lk_none")),
    group("product", t("lk_products"), products.map((p) => chip(p, () => ctx.go("products", { product: p }))), t("lk_none")),
    group("dashboard", t("lk_pages"), s.topics.map((x) => chip(topicName(x), ROUTE_OF[x] ? () => ctx.go(ROUTE_OF[x]) : null, X.linkedTopics?.has(x) ? t("lk_explicit") : t("lk_auto"))), t("sop_no_topic")),
    group("cap", t("lk_positions"), (T.matrix?.positions ?? []).map((p) => chip(p, () => ctx.go("training"))), t("lk_no_positions")),
    forms.length || ccps.length ? group("records", t("lk_points_here"), [
      ...forms.map((f) => chip(`${f["Form code"]} · ${f.Title ?? ""}`, null, t("frm_register"))),
      ...ccps.map((c) => chip(`${c["CCP ID"]} · ${c.Parameter ?? ""}`, () => ctx.go("rooms", { room: c.Room }), "CCP")),
    ], "") : null);
  return card(t("lk_title"), body, { sub: t("lk_sub"), actions: ctx.canEdit && s.__key ? h("button.btn.compact.ghost", { type: "button", onclick: () => openLinks(ctx, X, s) }, icon("edit", 14), t("lk_edit")) : null });
}

/** The links editor: every value chosen from the app's own lists. */
function openLinks(ctx, X, s) {
  const opts = ctx.options;
  const T = sopTraining(ctx.m.x.trainingX, s);
  const explicit = (X.links ?? []).filter((l) => sopKey(l.SOP) === s.key);
  const rooms = fieldPicker("rooms", opts, s["Linked rooms"], "lk-rooms");
  const assets = fieldPicker("assets", opts, s["Linked equipment"], "lk-assets");
  const products = fieldPicker("products", opts, s["Linked products"], "lk-products");
  const pages = picker({ id: "lk-pages", options: SOP_TOPICS.map(([id, en, fr]) => [id, FR() ? fr : en]), value: explicit.map((l) => l.Topic).join("; "), multi: true });
  const positions = fieldPicker("positions", opts, T.matrix?.Positions ?? "", "lk-pos");
  const msg = h("p.form-msg", { role: "status" });
  const save = h("button.btn.primary", { type: "submit" }, t("save"));
  const field = (label, el, hint) => h("label.field.wide", { for: el.querySelector("input")?.id }, h("span", label), el, hint ? h("small.fine", hint) : null);
  const form = h("form.row-form.ed-form", {
    onsubmit: async (e) => {
      e.preventDefault();
      save.disabled = true; msg.className = "form-msg"; msg.textContent = t("ws_saving");
      try {
        const patch = { "Linked rooms": rooms.value || null, "Linked equipment": assets.value || null, "Linked products": products.value || null };
        if (Object.entries(patch).some(([k, v]) => (s[k] ?? null) !== v)) await ctx.saveObj("sop", s.__key, patch, true);
        // pages: the explicit links of this SOP become the ones chosen
        const want = new Set(pages.values);
        for (const l of explicit) if (!want.has(l.Topic)) await ctx.deleteRow("sopLinks", l.__key);
        for (const id of want) if (!explicit.some((l) => l.Topic === id)) await ctx.saveObj("sopLinks", null, { Topic: id, SOP: s.Code }, true);
        // positions to train: the SOP's line in the training matrix
        const pos = positions.value;
        if (T.matrix) { if ((T.matrix.Positions ?? "") !== pos) await ctx.saveObj("trainingMatrix", T.matrix.__key, { Positions: pos || null }, true); }
        else if (pos) await ctx.saveObj("trainingMatrix", null, { Topic: s.Title ?? s.Code, Reference: s.Code, Kind: "SOP", Department: SOP_DEPTS[s.Department]?.[0] ?? s.Department ?? null, Positions: pos }, true);
        ctx.toast(t("saved_ok"));
        ctx.closeDrawer(); ctx.rerender();
      } catch (err) { msg.className = "form-msg warn-text"; msg.textContent = err.message ?? String(err); save.disabled = false; }
    },
  },
    h("div.form-grid", field(t("lk_rooms"), rooms), field(t("lk_equipment"), assets), field(t("lk_products"), products),
      field(t("lk_pages"), pages, t("lk_pages_h")), field(t("lk_positions"), positions, t("lk_positions_h"))),
    msg,
    h("div.form-actions", save, h("button.btn.ghost", { type: "button", onclick: () => ctx.closeDrawer() }, t("cancel"))));
  ctx.open.drawer(() => [
    h("div.d-head", h("span.d-ref", `${s.Code}${s.Revision ? ` · rev ${s.Revision}` : ""}`), h("h2", t("lk_edit_title"))),
    h("p.fine", t("lk_note")),
    form,
  ], { form: true });
}

/** Who must be trained on this SOP, who is on its current revision, and its trainings. */
export function trainingCard(ctx, s) {
  const X = ctx.m.x.trainingX;
  const T = sopTraining(X, s);
  const n = T.need && !T.need.covered ? T.need : null;
  const pending = T.people.filter((p) => !T.trained.includes(p));
  const list = [...T.planned, ...T.unplanned].sort((a, b) => (b.date ?? b.planned ?? 0) - (a.date ?? a.planned ?? 0));
  if (!T.matrix && !list.length && !n && !T.records.length) {
    return card(t("lk_training"), h("p.muted", t("lk_training_none"), " ", ctx.canEdit && s.__key ? h("button.link", { type: "button", onclick: () => openLinks(ctx, ctx.m.x.sopx, s) }, t("lk_edit")) : null));
  }
  return card(t("lk_training"), h("div.lk-train",
    n ? h("div.banner.warn", icon("alert", 18), h("span", t("lk_training_due", tv(n.category), fmtDate(n.due), fmtNum(n.pending.length))),
      ctx.canEdit ? h("button.btn.compact", { type: "button", onclick: () => newUnplanned(ctx, X, fromNeed(X, n)) }, icon("plus", 14), t("trn_create")) : null) : null,
    T.people.length ? h("div.lk-train-k",
      h("div", h("small", t("lk_trained_rev", s.Revision ?? "—")), h("b", `${fmtNum(T.trained.length)} / ${fmtNum(T.people.length)}`), h("span.trn-bar", h("i", { style: { width: `${Math.round((T.trained.length / T.people.length) * 100)}%`, background: T.trained.length === T.people.length ? "var(--good)" : "var(--warning)" } }), h("b", fmtPct(T.trained.length / T.people.length)))),
      pending.length ? h("div", h("small", t("lk_not_yet")), h("p", pending.map((p) => p.name).join(", "))) : null) : null,
    list.length ? h("ul.trn-req", list.slice(0, 8).map((x) => h("li",
      h("span.pill", { style: { "--dot": TR_COLOR[x.status] ?? "var(--muted-mark)" } }, h("i"), x.plan === "Planned" ? trStatus(x.status) : tv(x.status)),
      h("button.link", { type: "button", onclick: () => openTraining(ctx, X, x) }, `${tv(x.plan)} · ${x["Training ID"] ?? ""}`),
      h("small.muted", fmtDate(x.date ?? x.done ?? x.planned))))) : null), { sub: T.matrix ? t("lk_training_sub", fmtNum(T.matrix.positions.length)) : null });
}
