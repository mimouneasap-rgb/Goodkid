// Batch Release Desk: UI. Plain DOM + hand-drawn SVG charts, no framework.
(function () {
  "use strict";
  const M = window.ReleaseModel;
  const STORE_KEY = "brd.workbook.v1";
  const THEME_KEY = "brd.theme";
  const SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

  let model = null;
  let source = "bundled"; // bundled | imported
  const ui = {
    view: "overview",
    q: "",
    status: "all",
    bucket: "all",
    category: "all",
    flagged: false,
    preset: null, // { label, fn }
    sort: { key: "cll", dir: -1 },
    limit: 80,
    blockedSort: "expiry",
  };

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "—");
  const fmtMonth = (ym, long) => `${MON[+ym.slice(5, 7) - 1]}${long ? " " + ym.slice(0, 4) : ""}`;
  const nf = new Intl.NumberFormat("en-GB");
  const fmtN = (n) => (n === null || n === undefined ? "—" : nf.format(Math.round(n)));
  const pct = (x, d = 0) => (x === null || x === undefined ? "—" : (x * 100).toFixed(d) + "%");
  const days = (d) => (d === null || d === undefined ? "—" : d === 0 ? "same day" : `${d % 1 ? d.toFixed(1) : d} day${d === 1 ? "" : "s"}`);
  const plural = (n, w, p = w + "s") => `${fmtN(n)} ${n === 1 ? w : p}`;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const ICON = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 11.6 2.6 8l1.1-1.1 2.5 2.5 6.1-6.1L13.4 4.4z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>',
    x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.2 3.1 3.8 3.8 3.8-3.8 1.1 1.1L9.1 8l3.8 3.8-1.1 1.1L8 9.1l-3.8 3.8-1.1-1.1L6.9 8 3.1 4.2z"/></svg>',
    dash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7h10v2H3z"/></svg>',
    warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 15.5 14h-15zm-.9 5v4h1.8V6zm0 5v1.8h1.8V11z"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.8 1.5a5.3 5.3 0 0 1 4.2 8.5l3.6 3.6-1.1 1.1-3.6-3.6A5.3 5.3 0 1 1 6.8 1.5zm0 1.6a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4z"/></svg>',
  };
  function pill(status) {
    if (!status) return `<span class="pill none">${ICON.dash}Not listed</span>`;
    const icon = status === "Released" ? ICON.check : status === "Quarantine" ? ICON.pause : status === "Rejected" ? ICON.x : ICON.dash;
    return `<span class="pill ${esc(status.split(" ")[0])}">${icon}${esc(status)}</span>`;
  }
  const refChips = (refs) => (refs && refs.length ? `<span class="chips">${refs.map((r) => `<span class="ref">${esc(r)}</span>`).join("")}</span>` : "");
  const tipAttr = (html) => `data-tip="${esc(html)}"`;
  const tipRows = (title, rows) => `<div class="t-h">${esc(title)}</div>` + rows.map(([k, v]) => `<div class="t-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("");

  // Lead-time ramp: light (fast) to deep (slow). Hero uses fixed steps (it is always dark).
  const HERO_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#1c5cab", "#104281"];
  const rampVar = (i) => `var(--q${i + 1})`;
  const leadColor = (d) => {
    if (d === null || d < 0) return "var(--bad)";
    const i = M.LEAD_BUCKETS.findIndex((b) => b.test(d));
    return rampVar(i);
  };
  const KIND_COLOR = { Rejected: "var(--k-rejected)", Investigation: "var(--k-investigation)", "Missing CLL / COA": "var(--k-missing)", "Decision / documents": "var(--k-decision)", Other: "var(--k-other)" };

  function niceMax(v, ticks = 4) {
    if (v <= 0) return { max: ticks, step: 1 };
    const raw = v / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    return { max: Math.ceil(v / step) * step, step };
  }
  const widthOf = (el, fallback = 640) => Math.max(280, Math.floor(el?.clientWidth || fallback));

  // ---------- data loading ----------
  function loadInitial() {
    let wb = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { wb = JSON.parse(raw); source = "imported"; }
    } catch { /* storage unavailable */ }
    if (!wb && window.RELEASE_WORKBOOK) { wb = window.RELEASE_WORKBOOK; source = "bundled"; }
    if (wb) model = M.build(wb);
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.XLSX) return res();
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      const fail = () => rej(new Error("The spreadsheet reader could not be downloaded. Check the network connection and try again."));
      s.onerror = fail;
      setTimeout(() => window.XLSX || fail(), 20000);
      document.head.appendChild(s);
    });
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return toast(`"${file.name}" is not an Excel workbook. Choose an .xlsx file.`);
    toast(`Reading ${file.name}…`);
    try {
      await loadScript(SHEETJS);
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: "array", cellNF: true, cellDates: false });
      const raw = M.fromSheetJS(window.XLSX, wb, file.name);
      const next = M.build(raw);
      if (!next.batches.length) return toast("No batches found. The workbook needs a sheet with Product, Batch No, CLL date and Status columns.");
      model = next;
      source = "imported";
      try { localStorage.setItem(STORE_KEY, JSON.stringify(raw)); } catch { /* too large or blocked: keep in memory */ }
      resetFilters();
      render();
      toast(`Loaded ${file.name}: ${plural(next.stats.total, "batch", "batches")}.`);
    } catch (e) {
      toast(e.message || "The workbook could not be read.");
    }
  }

  function resetToBundled() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    model = window.RELEASE_WORKBOOK ? M.build(window.RELEASE_WORKBOOK) : null;
    source = "bundled";
    resetFilters();
    render();
    toast("Back to the bundled workbook.");
  }
  function resetFilters() {
    Object.assign(ui, { q: "", status: "all", bucket: "all", category: "all", flagged: false, preset: null, limit: 80 });
  }

  // ---------- routing ----------
  const VIEWS = [
    { id: "overview", label: "Overview", icon: '<svg viewBox="0 0 20 20"><path d="M3 11h5V3H3zm0 6h5v-4H3zm9 0h5V9h-5zm0-14v4h5V3z"/></svg>' },
    { id: "batches", label: "Batches", icon: '<svg viewBox="0 0 20 20"><path d="M3 4h14v2H3zm0 5h14v2H3zm0 5h14v2H3z"/></svg>' },
    { id: "lead-time", label: "Lead time", icon: '<svg viewBox="0 0 20 20"><path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-1 2h2v3.6l2.7 2.7-1.4 1.4L9 10.4z"/></svg>' },
    { id: "reconcile", label: "Reconcile", icon: '<svg viewBox="0 0 20 20"><path d="M3 4h5v3H3zm9 0h5v3h-5zM3 13h5v3H3zm9 0h5v3h-5zM8 5h4v1H8zm-1 2.6 5.3 5.3-.8.8L6.2 8.4zM8 14h4v1H8z"/></svg>' },
    { id: "blocked", label: "Blocked stock", icon: '<svg viewBox="0 0 20 20"><path d="M10 2 17 6v8l-7 4-7-4V6zm0 2.3L5.2 7 10 9.7 14.8 7zM5 8.7v4.1l4 2.3v-4.1zm10 0-4 2.3v4.1l4-2.3z"/></svg>' },
    { id: "follow-up", label: "Follow-up", icon: '<svg viewBox="0 0 20 20"><path d="M4 3h9l3 3v11H4zm2 2v10h8V7h-2V5zm1 4h6v1.5H7zm0 3h6v1.5H7z"/></svg>' },
  ];
  function go(view, preset) {
    if (preset !== undefined) { resetFilters(); Object.assign(ui, preset); }
    if (location.hash.slice(1) === view) render();
    else location.hash = view;
    window.scrollTo({ top: 0 });
  }
  function currentView() {
    const h = location.hash.slice(1);
    return VIEWS.some((v) => v.id === h) ? h : "overview";
  }

  // ---------- shell ----------
  function navHTML(mobile) {
    const s = model?.stats;
    const counts = s ? { batches: fmtN(s.total), reconcile: fmtN((s.issues["ax-behind"]?.length || 0) + (s.issues["erp-missing"]?.length || 0)), blocked: fmtN(model.blocked.length), "follow-up": fmtN(model.posting.length + model.requests.length + model.physical.length) } : {};
    return VIEWS.map((v) => `<a href="#${v.id}" ${ui.view === v.id ? 'aria-current="page"' : ""}>${v.icon}<span>${mobile ? v.label.split(" ")[0] : v.label}</span>${!mobile && counts[v.id] ? `<span class="count ${v.id === "reconcile" ? "alert" : ""}">${counts[v.id]}</span>` : ""}</a>`).join("");
  }
  function themeLabel() {
    const t = document.documentElement.dataset.theme;
    return t === "dark" ? "Dark" : t === "light" ? "Light" : "Auto";
  }

  function render() {
    ui.view = currentView();
    $("#nav").innerHTML = navHTML(false);
    $("#mobile-nav").innerHTML = navHTML(true);
    $("#theme-btn span").textContent = themeLabel();
    const s = model?.stats;
    $("#doc").innerHTML = model
      ? `<div><dt>Workbook</dt><dd>${esc(model.name)}</dd></div><div><dt>Source</dt><dd>${source === "imported" ? "Imported" : "Bundled"}</dd></div><div><dt>CLL dates</dt><dd>${s.firstCll ? fmtDate(s.firstCll).slice(3) + " – " + fmtDate(s.lastCll).slice(3) : "—"}</dd></div><div><dt>Rows read</dt><dd>${fmtN(s.rows)}</dd></div>`
      : "";
    $("#reset-btn").hidden = !(source === "imported" && window.RELEASE_WORKBOOK);
    const view = $("#view");
    closeTip();
    if (!model) { view.innerHTML = welcomeHTML(); $("#title").textContent = "Batch Release Desk"; $("#crumb").textContent = "No workbook loaded"; return; }
    const v = VIEWS.find((x) => x.id === ui.view);
    $("#title").textContent = v.label;
    $("#crumb").textContent = "CLL received vs AX · " + model.name;
    document.title = `${v.label} · Batch Release Desk`;
    view.innerHTML = `<div class="view">${RENDER[ui.view]()}</div>`;
    AFTER[ui.view]?.();
  }

  function welcomeHTML() {
    return `<div class="welcome"><div class="card">
      <svg width="64" height="64" viewBox="0 0 34 34" aria-hidden="true">${brandMark()}</svg>
      <h2>Load your CLL vs AX workbook</h2>
      <p>Drop the Excel file anywhere on this page, or choose it below. It stays in this browser and is never uploaded.</p>
      <button class="btn primary" data-act="import">Choose workbook…</button>
      <ul>
        <li><b>CLL vs AX</b>: product, batch, CLL receiving date, AX status, release date, remark</li>
        <li><b>ERP 365</b> and <b>AX 2024–2026</b>: batch disposition codes</li>
        <li>Optional: <b>Statut PF</b>, posting follow-up, QA release requests, physical release</li>
      </ul>
    </div></div>`;
  }
  function brandMark() {
    return `<rect x="1" y="1" width="32" height="32" rx="8" fill="#163a3e"/><rect x="7" y="9" width="20" height="4" rx="2" fill="#cde2fb"/><rect x="7" y="15" width="14" height="4" rx="2" fill="#6da7ec"/><rect x="7" y="21" width="8" height="4" rx="2" fill="#1baf7a"/>`;
  }

  // ---------- OVERVIEW ----------
  function overview() {
    const s = model.stats;
    const total = s.byBucket.reduce((a, b) => a + b.count, 0);
    const iss = s.issues;
    const quarantine = model.batches.filter((b) => b.status === "Quarantine");
    const oldest = quarantine.reduce((m, b) => Math.max(m, b.age || 0), 0);
    const dev = s.categories.find((c) => c.category === "Deviation (QE)");
    const clean = s.categories.find((c) => c.category === "No remark");
    const expSoon = model.blocked.filter((b) => b.monthsLeft !== null && b.monthsLeft <= 6);
    const physGap = model.physical.filter((p) => p.physical && !p.system && p.erp !== "Released");
    const dq = new Set([...(iss["negative-lead"] || []), ...(iss.duplicate || []), ...(iss["no-cll"] || []), ...(iss["bad-date"] || [])]);

    const segs = s.byBucket.map((b, i) => {
      const share = total ? b.count / total : 0;
      const narrow = window.innerWidth < 700;
      const label = narrow ? (share > 0.3 ? `${b.label} · ${pct(share)}` : "") : share > 0.07 ? `${b.label} · ${pct(share)}` : share > 0.035 ? pct(share) : "";
      return `<div class="seg-b ${i < 3 ? "dark-text" : ""}" role="button" tabindex="0" data-bucket="${b.id}" style="flex:${b.count} 1 0;background:${HERO_RAMP[i]};animation-delay:${i * 70}ms" ${tipAttr(tipRows(b.label + " from CLL to release", [["Batches", fmtN(b.count)], ["Share", pct(share, 1)]]))}>${label}</div>`;
    }).join("");
    const legend = s.byBucket.map((b, i) => `<span><i style="background:${HERO_RAMP[i]}"></i>${esc(b.label)} <b>${fmtN(b.count)}</b></span>`).join("");

    const attn = [
      quarantine.length && { stripe: "var(--warn)", t: `${plural(quarantine.length, "batch", "batches")} still in quarantine`, s: `Oldest CLL received ${plural(oldest, "day")} ago`, n: quarantine.length, act: "q-quarantine" },
      iss["ax-behind"] && { stripe: "var(--bad)", t: "AX still shows quarantine", s: "Released in ERP 365 and the tracker, not yet in AX", n: iss["ax-behind"].length, act: "q-ax-behind" },
      iss["erp-missing"] && { stripe: "var(--warn)", t: "Not found in ERP 365", s: "Tracked batches missing from the ERP 365 list", n: iss["erp-missing"].length, act: "q-erp-missing" },
      model.awaitingCll.length && { stripe: "var(--accent)", t: "Quarantined in ERP 365, no CLL yet", s: "Batches waiting for their CLL to arrive", n: model.awaitingCll.length, act: "go-reconcile" },
      expSoon.length && { stripe: "var(--bad)", t: "Blocked stock expiring within 6 months", s: `${fmtN(expSoon.reduce((a, b) => a + (b.qty || 0), 0))} units across ${plural(expSoon.length, "batch", "batches")}`, n: expSoon.length, act: "go-blocked" },
      physGap.length && { stripe: "var(--warn)", t: "Physically released, not in the system", s: "Physical release done; ERP 365 not released yet", n: physGap.length, act: "go-follow-up" },
      dq.size && { stripe: "var(--muted)", t: "Data to correct in the tracker", s: "Duplicates, missing CLL dates, release before CLL", n: dq.size, act: "q-data" },
    ].filter(Boolean);

    return `
      <section class="hero" aria-labelledby="hero-h">
        <div class="hero-head">
          <div>
            <div class="eyebrow">CLL received → released in AX · ${fmtDate(s.firstCll).slice(3)} to ${fmtDate(s.lastCll).slice(3)}</div>
            <h2 id="hero-h"><em>${pct(s.sameDay)}</em> of batches are released the same day their CLL arrives.</h2>
          </div>
          <div class="hero-figure">
            <div class="big">${s.p90 === null ? "—" : Math.round(s.p90)}<small>days</small></div>
            <div class="cap">90% of batches are released within this time</div>
          </div>
        </div>
        <p class="sub"><b>${fmtN(s.total)}</b> batches received · <b>${fmtN(s.released)}</b> released · <b>${fmtN(s.quarantine)}</b> in quarantine · <b>${pct(s.within3)}</b> released within 3 days · average <b>${s.mean?.toFixed(1)}</b> days. Each block below is a share of the ${fmtN(total)} batches with both dates.</p>
        <div class="spectrum">
          <div class="spectrum-bar">${segs}</div>
          <div class="hero-scale"><span>Fastest</span><span>Slowest</span></div>
          <div class="spectrum-legend">${legend}</div>
        </div>
      </section>

      <div class="tiles">
        ${tile("Batches received", fmtN(s.total), `${fmtN(s.rows)} tracker rows`, "var(--s-received)")}
        ${tile("Released", fmtN(s.released), pct(s.released / s.total, 1) + " of received", "var(--good)")}
        ${tile("In quarantine", fmtN(s.quarantine), oldest ? `oldest: ${plural(oldest, "day")}` : "none waiting", "var(--warn)", "q-quarantine")}
        ${tile("Median lead time", s.median === 0 ? "0" : fmtN(s.median), `days · 90th percentile ${fmtN(s.p90)}`, "var(--q4)")}
        ${dev ? tile("With a deviation", fmtN(dev.median), `days median · ${plural(dev.count, "batch", "batches")} vs ${fmtN(clean?.median)} without remark`, "var(--k-investigation)", "go-lead-time") : ""}
        ${tile("Awaiting CLL", fmtN(model.awaitingCll.length), "quarantined in ERP 365", "var(--accent)", "go-reconcile")}
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><div><h3>Monthly flow</h3><p>Batches whose CLL arrived each month, beside batches released that month.</p></div>
            <div class="tools"><div class="seg" role="group" aria-label="Chart or table"><button data-act="flow-chart" aria-pressed="${!ui.flowTable}">Chart</button><button data-act="flow-table" aria-pressed="${!!ui.flowTable}">Table</button></div></div></div>
          <div class="legend"><span><i style="background:var(--s-received)"></i>CLL received</span><span><i style="background:var(--s-released)"></i>Released</span></div>
          <div class="panel-body" id="flow"></div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h3>Needs attention</h3><p>Open items across the workbook, worst first.</p></div></div>
          <div class="panel-body"><ul class="attn">${attn.map((a) => `<li><button data-act="${a.act}"><span class="stripe" style="background:${a.stripe}"></span><span><span class="t">${esc(a.t)}</span><br><span class="s">${esc(a.s)}</span></span><span class="n">${fmtN(a.n)}</span></button></li>`).join("") || '<li class="empty">Nothing open.</li>'}</ul></div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><div><h3>CLL receipt calendar</h3><p>Each square is a day; darker means more CLLs received. Hover a day to see which products arrived.</p></div></div>
        <div class="panel-body cal-wrap" id="cal"></div>
        <div class="cal-scale" id="cal-scale"></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3>Average days from CLL to release</h3><p>By month of CLL receipt. The shaded band reaches the 90th percentile; months with fewer than 5 dated batches are left out.</p></div></div>
        <div class="legend"><span><i style="background:var(--q4)"></i>Average</span><span><i style="background:var(--q1)"></i>Up to 90th percentile</span></div>
        <div class="panel-body" id="trend"></div>
      </section>`;
  }
  function tile(label, value, note, color, act) {
    const tag = act ? `button data-act="${act}"` : "div";
    return `<${tag} class="tile" ${act ? 'style="text-align:left;cursor:pointer;font:inherit"' : ""}><span class="label"><span class="dot" style="background:${color}"></span>${esc(label)}</span><span class="value">${value}</span><span class="note">${esc(note)}</span></${act ? "button" : "div"}>`;
  }

  function drawFlow() {
    const el = $("#flow");
    if (!el) return;
    const data = model.stats.monthly;
    if (ui.flowTable) {
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">CLL received</th><th class="num">Released</th><th class="num">Average days</th><th class="num">Same day</th></tr></thead><tbody>${data.map((m) => `<tr style="cursor:default"><td>${fmtMonth(m.month, true)}</td><td class="num">${fmtN(m.received)}</td><td class="num">${fmtN(m.released)}</td><td class="num">${m.mean === null ? "—" : m.mean.toFixed(1)}</td><td class="num">${pct(m.sameDay)}</td></tr>`).join("")}</tbody></table></div>`;
      return;
    }
    const W = widthOf(el), H = 250, P = { l: 36, r: 8, t: 18, b: 34 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const { max, step } = niceMax(Math.max(...data.map((d) => Math.max(d.received, d.released))));
    const y = (v) => P.t + ih - (v / max) * ih;
    const band = iw / data.length;
    const bw = Math.max(3, Math.min(18, (band - 8) / 2));
    let g = '<g class="grid">';
    for (let v = 0; v <= max; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    g += "</g>";
    const peak = data.reduce((a, b) => (b.received > a.received ? b : a), data[0]);
    let bars = "";
    data.forEach((d, i) => {
      const cx = P.l + band * i + band / 2;
      const tip = tipRows(fmtMonth(d.month, true), [["CLL received", fmtN(d.received)], ["Released", fmtN(d.released)], ["Average days", d.mean === null ? "—" : d.mean.toFixed(1)], ["Released same day", pct(d.sameDay)]]);
      bars += `<g ${tipAttr(tip)}><rect x="${cx - band / 2}" y="${P.t}" width="${band}" height="${ih}" fill="transparent"/>`;
      [["received", "var(--s-received)", -1], ["released", "var(--s-released)", 1]].forEach(([k, c, side]) => {
        const v = d[k];
        if (!v) return;
        const x = side < 0 ? cx - bw - 1 : cx + 1;
        const h = Math.max(1, y(0) - y(v));
        const r = Math.min(4, bw / 2, h);
        bars += `<path d="M${x},${y(0)} V${y(0) - h + r} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} V${y(0)} Z" fill="${c}"/>`;
      });
      bars += "</g>";
      const show = band >= 34 || i % 2 === 0;
      if (show) bars += `<text x="${cx}" y="${H - P.b + 16}" text-anchor="middle">${fmtMonth(d.month)}</text>${d.month.endsWith("-01") || i === 0 ? `<text x="${cx}" y="${H - P.b + 29}" text-anchor="middle">${d.month.slice(0, 4)}</text>` : ""}`;
      if (d === peak) bars += `<text class="val" x="${cx - bw / 2 - 1}" y="${y(d.received) - 6}" text-anchor="middle">${d.received}</text>`;
    });
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly CLL received and released">${g}${bars}<line class="baseline" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  }

  function drawCalendar() {
    const el = $("#cal");
    if (!el) return;
    const s = model.stats;
    if (!s.lastCll) { el.innerHTML = '<p class="empty">No CLL dates.</p>'; return; }
    const DAYMS = 86400000;
    const end = new Date(s.lastCll + "T00:00:00Z");
    const endSun = new Date(end.getTime() + ((7 - ((end.getUTCDay() + 6) % 7) - 1) * DAYMS));
    const weeks = 53;
    const start = new Date(endSun.getTime() - (weeks * 7 - 1) * DAYMS);
    const cell = 13, gap = 3, P = { l: 30, t: 20 };
    const W = P.l + weeks * (cell + gap), H = P.t + 7 * (cell + gap) + 4;
    const maxCount = Math.max(...s.daily.values());
    const steps = [0, 1, 3, 6, 11, 21].filter((v, i) => i < 2 || v <= maxCount);
    const level = (c) => { let l = 0; steps.forEach((v, i) => { if (c >= v) l = i; }); return l; };
    const byDay = new Map();
    for (const b of model.batches) if (b.cll) (byDay.get(b.cll) || byDay.set(b.cll, []).get(b.cll)).push(b);
    let out = "", lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start.getTime() + (w * 7 + d) * DAYMS);
        if (dt > end) continue;
        const iso = dt.toISOString().slice(0, 10);
        const c = s.daily.get(iso) || 0;
        const list = byDay.get(iso) || [];
        const prods = {};
        list.forEach((b) => (prods[b.productLabel] = (prods[b.productLabel] || 0) + 1));
        const top = Object.entries(prods).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const tip = tipRows(fmtDate(iso), [["CLL received", fmtN(c)], ...top.map(([p, n]) => [p, n])]);
        out += `<rect class="day" x="${P.l + w * (cell + gap)}" y="${P.t + d * (cell + gap)}" width="${cell}" height="${cell}" fill="${c ? `var(--q${level(c) + 1})` : "var(--q0)"}" ${c ? `${tipAttr(tip)} data-day="${iso}"` : ""}/>`;
        if (d === 0 && dt.getUTCMonth() !== lastMonth && dt.getUTCDate() <= 7) {
          lastMonth = dt.getUTCMonth();
          out += `<text x="${P.l + w * (cell + gap)}" y="${P.t - 7}">${MON[lastMonth]}</text>`;
        }
      }
    }
    ["Mon", "Wed", "Fri"].forEach((n, i) => (out += `<text x="0" y="${P.t + i * 2 * (cell + gap) + 10}">${n}</text>`));
    el.innerHTML = `<svg class="chart cal fixed" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily CLL receipts">${out}</svg>`;
    $("#cal-scale").innerHTML = `Fewer ${steps.map((v, i) => `<i style="background:${i === 0 ? "var(--q0)" : `var(--q${i + 1})`}" title="${i === 0 ? "0" : v + (steps[i + 1] ? "–" + (steps[i + 1] - 1) : "+")}"></i>`).join("")} More <span style="margin-left:8px">(${steps.slice(1).map((v, i) => v + (steps[i + 2] ? "–" + (steps[i + 2] - 1) : "+")).join(", ")} per day)</span>`;
    el.scrollLeft = el.scrollWidth;
  }

  function drawTrend() {
    const el = $("#trend");
    if (!el) return;
    const data = model.stats.monthly.filter((m) => m.leads.length >= 5);
    if (data.length < 2) { el.innerHTML = '<p class="empty">Not enough months with release dates.</p>'; return; }
    const W = widthOf(el), H = 220, P = { l: 36, r: 16, t: 16, b: 26 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const { max, step } = niceMax(Math.max(...data.map((d) => d.p90)));
    const x = (i) => P.l + (iw * i) / (data.length - 1);
    const y = (v) => P.t + ih - (v / max) * ih;
    let g = '<g class="grid">';
    for (let v = 0; v <= max; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    g += "</g>";
    const area = `M${x(0)},${y(0)} ` + data.map((d, i) => `L${x(i)},${y(d.p90)}`).join(" ") + ` L${x(data.length - 1)},${y(0)} Z`;
    const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.mean)}`).join(" ");
    let dots = "", labels = "", hits = "";
    const last = data.length - 1;
    data.forEach((d, i) => {
      if (iw / (data.length - 1) >= 34 || i % 2 === 0 || i === last) labels += `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === last ? "end" : "middle"}">${fmtMonth(d.month)}</text>`;
      const tip = tipRows(fmtMonth(d.month, true), [["Average", d.mean.toFixed(1) + " days"], ["Median", days(d.median)], ["90th percentile", d.p90.toFixed(0) + " days"], ["Batches", fmtN(d.leads.length)]]);
      const hx = iw / (data.length - 1);
      hits += `<rect x="${x(i) - hx / 2}" y="${P.t}" width="${hx}" height="${ih}" fill="transparent" ${tipAttr(tip)}/>`;
      if (i === last) dots += `<circle cx="${x(i)}" cy="${y(d.mean)}" r="5" fill="var(--q4)" stroke="var(--surface)" stroke-width="2"/><text class="val" x="${x(i) - 8}" y="${y(d.mean) - 10}" text-anchor="end">${d.mean.toFixed(1)} days</text>`;
    });
    const worst = data.reduce((a, b) => (b.mean > a.mean ? b : a));
    const wi = data.indexOf(worst);
    if (wi !== last) dots += `<circle cx="${x(wi)}" cy="${y(worst.mean)}" r="4" fill="var(--q4)" stroke="var(--surface)" stroke-width="2"/><text class="val" x="${x(wi)}" y="${y(worst.mean) - 10}" text-anchor="middle">${worst.mean.toFixed(1)}</text>`;
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average lead time by month">${g}<path d="${area}" fill="var(--q1)" opacity=".55"/><path d="${line}" fill="none" stroke="var(--q4)" stroke-width="2" stroke-linejoin="round"/><line class="baseline" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/>${dots}${labels}${hits}</svg>`;
  }

  // ---------- BATCHES ----------
  function filteredBatches() {
    const q = ui.q.trim().toLowerCase();
    let list = model.batches.filter((b) => {
      if (ui.preset && !ui.preset.fn(b)) return false;
      if (ui.status !== "all" && (b.status || "none") !== ui.status) return false;
      if (ui.bucket !== "all" && b.bucket !== ui.bucket) return false;
      if (ui.category !== "all" && b.category !== ui.category) return false;
      if (ui.flagged && !b.issues.length) return false;
      if (q && !(b.id.toLowerCase().includes(q) || b.product.toLowerCase().includes(q) || b.remark.toLowerCase().includes(q) || b.refs.some((r) => r.toLowerCase().includes(q)))) return false;
      return true;
    });
    const { key, dir } = ui.sort;
    const val = (b) => (key === "erp" ? b.erp || "" : key === "ax" ? b.ax?.status || "" : key === "lead" ? (b.lead ?? (b.status === "Quarantine" ? 9999 : -9999)) : b[key] ?? "");
    list.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return c * dir || a.id.localeCompare(b.id, undefined, { numeric: true });
    });
    return list;
  }

  function batches() {
    const cats = model.stats.categories.map((c) => c.category);
    const head = (key, label, num) => `<th class="${num ? "num" : ""}" ${ui.sort.key === key ? `aria-sort="${ui.sort.dir > 0 ? "ascending" : "descending"}"` : ""}><button data-sort="${key}">${label}${ui.sort.key === key ? (ui.sort.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`;
    return `<section class="panel">
      <div class="filters">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Search batch, product, remark or QE/CAPA ref" value="${esc(ui.q)}" aria-label="Search batches"></label>
        <select id="f-status" aria-label="Tracker status"><option value="all">All statuses</option>${["Released", "Quarantine"].map((s) => `<option ${ui.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
        <select id="f-bucket" aria-label="Lead time"><option value="all">Any lead time</option>${M.LEAD_BUCKETS.map((b) => `<option value="${b.id}" ${ui.bucket === b.id ? "selected" : ""}>${b.label}</option>`).join("")}</select>
        <select id="f-cat" aria-label="Remark type"><option value="all">Any remark</option>${cats.map((c) => `<option ${ui.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <label style="display:inline-flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="f-flag" ${ui.flagged ? "checked" : ""}> With issues only</label>
        ${ui.preset ? `<button class="active-filter" data-act="clear-preset"><span>${esc(ui.preset.label)}</span>${ICON.x.replace("<svg", '<svg width="14" height="14" fill="currentColor"')}</button>` : ""}
        <span class="result" id="result"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>${head("id", "Batch")}${head("product", "Product")}${head("cll", "CLL received")}${head("released", "Released")}${head("lead", "Lead time", true)}${head("status", "Tracker")}${head("erp", "ERP 365")}${head("ax", "AX")}<th>Remark</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
      <div class="more" id="more"></div>
    </section>`;
  }
  function drawRows() {
    const list = filteredBatches();
    const shown = list.slice(0, ui.limit);
    $("#result").textContent = `${plural(list.length, "batch", "batches")}`;
    $("#rows").innerHTML = shown.length
      ? shown.map((b) => {
          const leadW = b.lead === null ? 0 : Math.min(100, Math.max(4, (Math.max(0, b.lead) / 30) * 100));
          const lead = b.lead !== null ? `<span class="leadcell"><span class="num">${b.lead < 0 ? b.lead : b.lead}</span><span class="leadbar" aria-hidden="true"><i style="width:${leadW}%;background:${leadColor(b.lead)}"></i></span></span>` : b.age !== undefined ? `<span class="leadcell" style="color:var(--warn-ink)"><span class="num">${b.age}+</span><span class="leadbar" aria-hidden="true"><i style="width:100%;background:var(--warn)"></i></span></span>` : "—";
          return `<tr data-batch="${esc(b.id)}" tabindex="0">
            <td class="mono"><b>${esc(b.id)}</b>${b.issues.length ? `<br><span class="flag" title="${esc(b.issues.map((i) => i.text).join("; "))}">${ICON.warn}${b.issues.length}</span>` : ""}</td>
            <td class="prod">${esc(b.productLabel || b.product)}<small>${esc(b.product)}</small></td>
            <td class="mono date">${fmtDate(b.cll)}</td>
            <td class="mono date">${fmtDate(b.released)}</td>
            <td class="num">${lead}</td>
            <td>${pill(b.status)}</td><td>${pill(b.erp)}</td><td>${pill(b.ax?.status)}${b.ax ? `<small style="display:block;color:var(--muted);font-size:11px">AX ${esc(b.ax.year)}</small>` : ""}</td>
            <td class="remark">${refChips(b.refs)}${b.remark && b.remark !== b.refs.join(" ") ? `<div>${esc(b.remark)}</div>` : ""}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="9" class="empty">No batches match these filters. <button class="btn ghost" data-act="clear-all">Clear filters</button></td></tr>`;
    $("#more").innerHTML = list.length > ui.limit ? `<button class="btn" data-act="more">Show ${Math.min(80, list.length - ui.limit)} more of ${fmtN(list.length - ui.limit)}</button>` : "";
  }

  // ---------- LEAD TIME ----------
  function leadTime() {
    const s = model.stats;
    const dev = s.categories.find((c) => c.category === "Deviation (QE)");
    const clean = s.categories.find((c) => c.category === "No remark");
    const slowest = [...s.products].filter((p) => p.count >= 5 && p.p90 !== null).sort((a, b) => b.p90 - a.p90)[0];
    return `
      <div class="grid-2 even">
        <section class="panel">
          <div class="panel-head"><div><h3>How long batches wait</h3><p>Days from CLL receipt to release in AX, for ${fmtN(s.leads)} batches with both dates.</p></div></div>
          <p class="insight"><b>${pct(s.sameDay)}</b> are released the same day and <b>${pct(s.within3)}</b> within 3 days. The slowest ${pct(1 - (s.byBucket.slice(0, 5).reduce((a, b) => a + b.count, 0) / s.leads))} take more than two weeks.</p>
          <div class="panel-body" id="hist"></div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h3>What slows a release</h3><p>Median days to release, grouped by the remark written against the batch.</p></div></div>
          ${dev && clean ? `<p class="insight">Batches with a <b>deviation (QE)</b> remark take a median of <b>${days(dev.median)}</b>; batches with no remark take <b>${days(clean.median)}</b>.</p>` : ""}
          <div class="panel-body" id="cats"></div>
        </section>
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>Lead time by product</h3><p>The ${Math.min(20, s.products.length)} products with the most batches. The dot is the median, the bar runs to the 90th percentile. Click a product to see its batches.</p></div></div>
        ${slowest ? `<p class="insight">Widest spread: <b>${esc(slowest.label)}</b>, where 1 batch in 10 waits more than <b>${Math.round(slowest.p90)} days</b> (${plural(slowest.count, "batch", "batches")}).</p>` : ""}
        <div class="legend" style="padding-top:6px"><span><i style="background:var(--q4);border-radius:50%"></i>Median</span><span><i style="background:var(--q2)"></i>Median to 90th percentile</span></div>
        <div class="panel-body" id="league"></div>
      </section>`;
  }
  function drawHist() {
    const el = $("#hist");
    if (!el) return;
    const data = model.stats.byBucket;
    const W = widthOf(el), H = 240, P = { l: 36, r: 8, t: 22, b: 40 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const { max, step } = niceMax(Math.max(...data.map((d) => d.count)));
    const y = (v) => P.t + ih - (v / max) * ih;
    const band = iw / data.length, bw = Math.min(56, band - 10);
    let g = '<g class="grid">';
    for (let v = 0; v <= max; v += step) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    g += "</g>";
    let bars = "";
    const total = data.reduce((a, b) => a + b.count, 0);
    data.forEach((d, i) => {
      const cx = P.l + band * i + band / 2, h = Math.max(d.count ? 2 : 0, y(0) - y(d.count)), r = Math.min(4, h);
      bars += `<g data-bucket="${d.id}" ${tipAttr(tipRows(d.label, [["Batches", fmtN(d.count)], ["Share", pct(d.count / total, 1)]]))}><rect x="${cx - band / 2}" y="${P.t}" width="${band}" height="${ih}" fill="transparent"/>${h ? `<path d="M${cx - bw / 2},${y(0)} V${y(0) - h + r} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} V${y(0)} Z" fill="${rampVar(i)}"/>` : ""}<text class="val" x="${cx}" y="${y(d.count) - 6}" text-anchor="middle">${fmtN(d.count)}</text></g>`;
      const words = d.label.split(" ");
      bars += `<text x="${cx}" y="${H - P.b + 16}" text-anchor="middle">${esc(words[0])}</text><text x="${cx}" y="${H - P.b + 29}" text-anchor="middle">${esc(words.slice(1).join(" "))}</text>`;
    });
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lead time distribution">${g}${bars}<line class="baseline" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  }
  function drawCats() {
    const el = $("#cats");
    if (!el) return;
    const data = model.stats.categories.filter((c) => c.median !== null).sort((a, b) => b.median - a.median);
    const max = niceMax(Math.max(...data.map((d) => d.median), 1)).max;
    el.innerHTML = `<div class="league">${data
      .map((c) => `<button class="league-row" data-cat="${esc(c.category)}" ${tipAttr(tipRows(c.category, [["Batches", fmtN(c.count)], ["Median", days(c.median)], ["Average", c.mean.toFixed(1) + " days"], ["Still in quarantine", fmtN(c.quarantine)]]))}>
        <span class="nm">${esc(c.category)}</span><span class="ct">${fmtN(c.count)}</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:1;height:14px;background:var(--grid);border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(1.5, (c.median / max) * 100)}%;background:${c.category === "No remark" ? "var(--s-released)" : "var(--q4)"};border-radius:0 4px 4px 0"></span></span><span class="mono" style="width:54px;text-align:right;font-size:12px">${c.median} d</span></span>
      </button>`)
      .join("")}</div><p style="color:var(--muted);font-size:12px;margin:10px 0 0">Bar length: median days. Number: batches in the group.</p>`;
  }
  function drawLeague() {
    const el = $("#league");
    if (!el) return;
    const data = model.stats.products.slice(0, 20).filter((p) => p.median !== null);
    const max = niceMax(Math.min(60, Math.max(...data.map((p) => p.p90)))).max;
    const pos = (v) => `${(Math.min(v, max) / max) * 100}%`;
    const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
    el.innerHTML = `<div class="league">
      <div class="league-row league-head"><span>Product</span><span class="ct">Batches</span><span style="position:relative;height:14px">${ticks.map((t, i) => `<span style="position:absolute;left:${pos(t)};translate:${i === 0 ? "0" : i === ticks.length - 1 ? "-100%" : "-50%"}">${t}${i === ticks.length - 1 ? " days" : ""}</span>`).join("")}</span></div>
      ${data
        .map((p) => `<button class="league-row" data-product="${esc(p.key)}" ${tipAttr(tipRows(p.fullName, [["Batches", fmtN(p.count)], ["Median", days(p.median)], ["90th percentile", Math.round(p.p90) + " days"], ["Longest", days(p.max)], ["Same day", pct(p.sameDay)], ["In quarantine", fmtN(p.quarantine)]]))}>
          <span class="nm" title="${esc(p.fullName)}">${esc(p.label)}</span><span class="ct">${fmtN(p.count)}</span>
          <span style="position:relative;height:18px;background:linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/25% 100%">
            <span style="position:absolute;top:6px;height:6px;border-radius:3px;left:${pos(p.median)};width:calc(${pos(p.p90)} - ${pos(p.median)});min-width:2px;background:var(--q2)"></span>
            <span style="position:absolute;top:3px;width:12px;height:12px;border-radius:50%;left:${pos(p.median)};translate:-6px 0;background:var(--q4);box-shadow:0 0 0 2px var(--surface)"></span>
            ${p.p90 > max ? `<span style="position:absolute;right:0;top:-1px;font:500 10.5px var(--font-mono);color:var(--muted)">${Math.round(p.p90)}→</span>` : ""}
          </span>
        </button>`)
        .join("")}</div>`;
  }

  // ---------- RECONCILE ----------
  function reconcile() {
    const iss = model.stats.issues;
    const cards = [
      ["ax-behind", "AX lagging ERP 365", "Released in ERP 365 but still quarantined in AX.", "var(--bad)"],
      ["erp-missing", "Not in ERP 365", "In the tracker, not in the ERP 365 disposition list.", "var(--warn)"],
      ["status-mismatch", "Status disagrees", "Tracker status differs from ERP 365.", "var(--bad)"],
      ["duplicate", "Duplicate rows", "The same batch is listed more than once.", "var(--muted)"],
      ["negative-lead", "Release before CLL", "Release date is earlier than the CLL date: a typing error.", "var(--muted)"],
      ["no-cll", "No CLL date", "The receiving date is empty.", "var(--muted)"],
      ["bad-date", "Unreadable date", "A date cell holds text that is not a date.", "var(--muted)"],
    ].filter(([k]) => iss[k]?.length);
    const byYear = {};
    model.awaitingCll.forEach((a) => { const y = /^2[0-9]/.test(a.id) ? "20" + a.id.slice(0, 2) : "Other"; (byYear[y] ||= []).push(a); });
    return `
      <section class="panel">
        <div class="panel-head"><div><h3>Three systems, one batch</h3><p>Each band follows batches from the CLL tracker status, to the ERP 365 disposition, to the AX disposition. Bands that change colour or end in "Not listed" are the ones to chase. Click a band to list its batches.</p></div></div>
        <div class="legend"><span><i style="background:var(--good)"></i>Released</span><span><i style="background:var(--warn)"></i>Quarantine</span><span><i style="background:var(--k-other)"></i>Not listed</span></div>
        <div class="panel-body chart-wrap" id="sankey"></div>
      </section>
      <div class="tiles">${cards.map(([k, t, s, c]) => `<button class="tile" data-issue="${k}" style="text-align:left;cursor:pointer;font:inherit"><span class="label"><span class="dot" style="background:${c}"></span>${esc(t)}</span><span class="value">${fmtN(iss[k].length)}</span><span class="note">${esc(s)}</span></button>`).join("")}</div>
      <section class="panel">
        <div class="panel-head"><div><h3>Quarantined in ERP 365, no CLL received</h3><p>${plural(model.awaitingCll.length, "batch", "batches")} sit in quarantine in ERP 365 and have no row in the CLL tracker. Red: from an earlier year.</p></div>
          <div class="tools"><label class="search" style="flex:0 1 200px"><input id="aw-q" type="search" placeholder="Find batch" aria-label="Find batch"></label></div></div>
        <div class="panel-body" id="awaiting">${Object.entries(byYear).sort().map(([y, list]) => `<h4 style="margin:8px 0 6px;font:500 11px var(--font-mono);letter-spacing:.08em;color:var(--muted)">${y} · ${fmtN(list.length)}</h4><div class="batch-cloud">${list.map((a) => `<span class="${y < String(new Date().getFullYear()) ? "old" : ""}" data-aw="${esc(a.id)}">${esc(a.id)}</span>`).join("")}</div>`).join("")}</div>
      </section>`;
  }
  function drawSankey() {
    const el = $("#sankey");
    if (!el) return;
    const uniq = [...new Map(model.batches.map((b) => [b.id, b])).values()];
    const cols = [
      { name: "CLL tracker", get: (b) => b.status || "Not listed" },
      { name: "ERP 365", get: (b) => b.erp || "Not listed" },
      { name: "AX", get: (b) => b.ax?.status || "Not listed" },
    ];
    const ORDER = ["Released", "Quarantine", "Rejected", "Near expiry", "Not listed"];
    const COLOR = { Released: "var(--good)", Quarantine: "var(--warn)", Rejected: "var(--bad)", "Near expiry": "var(--bad)", "Not listed": "var(--k-other)" };
    const W = Math.max(560, widthOf(el)), H = 360, P = { t: 22, b: 10, l: 8, r: 8 }, nodeW = 12, gapY = 14;
    const ih = H - P.t - P.b;
    const nodes = cols.map((c, ci) => {
      const counts = {};
      uniq.forEach((b) => (counts[c.get(b)] = (counts[c.get(b)] || 0) + 1));
      const keys = ORDER.filter((k) => counts[k]);
      return { ci, keys, counts };
    });
    const total = uniq.length;
    const scale = (ih - gapY * 4) / total;
    const minH = 3;
    nodes.forEach((n) => {
      let yy = P.t;
      n.pos = {};
      n.keys.forEach((k) => { const h = Math.max(minH, n.counts[k] * scale); n.pos[k] = { y: yy, h, outY: yy, inY: yy }; yy += h + gapY; });
    });
    const colX = (ci) => P.l + 110 + ((W - P.l - P.r - 220 - nodeW) * ci) / (cols.length - 1);
    let links = "", rects = "", labels = "";
    for (let ci = 0; ci < cols.length - 1; ci++) {
      const flows = {};
      uniq.forEach((b) => { const k = cols[ci].get(b) + "→" + cols[ci + 1].get(b); flows[k] = (flows[k] || 0) + 1; });
      const keys = Object.keys(flows).sort((a, b) => { const [a1, a2] = a.split("→"), [b1, b2] = b.split("→"); return ORDER.indexOf(a1) - ORDER.indexOf(b1) || ORDER.indexOf(a2) - ORDER.indexOf(b2); });
      keys.forEach((k) => {
        const [from, to] = k.split("→");
        const v = flows[k];
        const s = nodes[ci].pos[from], t = nodes[ci + 1].pos[to];
        const sh = (v / nodes[ci].counts[from]) * s.h, th = (v / nodes[ci + 1].counts[to]) * t.h;
        const x0 = colX(ci) + nodeW, x1 = colX(ci + 1), xm = (x0 + x1) / 2;
        const d = `M${x0},${s.outY} C${xm},${s.outY} ${xm},${t.inY} ${x1},${t.inY} L${x1},${t.inY + th} C${xm},${t.inY + th} ${xm},${s.outY + sh} ${x0},${s.outY + sh} Z`;
        const changed = from !== to;
        links += `<path d="${d}" fill="${COLOR[from]}" opacity="${changed ? 0.5 : 0.18}" data-flow="${ci}|${esc(from)}|${esc(to)}" ${tipAttr(tipRows(`${cols[ci].name}: ${from} → ${cols[ci + 1].name}: ${to}`, [["Batches", fmtN(v)]]))}/>`;
        s.outY += sh;
        t.inY += th;
      });
    }
    nodes.forEach((n, ci) => {
      const x = colX(ci);
      labels += `<text x="${x + nodeW / 2}" y="12" text-anchor="middle" style="font-weight:600;fill:var(--ink-2)">${cols[ci].name}</text>`;
      n.keys.forEach((k) => {
        const p = n.pos[k];
        rects += `<rect x="${x}" y="${p.y}" width="${nodeW}" height="${p.h}" rx="3" fill="${COLOR[k]}" ${tipAttr(tipRows(`${cols[ci].name}: ${k}`, [["Batches", fmtN(n.counts[k])]]))}/>`;
        const left = ci === 0;
        labels += `<text x="${left ? x - 8 : x + nodeW + 8}" y="${p.y + p.h / 2 + 4}" text-anchor="${left ? "end" : "start"}" class="halo"><tspan style="fill:var(--ink);font-weight:600">${fmtN(n.counts[k])}</tspan> ${esc(k)}</text>`;
      });
    });
    el.innerHTML = `<svg class="chart fixed" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Status flow between tracker, ERP 365 and AX">${links}${rects}${labels}</svg>`;
  }

  // ---------- BLOCKED ----------
  function blocked() {
    const list = model.blocked;
    if (!list.length) return `<section class="panel"><p class="empty">This workbook has no Statut PF sheet.</p></section>`;
    const kinds = M.BLOCK_KINDS.filter((k) => list.some((b) => b.kind === k));
    const qty = list.reduce((a, b) => a + (b.qty || 0), 0);
    const soon = list.filter((b) => b.monthsLeft !== null && b.monthsLeft <= 6);
    const expired = list.filter((b) => b.monthsLeft !== null && b.monthsLeft < 0);
    const rows = [...list].sort((a, b) => (ui.blockedSort === "qty" ? (b.qty || 0) - (a.qty || 0) : (a.expiry || "9").localeCompare(b.expiry || "9")));
    return `
      <div class="tiles">
        ${tile("Blocked batches", fmtN(list.length), `${fmtN(new Set(list.map((b) => b.productLabel)).size)} products`, "var(--k-other)")}
        ${tile("Units on hold", fmtN(qty), "finished-product quantity", "var(--accent)")}
        ${tile("Expire within 6 months", fmtN(soon.length), `${fmtN(soon.reduce((a, b) => a + (b.qty || 0), 0))} units`, "var(--bad)")}
                ${tile("Already expired", fmtN(expired.length), `${fmtN(expired.reduce((x, b) => x + (b.qty || 0), 0))} units still on hold`, "var(--k-rejected)")}
      </div>
      <section class="panel">
        <div class="panel-head"><div><h3>Expiry runway</h3><p>Each circle is a blocked batch, placed at its expiry date; size is quantity. Batches in the shaded zone expire within six months${expired.length ? `, and ${plural(expired.length, "batch has", "batches have")} already expired` : ""}.</p></div></div>
        <div class="legend">${kinds.map((k) => `<span><i style="background:${KIND_COLOR[k]};border-radius:50%"></i>${esc(k)}</span>`).join("")}</div>
        <div class="panel-body chart-wrap" id="runway"></div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Blocked finished products</h3><p>From the Statut PF sheet, with the reason each batch is on hold.</p></div>
          <div class="tools"><div class="seg" role="group" aria-label="Sort"><button data-bsort="expiry" aria-pressed="${ui.blockedSort === "expiry"}">By expiry</button><button data-bsort="qty" aria-pressed="${ui.blockedSort === "qty"}">By quantity</button></div></div></div>
        <div class="table-wrap"><table><thead><tr><th>Batch</th><th>Product</th><th class="num">Quantity</th><th>Expiry</th><th>Reason</th></tr></thead><tbody>
        ${rows.map((b) => { const ml = b.monthsLeft; const tone = ml === null ? "none" : ml < 3 ? "Rejected" : ml <= 6 ? "Quarantine" : "none"; return `<tr data-batch="${esc(b.batch)}" tabindex="0"><td class="mono"><b>${esc(b.batch)}</b></td><td class="prod">${esc(b.productLabel)}<small>${esc(b.product)}</small></td><td class="num mono">${fmtN(b.qty)}</td><td class="mono" style="white-space:nowrap">${fmtDate(b.expiry)}<br><span class="pill ${tone}" style="margin-top:3px">${ml === null ? "—" : ml < 0 ? "expired" : ml < 1 ? "under 1 month left" : Math.floor(ml) === 1 ? "1 month left" : Math.floor(ml) + " months left"}</span></td><td class="remark"><span class="pill none" style="margin-bottom:4px"><span class="dot" style="background:${KIND_COLOR[b.kind]}"></span>${esc(b.kind)}</span><div>${esc(b.reason)}</div></td></tr>`; }).join("")}
        </tbody></table></div>
      </section>`;
  }
  function drawRunway() {
    const el = $("#runway");
    if (!el) return;
    const list = model.blocked.filter((b) => b.expiry);
    const kinds = M.BLOCK_KINDS.filter((k) => list.some((b) => b.kind === k));
    const W = Math.max(620, widthOf(el)), lane = 64, P = { l: 132, r: 24, t: 26, b: 30 };
    const H = P.t + lane * kinds.length + P.b;
    const t0 = Math.min(M.daysBetween("2000-01-01", model.today), ...list.map((b) => M.daysBetween("2000-01-01", b.expiry))) - 30;
    const tMax = Math.max(...list.map((b) => M.daysBetween("2000-01-01", b.expiry))) + 30;
    const x = (iso) => P.l + ((M.daysBetween("2000-01-01", iso) - t0) / (tMax - t0)) * (W - P.l - P.r);
    const xd = (d) => P.l + ((d - t0) / (tMax - t0)) * (W - P.l - P.r);
    const maxQ = Math.max(...list.map((b) => b.qty || 0), 1);
    const r = (q) => 4 + Math.sqrt((q || 0) / maxQ) * 13;
    const today = M.daysBetween("2000-01-01", model.today);
    let out = `<rect x="${xd(today)}" y="${P.t - 6}" width="${xd(today + 182) - xd(today)}" height="${lane * kinds.length + 6}" fill="var(--bad-bg)" opacity=".7"/>`;
    // year ticks
    const y0 = +model.today.slice(0, 4);
    for (let y = y0; y <= y0 + 6; y++) for (const m of ["01", "07"]) {
      const iso = `${y}-${m}-01`;
      const xx = x(iso);
      if (xx < P.l || xx > W - P.r) continue;
      out += `<line x1="${xx}" x2="${xx}" y1="${P.t - 6}" y2="${H - P.b}" stroke="var(--grid)"/><text x="${xx}" y="${H - 10}" text-anchor="middle">${m === "01" ? y : "Jul"}</text>`;
    }
    out += `<line x1="${xd(today)}" x2="${xd(today)}" y1="${P.t - 10}" y2="${H - P.b}" stroke="var(--ink-2)" stroke-dasharray="3 3"/><text x="${xd(today)}" y="${P.t - 12}" text-anchor="middle" style="fill:var(--ink-2);font-weight:600">Today</text><text x="${xd(today + 182) + 4}" y="${P.t - 12}" style="fill:var(--bad-ink)">+6 months</text>`;
    kinds.forEach((k, i) => {
      const cy = P.t + lane * i + lane / 2;
      out += `<line x1="${P.l}" x2="${W - P.r}" y1="${cy}" y2="${cy}" stroke="var(--grid)"/><text x="${P.l - 12}" y="${cy + 4}" text-anchor="end" style="fill:var(--ink-2)">${esc(k)}</text>`;
      const placed = [];
      list.filter((b) => b.kind === k).sort((a, b) => (b.qty || 0) - (a.qty || 0)).forEach((b) => {
        const cx = x(b.expiry), rr = r(b.qty);
        let dy = 0;
        for (const off of [0, -1, 1, -2, 2, -3, 3]) {
          const yy = cy + off * 9;
          if (placed.every((p) => Math.hypot(p.x - cx, p.y - yy) >= p.r + rr - 4)) { dy = off * 9; break; }
          dy = off * 9;
        }
        placed.push({ x: cx, y: cy + dy, r: rr });
        out += `<circle cx="${cx}" cy="${cy + dy}" r="${rr}" fill="${KIND_COLOR[k]}" fill-opacity=".85" stroke="var(--surface)" stroke-width="2" data-batch="${esc(b.batch)}" ${tipAttr(tipRows(`${b.batch} · ${b.productLabel}`, [["Quantity", fmtN(b.qty)], ["Expiry", fmtDate(b.expiry)], ["Months left", b.monthsLeft.toFixed(1)], ["Reason", b.reason.slice(0, 90) + (b.reason.length > 90 ? "…" : "")]]))}/>`;
      });
    });
    el.innerHTML = `<svg class="chart fixed" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Blocked batches by expiry date">${out}</svg>`;
  }

  // ---------- FOLLOW-UP ----------
  function followUp() {
    const P = model.posting, R = model.requests, F = model.physical;
    const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
    const pStatus = count(P, (p) => p.status);
    const pFeed = count(P, (p) => p.feedback);
    const notDone = R.filter((r) => r.answer === "Not done");
    const nowReleased = notDone.filter((r) => r.erp === "Released" || r.tracker?.status === "Released");
    const phDone = F.filter((p) => p.physical);
    const phSys = F.filter((p) => p.physical && p.system);
    const gap = F.filter((p) => p.physical && !p.system);
    const gapNow = gap.filter((p) => p.erp === "Released");
    const STATUS_C = { "RM not yet shipped": "var(--k-missing)", "Under posting": "var(--warn)", Posted: "var(--good)", "No status": "var(--k-other)" };
    const FEED_C = { "OF done": "var(--good)", "Not posted": "var(--warn)", "Not found": "var(--bad)", Problem: "var(--bad)", "No feedback": "var(--k-other)" };
    const stack = (obj, colors, total) => `<div style="display:flex;gap:2px;height:28px;border-radius:7px;overflow:hidden">${Object.entries(obj).filter((e) => e[1]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span style="flex:${v} 1 0;background:${colors[k] || "var(--k-other)"}" ${tipAttr(tipRows(k, [["Batches", fmtN(v)], ["Share", pct(v / total)]]))}></span>`).join("")}</div><div class="legend" style="padding:8px 0 0">${Object.entries(obj).filter((e) => e[1]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span><i style="background:${colors[k] || "var(--k-other)"}"></i>${esc(k)} <b class="num">${v}</b></span>`).join("")}</div>`;
    const row = (b, extra) => `<tr data-batch="${esc(b.batch)}" tabindex="0"><td class="mono"><b>${esc(b.batch)}</b></td><td class="prod">${esc(b.product)}</td>${extra}</tr>`;
    return `
      <div class="grid-3">
        <section class="panel">
          <div class="panel-head"><div><h3>ERP posting</h3><p>${plural(P.length, "batch", "batches")} on the posting follow-up sheet.</p></div></div>
          <div class="panel-body" style="display:grid;gap:16px">
            <div><h4 style="margin:0 0 6px;font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Posting status</h4>${stack(pStatus, STATUS_C, P.length)}</div>
            <div><h4 style="margin:0 0 6px;font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">QA feedback</h4>${stack(pFeed, FEED_C, P.length)}</div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h3>QA release requests</h3><p>${plural(R.length, "batch", "batches")} asked about; answers given at the time.</p></div></div>
          <div class="panel-body" style="display:grid;gap:12px">
            ${stack(count(R, (r) => r.answer), { Released: "var(--good)", "Not done": "var(--warn)", "No answer": "var(--k-other)" }, R.length)}
            <p class="insight" style="margin:0">Of the <b>${notDone.length}</b> answered "Not done", <b>${nowReleased.length}</b> are now released in ERP 365 or the tracker; <b>${notDone.length - nowReleased.length}</b> still are not.</p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h3>Physical vs system release</h3><p>${plural(F.length, "batch", "batches")} on the physical release sheet.</p></div></div>
          <div class="panel-body" style="display:grid;gap:12px">
            ${stack({ "Physical + system": phSys.length, "Physical only": gap.length, "Not yet released": F.length - phDone.length }, { "Physical + system": "var(--good)", "Physical only": "var(--warn)", "Not yet released": "var(--k-other)" }, F.length)}
            <p class="insight" style="margin:0"><b>${gap.length}</b> were released physically without a system release on the sheet; ERP 365 now shows <b>${gapNow.length}</b> of them released.</p>
          </div>
        </section>
      </div>
      <div class="grid-2 even">
        <section class="panel">
          <div class="panel-head"><div><h3>Still open after a "Not done" answer</h3><p>Not released in ERP 365 or the tracker yet.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Batch</th><th>Product</th><th>CLL</th><th>ERP 365 now</th></tr></thead><tbody>${notDone.filter((r) => !nowReleased.includes(r)).map((r) => row(r, `<td class="mono">${fmtDate(r.cll)}</td><td>${pill(r.erp)}</td>`)).join("") || '<tr><td colspan="4" class="empty">All released.</td></tr>'}</tbody></table></div>
        </section>
        <section class="panel">
          <div class="panel-head"><div><h3>Posting problems</h3><p>Not posted, not found or flagged as a problem by QA. ${(() => { const pr = P.filter((p) => ["Not posted", "Not found", "Problem"].includes(p.feedback)); const rel = pr.filter((p) => p.erp === "Released").length; return pr.length ? `${rel} of ${pr.length} are now released in ERP 365.` : ""; })()}</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Batch</th><th>Product</th><th>Status</th><th>QA feedback</th><th>ERP 365</th></tr></thead><tbody>${P.filter((p) => ["Not posted", "Not found", "Problem"].includes(p.feedback)).map((p) => row(p, `<td>${esc(p.status)}</td><td><span class="pill ${p.feedback === "Not posted" ? "Quarantine" : "Rejected"}">${esc(p.feedback)}</span></td><td>${pill(p.erp)}</td>`)).join("") || '<tr><td colspan="5" class="empty">No problems.</td></tr>'}</tbody></table></div>
        </section>
      </div>`;
  }

  // ---------- drawer ----------
  function openBatch(id) {
    const rows = model.batches.filter((b) => b.id === id);
    const b = rows[0];
    const bl = model.blocked.find((x) => x.batch === id);
    const po = model.posting.find((x) => x.batch === id);
    const rq = model.requests.find((x) => x.batch === id);
    const ph = model.physical.find((x) => x.batch === id);
    const erp = b?.erp ?? model.erp.get(id) ?? null;
    const ax = b?.ax ?? model.ax.get(id) ?? null;
    const product = b?.product || bl?.product || po?.product || rq?.product || ph?.product || "";
    const prod = b ? model.stats.products.find((p) => p.key === b.productKey) : null;
    const siblings = b ? model.batches.filter((x) => x.productKey === b.productKey && x.id !== id).slice(0, 40) : [];
    const issues = rows.flatMap((r) => r.issues);
    const other = [
      bl && ["Blocked stock (Statut PF)", `${fmtN(bl.qty)} units · expires ${fmtDate(bl.expiry)} · ${bl.reason}`],
      po && ["ERP posting", `${po.status} · QA feedback: ${po.feedback}`],
      rq && ["QA release request", `Answer at the time: ${rq.answer}`],
      ph && ["Physical release", `${ph.physical ? "Physical release done" : "Physical release not done"} · ${ph.system ? "system release done" : "system release not done"}`],
    ].filter(Boolean);
    const html = `
      <div class="scrim" data-act="close"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-h">
        <div class="drawer-head"><div><div class="eyebrow" style="color:var(--muted)">Batch</div><h2 id="dr-h">${esc(id)}</h2><p>${esc(product)}</p></div><button class="x" data-act="close" aria-label="Close">${ICON.x}</button></div>
        <div class="drawer-body">
          ${b ? `<div><h4>CLL to release</h4><div class="timeline"><div class="end"><b>${fmtDate(b.cll)}</b><span>CLL received</span></div><div class="track"><span style="${b.lead !== null && b.lead < 0 ? "color:var(--bad-ink)" : ""}">${b.lead !== null ? days(b.lead) : b.age !== undefined ? `waiting ${b.age} days` : "—"}</span></div><div class="end"><b>${fmtDate(b.released)}</b><span>${b.released ? "Released in AX" : "Not released"}</span></div></div></div>` : ""}
          <div><h4>Status in each system</h4><div class="systems">
            <div class="sys"><span class="k">CLL tracker</span>${pill(b?.status)}</div>
            <div class="sys"><span class="k">ERP 365</span>${pill(erp)}</div>
            <div class="sys"><span class="k">AX${ax ? " " + esc(ax.year) : ""}</span>${pill(ax?.status)}</div>
          </div></div>
          ${issues.length ? `<div><h4>Issues</h4><ul class="issue-list">${issues.map((i) => `<li>${ICON.warn}<span>${esc(i.text)}</span></li>`).join("")}</ul></div>` : ""}
          ${b?.remark ? `<div><h4>Remark</h4><p style="margin:0 0 6px">${esc(b.remark)}</p>${refChips(b.refs)}</div>` : ""}
          ${other.length ? `<div><h4>Also on</h4><dl class="kv">${other.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>` : ""}
          ${b ? `<div><h4>Tracker row</h4><dl class="kv"><dt>Sheet</dt><dd>${esc(model.found.tracker)}</dd><dt>Row</dt><dd class="mono">${rows.map((r) => r.row).join(", ")}</dd><dt>Remark type</dt><dd>${esc(b.category)}</dd></dl></div>` : ""}
          ${prod ? `<div><h4>${esc(prod.label)}: ${plural(prod.count, "batch", "batches")}${siblings.length ? "" : " (this one)"}</h4>${prod.median !== null ? `<p style="margin:0 0 8px;color:var(--muted);font-size:12.5px">Median ${days(prod.median)} · 90th percentile ${Math.round(prod.p90)} days · ${pct(prod.sameDay)} same day</p>` : ""}<div class="mini-batches">${siblings.map((s) => `<button data-open="${esc(s.id)}" title="${esc(s.status || "")} · ${s.lead === null ? "" : days(s.lead)}">${esc(s.id)}</button>`).join("")}</div></div>` : ""}
        </div>
      </aside>`;
    const host = $("#drawer");
    host.innerHTML = html;
    host.hidden = false;
    lastFocus = document.activeElement;
    $(".x", host).focus();
  }
  let lastFocus = null;
  function closeDrawer() {
    const host = $("#drawer");
    if (host.hidden) return;
    host.hidden = true;
    host.innerHTML = "";
    lastFocus?.focus?.();
  }

  // ---------- tooltip ----------
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  let tipTarget = null;
  function showTip(target, x, y) {
    if (tipTarget !== target) { tip.innerHTML = target.getAttribute("data-tip"); tipTarget = target; }
    tip.classList.add("on");
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }
  function closeTip() { tip.classList.remove("on"); tipTarget = null; }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4200);
  }

  // ---------- events ----------
  const RENDER = { overview, batches, "lead-time": leadTime, reconcile, blocked, "follow-up": followUp };
  const AFTER = {
    overview: () => { drawFlow(); drawCalendar(); drawTrend(); },
    batches: drawRows,
    "lead-time": () => { drawHist(); drawCats(); drawLeague(); },
    reconcile: drawSankey,
    blocked: drawRunway,
  };
  const PRESETS = {
    "q-quarantine": { status: "Quarantine", sort: { key: "cll", dir: 1 } },
    "q-ax-behind": { preset: { label: "AX lagging ERP 365", fn: (b) => b.issues.some((i) => i.kind === "ax-behind") } },
    "q-erp-missing": { preset: { label: "Missing from ERP 365", fn: (b) => b.issues.some((i) => i.kind === "erp-missing") } },
    "q-data": { preset: { label: "Data to correct", fn: (b) => b.issues.some((i) => ["negative-lead", "duplicate", "no-cll", "bad-date"].includes(i.kind)) } },
  };

  function bind() {
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-act],[data-batch],[data-open],[data-sort],[data-bucket],[data-cat],[data-product],[data-issue],[data-flow],[data-bsort],[data-aw]");
      if (!t) return;
      const d = t.dataset;
      if (d.act) {
        const a = d.act;
        if (a === "close") return closeDrawer();
        if (a === "import") return $("#file").click();
        if (a === "reset") return resetToBundled();
        if (a === "theme") return cycleTheme();
        if (a === "more") { ui.limit += 80; return drawRows(); }
        if (a === "clear-preset") { ui.preset = null; ui.limit = 80; return render(); }
        if (a === "clear-all") { resetFilters(); return render(); }
        if (a === "flow-chart" || a === "flow-table") { ui.flowTable = a === "flow-table"; return render(); }
        if (a.startsWith("go-")) return go(a.slice(3));
        if (PRESETS[a]) return go("batches", PRESETS[a]);
      }
      if (d.open) return openBatch(d.open);
      if (d.batch) return openBatch(d.batch);
      if (d.sort) { ui.sort = ui.sort.key === d.sort ? { key: d.sort, dir: -ui.sort.dir } : { key: d.sort, dir: d.sort === "lead" || d.sort === "cll" || d.sort === "released" ? -1 : 1 }; return render(); }
      if (d.bucket) return go("batches", { bucket: d.bucket, sort: { key: "lead", dir: -1 } });
      if (d.cat) return go("batches", { category: d.cat, sort: { key: "lead", dir: -1 } });
      if (d.product) { const p = model.stats.products.find((x) => x.key === d.product); return go("batches", { preset: { label: p.label, fn: (b) => b.productKey === d.product }, sort: { key: "lead", dir: -1 } }); }
      if (d.issue) { const k = d.issue; return go("batches", { preset: { label: t.querySelector(".label").textContent.trim(), fn: (b) => b.issues.some((i) => i.kind === k) } }); }
      if (d.flow) {
        const [ci, from, to] = d.flow.split("|");
        const getters = [(b) => b.status || "Not listed", (b) => b.erp || "Not listed", (b) => b.ax?.status || "Not listed"];
        const names = ["Tracker", "ERP 365", "AX"];
        return go("batches", { preset: { label: `${names[ci]} ${from} → ${names[+ci + 1]} ${to}`, fn: (b) => getters[ci](b) === from && getters[+ci + 1](b) === to } });
      }
      if (d.bsort) { ui.blockedSort = d.bsort; return render(); }
      if (d.aw) return openBatch(d.aw);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDrawer(); closeTip(); }
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-batch], .seg-b")) { e.preventDefault(); e.target.click(); }
      if (e.key === "/" && !e.target.matches("input,select,textarea")) { const q = $("#q"); if (q) { e.preventDefault(); q.focus(); } }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "q") { ui.q = e.target.value; ui.limit = 80; drawRows(); }
      if (e.target.id === "aw-q") {
        const v = e.target.value.trim().toUpperCase();
        document.querySelectorAll("[data-aw]").forEach((s) => (s.hidden = v && !s.dataset.aw.includes(v)));
      }
    });
    document.addEventListener("change", (e) => {
      const id = e.target.id;
      if (id === "f-status") ui.status = e.target.value;
      else if (id === "f-bucket") ui.bucket = e.target.value;
      else if (id === "f-cat") ui.category = e.target.value;
      else if (id === "f-flag") ui.flagged = e.target.checked;
      else if (id === "file") { importFile(e.target.files[0]); e.target.value = ""; return; }
      else return;
      ui.limit = 80;
      drawRows();
    });
    document.addEventListener("pointermove", (e) => {
      const t = e.target.closest?.("[data-tip]");
      if (t) showTip(t, e.clientX, e.clientY);
      else if (tipTarget) closeTip();
    });
    document.addEventListener("focusin", (e) => {
      const t = e.target.closest?.("[data-tip]");
      if (t) { const r = t.getBoundingClientRect(); showTip(t, r.left + r.width / 2, r.bottom); }
    });
    document.addEventListener("scroll", closeTip, { passive: true, capture: true });
    window.addEventListener("hashchange", render);
    let rz;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => AFTER[ui.view]?.(), 150); });
    // drag & drop import
    let depth = 0;
    window.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { depth++; $("#dropzone").hidden = false; } });
    window.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; $("#dropzone").hidden = true; } });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; $("#dropzone").hidden = true; importFile(e.dataTransfer.files[0]); });
  }

  // ---------- theme ----------
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  function cycleTheme() {
    const cur = document.documentElement.dataset.theme || "auto";
    const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    render();
  }

  // ---------- boot ----------
  function boot() {
    try { applyTheme(localStorage.getItem(THEME_KEY)); } catch { /* ignore */ }
    document.body.appendChild(tip);
    $("#brand-mark").innerHTML = brandMark();
    loadInitial();
    bind();
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
