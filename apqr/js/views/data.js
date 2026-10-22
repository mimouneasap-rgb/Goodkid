// Data & settings: status date and SOP parameters, import (Scigeniq export,
// CSV, backup), export (Excel, JSON, CSV), audit trail and reset.

import { el, icon, fmtDate, download, relativeTime } from "../dom.js";
import { toCsv, todayIso, matchesQuery } from "../model.js";
import { readImportFile, exportWorkbook } from "../io.js";
import { cardHead, select } from "../ui.js";
import { logItem } from "./product.js";

export const title = () => "Data & settings";
export const crumbs = (ctx) => [ctx.store.shared ? "Shared workspace · everyone with access sees the same data" : "Everything is stored in this browser · no sign-in"];

export function render(ctx) {
  const s = ctx.state.settings;
  const set = (patch, label) => ctx.store.setSettings(patch, label);
  const num = (key, label, hint, min = 0) => el("div", { class: "field" }, el("label", { for: `set-${key}` }, label),
    el("input", { id: `set-${key}`, class: "input", type: "number", min: String(min), value: s[key], onchange: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= min) set({ [key]: v }, `Set ${label.toLowerCase()}`);
    } }), el("span", { class: "hint" }, hint));

  return el("div", { class: "view" },
    el("div", { class: "grid g-12" },
      el("section", { class: "card span-6" }, cardHead("Settings", "Used in every calculation"),
        el("div", { class: "card-body" }, el("div", { class: "form-grid" },
          el("div", { class: "field full" }, el("label", { for: "set-name" }, "Your name"),
            el("input", { id: "set-name", class: "input", value: s.userName, placeholder: "Shown in the change history", autocomplete: "name",
              onchange: (e) => set({ userName: e.target.value.trim() }, "Set user name") }),
            el("span", { class: "hint" }, ctx.store.shared ? "Shown in the change history. Leave it empty to use your claude.ai name." : "No sign-in: the name you type here is recorded with each change.")),
          el("div", { class: "field" }, el("label", {}, "Status date"),
            select([["snapshot", `Snapshot (${fmtDate(ctx.state.meta.snapshot)})`], ["today", `Today (${fmtDate(todayIso())})`], ["custom", "Specific date"]], s.asOfMode,
              (v) => set({ asOfMode: v, asOf: v === "snapshot" ? ctx.state.meta.snapshot : s.asOf }, "Change status date"), { label: "Status date mode" })),
          el("div", { class: "field" }, el("label", { for: "set-asof" }, "Specific date"),
            el("input", { id: "set-asof", class: "input", type: "date", value: s.asOfMode === "today" ? todayIso() : s.asOf, disabled: s.asOfMode !== "custom",
              onchange: (e) => set({ asOf: e.target.value }, "Change status date") })),
          num("lagDays", "Report due after period end (days)", "SOPQA0021E §10.3.6: within 3 months of the period end."),
          num("dueSoonDays", "Due-soon window (days)", "A live workflow due within this window is flagged Due soon.", 1),
          num("triggerWindowDays", "Trigger warning (days)", "Untriggered products this close to report due are flagged.", 1)))),
      el("section", { class: "card span-6" }, cardHead("Import", "Refresh tasks from Scigeniq, or restore a backup"),
        el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "12px" } },
          dropzone(ctx),
          el("ul", { class: "muted", style: { fontSize: "12.5px", margin: 0, paddingLeft: "18px" } },
            el("li", {}, el("strong", {}, "Scigeniq export (.xlsx/.csv): "), "the APQR status report, sheet “Data”, or the master tracker's “Task Register”. Replaces the task list; plan, statistics, CAPA and approvals are kept. New products are added."),
            el("li", {}, el("strong", {}, "Backup (.json): "), "restores everything exactly as exported."))))),

    el("section", { class: "card" }, cardHead("Export", "Share with people who do not use this app, or keep a backup"),
      el("div", { class: "card-body", style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
        el("button", { class: "btn primary", type: "button", onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          try { await exportWorkbook(ctx); ctx.toast("Excel workbook downloaded"); } catch (err) { ctx.toast(err.message); } finally { b.disabled = false; }
        } }, icon("download", "sm"), "Excel workbook (all sheets)"),
        el("button", { class: "btn", type: "button", onclick: () => {
          download(`APQR-backup-${todayIso()}.json`, JSON.stringify(ctx.state, null, 1), "application/json");
          ctx.toast("Backup downloaded");
        } }, icon("download", "sm"), "Full backup (.json)"),
        el("button", { class: "btn", type: "button", onclick: () => ctx.go("plan") }, "Plan CSV", icon("chevronRight", "sm")),
        el("button", { class: "btn", type: "button", onclick: () => ctx.go("tasks") }, "Task CSV", icon("chevronRight", "sm")),
        el("button", { class: "btn", type: "button", onclick: () => ctx.go("workflows") }, "Workflow CSV", icon("chevronRight", "sm")))),

    auditCard(ctx),

    el("div", { class: "grid g-12" },
      el("section", { class: "card span-7" }, cardHead("About this data", "Where the starting data came from"),
        el("div", { class: "card-body" },
          el("ul", { style: { margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" } }, ctx.state.meta.sources.map((x) => el("li", {}, x))),
          el("div", { class: "callout info", style: { marginTop: "14px" } }, icon("shield"), el("span", {},
            "This is a tracking and planning workspace. Scigeniq remains the system of record: official data, digital signatures and archived reports (21 CFR Part 11) live there. ",
            ctx.store.shared ? "Here, products, tasks and the change history are shared with everyone who can open this page; your settings stay on your device." : "Data here is kept in this browser only, so export a backup regularly.")))),
      el("section", { class: "card span-5" }, cardHead("Reset", "Start again from the source documents"),
        el("div", { class: "card-body", style: { display: "flex", flexDirection: "column", gap: "12px" } },
          el("p", { class: "muted", style: { fontSize: "13px" } }, "Replaces all products, tasks, statistics and approvals with the original plan and Scigeniq export", ctx.store.shared ? ", for everyone using this page" : "", ". Your name and settings are kept. You can undo straight after."),
          el("button", { class: "btn danger", type: "button", onclick: async () => {
            if (await ctx.confirm({ title: "Reset all data?", message: "Every edit, study and approval will be replaced by the source data. Export a backup first if you may need them.", confirmLabel: "Reset", danger: true })) {
              ctx.store.reset();
              ctx.undoToast("Data reset to the source documents");
            }
          } }, icon("history", "sm"), "Reset to source data")))),
  );
}

function dropzone(ctx) {
  const input = el("input", { type: "file", accept: ".xlsx,.xls,.xlsm,.csv,.json", class: "sr-only", onchange: (e) => { if (e.target.files[0]) handle(ctx, e.target.files[0]); e.target.value = ""; } });
  const zone = el("label", { class: "dropzone", tabindex: "0", onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } } },
    input, icon("upload", "lg"), el("div", { style: { fontWeight: 700, marginTop: "6px", color: "var(--ink)" } }, "Drop a file here or click to choose"),
    el("div", { style: { fontSize: "12.5px" } }, ".xlsx · .csv · .json"));
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    if (e.dataTransfer.files[0]) handle(ctx, e.dataTransfer.files[0]);
  });
  return zone;
}

async function handle(ctx, file) {
  let result;
  try {
    result = await readImportFile(file, ctx.state);
  } catch (err) {
    ctx.toast(err.message || "Could not read the file");
    return;
  }
  if (result.kind === "backup") {
    const ok = await ctx.confirm({
      title: "Restore this backup?",
      message: `${file.name}: ${result.state.products.length} products, ${result.state.tasks.length} tasks, ${result.state.log.length} history entries. It replaces the current data.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    ctx.store.replaceState(result.state, `Restore backup ${file.name}`);
    ctx.undoToast("Backup restored");
    return;
  }
  const products = new Set(result.tasks.map((t) => t.productId));
  const done = result.tasks.filter((t) => t.status === "Completed").length;
  const ok = await ctx.modal((close) => ({
    title: "Import Scigeniq tasks",
    subtitle: `${file.name} · sheet “${result.sheet}”`,
    body: [
      el("div", { class: "stat-grid" },
        statBox("Tasks", result.tasks.length), statBox("Products", products.size), statBox("Completed", done), statBox("New products", result.newProducts.length)),
      el("p", { style: { color: "var(--ink-2)" } }, `The current ${ctx.state.tasks.length} tasks will be replaced. Plan details, statistics, CAPA decisions, requirement status and committee approvals stay as they are.`),
      result.newProducts.length ? el("div", { class: "callout info" }, icon("info"), el("div", {}, el("strong", {}, "Not in the plan yet, will be added: "), result.newProducts.map((p) => p.name).join("; "))) : null,
    ],
    foot: [
      el("button", { class: "btn", type: "button", onclick: () => close(false) }, "Cancel"),
      el("button", { class: "btn primary", type: "button", onclick: () => close(true) }, `Replace with ${result.tasks.length} tasks`),
    ],
  }));
  if (!ok) return;
  ctx.store.commit(`Import ${file.name}`, (s) => {
    s.tasks = result.tasks;
    s.products.push(...result.newProducts);
    return [{ kind: "data", label: file.name, changes: [{ field: "tasks", from: ctx.state.tasks.length, to: result.tasks.length }] }];
  });
  ctx.undoToast(`${result.tasks.length} tasks imported`);
}

function statBox(label, value) {
  return el("div", { class: "stat" }, el("div", { class: "l" }, label), el("div", { class: "v" }, value));
}

function auditCard(ctx) {
  const u = (ctx.ui.audit ??= { q: "", limit: 40 });
  const all = ctx.state.log;
  const rows = all.filter((e) => matchesQuery(u.q, e.by, e.action, e.label, JSON.stringify(e.changes || "")));
  return el("section", { class: "card", id: "audit" },
    cardHead("Change history", all.length ? `${all.length} entries · last change ${relativeTime(all[0].ts)}` : "Every change made in this browser is listed here",
      el("input", { class: "input sm", type: "search", placeholder: "Filter history…", value: u.q, style: { width: "200px" }, "aria-label": "Filter history",
        onchange: (e) => { u.q = e.target.value; ctx.refresh(); } }),
      el("button", { class: "btn sm", type: "button", disabled: !all.length, onclick: () => {
        const csv = toCsv(all, [
          { label: "Time", value: (e) => e.ts }, { label: "By", value: (e) => e.by }, { label: "Action", value: (e) => e.action },
          { label: "Record", value: (e) => e.label ?? "" },
          { label: "Changes", value: (e) => (e.changes || []).map((c) => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join("; ") },
        ]);
        download(`APQR-change-history-${todayIso()}.csv`, `﻿${csv}`, "text/csv");
      } }, icon("download", "sm"), "CSV"),
      ctx.store.shared ? null : el("button", { class: "btn sm danger", type: "button", disabled: !all.length, onclick: async () => {
        if (await ctx.confirm({ title: "Clear the change history?", message: "The history list is emptied. Your data is not changed. This cannot be undone.", confirmLabel: "Clear history", danger: true })) ctx.store.clearLog();
      } }, "Clear")),
    rows.length ? el("div", { class: "log", style: { marginTop: "10px" } }, rows.slice(0, u.limit).map((e) => logItem(e, ctx.nameOf)),
      rows.length > u.limit ? el("div", { class: "table-more" }, el("button", { class: "btn", type: "button", onclick: () => { u.limit += 100; ctx.refresh(); } }, `Show more (${rows.length - u.limit})`)) : null) :
      el("div", { class: "empty" }, icon("history"), el("h3", {}, all.length ? "No entries match" : "No changes yet"), el("p", {}, "Edit a task, a product or a setting and it appears here with your name and the time.")));
}
