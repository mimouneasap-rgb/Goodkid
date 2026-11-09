// Batch Release Desk: data model.
// Turns the raw workbook (sheet name -> array of rows) into batches, status
// cross-checks, lead times and follow-up lists. Pure functions, no DOM, so the
// same code runs in the browser and in `node --test`.
(function (root) {
  "use strict";

  const DAY = 86400000;

  // ---------- small helpers ----------
  const clean = (v) => (typeof v === "string" ? v.replace(/ /g, " ").replace(/\s+/g, " ").trim() : v);
  const text = (v) => {
    v = clean(v);
    return v === null || v === undefined || v === "" ? "" : String(v);
  };
  const norm = (v) => text(v).toLowerCase();
  const batchKey = (v) => text(v).toUpperCase();

  function isoFromParts(y, m, d) {
    if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Accepts "2026-01-05", Excel serials, "13/07/2026", and typo'd years like "13/07/026".
  function parseDate(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") {
      if (v < 30000 || v > 80000) return null; // not a plausible date serial
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY);
      return d.toISOString().slice(0, 10);
    }
    const s = text(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return isoFromParts(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      else if (y < 1000) y = 2000 + (y % 100);
      return isoFromParts(y, +m[2], +m[1]);
    }
    return null;
  }

  const toDay = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / DAY);
  const daysBetween = (a, b) => toDay(b) - toDay(a);

  function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function quantile(xs, q) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  // ---------- statuses ----------
  function normStatus(v) {
    const s = norm(v);
    if (!s || s === "#n/a") return null;
    if (s.startsWith("releas") || s === "libéré") return "Released";
    if (s.startsWith("quarant")) return "Quarantine";
    if (s.startsWith("reject") || s.startsWith("rejet")) return "Rejected";
    if (s.startsWith("nearexp")) return "Near expiry";
    return text(v);
  }

  // ---------- product grouping ----------
  // "Exval® Comprimé pelliculé 160/5mg B/30" and "Exval 160/5 mg comprimé pelliculé"
  // are the same product: group by brand word + first strength.
  const STRENGTH = /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*)\s*(mg|µg|mcg|g|ml|%)(?![a-z])/i;
  function productKey(name) {
    const s = norm(name).replace(/[®™*]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return { key: "", label: "" };
    const words = s.split(" ");
    // "Co Tensotel", "Co Aprosart": a two-letter prefix belongs to the brand.
    const brand = words[0].length <= 2 && words[1] ? words[0] + " " + words[1] : words[0];
    const m = s.match(STRENGTH);
    const strength = m ? (m[1].replace(/\s+/g, "") + m[2].toLowerCase()).replace(/\.(?=\d)/g, ",") : "";
    const label = brand.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + (strength ? " " + strength : "");
    return { key: brand + "|" + strength, label };
  }

  // ---------- remarks ----------
  const REF_RES = [
    { re: /\b(QE|CAPA|CC|COMP)\s*-?\s*KE\s*-?\s*(\d+)/gi, fmt: (m) => `${m[1].toUpperCase()}-KE-${m[2]}` },
    { re: /\bRE\s*-?\s*(\d+)\s*-\s*(\d+)\s*PF/gi, fmt: (m) => `RE-${m[1]}-${m[2]}PF` },
    { re: /\bDV\b/g, fmt: () => "DV" },
  ];
  function refsIn(remark) {
    const out = [];
    for (const { re, fmt } of REF_RES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(remark))) {
        const r = fmt(m);
        if (!out.includes(r)) out.push(r);
      }
    }
    return out;
  }

  const REMARK_CATEGORIES = [
    "Stability",
    "ERP posting (OF/OC)",
    "CAPA",
    "Deviation (QE)",
    "Change control",
    "Lab / QC result",
    "Management decision",
    "Other note",
    "No remark",
  ];
  function remarkCategory(remark) {
    const s = norm(remark);
    if (!s) return "No remark";
    if (s.includes("stabilit")) return "Stability";
    if (/\bo[fc]\b|of\/oc|not posted/.test(s)) return "ERP posting (OF/OC)";
    if (s.includes("capa")) return "CAPA";
    if (/qe\s*-?\s*ke|deviation/.test(s)) return "Deviation (QE)";
    if (/cc\s*-?\s*ke|change control/.test(s)) return "Change control";
    if (/microbio|oos|analys|qc\b/.test(s)) return "Lab / QC result";
    if (/décision|decision|manag/.test(s)) return "Management decision";
    return "Other note";
  }

  // ---------- lead time buckets ----------
  const LEAD_BUCKETS = [
    { id: "0", label: "Same day", test: (d) => d === 0 },
    { id: "1", label: "1 day", test: (d) => d === 1 },
    { id: "2-3", label: "2–3 days", test: (d) => d >= 2 && d <= 3 },
    { id: "4-7", label: "4–7 days", test: (d) => d >= 4 && d <= 7 },
    { id: "8-14", label: "8–14 days", test: (d) => d >= 8 && d <= 14 },
    { id: "15-30", label: "15–30 days", test: (d) => d >= 15 && d <= 30 },
    { id: "31+", label: "Over 30 days", test: (d) => d > 30 },
  ];
  const leadBucket = (d) => (d === null || d < 0 ? null : LEAD_BUCKETS.find((b) => b.test(d)).id);

  // ---------- sheet discovery ----------
  // Find a sheet by its header labels rather than its tab name, so a renamed
  // tab in next month's workbook still loads.
  function findHeader(rows, needles, maxScan = 6) {
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
      const cells = (rows[i] || []).map(norm);
      const cols = needles.map((n) => cells.findIndex((c) => c.includes(n)));
      if (cols.every((c) => c >= 0)) return { row: i, cols };
    }
    return null;
  }
  function findSheet(sheets, needles, nameHint) {
    const names = Object.keys(sheets);
    const ordered = nameHint ? [...names.filter((n) => nameHint.test(n)), ...names.filter((n) => !nameHint.test(n))] : names;
    for (const name of ordered) {
      const h = findHeader(sheets[name], needles);
      if (h) return { name, rows: sheets[name], ...h };
    }
    return null;
  }

  // ---------- main ----------
  function build(workbook, opts = {}) {
    const sheets = workbook.sheets || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const found = {};
    const warnings = [];

    // Status lists: ERP 365 and AX per year. Each sheet has "Batch number detailed | Batch disposition code".
    const erp = new Map();
    const ax = new Map(); // batch -> { status, year }
    for (const [name, rows] of Object.entries(sheets)) {
      const h = findHeader(rows, ["batch number", "disposition"], 3);
      if (!h) continue;
      const isErp = /erp|365|d365/i.test(name);
      const year = (name.match(/20\d\d/) || [])[0] || "";
      for (const r of rows.slice(h.row + 1)) {
        const b = batchKey(r[h.cols[0]]);
        const st = normStatus(r[h.cols[1]]);
        if (!b || !st) continue;
        if (isErp) erp.set(b, st);
        else ax.set(b, { status: st, year, sheet: name });
      }
      (found.statusSheets ||= []).push(name);
    }

    // Main tracker: CLL received vs AX.
    const main = findSheet(sheets, ["batch", "cll", "status"], /cll/i);
    const batches = [];
    if (main) {
      found.tracker = main.name;
      const hdr = main.rows[main.row].map(norm);
      const col = (needle, fallback) => {
        const i = hdr.findIndex((c) => c.includes(needle));
        return i >= 0 ? i : fallback;
      };
      const C = {
        product: col("product", 0),
        batch: main.cols[0],
        cll: main.cols[1],
        status: main.cols[2],
        released: col("released date", 4),
        remark: col("remark", 5),
      };
      const seen = new Map();
      main.rows.slice(main.row + 1).forEach((r, i) => {
        const product = text(r[C.product]);
        const id = batchKey(r[C.batch]);
        if (!id || /^total$/i.test(product)) return;
        const cllRaw = r[C.cll];
        const relRaw = r[C.released];
        const cll = parseDate(cllRaw);
        const released = parseDate(relRaw);
        const status = normStatus(r[C.status]);
        const remark = text(r[C.remark]);
        const lead = cll && released ? daysBetween(cll, released) : null;
        const pk = productKey(product);
        const b = {
          id,
          row: main.row + i + 2, // 1-based Excel row
          product,
          productKey: pk.key,
          productLabel: pk.label,
          cll,
          released,
          status,
          remark,
          refs: refsIn(remark),
          category: remarkCategory(remark),
          lead,
          bucket: leadBucket(lead),
          erp: erp.get(id) || null,
          ax: ax.get(id) || null,
          issues: [],
        };
        if (cllRaw && !cll) b.issues.push({ kind: "bad-date", text: `CLL date "${text(cllRaw)}" is not a date` });
        if (relRaw && !released) b.issues.push({ kind: "bad-date", text: `Release date "${text(relRaw)}" is not a date` });
        if (!cllRaw) b.issues.push({ kind: "no-cll", text: "No CLL receiving date" });
        if (status === "Released" && !relRaw) b.issues.push({ kind: "no-release-date", text: "Released with no release date" });
        if (lead !== null && lead < 0) b.issues.push({ kind: "negative-lead", text: `Released ${-lead} days before the CLL was received` });
        if (seen.has(id)) {
          b.issues.push({ kind: "duplicate", text: `Listed twice (also row ${seen.get(id).row})` });
          seen.get(id).issues.push({ kind: "duplicate", text: `Listed twice (also row ${b.row})` });
        } else seen.set(id, b);
        if (!b.erp) b.issues.push({ kind: "erp-missing", text: "Not found in the ERP 365 list" });
        else if (status && b.erp !== status) b.issues.push({ kind: "status-mismatch", text: `Tracker says ${status}, ERP 365 says ${b.erp}` });
        if (b.erp === "Released" && b.ax && b.ax.status !== "Released")
          b.issues.push({ kind: "ax-behind", text: `ERP 365 released, AX ${b.ax.year} still ${b.ax.status}` });
        if (status === "Quarantine" && cll) b.age = daysBetween(cll, today);
        batches.push(b);
      });
    } else warnings.push("No sheet with Batch / CLL / Status columns was found.");

    const trackerIds = new Set(batches.map((b) => b.id));

    // ERP quarantine with no CLL received yet.
    const awaitingCll = [];
    for (const [id, st] of erp) if (st === "Quarantine" && !trackerIds.has(id)) awaitingCll.push({ id, ax: ax.get(id) || null });
    awaitingCll.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    // Blocked finished products (Statut PF): product, batch, qty, expiry, reason.
    const blocked = [];
    const pf = findSheet(sheets, ["product", "batch"], /statut|pf/i);
    if (pf && /statut|pf/i.test(pf.name)) {
      found.blocked = pf.name;
      let last = null;
      for (const r of pf.rows.slice(pf.row + 1)) {
        const batch = batchKey(r[1]);
        const reason = text(r[4]).replace(/^-\s*/, "");
        if (!batch) {
          if (last && reason) last.reason += " · " + reason;
          continue;
        }
        let qty = r[2];
        if (typeof qty === "string" && /^\d{4}-\d{2}-\d{2}$/.test(qty)) qty = toDay(qty) - toDay("1899-12-30"); // qty mis-typed as a date
        qty = typeof qty === "number" ? qty : Number(text(qty).replace(/\s/g, "")) || null;
        const expiry = parseDate(r[3]);
        last = {
          product: text(r[0]).split(" / ")[0],
          productLabel: productKey(r[0]).label,
          batch,
          qty,
          expiry,
          monthsLeft: expiry ? daysBetween(today, expiry) / 30.44 : null,
          reason,
        };
        blocked.push(last);
      }
      for (const b of blocked) {
        b.kind = blockKind(b.reason);
        b.refs = refsIn(b.reason);
        b.tracker = batches.find((x) => x.id === b.batch) || null;
      }
    }

    // Posting follow-up (CodeProduit | Product | Batch | Qty | Status | QA feedback).
    const posting = [];
    const ps = findSheet(sheets, ["codeproduit", "batch", "status"]);
    if (ps) {
      found.posting = ps.name;
      for (const r of ps.rows.slice(ps.row + 1)) {
        if (!r || !r.length) continue;
        let rec;
        if (/^[A-Z]{2}\d{3}/.test(text(r[0]))) rec = { code: text(r[0]), product: text(r[1]), batch: batchKey(r[2]), qty: r[3], status: text(r[4]), feedback: text(r[5]) };
        else rec = { code: "", product: text(r[0]), batch: batchKey(r[1]), qty: null, status: text(r[2]), feedback: text(r[3]) }; // shorter rows
        if (!rec.batch) continue;
        rec.status = postingStatus(rec.status);
        rec.feedback = postingFeedback(rec.feedback);
        rec.tracker = batches.find((x) => x.id === rec.batch) || null;
        rec.erp = erp.get(rec.batch) || null;
        posting.push(rec);
      }
    }

    // QA release requests (Product | Batch | CLL | QA release).
    const requests = [];
    const rq = findSheet(sheets, ["product", "batch", "cll", "qa release"]);
    if (rq) {
      found.requests = rq.name;
      for (const r of rq.rows.slice(rq.row + 1)) {
        const batch = batchKey(r[1]);
        if (!batch) continue;
        const asked = text(r[3]) || "No answer";
        requests.push({ product: text(r[0]), batch, cll: parseDate(r[2]), answer: /releas/i.test(asked) ? "Released" : /not/i.test(asked) ? "Not done" : asked, erp: erp.get(batch) || null, tracker: batches.find((x) => x.id === batch) || null });
      }
    }

    // Physical vs system release.
    const physical = [];
    const ph = findSheet(sheets, ["batch", "physique"]);
    if (ph) {
      found.physical = ph.name;
      const hdr = ph.rows[ph.row].map(norm);
      const sysCol = hdr.findIndex((c) => c.includes("système") || c.includes("systeme") || c.includes("system"));
      for (const r of ph.rows.slice(ph.row + 1)) {
        const batch = batchKey(r[1]);
        if (!batch) continue;
        physical.push({ product: text(r[0]), batch, cll: parseDate(r[2]), physical: /done/i.test(text(r[ph.cols[1]])), system: sysCol >= 0 && /done/i.test(text(r[sysCol])), erp: erp.get(batch) || null });
      }
    }

    return { name: workbook.name || "Workbook", today, found, warnings, batches, erp, ax, awaitingCll, blocked, posting, requests, physical, stats: stats(batches) };
  }

  function blockKind(reason) {
    const s = norm(reason);
    if (/rejet|rejeté|reject/.test(s)) return "Rejected";
    if (/cll|coa/.test(s)) return "Missing CLL / COA";
    if (/oos|investig|qe-ke|capa|anomal|deviation|réclamation|comp-ke/.test(s)) return "Investigation";
    if (/decision|décision|variation|validation|standard|quh/.test(s)) return "Decision / documents";
    return "Other";
  }
  const BLOCK_KINDS = ["Rejected", "Investigation", "Missing CLL / COA", "Decision / documents", "Other"];

  function postingStatus(s) {
    const n = norm(s);
    if (!n) return "No status";
    if (n.startsWith("rm not")) return "RM not yet shipped";
    if (n.startsWith("under")) return "Under posting";
    if (n.startsWith("posted")) return "Posted";
    return text(s);
  }
  function postingFeedback(s) {
    const n = norm(s);
    if (!n) return "No feedback";
    if (n.includes("trouv")) return "Not found";
    if (n.includes("not posted")) return "Not posted";
    if (n.startsWith("of done")) return "OF done";
    if (n.startsWith("prob")) return "Problem";
    return text(s);
  }

  // ---------- aggregate stats ----------
  function stats(batches) {
    const unique = new Map();
    for (const b of batches) if (!unique.has(b.id)) unique.set(b.id, b);
    const list = [...unique.values()];
    const released = list.filter((b) => b.status === "Released");
    const quarantine = list.filter((b) => b.status === "Quarantine");
    const leads = list.filter((b) => b.lead !== null && b.lead >= 0).map((b) => b.lead);

    const byBucket = LEAD_BUCKETS.map((bk) => ({ ...bk, count: leads.filter(bk.test).length }));

    // Months between first and last CLL date.
    const months = new Map();
    const monthOf = (iso) => iso.slice(0, 7);
    const dates = list.map((b) => b.cll).filter(Boolean).sort();
    if (dates.length) {
      let [y, m] = dates[0].split("-").map(Number);
      const [ey, em] = dates[dates.length - 1].split("-").map(Number);
      while (y < ey || (y === ey && m <= em)) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        months.set(k, { month: k, received: 0, released: 0, leads: [] });
        if (++m > 12) { m = 1; y++; }
      }
    }
    for (const b of list) {
      if (b.cll && months.has(monthOf(b.cll))) {
        const mo = months.get(monthOf(b.cll));
        mo.received++;
        if (b.lead !== null && b.lead >= 0) mo.leads.push(b.lead);
      }
      if (b.released && months.has(monthOf(b.released))) months.get(monthOf(b.released)).released++;
    }
    const monthly = [...months.values()].map((m) => ({ ...m, median: median(m.leads), p90: quantile(m.leads, 0.9), mean: m.leads.length ? m.leads.reduce((a, b) => a + b, 0) / m.leads.length : null, sameDay: m.leads.length ? m.leads.filter((d) => d === 0).length / m.leads.length : null }));

    // Daily receipts for the calendar.
    const daily = new Map();
    for (const b of list) if (b.cll) daily.set(b.cll, (daily.get(b.cll) || 0) + 1);

    // Products.
    const prod = new Map();
    for (const b of list) {
      if (!b.productKey) continue;
      if (!prod.has(b.productKey)) prod.set(b.productKey, { key: b.productKey, label: b.productLabel, names: new Map(), batches: [], leads: [] });
      const p = prod.get(b.productKey);
      p.batches.push(b);
      p.names.set(b.product, (p.names.get(b.product) || 0) + 1);
      if (b.lead !== null && b.lead >= 0) p.leads.push(b.lead);
    }
    const products = [...prod.values()]
      .map((p) => ({ key: p.key, label: p.label, fullName: [...p.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: p.batches.length, quarantine: p.batches.filter((b) => b.status === "Quarantine").length, median: median(p.leads), p90: quantile(p.leads, 0.9), max: p.leads.length ? Math.max(...p.leads) : null, sameDay: p.leads.length ? p.leads.filter((d) => d === 0).length / p.leads.length : null }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    // Remark categories.
    const categories = REMARK_CATEGORIES.map((c) => {
      const bs = list.filter((b) => b.category === c);
      const ls = bs.filter((b) => b.lead !== null && b.lead >= 0).map((b) => b.lead);
      return { category: c, count: bs.length, median: median(ls), mean: ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null, quarantine: bs.filter((b) => b.status === "Quarantine").length };
    }).filter((c) => c.count);

    const issues = {};
    for (const b of batches) for (const i of b.issues) (issues[i.kind] ||= []).push(b);

    return {
      rows: batches.length,
      total: list.length,
      released: released.length,
      quarantine: quarantine.length,
      leads: leads.length,
      median: median(leads),
      mean: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null,
      p90: quantile(leads, 0.9),
      sameDay: leads.length ? leads.filter((d) => d === 0).length / leads.length : null,
      within3: leads.length ? leads.filter((d) => d <= 3).length / leads.length : null,
      byBucket,
      monthly,
      daily,
      products,
      categories,
      issues,
      firstCll: dates[0] || null,
      lastCll: dates[dates.length - 1] || null,
    };
  }

  // ---------- SheetJS adapter ----------
  // Converts a SheetJS workbook to the plain {name, sheets} shape used above.
  // Date cells become ISO strings; everything else keeps its raw value.
  function fromSheetJS(XLSX, wb, name) {
    const sheets = {};
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      if (!ws["!ref"]) { sheets[sn] = []; continue; }
      const range = XLSX.utils.decode_range(ws["!ref"]);
      const rows = [];
      for (let R = range.s.r; R <= range.e.r; R++) {
        const row = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          let v = null;
          if (cell) {
            if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
              const p = XLSX.SSF.parse_date_code(cell.v);
              v = p ? isoFromParts(p.y, p.m, p.d) : null;
            } else if (cell.t === "d") {
              v = cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : null;
            } else if (cell.t !== "e") v = clean(cell.v);
          }
          row.push(v === "" ? null : v);
        }
        while (row.length && row[row.length - 1] === null) row.pop();
        rows.push(row);
      }
      while (rows.length && !rows[rows.length - 1].length) rows.pop();
      sheets[sn] = rows;
    }
    return { name, sheets };
  }

  const api = { build, parseDate, productKey, refsIn, remarkCategory, leadBucket, daysBetween, median, quantile, fromSheetJS, LEAD_BUCKETS, REMARK_CATEGORIES, BLOCK_KINDS };
  root.ReleaseModel = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
