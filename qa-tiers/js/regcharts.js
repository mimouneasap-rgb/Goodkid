// Charts of one register: every metric the register's fields allow, drawn
// on the records its filters show. Generated from the register definition,
// so every register of both tiers gets them: status mix, one chart per
// drop-down field (source, type, category, department, class, owner…), the
// records each parent carries, raised vs closed per month, age of the open
// items, due-date horizon, overdue by person, on-time closure and cycle time
// per month, and every quantity per month and per person. Clicking a bar
// filters the register on that value.

import * as E from "./engine.js";
import { hbars, stackedH, line, columns } from "./charts.js";
import { CHART_DATA } from "./export.js";
import { esc, pct, fmtNum, statusClass } from "./ui.js";

const has = (v) => v !== "" && v != null;
/** One fixed colour per register (colour follows the entity). */
const SLOT = {
  t2: { act: "f-s1", dev: "f-s2", capa: "f-s3", cc: "f-s4", rel: "f-s5", apqr: "f-s6", tasks: "f-s7", find: "f-s8" },
  t1: { dl: "f-s1", br: "f-s2", fn: "f-s3", ac: "f-s4", hd: "f-s5", tr: "f-s6" },
};
/** Lists whose values are ordered: one hue, light → dark. */
const ORDINAL = { DevClass: ["Minor", "Major", "Critical"], Severity: ["Low", "Medium", "High"], CCCat: ["Minor", "Major", "Critical"], Priority: ["Low", "Medium", "High", "Urgent"], AudRisk: ["Low Risk", "Moderate Risk", "High Risk"] };
const STATUS_CLS = { G: "f-G", A: "f-A", R: "f-R", info: "f-s1", "": "f-other" };
const MONTHS = (refIso, n = 12) => Array.from({ length: n }, (_, k) => { const d = new Date(`${refIso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - (n - 1 - k)); return d.toISOString().slice(0, 7); });
const monLabel = (ym) => `${E.MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;
const short = (v, n = 34) => (String(v).length > n ? `${String(v).slice(0, n - 1)}…` : String(v));
const keyOf = (f, v) => (f.key === "product" ? String(v).split(" / ")[0].trim() : String(v));

/** All the charts of a register, as HTML cards (their figures go to CHART_DATA for the CSV export). */
export function registerCharts({ tier, reg, sc, list, ref, dateKey, closeKey, ownerKey, doneOf }) {
  const color = SLOT[tier]?.[reg] || "f-s1";
  const cards = [];
  const cid = (k) => `reg-${tier}-${reg}-${k}`;
  const add = (k, title, q, body, data, extra = "") => {
    if (!body) return;
    CHART_DATA.set(cid(k), { title: `${sc.title} — ${title}`, ...data, filters: [] });
    cards.push(`<div class="card card-pad" data-chart="${cid(k)}"><div class="card-head"><h2>${esc(title)}</h2></div><p class="muted" style="margin:-6px 0 10px;font-size:12.5px">${esc(q)}</p>${body}${extra}</div>`);
  };
  const n = list.length;
  if (!n) return { tiles: "", html: `<div class="empty">No record matches the filters — clear them or add records to see the charts.</div>` };
  const open = list.filter((x) => x.c.open);
  const overdue = list.filter((x) => x.c.live === "Overdue");
  const closed = closeKey ? list.filter((x) => has(x.r[closeKey])) : [];
  const withDue = closed.filter((x) => has(x.r.due));
  const onTime = withDue.filter((x) => x.r[closeKey] <= x.r.due).length;
  const ages = dateKey ? open.filter((x) => has(x.r[dateKey])).map((x) => E.diffDays(ref, x.r[dateKey])) : [];
  const cycles = dateKey && closeKey ? closed.filter((x) => has(x.r[dateKey])).map((x) => E.diffDays(x.r[closeKey], x.r[dateKey])).filter((d) => d >= 0).sort((a, b) => a - b) : [];
  const tiles = `<div class="glance" style="margin-bottom:14px">
    <div><b>${n}</b><span>records shown</span></div>
    ${open.length || closeKey ? `<div><b>${open.length}</b><span>open</span></div>` : ""}
    ${list.some((x) => "live" in x.c) ? `<div class="${overdue.length ? "R" : "G"}"><b>${overdue.length}</b><span>overdue</span></div>` : ""}
    ${closeKey ? `<div><b>${closed.length}</b><span>closed</span></div>` : ""}
    ${withDue.length ? `<div class="${onTime / withDue.length >= 0.9 ? "G" : onTime / withDue.length >= 0.75 ? "A" : "R"}"><b>${pct(onTime / withDue.length)}</b><span>closed on time</span></div>` : ""}
    ${ages.length ? `<div><b>${fmtNum(ages.reduce((a, b) => a + b, 0) / ages.length)}</b><span>average age of open (d)</span></div>` : ""}
    ${cycles.length ? `<div><b>${cycles[Math.floor(cycles.length / 2)]}</b><span>median cycle time (d)</span></div>` : ""}
  </div>`;

  // 1 · status
  const st = {};
  list.forEach((x) => { const v = x.c.live || x.c.status || x.r.status || x.r.att; if (has(v)) st[v] = (st[v] || 0) + 1; });
  const stPairs = Object.entries(st).sort((a, b) => b[1] - a[1]);
  if (stPairs.length) add("status", "Status", "Where the records stand today (live status: overdue counts first)",
    hbars(stPairs.map(([v, c]) => ({ label: v, value: c, cls: STATUS_CLS[statusClass(v)] || "f-other", tip: `**${v}**\n${c} of ${n} (${pct(c / n)}) · click to filter`, attrs: `data-fstatus="${esc(v)}"` })), { labelW: 160 }),
    { head: ["Status", "Records", "Share"], rows: stPairs.map(([v, c]) => [v, c, pct(c / n)]) });

  // 2 · one chart per drop-down / categorical field
  const cats = sc.fields.filter((f) => f.key !== "status" && f.key !== (sc.idKey || "id") && (f.type === "list" || f.type === "roster" || f.type === "ref" || f.type === "activity" || f.suggest));
  for (const f of cats) {
    const m = new Map();
    list.forEach((x) => { const v = x.r[f.key]; if (has(v)) m.set(keyOf(f, v), (m.get(keyOf(f, v)) || 0) + 1); });
    if (!m.size) continue;
    const ord = ORDINAL[f.list];
    let pairs = [...m.entries()];
    pairs = ord ? pairs.sort((a, b) => ord.indexOf(a[0]) - ord.indexOf(b[0])) : pairs.sort((a, b) => b[1] - a[1]);
    const top = pairs.slice(0, 12), rest = pairs.slice(12);
    const blank = n - pairs.reduce((a, [, c]) => a + c, 0);
    const items = top.map(([v, c]) => ({ label: short(v, 30), value: c, cls: ord ? `f-q${Math.min(3, ord.indexOf(v) + 1) || 1}` : color, tip: `**${v}**\n${c} of ${n} (${pct(c / n)})${f.type === "ref" ? "" : " · click to filter"}`, attrs: f.type === "ref" || f.key === "product" ? `data-fq="${esc(v)}"` : `data-fby="${f.key}" data-fv="${esc(v)}"` }));
    if (rest.length) items.push({ label: `Other (${rest.length})`, value: rest.reduce((a, [, c]) => a + c, 0), cls: "f-other" });
    if (blank > 0) items.push({ label: "Not filled in", value: blank, cls: "f-other" });
    const title = f.type === "ref" ? `Records per ${f.label.toLowerCase()}` : `By ${f.label.toLowerCase()}`;
    add(`by-${f.key}`, title, f.type === "ref" ? "Which parent records carry the most items — click to search for it" : `How the records split by ${f.label.toLowerCase()}`,
      hbars(items, { labelW: 170 }), { head: [f.label, "Records", "Share"], rows: [...pairs.map(([v, c]) => [v, c, pct(c / n)]), ...(blank > 0 ? [["Not filled in", blank, pct(blank / n)]] : [])] });
  }

  // 2b · multi-person fields (trainers, employees trained): one count per person
  for (const f of sc.fields.filter((x) => x.type === "people")) {
    const m = new Map();
    list.forEach((x) => String(x.r[f.key] || "").split(",").map((v) => v.trim()).filter(Boolean).forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
    if (!m.size) continue;
    const pairs = [...m.entries()].sort((a, b) => b[1] - a[1]);
    add(`by-${f.key}`, `By ${f.label.toLowerCase()}`, `Records per person named in ${f.label.toLowerCase()} — click to search for them`,
      hbars(pairs.slice(0, 14).map(([v, c]) => ({ label: short(v, 30), value: c, cls: color, tip: `**${v}**\n${c} records · click to search`, attrs: `data-fq="${esc(v)}"` })), { labelW: 170 }),
      { head: [f.label, "Records"], rows: pairs });
  }

  // 3 · raised vs closed per month
  if (dateKey) {
    const months = MONTHS(ref);
    const raised = months.map((m) => list.filter((x) => String(x.r[dateKey] || "").startsWith(m)).length);
    const shut = closeKey ? months.map((m) => list.filter((x) => String(x.r[closeKey] || "").startsWith(m)).length) : null;
    const series = [{ name: "Raised", cls: "f-s1", values: raised }, ...(shut ? [{ name: "Closed", cls: "f-s3", values: shut }] : [])];
    add("flow", shut ? "Raised vs closed per month" : `Records per month`, "Twelve months to the board date — is the backlog growing?",
      line(series, { labels: months.map(monLabel), empty: "Nothing dated in the last 12 months" }),
      { head: ["Month", "Raised", ...(shut ? ["Closed", "Net"] : [])], rows: months.map((m, i) => [m, raised[i], ...(shut ? [shut[i], raised[i] - shut[i]] : [])]) },
      shut ? `<div class="chart-legend"><span><i class="bg-s1"></i>Raised</span><span><i class="bg-s3"></i>Closed</span></div>` : "");
  }

  // 4 · age of the open records
  if (ages.length) {
    const B = [["0–30 d", "f-a1", (a) => a <= 30], ["31–60 d", "f-a2", (a) => a > 30 && a <= 60], ["61–90 d", "f-a3", (a) => a > 60 && a <= 90], ["> 90 d", "f-a4", (a) => a > 90]];
    const counts = B.map(([, , t]) => ages.filter(t).length);
    add("age", "Age of the open records", "Days since raised, as of the board date",
      hbars(B.map(([l, c], i) => ({ label: l, value: counts[i], cls: c })).filter((x) => x.value), {}), { head: ["Age", "Open records"], rows: B.map(([l], i) => [l, counts[i]]) });
  }

  // 5 · due-date horizon of the open records
  if (sc.fields.some((f) => f.key === "due") && open.length) {
    const H = [["Overdue", "f-R", (d) => d < 0], ["Due this week", "f-a4", (d) => d >= 0 && d <= 7], ["8–14 days", "f-a3", (d) => d > 7 && d <= 14], ["15–30 days", "f-a2", (d) => d > 14 && d <= 30], ["Later", "f-a1", (d) => d > 30]];
    const dueDays = open.filter((x) => has(x.r.due)).map((x) => E.diffDays(x.r.due, ref));
    const counts = H.map(([, , t]) => dueDays.filter(t).length);
    const noDue = open.length - dueDays.length;
    add("horizon", "Due-date horizon", "When the open records fall due",
      hbars([...H.map(([l, c], i) => ({ label: l, value: counts[i], cls: c })), { label: "No due date", value: noDue, cls: "f-other" }].filter((x) => x.value), {}),
      { head: ["Horizon", "Open records"], rows: [...H.map(([l], i) => [l, counts[i]]), ["No due date", noDue]] });
  }

  // 6 · overdue by person
  if (ownerKey && overdue.length) {
    const m = {};
    overdue.forEach((x) => { const o = x.r[ownerKey] || "No owner"; m[o] = (m[o] || 0) + 1; });
    const pairs = Object.entries(m).sort((a, b) => b[1] - a[1]);
    add("overdue-owner", "Overdue by person", "Who carries the overdue records — click to filter",
      hbars(pairs.slice(0, 14).map(([o, c]) => ({ label: o, value: c, cls: "f-R", attrs: `data-fby="${ownerKey}" data-fv="${esc(o)}"` })), { labelW: 170 }), { head: ["Person", "Overdue"], rows: pairs });
  }

  // 7 · on-time closure and cycle time per month
  if (dateKey && closeKey && closed.length) {
    const months = MONTHS(ref);
    const rate = months.map((m) => { const c = withDue.filter((x) => String(x.r[closeKey]).startsWith(m)); return c.length ? c.filter((x) => x.r[closeKey] <= x.r.due).length / c.length : null; });
    if (rate.some((v) => v != null)) add("ontime", "On-time closure per month", "Of the records closed each month, the share closed by their due date",
      line([{ name: "On time", cls: "f-s3", values: rate }], { labels: months.map(monLabel), pctAxis: true, target: 0.9 }), { head: ["Month", "On-time rate"], rows: months.map((m, i) => [m, rate[i] == null ? "" : pct(rate[i])]) });
    const cyc = months.map((m) => { const c = closed.filter((x) => String(x.r[closeKey]).startsWith(m) && has(x.r[dateKey])); return c.length ? c.reduce((a, x) => a + E.diffDays(x.r[closeKey], x.r[dateKey]), 0) / c.length : null; });
    if (cyc.some((v) => v != null)) add("cycle", "Average cycle time per month", "Days from raised to closed, for the records closed each month",
      line([{ name: "Cycle time (d)", cls: color, values: cyc }], { labels: months.map(monLabel) }), { head: ["Month", "Average cycle time (d)"], rows: months.map((m, i) => [m, cyc[i] == null ? "" : fmtNum(cyc[i])]) });
  }

  // 8 · quantities: every number per month, and per person
  const nums = sc.fields.filter((f) => (f.type === "int" || f.type === "num") && f.key !== (sc.idKey || "id"));
  if (nums.length && dateKey) {
    const months = MONTHS(ref);
    nums.forEach((f, k) => {
      const v = months.map((m) => list.filter((x) => String(x.r[dateKey] || "").startsWith(m)).reduce((a, x) => a + (+x.r[f.key] || 0), 0));
      if (!v.some(Boolean)) return;
      add(`sum-${f.key}`, `${f.label} per month`, `Total of ${f.label.toLowerCase()} recorded each month`,
        columns(months.map((m, i) => ({ label: monLabel(m), short: E.MONTHS[+m.slice(5, 7) - 1], parts: [{ value: Math.round(v[i] * 100) / 100, cls: `f-s${(k % 8) + 1}`, name: f.label }] })), { height: 200 }),
        { head: ["Month", f.label], rows: months.map((m, i) => [m, v[i]]) });
    });
    if (ownerKey) {
      const people = [...new Set(list.map((x) => x.r[ownerKey]).filter(has))];
      const used = nums.filter((f) => list.some((x) => +x.r[f.key])).slice(0, 8);
      if (people.length && used.length) {
        const rows = people.map((p) => ({ label: p, parts: used.map((f, k) => ({ value: list.filter((x) => x.r[ownerKey] === p).reduce((a, x) => a + (+x.r[f.key] || 0), 0), cls: `f-s${k + 1}`, name: f.label })) }))
          .sort((a, b) => b.parts.reduce((s, x) => s + x.value, 0) - a.parts.reduce((s, x) => s + x.value, 0));
        add("by-person", used.length > 1 ? "Quantities per person" : `${used[0].label} per person`, "Totals over the records shown",
          used.length > 1 ? stackedH(rows, { labelW: 170 }) : hbars(rows.map((r) => ({ label: r.label, value: r.parts[0].value, cls: color })), { labelW: 170 }),
          { head: ["Person", ...used.map((f) => f.label)], rows: rows.map((r) => [r.label, ...r.parts.map((x) => x.value)]) },
          used.length > 1 ? `<div class="chart-legend">${used.map((f, k) => `<span><i class="bg-s${k + 1}"></i>${esc(f.label)}</span>`).join("")}</div>` : "");
      }
    }
  }

  // 9 · data check
  const flags = {};
  list.forEach((x) => { if (x.c.check && x.c.check !== "OK") flags[x.c.check] = (flags[x.c.check] || 0) + 1; });
  const fp = Object.entries(flags).sort((a, b) => b[1] - a[1]);
  if (fp.length) add("check", "Data-check flags", "What to fix before the KPIs can be trusted",
    hbars(fp.map(([v, c]) => ({ label: v, value: c, cls: "f-R" })), { labelW: 200 }), { head: ["Flag", "Records"], rows: fp });

  return { tiles, html: `<div class="grid g2">${cards.join("")}</div>` };
}
