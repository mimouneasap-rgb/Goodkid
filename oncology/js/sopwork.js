// SOP work done in the app (pure, no DOM): résumés edited by people, form definitions corrected or added in the
// forms register, and SOP review / revision requests with what closing them means for the SOP.

const str = (v) => { const s = String(v ?? "").replace(/[ \t]+/g, " ").trim(); return s || null; };

/** The parts of a résumé people can edit, in page order. */
export const SUMMARY_PARTS = ["purpose", "scope", "trigger", "roles", "steps", "critical", "training"];

/** One entry per non-empty line ("—" alone means "explicitly none"). */
export const linesOf = (text) => String(text ?? "").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && x !== "—" && x !== "-");
export const textOf = (list) => (list ?? []).join("\n");
/** Codes typed in a list ("AB0002F/Onc/FF01, AB0002F/Onc/FF02"). */
export const codesOf = (text) => String(text ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

/**
 * A résumé after a person edited some of its parts: the edited parts are cleaned, the rest kept; where it came from
 * (app or Claude, the file date and revision it was written from, the SOP's revision history) is kept too.
 */
export function editSummary(old, patch, by, at, src) {
  const o = old ?? {};
  const next = { ...o };
  for (const k of SUMMARY_PARTS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (k === "roles") next.roles = (v ?? []).map((r) => ({ role: str(r?.role), duties: str(r?.duties) })).filter((r) => r.role || r.duties);
    else if (k === "steps") next.steps = (v ?? []).map((s) => ({ phase: str(s?.phase), do: str(s?.do), who: str(s?.who), records: [...new Set((s?.records ?? []).map(str).filter(Boolean))] })).filter((s) => s.do);
    else if (k === "critical") next.critical = (v ?? []).map(str).filter(Boolean);
    else next[k] = str(v);
  }
  return { ...next, by: o.by ?? "people", edited: true, editedAt: at, editedBy: by ?? null, src: src ?? o.src ?? null };
}

/** What a person changed in a résumé, as part names (for the confirmation before Claude rewrites it). */
export const editedParts = (sum) => (sum?.edited ? SUMMARY_PARTS.filter((k) => sum[k] != null && (!Array.isArray(sum[k]) || sum[k].length)) : []);

// ---------- forms register: corrections and additions made in the app ----------
/** Register types the app shows, and the form kinds they stand for. */
export const FORM_TYPES = [["form", "Form"], ["logbook", "Logbook"], ["checklist", "Checklist"], ["template", "Template"], ["attachment", "Attachment"]];
export const REMOVED = "Removed";
/** A register row as the corrections it carries (null fields = keep what the SOP file says). */
export function formOverride(r) {
  if (!r) return null;
  const list = (v) => (v == null || String(v).trim() === "" ? null : linesOf(v));
  return {
    title: str(r.Title), type: str(r.Type), rev: str(r.Revision), owner: str(r["Owner SOP"]), status: str(r.Status),
    removed: String(r.Status ?? "").trim().toLowerCase() === REMOVED.toLowerCase(),
    sections: list(r.Sections), fields: list(r.Fields), columns: list(r.Columns), comment: str(r.Comment),
  };
}
/** The register row to save for a form edited in the app ({column: value}). */
export function formRow(v) {
  const list = (xs, had) => (xs == null ? null : xs.length ? textOf(xs) : had ? "—" : null);
  return {
    "Form code": str(v.code), Title: str(v.title), Type: FORM_TYPES.find(([k]) => k === v.kind)?.[1] ?? str(v.type), Revision: str(v.rev), "Owner SOP": str(v.owner),
    "Linked room": str(v.room), "Linked equipment": str(v.equipment), Status: str(v.status), Source: v.source ?? "App",
    Sections: list(v.sections, v.had?.sections), Fields: list(v.fields, v.had?.fields), Columns: list(v.columns, v.had?.columns), Comment: str(v.comment),
  };
}

// ---------- SOP reviews and revisions ----------
export const REVIEW_TYPES = ["Periodic review", "Revision", "New SOP", "Withdrawal"];
export const REVIEW_STATUS = ["Requested", "In progress", "In approval", "Closed", "Cancelled"];
export const REVIEW_OUTCOMES = ["No change", "Revised", "Withdrawn"];
export const REVIEW_REASONS = ["Review date", "Regulatory change", "Process change", "Change control", "Deviation / CAPA", "Audit finding", "Form update", "Index mismatch", "Other"];
const DAY = 86400000;
const isClosed = (st) => /^(closed|cancel)/i.test(st ?? "");

/**
 * Review records joined to their SOP. `dayOf` turns a stored date into a timestamp, `keyOf` an SOP code into its key.
 * Each review gets: sop, due, open, overdue, daysLate; each SOP gets its reviews (newest first) and the open one.
 */
export function joinReviews(rows, sops, { now, dayOf, keyOf }) {
  const byKey = new Map(sops.map((s) => [s.key ?? keyOf(s.Code), s]));
  for (const s of sops) { s.reviews = []; s.openReview = null; }
  const list = rows.filter((r) => r.SOP || r["Review ID"]).map((r) => {
    const sop = byKey.get(keyOf(r.SOP)) ?? null;
    const due = dayOf(r.Due), opened = dayOf(r["Requested on"]), closed = dayOf(r["Closed on"]);
    const open = !isClosed(r.Status);
    const rv = { ...r, sop, due, opened, closed, open, overdue: open && due != null && due < now, daysLate: open && due != null && due < now ? Math.round((now - due) / DAY) : 0,
      daysToDue: open && due != null ? Math.round((due - now) / DAY) : null, status: r.Status || "Requested" };
    if (sop) sop.reviews.push(rv);
    return rv;
  });
  for (const s of sops) {
    s.reviews.sort((a, b) => (b.opened ?? b.closed ?? 0) - (a.opened ?? a.closed ?? 0));
    s.openReview = s.reviews.find((r) => r.open) ?? null;
    const lastRev = s.reviews.find((r) => !r.open && r.Outcome === "Revised" && r["New revision"]);
    s.pendingRevision = lastRev && s.Revision && +lastRev["New revision"] > +s.Revision ? lastRev["New revision"] : null;
  }
  return list;
}

/**
 * The SOPs that need a review request now, and why: review date passed or within `horizon` days, or a form revision
 * listed ≠ attached (and, for those, a Drive file newer than the master index lists, or not being in the index).
 */
export function reviewSuggestions(sops, { horizon = 90, unlisted = new Set() } = {}) {
  const out = [];
  for (const s of sops) {
    if (s.openReview || /obsolete/i.test(s.Status ?? "") || s.reviewStatus === "Obsolete") continue;
    const why = [];
    if (s.reviewStatus === "Overdue") why.push(["overdue", s.next]);
    else if (s.daysToReview != null && s.daysToReview <= horizon) why.push(["due", s.next]);
    const mism = (s.formList ?? []).filter((f) => f.mismatch);
    if (mism.length) why.push(["forms", mism.map((f) => f.code).join(", ")]);
    // (a file newer than the index, a missing review date or an SOP absent from the index are document-control gaps,
    // shown on the index check: here they only add to the reasons of an SOP that needs a review anyway)
    if (why.length && s.idx?.state === "drive-newer") why.push(["newer", s.idx.rev]);
    if (why.length && unlisted.has(s.key)) why.push(["unlisted", null]);
    if (why.length) out.push({ sop: s, why, type: why.some(([k]) => k === "forms") ? "Revision" : "Periodic review", score: (why[0][0] === "overdue" ? 100 : why[0][0] === "due" ? 50 : 10) + why.length });
  }
  return out.sort((a, b) => b.score - a.score || (a.sop.next ?? 9e15) - (b.sop.next ?? 9e15));
}

/** Next free review id: SR-<year>-001, SR-<year>-002… */
export function nextReviewId(rows, year) {
  const pre = `SR-${year}-`;
  const n = rows.map((r) => String(r["Review ID"] ?? "")).filter((x) => x.startsWith(pre)).map((x) => +x.slice(pre.length) || 0);
  return `${pre}${String(Math.max(0, ...n) + 1).padStart(3, "0")}`;
}

/** Monthly review plan: [{month: "yyyy-mm", sops: […]}] for SOPs due in the next `months` months (overdue in the first). */
export function reviewPlan(sops, now, months = 12) {
  const d = new Date(now);
  const keys = Array.from({ length: months }, (_, i) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)); return x.toISOString().slice(0, 7); });
  const plan = keys.map((month) => ({ month, sops: [] }));
  for (const s of sops) {
    if (s.next == null || s.reviewStatus === "Obsolete") continue;
    const k = new Date(s.next).toISOString().slice(0, 7);
    const slot = k < keys[0] ? plan[0] : plan.find((p) => p.month === k);
    slot?.sops.push(s);
  }
  return plan;
}
