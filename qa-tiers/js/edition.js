// Which board a new copy of the app starts from when no shared board exists
// yet. "blank": empty registers for the reporting month below, with the
// standard lists, KPI targets and QA activity catalogue. "demo": the
// September 2026 training data. A copy that ships site data (real-data.js)
// always starts from that data instead.

export const EDITION = {
  start: "blank",
  month: "2026-11-01",
  label: "November 2026",
};
