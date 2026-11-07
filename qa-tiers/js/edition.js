// Which board a new copy of the app starts from when no shared board exists
// yet. "blank": empty registers for the reporting month below, with the
// standard lists, KPI targets and QA activity catalogue. "demo": the
// September 2026 training data. A copy that ships site data (real-data.js)
// always starts from that data instead.
//
// `tiers` decides which boards this copy is: both (the combined app), or one
// of them — the Tier 1 huddle app or the Tier 2 daily-management app. A
// single-tier copy is a separate app: it keeps, shares and reports only its
// own tier. What Tier 2 used to read from Tier 1 (huddle escalations, the
// huddle's safety headlines) is entered in the Tier 2 app itself.

export const EDITION = {
  start: "blank",
  month: "2026-11-01",
  label: "November 2026",
  tiers: ["t1", "t2"],
  name: "QA Tier Boards",
};

/** Whether this copy shows a tier. */
export const hasTier = (t) => EDITION.tiers.includes(t);
/** The tier of a single-tier copy, else null. */
export const ONE_TIER = EDITION.tiers.length === 1 ? EDITION.tiers[0] : null;
/** The tier whose setup names the site (Tier 2 when present). */
export const MAIN_TIER = hasTier("t2") ? "t2" : "t1";
