// Documentation hub (Tier 2 · section 06): the SOP master list imported from the
// DMS, the periodic-review calendar, the documents of each owner and the
// document actions in progress (register 06). Views: overview, master list,
// periodic review, by owner, document actions.

import { store } from "./store.js";
import * as E from "./engine.js";
import { openEditor } from "./registers.js";
import { dmsToSops } from "./dms.js";
import { esc, pill, fmtDate, fmtMonth, pct, toast, modal, $, $$, fresh, today } from "./ui.js";
import { saveFile, loadScript } from "./export.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const has = (v) => v !== "" && v != null;
const view = { tab: "overview", q: "", st: "", owner: "" };
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

/** Life-cycle states of an SOP, in the order they are shown, with their colour. */
export const SOP_STATES = [
  ["Overdue", "Review overdue", "R"], ["Rework needed", "Rework needed (rejected)", "R"], ["Review due", "Review due ≤ 6 months", "A"],
  ["In workflow", "In workflow (draft)", "A"], ["Approved — not effective", "Approved — not yet effective", "info"], ["Effective soon", "Effective soon", "info"],
  ["Effective", "Effective", "G"], ["Obsolete", "Obsolete", "N"],
];
const RAGOF = Object.fromEntries(SOP_STATES.map(([k, , c]) => [k, c]));
const LABEL = Object.fromEntries(SOP_STATES.map(([k, l]) => [k, l]));
const sopPill = (live) => pill(live === "Overdue" ? "Review overdue" : live, RAGOF[live] || "N");
const dueText = (c) => (c.toReview === "" ? "" : c.toReview < 0 ? `${-c.toReview} d late` : c.toReview <= 180 ? `in ${c.toReview} d` : `in ${Math.round(c.toReview / 30.4)} mo`);

function rowsOf(s) {
  const comp = E.t2Computed(s).sop || [];
  return (s.sop || []).map((r, i) => ({ r, c: comp[i] || {}, i }));
}
const lang = (id) => (/\dE\//.test(id) ? "EN" : /\dF\//.test(id) ? "FR" : "");

export function renderDocs(root) {
  root = fresh(root);
  const s = store.t2;
  const rows = rowsOf(s);
  const by = (k) => rows.filter((x) => x.c.live === k);
  const inForce = rows.filter((x) => x.c.inForce);
  const okForce = inForce.filter((x) => x.c.live !== "Overdue");
  const health = inForce.length ? okForce.length / inForce.length : null;
  const hrag = health == null ? "N" : health >= 1 ? "G" : health >= 0.9 ? "A" : "R";
  const docComp = E.t2Computed(s).doc || [];
  const actOpen = (s.doc || []).filter((r, i) => docComp[i]?.open).length;
  const actLate = docComp.filter((c) => c.live === "Overdue").length;
  const owners = [...new Set(rows.map((x) => x.r.owner).filter(Boolean))];
  const RR = 52, CC = 2 * Math.PI * RR;
  const stat = (label, value, sub = "", cls = "") => `<div class="ths ${cls}"><dt>${esc(label)}</dt><dd>${value}${sub ? `<small>${sub}</small>` : ""}</dd></div>`;
  const TABS = [["overview", "▧", "Overview"], ["list", "▤", `SOP master list · ${rows.length}`], ["review", "◷", `Periodic review · ${by("Overdue").length + by("Review due").length}`], ["owners", "◎", `By owner · ${owners.length}`], ["actions", "✎", `Document actions · ${actOpen}`]];
  root.innerHTML = `
    <section class="hero trn-hero">
      <div class="trn-hero-grid">
        <div class="trn-hero-text">
          <div class="eyebrow">Tier 2 · Daily management · section 06</div>
          <h1>Documentation</h1>
          <p>The department's controlled SOPs from the DMS — revision, status, effective and periodic-review dates, document owner — and the document actions in progress.</p>
          <div class="hero-meta"><span class="chip">Source <b>DMS export (SeedDMS / Scigeniq)</b></span><span class="chip">Owner <b>= uploader</b></span><span class="chip">Periodic review <b>3 years</b></span></div>
          <div class="row" style="margin-top:16px"><button class="btn primary" data-import>⤓ Import DMS export</button><button class="btn on-dark" data-addsop>＋ Add SOP</button><button class="btn on-dark" data-xlsx>⤓ Master list (xlsx)</button><a class="btn on-dark" href="#/t2/reg/doc">Document actions ›</a></div>
        </div>
        <div class="trn-hero-kpi">
          <figure class="trn-ring" aria-label="SOPs within their review period ${health == null ? "no data" : pct(health)}">
            <svg viewBox="0 0 132 132" role="img"><circle cx="66" cy="66" r="${RR}" class="trk"/>${health == null ? "" : `<circle cx="66" cy="66" r="${RR}" class="arc ${hrag}" stroke-dasharray="${Math.max(0.01, health) * CC} ${CC}" transform="rotate(-90 66 66)"/>`}
              <text x="66" y="70" text-anchor="middle" class="v"${health != null && health >= 0.995 ? ' style="font-size:25px"' : ""}>${health == null ? "—" : `${Math.round(health * 100)}%`}</text><text x="66" y="88" text-anchor="middle" class="l">in review period</text></svg>
            <figcaption>SOPs in force<br><b>not past their review date</b></figcaption>
          </figure>
          <dl class="trn-hero-stats">
            ${stat("SOPs in force", String(inForce.length), ` / ${rows.length} listed`)}
            ${stat("Review overdue", String(by("Overdue").length), "", by("Overdue").length ? "bad" : "good")}
            ${stat("Review due ≤ 6 months", String(by("Review due").length))}
            ${stat("Draft / rework", String(by("In workflow").length + by("Rework needed").length), ` · ${by("Rework needed").length} rejected`, by("Rework needed").length ? "bad" : "")}
            ${stat("Approved, not effective", String(by("Approved — not effective").length + by("Effective soon").length))}
            ${stat("Document actions open", String(actOpen), actLate ? ` · ${actLate} late` : "", actLate ? "bad" : "")}
          </dl>
        </div>
      </div>
    </section>
    <nav class="trn-tabs" role="tablist" aria-label="Documentation views">${TABS.map(([v, ic, l]) => `<button type="button" role="tab" data-tab="${v}" aria-selected="${view.tab === v}"><span>${ic}</span>${l}</button>`).join("")}</nav>
    <div data-tabbody></div>`;
  const body = $("[data-tabbody]", root);
  const redraw = () => renderDocs(root);
  if (view.tab === "list") listView(body, s, rows, redraw);
  else if (view.tab === "review") reviewView(body, s, rows);
  else if (view.tab === "owners") ownersView(body, s, rows);
  else if (view.tab === "actions") actionsView(body, s, rows, redraw);
  else overview(body, s, rows);
  $$("[data-tab]", root).forEach((b) => b.onclick = () => { view.tab = b.dataset.tab; redraw(); });
  $("[data-import]", root).onclick = () => importDialog(redraw);
  $("[data-addsop]", root).onclick = () => openEditor({ tier: "t2", reg: "sop", prefill: { state: "Draft" }, onSaved: redraw });
  $("[data-xlsx]", root).onclick = (e) => busy(e.currentTarget, () => exportList(s, rows));
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-sop]");
    if (t) openEditor({ tier: "t2", reg: "sop", index: +t.dataset.sop, onSaved: redraw });
    const owner = e.target.closest("[data-ownerlist]");
    if (owner) { view.tab = "list"; view.owner = owner.dataset.ownerlist; view.st = ""; redraw(); }
    const st = e.target.closest("[data-stlist]");
    if (st) { view.tab = "list"; view.st = st.dataset.stlist; view.owner = ""; redraw(); }
  });
}

async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = "Preparing…";
  try { await fn(); } catch (e) { toast(e.message || "Export failed"); } finally { btn.disabled = false; btn.textContent = t; }
}

/* ── overview ── */
function overview(body, s, rows) {
  const total = rows.length || 1;
  const mix = SOP_STATES.map(([k, l, c]) => ({ k, l, c, n: rows.filter((x) => x.c.live === k).length })).filter((x) => x.n);
  const attention = rows.filter((x) => ["Overdue", "Rework needed", "Review due", "In workflow", "Approved — not effective"].includes(x.c.live) || (x.c.check && x.c.check !== "OK"))
    .sort((a, b) => (SOP_STATES.findIndex(([k]) => k === a.c.live) - SOP_STATES.findIndex(([k]) => k === b.c.live)) || String(a.r.expiry || "").localeCompare(String(b.r.expiry || "")));
  // periodic reviews per year (SOPs in force)
  const years = {};
  for (const x of rows) if (x.c.inForce && has(x.r.expiry)) years[x.r.expiry.slice(0, 4)] = (years[x.r.expiry.slice(0, 4)] || 0) + 1;
  const yMax = Math.max(1, ...Object.values(years));
  const ccs = {};
  for (const x of rows) for (const c of String(x.r.cc || "").split(/,\s*/).filter(Boolean)) ccs[c] = (ccs[c] || 0) + 1;
  const ccLinks = new Set((s.cc || []).map((r) => r.id));
  const effByYear = {};
  for (const x of rows) if (has(x.r.eff)) effByYear[x.r.eff.slice(0, 4)] = (effByYear[x.r.eff.slice(0, 4)] || 0) + 1;
  body.innerHTML = `
    <div class="card card-pad">
      <div class="card-head"><h2>Where the SOPs stand <span class="sub">${rows.length} SOPs · as of ${fmtDate(s.setup.statusDate)} · click a status to list its SOPs</span></h2></div>
      ${rows.length ? `<div class="doc-mix">${mix.map((x) => `<button type="button" class="dm-seg bg-${x.c === "info" ? "s1" : x.c}" style="flex:${x.n}" data-stlist="${esc(x.k)}" title="${esc(`${x.l}: ${x.n}`)}"><b>${x.n}</b></button>`).join("")}</div>
      <div class="legend" style="margin-top:10px">${mix.map((x) => `<button type="button" class="leg-btn" data-stlist="${esc(x.k)}"><i class="bg-${x.c === "info" ? "s1" : x.c}"></i>${esc(x.l)} · <b>${x.n}</b> <span class="muted">${pct(x.n / total)}</span></button>`).join("")}</div>`
      : `<div class="empty">No SOP yet — import the DMS export (button above) or add the SOPs one by one.</div>`}
    </div>
    <div class="grid split-wide" style="margin-top:16px">
      <div class="card card-pad">
        <div class="card-head"><h2>Needs attention · ${attention.length}</h2></div>
        <p class="muted" style="margin:-4px 0 10px;font-size:12.5px">Review overdue or due ≤ 6 months · rejected drafts · drafts in workflow · approved, not effective · data to complete</p>
        ${attention.length ? `<div class="urgent">${attention.map((x) => `<a href="javascript:void 0" data-sop="${x.i}"><span class="ref">${esc(x.r.id)}</span><span class="desc" title="${esc(x.r.title || "")}">${esc(x.r.title || "")} <span class="muted">· ${esc(x.r.owner || "no owner")}${x.r.expiry ? ` · review ${fmtDate(x.r.expiry)}${dueText(x.c) ? ` (${dueText(x.c)})` : ""}` : ""}${x.c.check && x.c.check !== "OK" ? ` · ⚠ ${esc(x.c.check)}` : ""}</span></span>${sopPill(x.c.live)}</a>`).join("")}</div>`
        : `<div class="empty">Nothing to act on — every SOP is effective and within its review period.</div>`}
      </div>
      <div class="stack">
        <div class="card card-pad"><div class="card-head"><h2>Periodic reviews per year <span class="sub">SOPs in force, by review date</span></h2></div>
          <div class="yr-bars">${Object.keys(years).sort().map((y) => `<div class="yb"><span class="yb-n">${years[y]}</span><i style="height:${(years[y] / yMax) * 100}%"></i><b>${y}</b></div>`).join("") || `<div class="empty">No review date</div>`}</div></div>
        <div class="card card-pad"><div class="card-head"><h2>Change controls behind the revisions</h2></div>
          ${Object.keys(ccs).length ? `<div class="cc-list">${Object.entries(ccs).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<${ccLinks.has(c) ? `a href="#/t2/reg/cc?id=${encodeURIComponent(c)}"` : "span"} class="cc-chip"><span class="mono">${esc(c)}</span><b>${n}</b></${ccLinks.has(c) ? "a" : "span"}>`).join("")}</div>` : `<div class="empty">No change control recorded</div>`}
          <p class="muted" style="font-size:12px;margin:8px 0 0">Effective dates: ${Object.keys(effByYear).sort().map((y) => `${y} · ${effByYear[y]}`).join(" · ") || "—"}</p></div>
      </div>
    </div>`;
}

/* ── master list ── */
function listView(body, s, rows, redraw) {
  const owners = [...new Set(rows.map((x) => x.r.owner).filter(Boolean))].sort();
  const draw = () => {
    const q = view.q.toLowerCase();
    const list = rows.filter((x) => (!view.st || x.c.live === view.st) && (!view.owner || x.r.owner === view.owner) && (!q || Object.values(x.r).some((v) => String(v).toLowerCase().includes(q))))
      .sort((a, b) => String(a.r.id).localeCompare(String(b.r.id), undefined, { numeric: true }));
    $("[data-tbl]", body).innerHTML = `<table class="data doc-tbl"><thead><tr><th>SOP No.</th><th>Title</th><th class="num">Rev.</th><th>DMS No.</th><th>Status</th><th>Effective</th><th>Periodic review</th><th>Owner</th></tr></thead>
      <tbody>${list.map((x) => `<tr data-sop="${x.i}" style="cursor:pointer"><td class="mono"><b>${esc(x.r.id)}</b>${lang(x.r.id) ? ` <span class="lang">${lang(x.r.id)}</span>` : ""}</td><td class="wrap" style="min-width:260px">${esc(x.r.title || "")}${x.r.cc ? `<br><small class="muted mono">${esc(x.r.cc)}</small>` : ""}</td><td class="num">${esc(x.r.rev || "")}</td><td class="mono muted">${esc(x.r.dms || "")}</td>
        <td>${sopPill(x.c.live)}</td><td>${fmtDate(x.r.eff)}</td><td>${fmtDate(x.r.expiry)}${dueText(x.c) ? `<br><small class="${x.c.toReview < 0 ? "bad-t" : x.c.toReview <= 180 ? "warn-t" : "muted"}">${dueText(x.c)}</small>` : ""}</td>
        <td>${x.r.owner ? `<span class="who"><span class="av sm">${esc(initials(x.r.owner))}</span>${esc(x.r.owner)}</span>` : `<span class="muted">—</span>`}</td></tr>`).join("")
        || `<tr><td colspan="8"><div class="empty">No SOP matches.</div></td></tr>`}</tbody></table>`;
    $("[data-count]", body).textContent = `${list.length} of ${rows.length} SOPs`;
  };
  body.innerHTML = `<div class="card card-pad">
    <div class="toolbar" style="margin-bottom:12px"><input type="search" data-q placeholder="Search SOP No., title, DMS No., change control…" value="${esc(view.q)}" style="flex:1;min-width:220px">
      <select data-st><option value="">All statuses</option>${SOP_STATES.map(([k, l]) => `<option value="${esc(k)}" ${view.st === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <select data-own><option value="">All owners</option>${owners.map((o) => `<option ${view.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
      <span class="muted" data-count style="font-size:13px"></span></div>
    <div class="table-wrap" data-tbl></div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Click an SOP to edit it. Periodic review = the DMS expiry date (3 years). EN / FR = language of the procedure.</p></div>`;
  $("[data-q]", body).oninput = (e) => { view.q = e.target.value; draw(); };
  $("[data-st]", body).onchange = (e) => { view.st = e.target.value; draw(); };
  $("[data-own]", body).onchange = (e) => { view.owner = e.target.value; draw(); };
  draw();
}

/* ── periodic review calendar ── */
function reviewView(body, s, rows) {
  const ref = s.setup.statusDate;
  const q0 = { y: +ref.slice(0, 4), q: Math.floor((+ref.slice(5, 7) - 1) / 3) };
  const qOf = (iso) => ({ y: +iso.slice(0, 4), q: Math.floor((+iso.slice(5, 7) - 1) / 3) });
  const key = (x) => x.y * 4 + x.q;
  const live = rows.filter((x) => x.c.inForce && has(x.r.expiry));
  const late = live.filter((x) => x.c.live === "Overdue");
  const ahead = live.filter((x) => x.c.live !== "Overdue");
  // the quarters that hold a review (empty ones are skipped), the current one always shown
  const qs = [...new Set([key(q0), ...ahead.map((x) => key(qOf(x.r.expiry)))])].sort((a, b) => a - b);
  const cols = [{ label: "Overdue", sub: "past the review date", items: late, cls: "late" },
    ...qs.map((k) => { const y = Math.floor(k / 4), q = k % 4; return { label: `Q${q + 1} ${y}`, sub: ["Jan – Mar", "Apr – Jun", "Jul – Sep", "Oct – Dec"][q], items: ahead.filter((x) => key(qOf(x.r.expiry)) === k), cls: k === key(q0) ? "cur" : "" }; })];
  const firstAhead = qs.find((k) => k > key(q0) && ahead.some((x) => key(qOf(x.r.expiry)) === k));
  const startPre = (x) => ({ id: x.r.id, title: x.r.title, type: "SOP", dept: "QA", version: x.r.rev ? String(+x.r.rev + 1).padStart(2, "0") : "", action: "Periodic Review", owner: x.r.owner, opened: today(), due: x.r.expiry, status: "Open" });
  const soon = live.filter((x) => ["Overdue", "Review due"].includes(x.c.live)).sort((a, b) => a.r.expiry.localeCompare(b.r.expiry));
  const hasAction = new Set((s.doc || []).filter((r) => r.status !== "Closed").map((r) => r.id));
  body.innerHTML = `
    <div class="card card-pad">
      <div class="card-head"><h2>Periodic review calendar <span class="sub">SOPs in force by review date, quarter by quarter · quarters without a review are not shown${firstAhead ? ` · next reviews in Q${(firstAhead % 4) + 1} ${Math.floor(firstAhead / 4)}` : ""}</span></h2></div>
      <div class="rv-cal">${cols.map((c) => `<div class="rv-col ${c.cls} ${c.items.length ? "" : "empty"}"><div class="rv-h"><b>${esc(c.label)}</b><span>${esc(c.sub)}</span><i>${c.items.length}</i></div>
        <div class="rv-items">${c.items.sort((a, b) => a.r.expiry.localeCompare(b.r.expiry)).map((x) => `<button type="button" class="rv-chip" data-sop="${x.i}" title="${esc(`${x.r.id} · ${x.r.title}\nReview ${fmtDate(x.r.expiry)} · ${x.r.owner || ""}`)}"><b>${esc(x.r.id.replace(/\/Onc$/i, ""))}</b><span>${esc(fmtDate(x.r.expiry))} · ${esc(initials(x.r.owner))}</span></button>`).join("")}</div></div>`).join("")}</div>
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <div class="card-head"><h2>Reviews to start <span class="sub">overdue or due within 6 months — start the periodic review as a document action (register 06)</span></h2></div>
      ${soon.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>SOP No.</th><th>Title</th><th>Owner</th><th>Review due</th><th></th><th></th></tr></thead><tbody>${soon.map((x) => `<tr><td class="mono"><b>${esc(x.r.id)}</b></td><td class="wrap">${esc(x.r.title)}</td><td>${esc(x.r.owner || "—")}</td><td>${fmtDate(x.r.expiry)} <small class="${x.c.toReview < 0 ? "bad-t" : "warn-t"}">${dueText(x.c)}</small></td><td>${sopPill(x.c.live)}</td>
        <td>${hasAction.has(x.r.id) ? `<a class="btn sm ghost" href="#/t2/reg/doc?id=${encodeURIComponent(x.r.id)}">Action open ›</a>` : `<a class="btn sm" href="#/t2/reg/doc?new=1&prefill=${encodeURIComponent(JSON.stringify(startPre(x)))}">▶ Start review</a>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">No periodic review due in the next 6 months.</div>`}
    </div>`;
}

/* ── by owner ── */
function ownersView(body, s, rows) {
  const owners = [...new Set(rows.map((x) => x.r.owner || "No owner"))].sort((a, b) => rows.filter((x) => (x.r.owner || "No owner") === b).length - rows.filter((x) => (x.r.owner || "No owner") === a).length);
  const team = new Map((s.load || []).map((r) => [r.member, r.role || ""]));
  const max = Math.max(1, ...owners.map((o) => rows.filter((x) => (x.r.owner || "No owner") === o).length));
  body.innerHTML = `<div class="own-grid">${owners.map((o) => {
    const mine = rows.filter((x) => (x.r.owner || "No owner") === o);
    const cnt = (k) => mine.filter((x) => x.c.live === k).length;
    const seg = SOP_STATES.map(([k, l, c]) => ({ k, l, c, n: cnt(k) })).filter((x) => x.n);
    const next = mine.filter((x) => x.c.inForce && has(x.r.expiry)).sort((a, b) => a.r.expiry.localeCompare(b.r.expiry))[0];
    return `<article class="card card-pad own-card">
      <div class="own-head"><span class="av">${esc(initials(o))}</span><div><b>${esc(o)}</b><small>${esc(team.get(o) || (team.size && o !== "No owner" ? "Outside the QA team" : ""))}</small></div><span class="own-n">${mine.length}<small>SOPs</small></span></div>
      <div class="doc-mix sm" style="width:${(mine.length / max) * 100}%">${seg.map((x) => `<span class="dm-seg bg-${x.c === "info" ? "s1" : x.c}" style="flex:${x.n}" title="${esc(`${x.l}: ${x.n}`)}"></span>`).join("")}</div>
      <dl class="own-stats"><div><dt>In force</dt><dd>${mine.filter((x) => x.c.inForce).length}</dd></div><div><dt>Review ≤ 6 mo</dt><dd>${cnt("Review due")}</dd></div><div class="${cnt("Overdue") ? "bad" : ""}"><dt>Overdue</dt><dd>${cnt("Overdue")}</dd></div><div class="${cnt("Rework needed") ? "bad" : ""}"><dt>Draft / rework</dt><dd>${cnt("In workflow") + cnt("Rework needed")}</dd></div></dl>
      <p class="muted" style="margin:0;font-size:12.5px">${next ? `Next review: <b>${esc(next.r.id)}</b> on ${fmtDate(next.r.expiry)}` : "No review date"}</p>
      <div class="own-ids">${mine.sort((a, b) => a.r.id.localeCompare(b.r.id, undefined, { numeric: true })).map((x) => `<button type="button" class="rv-chip mini ${RAGOF[x.c.live] || ""}" data-sop="${x.i}" title="${esc(`${x.r.title} — ${LABEL[x.c.live] || x.c.live}`)}">${esc(x.r.id.replace(/\/Onc$/i, ""))}</button>`).join("")}</div>
      <button class="btn sm ghost" data-ownerlist="${esc(o === "No owner" ? "" : o)}">List ›</button>
    </article>`;
  }).join("") || `<div class="card card-pad"><div class="empty">No SOP yet.</div></div>`}</div>`;
}

/* ── document actions (register 06) ── */
function actionsView(body, s, rows, redraw) {
  const comp = E.t2Computed(s).doc || [];
  const acts = (s.doc || []).map((r, i) => ({ r, c: comp[i] || {}, i }));
  const sopIds = new Map(rows.map((x) => [x.r.id, x]));
  const open = acts.filter((x) => x.c.open);
  const pre = { type: "SOP", dept: "QA", action: "Revision", status: "Open", opened: today() };
  body.innerHTML = `<div class="card card-pad">
    <div class="card-head"><h2>Document actions in progress <span class="sub">register 06 · ${open.length} open · ${acts.filter((x) => x.c.live === "Overdue").length} past due · ${acts.length} in total</span></h2>
      <div class="row"><a class="btn sm" href="#/t2/reg/doc?new=1&prefill=${encodeURIComponent(JSON.stringify(pre))}">＋ New document action</a><a class="btn sm ghost" href="#/t2/reg/doc">Register 06 ›</a></div></div>
    ${acts.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Document</th><th>Title</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>In the master list</th></tr></thead><tbody>${acts.sort((a, b) => (b.c.open - a.c.open) || String(a.r.due || "").localeCompare(String(b.r.due || ""))).map((x) => { const m = sopIds.get(x.r.id); return `<tr><td class="mono"><a href="#/t2/reg/doc?id=${encodeURIComponent(x.r.id)}"><b>${esc(x.r.id)}</b></a></td><td class="wrap">${esc(x.r.title || "")}</td><td>${esc(x.r.action || "")}${x.r.version ? ` · v${esc(x.r.version)}` : ""}</td><td>${esc(x.r.owner || "")}</td><td>${fmtDate(x.r.due)}</td><td>${pill(x.c.live || x.r.status)}</td><td>${m ? `<button type="button" class="btn sm ghost" data-sop="${m.i}">Rev. ${esc(m.r.rev || "?")} · ${esc(LABEL[m.c.live] || m.c.live)}</button>` : `<span class="muted">—</span>`}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty">No document action yet. Start one from the periodic review tab (▶ Start review) or with ＋ New document action — a revision, a new SOP or a withdrawal, tracked to its effective date.</div>`}
    <p class="muted" style="font-size:12px;margin:10px 0 0">A document action past its due date counts in the Documentation KPI, as does an SOP past its periodic review date.</p></div>`;
}

/* ── import the DMS export ── */
const SHOW = [["title", "Title"], ["rev", "Rev."], ["dms", "DMS No."], ["state", "Status"], ["eff", "Effective"], ["expiry", "Review due"], ["owner", "Owner"], ["cc", "Change control"]];
function importDialog(redraw) {
  const { el, close } = modal(`<div class="row"><div><div class="eyebrow">Documentation · SOP master list</div><h2>Import the DMS export</h2></div><span class="spacer"></span><button class="btn ghost" data-x aria-label="Close">✕</button></div>
    <p class="muted" style="margin:0">The metadata export of the DMS (SeedDMS / Scigeniq, .xls or .xlsx). One line per SOP is kept — SOP No., title, revision, DMS No., status, effective and review dates, change control — and the <b>document owner is the uploader</b>. Reviewer lines and e-mail addresses are left out.</p>
    <label class="drop" style="margin-top:12px"><input type="file" accept=".xls,.xlsx,.csv" data-file> <span>Choose the export file…</span></label>
    <div data-prev></div>`);
  el.querySelector("[data-x]").onclick = close;
  el.querySelector("[data-file]").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const prev = el.querySelector("[data-prev]");
    prev.innerHTML = `<div class="empty">Reading ${esc(file.name)}…</div>`;
    try {
      const X = await loadScript(XLSX_URL, "XLSX");
      const wb = X.read(await file.arrayBuffer(), { type: "array" });
      const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const s = store.t2;
      const { sops, skipped } = dmsToSops(aoa, (s.load || []).map((r) => r.member).filter(Boolean), s.lists.People || []);
      const have = new Map((s.sop || []).map((r, i) => [r.id, i]));
      const adds = sops.filter((r) => !have.has(r.id));
      const ups = sops.filter((r) => have.has(r.id)).map((r) => { const old = s.sop[have.get(r.id)]; const ch = SHOW.filter(([k]) => has(r[k]) && String(r[k]) !== String(old[k] ?? "")); return { r, old, ch }; }).filter((x) => x.ch.length);
      const same = sops.length - adds.length - ups.length;
      prev.innerHTML = `<div class="callout" style="margin-top:12px"><b>${sops.length} SOP${sops.length === 1 ? "" : "s"}</b> in the export · <b>${adds.length}</b> new · <b>${ups.length}</b> to update · ${same} unchanged${skipped ? ` · ${skipped} line(s) without an SOP number left out` : ""}. SOPs of the board that are not in the export stay as they are.</div>
        ${adds.length || ups.length ? `<div class="table-wrap" style="max-height:340px;margin-top:10px"><table class="plain"><thead><tr><th></th><th>SOP No.</th><th>Title</th><th>Rev.</th><th>Status</th><th>Review due</th><th>Owner</th></tr></thead><tbody>
          ${adds.map((r) => `<tr><td>${pill("New", "G")}</td><td class="mono">${esc(r.id)}</td><td>${esc(r.title || "")}</td><td>${esc(r.rev || "")}</td><td>${esc(r.state || "")}</td><td>${fmtDate(r.expiry)}</td><td>${esc(r.owner || "")}</td></tr>`).join("")}
          ${ups.map(({ r, ch, old }) => `<tr><td>${pill("Update", "A")}</td><td class="mono">${esc(r.id)}</td><td colspan="5">${ch.map(([k, l]) => `${esc(l)}: <s class="muted">${esc(old[k] ?? "—")}</s> → <b>${esc(k === "eff" || k === "expiry" ? fmtDate(r[k]) : r[k])}</b>`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-apply>Add ${adds.length} and update ${ups.length}</button></div>` : `<div class="empty" style="margin-top:10px">The master list is already up to date.</div>`}`;
      el.querySelector("[data-apply]")?.addEventListener("click", () => {
        for (const r of adds) store.upsert("t2", "sop", null, { ...r }, r.id);
        for (const { r } of ups) { const i = s.sop.findIndex((x) => x.id === r.id); if (i >= 0) store.upsert("t2", "sop", i, { ...s.sop[i], ...r }, r.id); }
        close(); toast(`SOP master list: ${adds.length} added, ${ups.length} updated`); view.tab = "list"; redraw();
      });
    } catch (err) { prev.innerHTML = `<div class="callout bad" style="margin-top:12px">${esc(err.message || "The file could not be read")}</div>`; }
  };
}

async function exportList(s, rows) {
  const X = await loadScript(XLSX_URL, "XLSX");
  const head = ["SOP No.", "Title", "Revision", "DMS No.", "DMS status", "Board status", "Effective date", "Periodic review due", "Days to review", "Document owner", "Change control", "Comments"];
  const d = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : "");
  const aoa = [head, ...rows.sort((a, b) => a.r.id.localeCompare(b.r.id, undefined, { numeric: true })).map((x) => [x.r.id, x.r.title || "", x.r.rev || "", x.r.dms || "", x.r.state || "", LABEL[x.c.live] || x.c.live || "", d(x.r.eff), d(x.r.expiry), x.c.toReview === "" ? "" : x.c.toReview, x.r.owner || "", x.r.cc || "", x.r.comments || ""])];
  const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws["!cols"] = [{ wch: 18 }, { wch: 70 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 26 }, { wch: 13 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 30 }];
  ws["!autofilter"] = { ref: `A1:L${aoa.length}` };
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, "SOP master list");
  const out = X.write(wb, { type: "array", bookType: "xlsx" });
  await saveFile(`QA_SOP_Master_List_${s.setup.statusDate}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

