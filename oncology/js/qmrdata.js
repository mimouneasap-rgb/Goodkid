// The figures of each management-review parameter for one review (pure, no DOM): counted from the app's own data for the
// reviewed half-year, compared with the four half-years before it (two years of history) and, where the procedure asks for
// it, related to the volume produced (rates per 100 batches manufactured). Figures the app cannot count are the ones the
// department enters by hand (qmrkit QMR_PARAMS fields). Labels are i18n keys (qf_…); the page translates and formats them.
import { historyOf, manualOf, manualHistory, prevHalf } from "./qmrkit.js";
import { metricValue } from "./domain.js";
import { toDay } from "./model.js";

const DAY = 86400000;
const inP = (t, p) => t != null && t >= p.start && t < p.end;
const per100 = (k, b) => (b ? (k / b) * 100 : null);
const pct = (k, d) => (d ? k / d : null);
const tally = (xs, f) => { const o = new Map(); for (const x of xs) for (const k of [].concat(f(x))) if (k) o.set(k, (o.get(k) ?? 0) + 1); return [...o].sort((a, b) => b[1] - a[1]); };
const classOf = (r) => { const c = `${r.finalClass || r.initialClass || r.classification || ""}`; return /crit/i.test(c) ? "Critical" : /maj/i.test(c) ? "Major" : /min/i.test(c) ? "Minor" : /incid/i.test(c) ? "Incident" : /notif/i.test(c) ? "Notification" : "Not classified"; };
const live = (r) => r.status !== "Canceled";
const causesOf = (r) => String(r.rootCause ?? "").split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
const reworked = (r) => /\S/.test(String(r.Reworks ?? "")) && !/^(no|non|none|aucun|n\/?a|-|0)$/i.test(String(r.Reworks).trim());

/** Figure: k = i18n key, v = value, u = "n" | "%" | "r" (per 100 batches) | "d" (days); tone 1 action, 2 watch, 3 good. */
const fig = (k, v, u = "n", extra = {}) => ({ k, v: v ?? null, u, ...extra });

/** Everything one parameter shows for a review: figures, a two-year trend, a breakdown, the items to look at, a suggested assessment. */
export function paramData(m, Q, review, key) {
  const p = review?.period;
  if (!p) return { figs: [], trend: null, bars: null, rows: null, hint: 0 };
  const x = m.x, now = m.now;
  const asOf = Math.min(p.end - DAY, now);
  const H = historyOf(p);
  const batchesIn = (q) => x.batches.filter((b) => inP(b.mfg, q));
  const vol = batchesIn(p).length;
  const manual = (f) => manualOf(review, key, f);
  const mHist = (f, k = `qf_${f}`) => ({ k, u: "n", points: manualHistory(Q, review, key, f) });
  const recs = (type) => m.records.filter((r) => r.type === type && live(r));
  const metric = (id, q = p) => metricValue(m, id, q);
  // a quarterly metric entered by hand, summed over the two quarters of the half-year
  const quarters = (q) => [`${q.year}-Q${q.h * 2 - 1}`, `${q.year}-Q${q.h * 2}`];
  const manualMetric = (id, q = p) => {
    const vs = x.metricValues.filter((v) => v.Metric === id && quarters(q).includes(v.Period));
    if (!vs.length) return null;
    const num = vs.reduce((a, v) => a + (+v.Numerator || +v.Value || 0), 0), den = vs.reduce((a, v) => a + (+v.Denominator || 0), 0);
    return { num, den, value: den ? num / den : num };
  };

  switch (key) {
    case "regulations": {
      const R = Q.regs;
      const pub = R.filter((r) => inP(r.published, p));
      const open = R.filter((r) => !r.closed);
      return {
        figs: [fig("qf_reg_new", pub.length), fig("qf_reg_implemented", R.filter((r) => /implemented/i.test(r.Status ?? "")).length), fig("qf_reg_open", open.length, "n", { tone: open.some((r) => r.overdue) ? 1 : open.length ? 2 : 3 }),
          fig("qf_reg_overdue", open.filter((r) => r.overdue).length, "n", { tone: open.some((r) => r.overdue) ? 1 : 3 })],
        trend: { k: "qf_reg_new", u: "n", points: H.map((q) => ({ x: q.label, value: R.filter((r) => inP(r.published, q)).length })) },
        bars: R.length ? { k: "col_status", items: tally(R, (r) => r.Status || "New").map(([label, value]) => ({ label, value })) } : null,
        rows: open.length ? { k: "qf_reg_open", items: open.map((r) => ({ ref: r["Reg ID"] ?? "", title: r.Regulation, status: r.overdue ? "Overdue" : r.Status, due: r.due, who: r.Owner })) } : null,
        hint: open.some((r) => r.overdue) ? 1 : open.length ? 2 : R.length ? 3 : 0, src: "regs",
      };
    }
    case "pqr": {
      const prog = x.apqrProg.products.filter((q) => q.inPlan);
      const dueIn = (q) => prog.filter((a) => inP(a.reportDue, q) && a.reportDue <= asOf);
      const D = dueIn(p);
      const done = D.filter((a) => a.approved != null);
      const overdue = prog.filter((a) => a.approved == null && a.reportDue != null && a.reportDue < asOf);
      const yearPlan = prog.filter((a) => a.reportDue != null && new Date(a.reportDue).getUTCFullYear() === p.year);
      const capas = recs("CAPA").filter((r) => /apqr|pqr|product quality review/i.test(r.source ?? ""));
      const ontime = metric("pqr_ontime");
      return {
        figs: [fig("qf_pqr_due", D.length), fig("qf_pqr_done", pct(done.length, D.length), "%", { sub: `${done.length} / ${D.length}`, tone: D.length ? (done.length === D.length ? 3 : 1) : 0 }),
          fig("qf_pqr_ontime", ontime.value, "%"), fig("qf_pqr_overdue", overdue.length, "n", { tone: overdue.length ? 1 : 3 }), fig("qf_pqr_year", yearPlan.length),
          fig("qf_pqr_year_done", pct(yearPlan.filter((a) => a.approved != null).length, yearPlan.length), "%"), fig("qf_pqr_capa", capas.length, "n", { sub: `${capas.filter((r) => r.isOpen).length} open` })],
        trend: { k: "qf_pqr_done", u: "%", points: H.map((q) => { const d = dueIn(q); return { x: q.label, value: pct(d.filter((a) => a.approved != null).length, d.length), n: d.length }; }) },
        rows: overdue.length ? { k: "qf_pqr_overdue", items: overdue.slice(0, 40).map((a) => ({ ref: a.code ?? "", title: a.name, status: "Overdue", due: a.reportDue })) } : null,
        hint: overdue.length ? 1 : D.length && done.length < D.length ? 2 : D.length ? 3 : 0, link: "apqr",
      };
    }
    case "procedures": {
      const S = m.sops.filter((s) => s.reviewStatus !== "Obsolete");
      const dated = S.filter((s) => s.next != null);
      const overdue = dated.filter((s) => s.next < asOf);
      const dueInP = dated.filter((s) => inP(s.next, p));
      const reviewedInP = S.filter((s) => inP(s.reviewedOn, p) || inP(s.eff, p));
      const pol = manual("policies"), polDone = manual("policiesDone");
      return {
        figs: [fig("qf_sop_total", S.length), fig("qf_sop_ontime", pct(dated.length - overdue.length, dated.length), "%", { tone: overdue.length ? 2 : 3 }), fig("qf_sop_overdue", overdue.length, "n", { tone: overdue.length ? 1 : 3 }),
          fig("qf_sop_due_period", dueInP.length), fig("qf_sop_revised", reviewedInP.length), fig("qf_sop_nodate", S.length - dated.length, "n", { tone: S.length - dated.length ? 2 : 3 }),
          fig("qf_policies", pol), fig("qf_policies_done", pol ? pct(polDone ?? 0, pol) : null, "%", { sub: pol ? `${polDone ?? 0} / ${pol}` : null })],
        trend: { k: "qf_sop_revised", u: "n", points: H.map((q) => ({ x: q.label, value: S.filter((s) => inP(s.reviewedOn, q) || inP(s.eff, q)).length })) },
        rows: overdue.length ? { k: "qf_sop_overdue", items: overdue.sort((a, b) => a.next - b.next).slice(0, 40).map((s) => ({ ref: s.Code, title: s.Title, status: "Overdue", due: s.next })) } : null,
        hint: overdue.length ? 2 : dated.length ? 3 : 0, link: "sops",
      };
    }
    case "suppliers": {
      const S = x.suppliers;
      const approved = S.filter((s) => /approv|qualif/i.test(s["Approval status"] ?? ""));
      const auditLate = S.filter((s) => s.auditStatus === "Audit overdue"), noAudit = S.filter((s) => s.auditStatus === "No audit date");
      const findings = recs("Audit Finding").filter((r) => r.supplier);
      const planned = manual("supQualPlanned"), done = manual("supQualDone");
      return {
        figs: [fig("qf_sup_total", S.length), fig("qf_sup_approved", pct(approved.length, S.length), "%", { sub: `${approved.length} / ${S.length}` }),
          fig("qf_sup_qual", planned ? pct(done ?? 0, planned) : null, "%", { sub: planned ? `${done ?? 0} / ${planned}` : null, tone: planned ? ((done ?? 0) >= planned ? 3 : 2) : 0 }),
          fig("qf_sup_audit_late", auditLate.length, "n", { tone: auditLate.length ? 1 : 3 }), fig("qf_sup_no_audit", noAudit.length, "n", { tone: noAudit.length ? 2 : 3 }),
          fig("qf_sup_findings", findings.filter((r) => inP(r.opened, p)).length, "n", { sub: `${findings.filter((r) => r.isOpen).length} open` }), fig("qf_supClaims", manual("supClaims"))],
        trend: mHist("supClaims"),
        rows: auditLate.length || noAudit.length ? { k: "qf_sup_attention", items: [...auditLate, ...noAudit].map((s) => ({ ref: s.API, title: `${s.Manufacturer ?? ""}${s.Supplier ? ` · ${s.Supplier}` : ""}`, status: s.auditStatus, due: s.next })) } : null,
        hint: auditLate.length ? 1 : noAudit.length ? 2 : S.length ? 3 : 0, link: "suppliers",
      };
    }
    case "training": {
      const T = x.training.filter((t) => t.status !== "Cancelled");
      const dueBy = (q) => T.filter((t) => t.planned != null && t.planned < q.end && t.planned <= asOf && new Date(t.planned).getUTCFullYear() === q.year);
      const due = dueBy(p);
      const gmp = metric("gmp_training"), plan = metric("training_plan");
      const tx = x.trainingX;
      const U = tx.unplanned.filter((u) => inP(u.date, p));
      const ppl = tx.people.filter((q) => q.active && q.required);
      const comp = ppl.length ? ppl.reduce((a, q) => a + q.compliance, 0) / ppl.length : null;
      return {
        figs: [fig("qf_trn_plan", plan.value, "%", { sub: plan.den ? `${plan.num} / ${plan.den}` : null, tone: plan.value == null ? 0 : plan.value >= 0.85 ? 3 : plan.value >= 0.75 ? 2 : 1 }),
          fig("qf_trn_gmp", gmp.value, "%", { sub: gmp.den ? `${gmp.num} / ${gmp.den}` : null }), fig("qf_trn_overdue", due.filter((t) => t.done == null).length, "n", { tone: due.some((t) => t.done == null) ? 2 : 3 }),
          fig("qf_trn_unplanned", U.length), fig("qf_trn_retrain", tx.retraining.length, "n", { tone: tx.retraining.some((r) => r.overdue) ? 1 : 3 }), fig("qf_trn_people", comp, "%")],
        trend: { k: "qf_trn_plan", u: "%", points: H.map((q) => { const v = metric("training_plan", q); return { x: q.label, value: v.value, n: v.den }; }) },
        rows: due.some((t) => t.done == null) ? { k: "qf_trn_overdue", items: due.filter((t) => t.done == null).map((t) => ({ ref: t["Training ID"] ?? "", title: t.Program, status: t.status, due: t.plannedEnd })) } : null,
        hint: plan.value == null ? 0 : plan.value >= 0.85 ? 3 : plan.value >= 0.75 ? 2 : 1, link: "training",
      };
    }
    case "resources": {
      const qaAuto = x.trainingX.staff.filter((s) => s.active && /quality assurance|^qa\b/i.test(`${s.dept ?? ""}`)).length;
      const site = manual("siteStaff"), temp = manual("tempStaff"), qa = manual("qaStaff") ?? (qaAuto || null), qc = manual("qcFte");
      return {
        figs: [fig("qf_siteStaff", site), fig("qf_tempStaff", temp), fig("qf_qaStaff", qa, "n", { sub: manual("qaStaff") == null && qaAuto ? "app" : null }), fig("qf_qa_share", site && qa != null ? qa / site : null, "%"),
          fig("qf_qcFte", qc), fig("qf_batches", vol), fig("qf_batches_per_qc", qc ? vol / qc : null, "x"), fig("qf_qc_per_100", qc != null && vol ? (qc / vol) * 100 : null, "x")],
        trend: { k: "qf_batches_per_qc", u: "x", points: H.map((q) => { const r = Q.reviews.find((y) => y.period?.label === q.label && !y.cancelled); const f = r ? manualOf(r, key, "qcFte") : null; const b = batchesIn(q).length; return { x: q.label, value: f ? b / f : null }; }) },
        hint: site == null || qc == null ? 0 : 3,
      };
    }
    case "deviations": {
      const devIn = (q) => recs("Deviation").filter((r) => inP(r.opened, q));
      const D = devIn(p);
      const by = (c) => D.filter((r) => classOf(r) === c);
      const crit = by("Critical"), maj = by("Major");
      const mc = [...crit, ...maj];
      const capas = recs("CAPA").filter((r) => D.some((d) => d.ref === r.parentRef) || (r.parentRef && /^QE/i.test(r.parentRef) && inP(r.opened, p)));
      const allCapaDev = recs("CAPA").filter((r) => /quality event|deviation/i.test(r.source ?? "") || /^QE/i.test(r.parentRef ?? ""));
      const lateCapa = allCapaDev.filter((r) => r.overdue);
      return {
        figs: [fig("qf_batches", vol), fig("qf_dev_total", D.length, "n", { sub: vol ? `${per100(D.length, vol).toFixed(1)} / 100` : null }),
          fig("qf_dev_critical", crit.length, "n", { tone: crit.length ? 1 : 3 }), fig("qf_dev_major", maj.length, "n", { tone: maj.length ? 2 : 3 }),
          fig("qf_dev_mc_rate", per100(mc.length, vol), "r"), fig("qf_dev_mc_share", pct(mc.length, D.length), "%"), fig("qf_dev_minor", by("Minor").length), fig("qf_dev_incident", by("Incident").length),
          fig("qf_dev_open", D.filter((r) => r.isOpen).length, "n", { sub: `${D.filter((r) => r.overdue).length} overdue`, tone: D.some((r) => r.overdue) ? 2 : 3 }),
          fig("qf_capa_open", allCapaDev.filter((r) => r.isOpen).length, "n", { sub: `${capas.length} from this period` }), fig("qf_capa_overdue", lateCapa.length, "n", { tone: lateCapa.length ? 1 : 3 })],
        trend: { k: "qf_dev_mc_rate", u: "r", series: ["Critical", "Major", "Minor"], points: H.map((q) => { const d = devIn(q), b = batchesIn(q).length; const c = d.filter((r) => ["Critical", "Major"].includes(classOf(r))).length;
          return { x: q.label, value: per100(c, b), n: b, Critical: d.filter((r) => classOf(r) === "Critical").length, Major: d.filter((r) => classOf(r) === "Major").length, Minor: d.filter((r) => classOf(r) === "Minor").length }; }) },
        bars: mc.length || D.length ? { k: "qf_dev_causes", items: tally(mc.length ? mc : D, causesOf).map(([label, value]) => ({ label, value, sub: mc.length ? ["Critical", "Major"].map((c) => `${c[0]}${mc.filter((r) => classOf(r) === c && causesOf(r).includes(label)).length}`).join(" ") : null })) } : null,
        rows: mc.length ? { k: "qf_dev_mc_list", items: mc.map((r) => ({ ref: r.ref, title: r.title, status: r.status, due: r.due, extra: `${classOf(r)}${r.linkedCapas ? ` · ${r.linkedCapas} CAPA` : ""}`, record: true })) } : null,
        hint: crit.length || lateCapa.length ? 1 : maj.length || D.some((r) => r.overdue) ? 2 : 3, link: "deviations",
      };
    }
    case "oos": {
      const bat = batchesIn(p).filter((b) => b.oos);
      const f = (k) => manual(k);
      const total = ["oosRaw", "oosBulk", "oosFinished", "oosStability"].reduce((a, k) => a + (f(k) ?? 0), 0);
      const rel = manualMetric("oos_release"), stab = manualMetric("oos_stab"), inv = manualMetric("oos_invalid");
      return {
        figs: [fig("qf_batches", vol), fig("qf_oos_batches", bat.length, "n", { sub: vol ? `${per100(bat.length, vol).toFixed(1)} / 100` : null, tone: bat.length ? 2 : 3 }),
          ...["oosRaw", "oosBulk", "oosFinished", "oosStability"].map((k) => fig(`qf_${k}`, f(k))), fig("qf_oos_total_rate", total ? per100(total, vol) : null, "r"),
          fig("qf_oosConfirmed", f("oosConfirmed"), "n", { tone: f("oosConfirmed") ? 2 : 0 }), fig("qf_oosNotConfirmed", f("oosNotConfirmed")),
          rel ? fig("qf_oos_metric_rel", rel.value, "%", { sub: `${rel.num} / ${rel.den}` }) : null, stab ? fig("qf_oos_metric_stab", stab.value, "%", { sub: `${stab.num} / ${stab.den}` }) : null,
          inv ? fig("qf_oos_metric_inv", inv.value, "%") : null].filter(Boolean),
        trend: { k: "qf_oos_batches", u: "n", points: H.map((q) => ({ x: q.label, value: batchesIn(q).filter((b) => b.oos).length, n: batchesIn(q).length })) },
        rows: bat.length ? { k: "qf_oos_batches", items: bat.map((b) => ({ ref: b["Batch no"], title: b.Product, status: b.stage, extra: b.oos })) } : null,
        hint: f("oosConfirmed") ? 2 : bat.length ? 2 : 3, link: "batches",
      };
    }
    case "complaints": {
      const f = (k) => manual(k);
      const rate = manualMetric("complaint_rate"), crit = manualMetric("complaint_critical");
      const units = f("unitsDistributed");
      return {
        figs: [fig("qf_complaints", f("complaints")), fig("qf_complaintsValid", f("complaintsValid"), "n", { tone: f("complaintsValid") ? 2 : 0 }), fig("qf_complaints_valid_share", f("complaints") ? pct(f("complaintsValid") ?? 0, f("complaints")) : null, "%"),
          fig("qf_complaints_rate", f("complaintsValid") != null && vol ? per100(f("complaintsValid"), vol) : null, "r"), fig("qf_complaints_ppm", units && f("complaints") != null ? (f("complaints") / units) * 1e6 : null, "x"),
          fig("qf_complaintsTechnical", f("complaintsTechnical")), fig("qf_counterfeits", f("counterfeits"), "n", { tone: f("counterfeits") ? 1 : 0 }),
          rate ? fig("qf_complaint_metric", rate.value, "%", { sub: `${rate.num} / ${rate.den}` }) : null, crit ? fig("qf_complaint_critical", crit.num, "n", { tone: crit.num ? 1 : 3 }) : null].filter(Boolean),
        trend: mHist("complaintsValid"),
        hint: f("counterfeits") || crit?.num ? 1 : f("complaintsValid") ? 2 : f("complaints") != null ? 3 : 0,
      };
    }
    case "recalls": {
      const f = (k) => manual(k);
      const ev = manualMetric("recall_events");
      const n = f("recalls") ?? ev?.num ?? null;
      return {
        figs: [fig("qf_recalls", n, "n", { tone: n ? 1 : n === 0 ? 3 : 0 }), fig("qf_recallsVoluntary", f("recallsVoluntary")), fig("qf_recallsForced", f("recallsForced"), "n", { tone: f("recallsForced") ? 1 : 0 }),
          fig("qf_recall_rate", n != null && vol ? per100(n, vol) : null, "r")],
        trend: mHist("recalls"),
        hint: n ? 1 : n === 0 ? 3 : 0,
      };
    }
    case "manufacturing": {
      // right first time, as the procedure defines it: batches without a major or critical deviation (and not rejected)
      const MC = recs("Deviation").filter((r) => ["Critical", "Major"].includes(classOf(r)));
      const hasMC = (b) => MC.some((r) => (r.batch && String(r.batch).includes(String(b["Batch no"]))) || (b.refs ?? []).includes(r.ref));
      const B = batchesIn(p);
      const rej = B.filter((b) => b.rejected);
      const rw = x.rejections.filter((r) => reworked(r) && B.some((b) => String(b["Batch no"]) === String(r.Batch)));
      const rft = (q) => { const bs = batchesIn(q); return { value: pct(bs.filter((b) => !hasMC(b) && !b.rejected).length, bs.length), n: bs.length }; };
      const r0 = rft(p), rftApp = pct(B.filter((b) => b.rft).length, B.length);
      const rw0 = manual("reworked") ?? rw.length;
      return {
        figs: [fig("qf_batches", vol), fig("qf_rejected", rej.length, "n", { sub: vol ? `${per100(rej.length, vol).toFixed(1)} %` : null, tone: rej.length ? 2 : 3 }),
          fig("qf_reworked", rw0, "n", { sub: vol ? `${per100(rw0, vol).toFixed(1)} %` : null }), fig("qf_rft", r0.value, "%", { tone: r0.value == null ? 0 : r0.value >= 0.95 ? 3 : r0.value >= 0.85 ? 2 : 1, sub: "SOP" }),
          fig("qf_rft_strict", rftApp, "%", { sub: "no deviation, OOS or rejection" }), fig("qf_released", B.filter((b) => b.release != null).length)],
        trend: { k: "qf_rft", u: "%", points: H.map((q) => ({ x: q.label, ...rft(q), rejected: batchesIn(q).filter((b) => b.rejected).length })) },
        bars: rej.length ? { k: "qf_rej_kinds", items: tally(x.rejections.filter((r) => rej.some((b) => String(b["Batch no"]) === String(r.Batch))), (r) => r.kind).map(([label, value]) => ({ label, value })) } : null,
        rows: rej.length ? { k: "qf_rejected", items: rej.map((b) => ({ ref: b["Batch no"], title: b.Product, status: b.stage, extra: [b.deviation, b.oos].filter(Boolean).join(" · ") })) } : null,
        hint: r0.value == null ? 0 : r0.value >= 0.95 && !rej.length ? 3 : r0.value >= 0.85 ? 2 : 1, link: "batches",
      };
    }
    case "vmp": {
      const V = x.validation.filter((v) => !/cancel/i.test(v.status ?? ""));
      const dueBy = V.filter((v) => v.start != null && v.start <= asOf);
      const done = dueBy.filter((v) => v.done != null);
      const overdue = V.filter((v) => v.status === "Overdue"), postponed = V.filter((v) => /postpon/i.test(v.Status ?? ""));
      const cal = metric("cal_compliance");
      return {
        figs: [fig("qf_vmp_planned", dueBy.length), fig("qf_vmp_done", pct(done.length, dueBy.length), "%", { sub: `${done.length} / ${dueBy.length}`, tone: dueBy.length ? (done.length / dueBy.length >= 0.9 ? 3 : done.length / dueBy.length >= 0.75 ? 2 : 1) : 0 }),
          fig("qf_vmp_overdue", overdue.length, "n", { tone: overdue.length ? 1 : 3 }), fig("qf_vmp_postponed", postponed.length), fig("qf_vmp_period", V.filter((v) => inP(v.done, p)).length), fig("qf_cal", cal.value, "%", { sub: cal.den ? `${cal.num} / ${cal.den}` : null })],
        trend: { k: "qf_vmp_period", u: "n", points: H.map((q) => ({ x: q.label, value: V.filter((v) => inP(v.done, q)).length })) },
        rows: overdue.length ? { k: "qf_vmp_overdue", items: overdue.map((v) => ({ ref: v["Task ID"] ?? "", title: v.Task, status: v.status, due: v.finishEnd, extra: v.Equipment })) } : null,
        hint: !dueBy.length ? 0 : done.length / dueBy.length >= 0.9 ? 3 : done.length / dueBy.length >= 0.75 ? 2 : 1, link: "validation",
      };
    }
    case "stability": {
      const f = (k) => manual(k);
      const bl = manualMetric("qc_stab_backlog");
      return {
        figs: [fig("qf_stabStudies", f("stabStudies")), fig("qf_stabRegistered", f("stabRegistered")), fig("qf_stab_coverage", f("stabRegistered") ? pct(f("stabStudies") ?? 0, f("stabRegistered")) : null, "%"),
          fig("qf_stabBacklog", f("stabBacklog"), "n", { tone: f("stabBacklog") ? 2 : f("stabBacklog") === 0 ? 3 : 0 }), bl ? fig("qf_stab_metric", bl.value, "%", { sub: `${bl.num} / ${bl.den}` }) : null].filter(Boolean),
        trend: mHist("stabBacklog"),
        hint: f("stabBacklog") ? 2 : f("stabStudies") != null ? 3 : 0,
      };
    }
    case "changes": {
      const ccIn = (q) => recs("Change Control").filter((r) => inP(r.opened, q));
      const C = ccIn(p);
      const by = (c) => C.filter((r) => classOf(r) === c).length;
      const openAll = recs("Change Control").filter((r) => r.isOpen);
      const mc = C.filter((r) => ["Major", "Critical"].includes(classOf(r)));
      const notif = manual("ccNotifications");
      return {
        figs: [fig("qf_cc_total", C.length + (notif ?? 0)), fig("qf_ccNotifications", notif ?? (by("Notification") || null)), fig("qf_cc_minor", by("Minor")), fig("qf_cc_major", by("Major")), fig("qf_cc_critical", by("Critical"), "n", { tone: by("Critical") ? 2 : 3 }),
          fig("qf_cc_closed", C.filter((r) => r.status === "Completed").length), fig("qf_cc_open_ontime", C.filter((r) => r.isOpen && !r.overdue).length), fig("qf_cc_open_late", C.filter((r) => r.overdue).length, "n", { tone: C.some((r) => r.overdue) ? 2 : 3 }),
          fig("qf_cc_backlog", openAll.length, "n", { sub: `${openAll.filter((r) => r.overdue).length} overdue` }), fig("qf_cc_ontime", metric("cc_ontime").value, "%")],
        trend: { k: "qf_cc_total", u: "n", series: ["Critical", "Major", "Minor"], points: H.map((q) => { const c = ccIn(q); return { x: q.label, value: c.length, Critical: c.filter((r) => classOf(r) === "Critical").length, Major: c.filter((r) => classOf(r) === "Major").length, Minor: c.filter((r) => classOf(r) === "Minor").length }; }) },
        bars: C.length ? { k: "qf_cc_scope", items: tally(C, (r) => String(r.scope ?? "").split(/\s*,\s*/)).slice(0, 8).map(([label, value]) => ({ label, value })) } : null,
        rows: mc.length ? { k: "qf_cc_mc_list", items: mc.map((r) => ({ ref: r.ref, title: r.title, status: r.status, due: r.due, extra: classOf(r), record: true })) } : null,
        hint: openAll.some((r) => r.overdue) || C.some((r) => r.overdue) ? 2 : 3, link: "cc",
      };
    }
    case "risk": {
      const F = m.fmea;
      const ras = [...new Set(F.map((f) => f["Assessment ref"] || f.Assessment).filter(Boolean))];
      const openAct = F.filter((f) => f.Action && f.rrpn == null), late = F.filter((f) => f.actionOverdue);
      const high = F.filter((f) => /high|unaccept|élev/i.test(String(f.level?.Level ?? f.level?.label ?? f.level ?? "")));
      const g = (k) => manual(k);
      return {
        figs: [fig("qf_raIssued", g("raIssued")), fig("qf_ra_total", ras.length), fig("qf_ra_risks", F.length, "n", { sub: high.length ? `${high.length} high` : null }), fig("qf_ra_open_actions", openAct.length),
          fig("qf_ra_late", late.length, "n", { tone: late.length ? 2 : 3 }), fig("qf_raDue", g("raDue")), fig("qf_raReviewed", g("raReviewed")), fig("qf_raUpdate", g("raUpdate"), "n", { tone: g("raUpdate") ? 2 : 0 }),
          fig("qf_ra_review_rate", g("raDue") ? pct(g("raReviewed") ?? 0, g("raDue")) : null, "%")],
        trend: mHist("raIssued"),
        bars: ras.length ? { k: "qf_ra_by", items: tally(F, (f) => f["Assessment ref"] || f.Assessment).slice(0, 10).map(([label, value]) => ({ label, value })) } : null,
        hint: late.length || (g("raDue") && (g("raReviewed") ?? 0) < g("raDue")) ? 2 : F.length ? 3 : 0, link: "fmea",
      };
    }
    case "audits": {
      const fIn = (q) => recs("Audit Finding").filter((r) => inP(r.opened, q));
      const A = fIn(p);
      const by = (c) => A.filter((r) => classOf(r) === c).length;
      const openAll = recs("Audit Finding").filter((r) => r.isOpen);
      const capa = recs("CAPA").filter((r) => /audit/i.test(r.source ?? ""));
      const g = (k) => manual(k);
      return {
        figs: [fig("qf_aud_findings", A.length), fig("qf_aud_critical", by("Critical"), "n", { tone: by("Critical") ? 1 : 3 }), fig("qf_aud_major", by("Major"), "n", { tone: by("Major") ? 2 : 3 }), fig("qf_aud_minor", by("Minor")),
          fig("qf_aud_open", openAll.length, "n", { sub: `${openAll.filter((r) => r.overdue).length} overdue`, tone: openAll.some((r) => r.overdue) ? 2 : 3 }),
          fig("qf_aud_capa", capa.filter((r) => r.isOpen).length, "n", { sub: `${capa.filter((r) => r.overdue).length} overdue`, tone: capa.some((r) => r.overdue) ? 1 : 3 }),
          fig("qf_inspections", g("inspections")), fig("qf_customerAudits", g("customerAudits")), fig("qf_commitments", g("commitments")), fig("qf_commitmentsOpen", g("commitmentsOpen"), "n", { tone: g("commitmentsOpen") ? 2 : 0 })],
        trend: { k: "qf_aud_findings", u: "n", series: ["Critical", "Major", "Minor"], points: H.map((q) => { const a = fIn(q); return { x: q.label, value: a.length, Critical: a.filter((r) => classOf(r) === "Critical").length, Major: a.filter((r) => classOf(r) === "Major").length, Minor: a.filter((r) => classOf(r) === "Minor").length }; }) },
        bars: A.length ? { k: "qf_aud_by_audit", items: tally(A, (r) => r.audit || r.source || "—").slice(0, 10).map(([label, value]) => ({ label, value })) } : null,
        rows: A.some((r) => classOf(r) === "Critical") ? { k: "qf_aud_critical", items: A.filter((r) => classOf(r) === "Critical").map((r) => ({ ref: r.ref, title: r.title, status: r.status, due: r.due, extra: r.audit, record: true })) } : null,
        hint: by("Critical") || capa.some((r) => r.overdue) ? 1 : openAll.some((r) => r.overdue) || by("Major") ? 2 : 3, link: "findings",
      };
    }
    case "actions": {
      const prev = Q.actions.filter((a) => a.review && a.review !== review && a.review.period && a.review.period.start < p.start);
      const cur = Q.actions.filter((a) => a.review === review);
      const doneOnTime = prev.filter((a) => a.onTime != null);
      return {
        figs: [fig("qf_act_prev", prev.length), fig("qf_act_prev_done", pct(prev.filter((a) => a.done).length, prev.filter((a) => !a.cancelled).length), "%", { sub: `${prev.filter((a) => a.done).length} / ${prev.filter((a) => !a.cancelled).length}` }),
          fig("qf_act_prev_open", prev.filter((a) => a.open).length, "n", { tone: prev.some((a) => a.overdue) ? 1 : prev.some((a) => a.open) ? 2 : 3 }), fig("qf_act_prev_late", prev.filter((a) => a.overdue).length, "n", { tone: prev.some((a) => a.overdue) ? 1 : 3 }),
          fig("qf_act_ontime", pct(doneOnTime.filter((a) => a.onTime).length, doneOnTime.length), "%"), fig("qf_act_current", cur.length)],
        rows: prev.some((a) => a.open) ? { k: "qf_act_prev_open", items: prev.filter((a) => a.open).map((a) => ({ ref: a["Action ID"] ?? "", title: a.Action, status: a.state, due: a.due, who: a.Responsible, extra: a.review?.no })) } : null,
        hint: prev.some((a) => a.overdue) ? 1 : prev.some((a) => a.open) ? 2 : prev.length ? 3 : 0, src: "actions",
      };
    }
    case "improvement": {
      const I = m.impr;
      const capaImp = Q.actions.filter((a) => a.Type === "Improvement");
      return {
        figs: [fig("qf_imp_total", I.length), fig("qf_imp_open", I.filter((i) => !/done|closed|complet/i.test(i.Stage ?? "")).length), fig("qf_imp_qmr", capaImp.length)],
        bars: I.length ? { k: "col_status", items: tally(I, (i) => i.Stage || "—").map(([label, value]) => ({ label, value })) } : null,
        rows: I.length ? { k: "qf_imp_list", items: I.map((i) => ({ ref: i.ID, title: i.Title, status: i.Stage, due: toDay(i["Target date"]), who: i.Owner })) } : null,
        hint: I.length ? 3 : 0, link: "improvements",
      };
    }
    default: return { figs: [], trend: null, bars: null, rows: null, hint: 0 };
  }
}

/** Critical or severe issues of the period, to escalate at once to site senior management and the quality executive. */
export function escalations(m, review) {
  const p = review?.period;
  if (!p) return [];
  const out = [];
  for (const r of m.records) {
    if (r.status === "Canceled" || !inP(r.opened, p) || classOf(r) !== "Critical") continue;
    if (r.type === "Deviation" || r.type === "Audit Finding") out.push({ ref: r.ref, title: r.title, type: r.type, status: r.status });
  }
  const recalls = manualOf(review, "recalls", "recalls"), cf = manualOf(review, "complaints", "counterfeits");
  if (recalls) out.push({ ref: "", title: `${recalls}`, type: "Recall" });
  if (cf) out.push({ ref: "", title: `${cf}`, type: "Counterfeit" });
  return out;
}

/** The half-year before the reviewed one, for "compared with the previous review". */
export const previousPeriod = (review) => (review?.period ? prevHalf(review.period) : null);
