// The masterclass: "Collecting and entering data in the Tier 1 and Tier 2
// boards". Content follows the QA Tier 2 data-entry training deck (v1.0,
// October 2026) and the Tier 1 guide, adapted to this app. Column guides are
// generated from schema.js so they always match the forms.

import { store } from "./store.js";
import * as E from "./engine.js";
import { T1_REGISTERS, T2_REGISTERS, T2_ORDER, T1_ORDER } from "./schema.js";
import { ring } from "./charts.js";
import { esc, pct, toast, confirmDialog, fresh, $, $$ } from "./ui.js";

const enc = (o) => encodeURIComponent(JSON.stringify(o));
const cards = (items, cls = "") => ({ type: "cards", items, cls });
const table = (head, rows) => ({ type: "table", head, rows });
const callout = (html, cls = "") => ({ type: "callout", html, cls });
const flow = (items) => ({ type: "flow", items });
const text = (html) => ({ type: "text", html });
const link = (label, href) => ({ type: "link", label, href });

/** Extra teaching blocks attached to some register lessons. */
const EXTRA = {
  insp: [
    { type: "cards", items: [
      { title: "✗ Poor", text: "“Bad documentation on the line.” Where? Which document? What exactly is wrong? Nobody can act on it.", cls: "R" },
      { title: "✓ Good", text: "“Uncontrolled printed copy of WI-PK-033 v02 at packaging line 2 workstation; current version is v03.” Fact · location · evidence.", cls: "G" },
    ] },
    table(["Severity", "Meaning", "Due"], [["HIGH", "Potential impact on product, patient or operator safety (containment breach, mix-up risk)", "Same day · day turns red"], ["MEDIUM", "GMP non-compliance without direct product impact (wrong form version)", "≤ 3 days · day turns amber"], ["LOW", "Housekeeping or minor GDP point, corrected on the spot", "≤ 5 days"]]),
  ],
  rel: [
    flow([
      { small: "CLOCK STARTS", title: "Mfg completion", text: "End of manufacture / packaging" },
      { small: "REVIEW", title: "BMR received", text: "Complete BMR reaches QA" },
      { small: "LAB", title: "QC CoA issued", text: "Results ready" },
      { small: "DECISION", title: "Released / Rejected", text: "Decision date" },
    ]),
    callout("ƒx Target release = Mfg completion + target (Setup) · ƒx Lead time = decision date (or as-of date) − Mfg completion · Overdue when the as-of date passes the target with no decision. Right First Time = no BMR correction requested."),
  ],
  load: [
    flow([
      { small: "ƒx", title: "Working days", text: "Counted from the calendar (weekend days in Setup)" },
      { small: "ƒx + TYPE", title: "− Absence", text: "Leave / Training / Absent days in the Tier 1 log + planned leave you type" },
      { small: "ƒx", title: "= Available days", text: "Capacity of the person this month" },
      { small: "ƒx", title: "Planned workload", text: "Standard effort of every record the person owns, spread over its dates" },
    ]),
    callout("Nobody types the workload any more. A deviation, CAPA, change, finding follow-up, batch, document, APQR, training session, escalation, planner task or Tier 1 action assigned to a name adds its standard effort (Setup § 4) to that person. <b>Delayed tasks</b> = their open items past due. Open a member in QA Load to see the breakdown, record by record."),
    { type: "loadcalc" },
  ],
  tasks: [callout("Use the Task planner for the work no register tracks: audits, validation runs, routine BMR review, document control. Pick the activity — its standard effort and typical role come from the catalogue — or type a specific effort for that task.")],
  trn: [callout("ƒx Completion % = participants trained ÷ participants planned. Status Overdue when the planned date has passed and the session is not Completed or Cancelled.")],
  esc: [callout("<b>Escalate when…</b> critical deviation or patient-safety impact · containment breach or HSE event · overdue > 5 working days without a plan · batch on hold > 1 week · QA load high for 2 weeks · unresolved after 2 Tier 2 meetings.", "warn")],
  capa: [callout("Life cycle: Open → In Progress → Effectiveness Check → Closed. Effectiveness Verified stays ‘Pending’ until the check is done.")],
  cc: [callout("Implemented, Closed and Rejected all need a Completion Date.")],
};

export const MODULES = [
  {
    id: "system", no: 1, title: "The system", min: 15,
    lead: "What the boards are for, how the pages fit together, and the rules that keep the data trustworthy.",
    lessons: [
      { title: "One board, one rhythm, three tiers", blocks: [
        flow([
          { small: "TIER 1", title: "Shop-floor huddle", text: "08:30 · QA officers on the line · SQDCP board" },
          { small: "TIER 2", title: "QA daily management", text: "10:30 · 15 min · Sarcand Meeting Room · 10 registers" },
          { small: "TIER 3", title: "Site management", text: "Daily / weekly · decisions, resources, budget" },
        ]),
        text("Anything Tier 1 cannot solve today is escalated to Tier 2 (an action marked <b>Escalated to Tier 2 = Yes</b> appears on the Tier 2 board until it is closed). Anything Tier 2 cannot solve goes to Tier 3 through register 10 · Escalations."),
        cards([
          { title: "Collects", text: "Every open quality event in 10 Tier 2 registers and 6 Tier 1 logs." },
          { title: "Calculates", text: "9 Tier 2 KPIs and 20 Tier 1 KPIs, each with a target and a RAG colour." },
          { title: "Paints", text: "Each day of the month on the Q-calendar and the SQDCP letters." },
          { title: "Ranks", text: "The 5 most urgent items per process, and the open actions." },
          { title: "Remembers", text: "A 12-month KPI history for Tier 3 and the APQR." },
        ]),
      ] },
      { title: "The pages in four families", blocks: [
        cards([
          { title: "Navigate", text: "Home — the three tiers, today's rhythm, every page one click away." },
          { title: "Enter", text: "Tier 2: Daily Log + registers 01–10. Tier 1: Daily log, Batch reviews, Findings, Actions, Huddle, Training, Skills matrix." },
          { title: "See", text: "Tier 2 dashboard, Analytics (8 charts), KPI Trend. Tier 1 huddle board." },
          { title: "Configure & audit", text: "Setup (month, weekend, targets), drop-down lists, change history." },
        ]),
        text("Each workbook sheet has its page here: <b>Deviations</b> sheet → register 01, <b>KPI Engine</b> → the ƒx columns and the KPI tiles (hover any tile to see its formula), <b>Lists</b> → Setup › Drop-down lists."),
      ] },
      { title: "How one row becomes a number on the board", blocks: [
        flow([
          { small: "1", title: "You type a record", text: "Cream fields in a register form" },
          { small: "2", title: "ƒx columns react", text: "Live status, age, on time, data check" },
          { small: "3", title: "The engine counts", text: "Totals, KPIs, RAG, trends" },
          { small: "4", title: "The board displays", text: "Dashboard, calendar, analytics" },
          { small: "5", title: "Tier 2 decides", text: "Owners, priorities, escalation" },
        ]),
        callout("<b>Garbage in, garbage on the board.</b> A missing closure date, a wrong status or a wrong due date changes the KPIs, the calendar colours and the Tier 3 report.", "warn"),
      ] },
      { title: "Read the colours before you type", blocks: [
        cards([
          { title: "Cream field", text: "You type or pick here.", cls: "cream" },
          { title: "ƒx · navy", text: "Calculated automatically — never typed.", cls: "fx" },
          { title: "Green", text: "On target / no issue.", cls: "G" },
          { title: "Amber", text: "Watch / due soon / major event raised.", cls: "A" },
          { title: "Red", text: "Off target / overdue / critical.", cls: "R" },
          { title: "Grey", text: "Weekend, no data, or not applicable.", cls: "W" },
        ]),
      ] },
      { title: "Eight golden rules of data entry", blocks: [
        cards([
          { n: 1, title: "Type only in cream fields", text: "ƒx values are formulas — the app recalculates them for you." },
          { n: 2, title: "Always use the drop-down", text: "A status typed by hand is invisible to the KPIs. Missing value? Use “＋ Add a value…” or Setup › Lists." },
          { n: 3, title: "Enter real dates", text: "The event date, not the day you type it. “Today” inserts today's date." },
          { n: 4, title: "One record, one row", text: "Never duplicate a reference — the app refuses a number that already exists." },
          { n: 5, title: "Copy references exactly", text: "The eQMS is the record of truth. DEV, CAPA and CC numbers match it character for character." },
          { n: 6, title: "Keep the history", text: "Close records, don't delete them. Delete only an entry made by mistake." },
          { n: 7, title: "Update the same day", text: "Enter changes when they happen — 10:00 is the latest, not the target." },
          { n: 8, title: "Fix every Data Check flag", text: "A red flag means a KPI is calculated on incomplete data." },
        ]),
      ] },
    ],
  },
  {
    id: "setup", no: 2, title: "Set up the board", min: 15,
    lead: "Done once when the board is installed, then a two-minute check at the start of every month.",
    lessons: [
      { title: "The Setup page at a glance", blocks: [
        cards([
          { n: 1, title: "Identity & reporting period", text: "Site, department, reporting month, status date, weekend days, thresholds, meeting time." },
          { n: 2, title: "Board owner & monthly inputs", text: "Owner name and role, review date, quality message, ‘other points’ KPI and monthly remarks." },
          { n: 3, title: "KPI targets & thresholds", text: "Target and amber limit for each of the 9 KPIs — they drive every colour on the board." },
        ]),
        link("Open Tier 2 Setup", "#/t2/setup"),
      ] },
      { title: "Section 1 — field by field", blocks: [
        table(["Field", "What to enter", "When"], [
          ["Site / facility", "Site name shown in the dashboard header", "Once"],
          ["Department · Board level", "Quality Assurance · Tier 2 — Daily Management", "Once"],
          ["Reporting month", "The month picker always stores the 1st, e.g. 01-Nov-2026", "Monthly"],
          ["Data as of (status date)", "Today for live use (Today button). A fixed date only to replay a past board", "Daily / once"],
          ["Weekend day 1 · 2", "Pick from the list: Friday · Saturday for this site", "Once"],
          ["ƒx Working days in month", "Counted automatically from the calendar. Check it, never type it", "Check monthly"],
          ["Due-soon window (days)", "Days ahead that turn a calendar day amber (default 1)", "Once"],
          ["Batch release target (days)", "Manufacture completion → QA decision target lead time", "Once / yearly"],
          ["High-load · Overload threshold", "85 % · 100 % — limits for the QA Load status", "Once"],
          ["Meeting time · location", "10:30 · Sarcand Meeting Room, 4th floor", "Once"],
          ["Escalation rule", "One sentence printed on the board", "Once"],
        ]),
      ] },
      { title: "Weekend days: how they work", blocks: [
        flow([
          { small: "1", title: "Setup", text: "Weekend day 1 · 2 = Friday · Saturday" },
          { small: "2", title: "Daily Log", text: "Weekend / Working for each date" },
          { small: "3", title: "Board effects", text: "Grey tiles · no auto-status · working-day count" },
        ]),
        callout("Three checks after changing the month: Setup shows <b>21 working days</b> for October 2026 · Fridays and Saturdays are grey on the Q-calendar · no dots on those tiles."),
      ] },
      { title: "Section 2 — owner, message and monthly remarks", blocks: [
        cards([
          { title: "Board owner · role · review date", text: "Name and function of the person who runs Tier 2 and signs the monthly board." },
          { title: "Quality message", text: "One short sentence shown on the board. Rotate it monthly." },
          { title: "Other points · status", text: "A tenth indicator tracked by hand, e.g. ‘HSE & containment: zero exposure events’ · On target / Watch / Off target." },
        ]),
        text("<b>Writing the monthly remarks:</b> count first (new deviations, criticals, overdue items) · name the trend (improving, stable, worsening) · state what was escalated and why · end with next month's focus."),
        callout("“September: 8 new deviations (1 critical, contained). DEV-26-057 overdue and escalated to Tier 3. CAPA on-time 86 %, improving. October focus: clear overdue items.”"),
      ] },
      { title: "Section 3 — KPI targets and the RAG rule", blocks: [
        { type: "kpis2" },
        { type: "ragcalc" },
      ] },
      { title: "Adding a value to a drop-down list", blocks: [
        cards([
          { n: 1, title: "In the form", text: "Open the list and pick “＋ Add a value to this list…”. The value is added and selected." },
          { n: 2, title: "Or in Setup", text: "Setup › Drop-down lists: type under the list and press Add." },
          { n: 3, title: "Test it", text: "Open any register form: the new value is offered in the drop-down." },
        ]),
        callout("🔒 Status values (Open, Closed, Overdue, Implemented…) are locked: the KPI formulas count those exact words.", "warn"),
      ] },
    ],
  },
  {
    id: "collect", no: 3, title: "Collect the data", min: 15,
    lead: "Every register has one primary source, one owner and one moment. Know them and the board is never late.",
    lessons: [
      { title: "Where every number comes from", blocks: [{ type: "sources" }] },
      { title: "The daily data rhythm", blocks: [{ type: "rhythm" }] },
      { title: "Before 10:00 — the three-minute data check", blocks: [
        cards([
          { n: 1, title: "Read the summary strip", text: "Total, active, overdue, new this month — does it match what you know?" },
          { n: 2, title: "Read the Data Check strip", text: "Green ✓ means every row is consistent. Red ⚠ shows how many rows need you — click it to filter them." },
          { n: 3, title: "Fix the flags", text: "Open each flagged row, fix it, save. The strip turns green." },
        ]),
        { type: "flagged" },
      ] },
    ],
  },
  {
    id: "enter", no: 4, title: "Enter, register by register", min: 60,
    lead: "Ten Tier 2 registers, the Daily Log and QA Load — every column, what to type, where it comes from.",
    lessons: [
      { title: "Anatomy of a register page", blocks: [
        cards([
          { n: 1, title: "Header", text: "Number, purpose, source, who collects it, when, and the status life cycle." },
          { n: 2, title: "Summary strip", text: "Total · active · overdue · new this month." },
          { n: 3, title: "Data Check strip", text: "✓ all consistent, or ⚠ n records need attention (click to filter)." },
          { n: 4, title: "Table", text: "Input columns, then the navy ƒx columns. Click a header to sort." },
          { n: 5, title: "Record form", text: "Click a row (or ＋ New record): cream fields, guidance under each field, ƒx preview at the top." },
          { n: 6, title: "Search & filters", text: "Search any text, filter by live status or flagged records, export CSV." },
        ]),
      ] },
      { title: "The automatic columns, decoded", blocks: [
        table(["ƒx column", "What it tells you"], [
          ["Live Status", "Overdue when the due date has passed and the item is not done; otherwise your Status."],
          ["Age / Cycle Time (d)", "Days since opening — or opening → closure once closed."],
          ["Days to Due", "Days left before the due date. Negative (red) = late."],
          ["Closed On Time", "Yes / No, comparing closure date with due date. Feeds the on-time KPIs."],
          ["Data Check", "OK, or the exact problem to fix (see the last lesson of this module)."],
        ]),
      ] },
      ...T2_ORDER.map((reg) => ({ title: `${T2_REGISTERS[reg].no} ${T2_REGISTERS[reg].title} — column by column`, blocks: [{ type: "columns", tier: "t2", reg }, ...(EXTRA[reg] || [])] })),
      { title: "Daily Log — the calendar engine", blocks: [
        flow([
          { small: "ƒx", title: "Calendar", text: "Day, date, weekday, day type" },
          { small: "TYPE", title: "Meeting", text: "Tier 2 held (Yes/No) · attendees" },
          { small: "OPTIONAL", title: "Manual override", text: "Only if the team disagrees with auto" },
          { small: "ƒx", title: "Auto status", text: "Per process + overall worst" },
          { small: "TYPE", title: "Priorities & notes", text: "Top 3 · escalated · remarks" },
        ]),
        cards([
          { title: "CRITICAL", text: "An item of that process is overdue on that day, or a Critical deviation / High-severity finding was raised that day.", cls: "R" },
          { title: "IN PROGRESS", text: "An item falls due within the due-soon window, or a Major deviation, Major change or Medium finding was raised.", cls: "A" },
          { title: "NO ISSUE", text: "None of the above.", cls: "G" },
          { title: "BLANK", text: "Weekend day, or a date after the status date.", cls: "W" },
        ]),
        callout("Click a day on the Q-calendar: the form shows <b>why</b> each process got its colour (which record is overdue, raised or due). Priorities: verb + object + owner — e.g. ‘Close DEV-26-057 investigation with Engineering (QA Lead)’."),
        link("Open the Daily Log", "#/t2/calendar"),
      ] },
      { title: "Data Check messages and how to fix them", blocks: [
        table(["Message", "Meaning", "Fix"], [
          ["Status missing", "A reference is entered but no status", "Pick a status from the drop-down"],
          ["Completion / Closure / Decision date missing", "Status says done, date is blank", "Enter the real completion date"],
          ["Date entered, status still open", "A completion date exists but the status is still open", "Change the status, or delete the date"],
          ["Due date before open date", "Dates typed in the wrong order", "Correct the date from the eQMS"],
          ["Trained exceeds planned", "More participants trained than planned", "Correct either number"],
          ["Participants trained missing", "Session Completed with no number", "Enter the number from the attendance sheet"],
        ]),
        callout("Goal before every meeting: every register shows <b>✓ Data check: all records consistent</b>."),
      ] },
    ],
  },
  {
    id: "outputs", no: 5, title: "Read and use the outputs", min: 20,
    lead: "The dashboard, the Q-calendar, the KPIs, the analytics — and how to run the 15-minute stand-up with them.",
    lessons: [
      { title: "The dashboard in ten stops", blocks: [
        cards([
          { n: 1, title: "Header", text: "Month, as-of date and board owner." },
          { n: 2, title: "Quality Pulse", text: "Share of KPIs on target." },
          { n: 3, title: "KPI panel", text: "Actual vs target, RAG, trend arrow, 12-month sparkline." },
          { n: 4, title: "Q-calendar", text: "One tile per day, coloured by the Daily Log." },
          { n: 5, title: "Top 3 priorities", text: "From today's Daily Log row." },
          { n: 6, title: "Stand-up box", text: "Quality message, meetings held, attendance." },
          { n: 7, title: "Escalations", text: "Open Tier 3 items — and open Tier 1 escalations." },
          { n: 8, title: "Registers 01–04", text: "Five most urgent open items each, by due date." },
          { n: 9, title: "Monthly summary", text: "Ten cumulative cards with RAG pill." },
          { n: 10, title: "Remarks", text: "Monthly remarks typed in Setup." },
        ]),
        link("Open the Tier 2 dashboard", "#/t2/board"),
      ] },
      { title: "Reading the Q-calendar", blocks: [
        cards([
          { title: "Tile colour", text: "Worst status of the day across the 4 processes." },
          { title: "Four dots", text: "Deviation · CAPA · Change Control · Inspection, left → right." },
          { title: "Framed tile", text: "Today (status date)." },
          { title: "✎ mark", text: "A manual override was set that day." },
          { title: "Grey tile", text: "Weekend day set in Setup — no status.", cls: "W" },
          { title: "White tile", text: "Future date — not yet assessed." },
        ]),
      ] },
      { title: "KPI panel, trend arrows and the Quality Pulse", blocks: [
        cards([
          { title: "Actual", text: "Calculated live from the registers." },
          { title: "Target", text: "From Setup § 3, with ≥ or ≤." },
          { title: "RAG", text: "Green / amber / red vs target and amber limit." },
          { title: "▲ ▼ Trend", text: "vs last month in KPI Trend — green better, red worse." },
        ]),
        { type: "pulsecalc" },
      ] },
      { title: "Analytics — the question each chart answers", blocks: [
        table(["#", "Chart", "Question"], [
          [1, "Workload by process", "Where is work starting but not finishing?"], [2, "Deviations by classification", "Is the severity mix shifting?"],
          [3, "Deviations by area", "Which area generates the events?"], [4, "Q-calendar days by status", "How many days carried an overdue item?"],
          [5, "KPI trend, 12 months", "Are the % KPIs improving over 3 months?"], [6, "QA team utilisation", "Who is above the load threshold?"],
          [7, "CAPA by source", "What feeds the CAPA system?"], [8, "Root-cause categories", "Which cause needs a trend CAPA?"],
        ]),
        link("Open Analytics", "#/t2/analytics"),
      ] },
      { title: "Running the 15-minute stand-up", blocks: [
        table(["Minutes", "Agenda item", "Question the team answers"], [
          ["00–02", "Safety & containment", "Any exposure, spill, near miss or containment breach?"],
          ["02–05", "Deviations", "New, critical, overdue — owner today?"],
          ["05–07", "CAPA", "Due this week? Effectiveness checks pending?"],
          ["07–09", "Change control", "Implementations due? Regulatory impact?"],
          ["09–11", "Gemba", "What did we see yesterday — is it fixed?"],
          ["11–13", "Release · documents", "Blocked batches? Overdue SOPs?"],
          ["13–15", "Priorities & escalation", "Three priorities. What goes to Tier 3?"],
        ]),
        callout("On the dashboard, <b>▶ Run the 15-min stand-up</b> walks the team through these seven steps with a timer and the live data of each step, and saves the three priorities to today's Daily Log."),
      ] },
    ],
  },
  {
    id: "monthend", no: 6, title: "Month-end & troubleshooting", min: 15,
    lead: "Freeze the month, roll to the next one, and fix the problems you will meet.",
    lessons: [
      { title: "Month-end roll-over in six steps", blocks: [
        cards([
          { n: 1, title: "Print the board", text: "Dashboard → Print A3 → save as PDF for the Tier 3 pack." },
          { n: 2, title: "Freeze the KPIs", text: "KPI Trend → ❄ Freeze: every Live value is pasted into the month column." },
          { n: 3, title: "Roll the month", text: "Setup → Month-end → set the next reporting month. Update the remarks." },
          { n: 4, title: "Clear the Daily Log", text: "Only overrides, priorities, remarks and attendees of the closed month — if you reuse it." },
          { n: 5, title: "Keep the registers", text: "Never clear registers. Closed records stay for traceability and trending." },
          { n: 6, title: "Save a version", text: "Setup → ⬇ Save version: QA_Tier2_<YYYY-MM>.json in the controlled folder." },
        ]),
        link("Open the month-end panel in Setup", "#/t2/setup"),
      ] },
      { title: "Troubleshooting guide", blocks: [
        table(["Symptom", "Likely cause", "Fix"], [
          ["Fridays and Saturdays not grey", "Weekend days not set", "Setup → Weekend day 1 · 2; working days = 21 for Oct-2026"],
          ["Calendar shows the wrong month", "Reporting month not rolled", "Setup → Reporting month"],
          ["Everything shows Overdue", "Status date fixed in the past or future", "Setup → Data as of → Today"],
          ["Item missing from the dashboard top 5", "Status closed, or no due date", "Check the status; add a due date"],
          ["Value not in the drop-down", "Value not in the list", "＋ Add a value… in the form, or Setup › Lists"],
          ["No trend arrow on a KPI", "Previous month empty in KPI Trend", "Freeze last month, or type its values in KPI Trend"],
          ["Data lost on another computer", "Data lives in the browser", "Export a backup and import it on the other device"],
        ]),
      ] },
      { title: "Data integrity rules for the board — ALCOA+", blocks: [
        cards([
          { title: "A · Attributable", text: "Owner, Inspector, Releasing Officer always filled." },
          { title: "L · Legible", text: "Plain one-line descriptions; no private abbreviations." },
          { title: "C · Contemporaneous", text: "Enter the event the day it happens." },
          { title: "O · Original", text: "The eQMS stays the GMP record — the board mirrors it." },
          { title: "A · Accurate", text: "References and dates copied exactly; Data Check = OK." },
          { title: "C · Complete · Consistent", text: "No blank status, no closure without a date." },
          { title: "E · Enduring · Available", text: "Monthly saved version in the controlled folder; change history kept." },
        ]),
        callout("The eQMS is the record of truth. The board mirrors it — it never replaces it. Every change made here is listed in <a href=\"#/audit\">Change history</a>."),
      ] },
    ],
  },
  {
    id: "tier1", no: 7, title: "The Tier 1 huddle board", min: 25,
    lead: "Officers log their day; the board builds itself. The huddle reads the board, agrees three priorities, and escalates what it cannot solve.",
    lessons: [
      { title: "The daily rhythm", blocks: [
        table(["When", "What"], [
          ["Before 08:30", "Each officer adds yesterday's row in the Daily log and updates Batch reviews, Findings and Actions they own. 3–5 minutes."],
          ["08:30 huddle (15 min)", "Stand at the screen. Board: set the date to yesterday or today, ‘All team’. Go S → Q → D → C → P on the letters, then the red KPIs, then the open-actions list."],
          ["During the huddle", "In the Huddle log write the top 3 priorities and the safety message. If the team disagrees with an automatic colour, set the override for that letter."],
          ["Escalate", "Anything Tier 1 cannot solve today: mark the action ‘Escalated to Tier 2 = Yes’. It appears on both boards until closed."],
          ["1-to-1 coaching", "Pick one officer in the Officer selector to review their month: the letters, KPIs, team table and actions all switch to that person."],
        ]),
        link("Open the Tier 1 board", "#/t1/board"),
      ] },
      { title: "How each SQDCP letter is coloured", blocks: [
        table(["Letter", "RED", "AMBER"], [
          ["S · Safety", "Safety incident, or High containment / HSE finding that day", "Near miss reported, or Medium containment finding"],
          ["Q · Quality", "A line clearance not right first time, or a High finding", "A batch record reviewed with errors, or a Medium finding"],
          ["D · Delivery", "Any action overdue, or any batch record beyond the review target", "An action due that day still open"],
          ["C · Compliance", "Two or more planned Gemba / audit-trail reviews missed", "One missed"],
          ["P · People", "Unplanned absence (team view: fewer present than the minimum)", "Leave, training day or overdue training"],
        ]),
        cards([
          { title: "Light grey day", text: "Working day with no Daily log entry — log it!" },
          { title: "Dark grey day", text: "Weekend (set in Setup).", cls: "W" },
          { title: "Override", text: "The Huddle log can set any letter Green / Amber / Red for a day." },
        ]),
      ] },
      { title: "20 KPIs, four per pillar", blocks: [{ type: "kpis1" }] },
      ...T1_ORDER.map((reg) => ({ title: `${T1_REGISTERS[reg].no} · ${T1_REGISTERS[reg].title}`, blocks: [{ type: "columns", tier: "t1", reg }] })),
      { title: "Skills matrix", blocks: [
        cards([
          { title: "0", text: "Not trained", cls: "W" }, { title: "1", text: "In training", cls: "R" }, { title: "2", text: "Qualified under supervision", cls: "A" },
          { title: "3", text: "Qualified", cls: "G" }, { title: "4", text: "Qualified trainer", cls: "G" },
        ]),
        callout("Coverage = competencies at level 3 or 4 — it feeds the People pillar. Fewer than two qualified people on a skill is a single point of failure: plan cross-training at the next huddle."),
        link("Open the skills matrix", "#/t1/skills"),
      ] },
    ],
  },
  {
    id: "practice", no: 8, title: "Practice & knowledge check", min: 30,
    lead: "Seven real events to enter in the demo, then twelve questions.",
    lessons: [
      { title: "Hands-on: enter these seven events", blocks: [{ type: "practice" }] },
      { title: "Knowledge check", blocks: [{ type: "quiz" }] },
      { title: "Quick reference card", blocks: [
        cards([
          { title: "Every day", text: "Update your registers by 10:00 · clear red Data Check flags · stand-up at 10:30, 15 minutes · fill the Daily Log after the meeting · log escalations the same day." },
          { title: "Every week", text: "APQR % complete · documentation status · review overdue items with owners · check QA Load for new absences." },
          { title: "Every month-end", text: "Print the board · freeze KPI Trend · set the new reporting month · clear the Daily Log · save the monthly version." },
          { title: "Shortcuts", text: "Ctrl + Enter saves a form · Esc closes it · Today inserts today's date · ← → move through the stand-up · / focuses search." },
        ]),
        callout("<b>Quality is not an act, it is a habit.</b> Clean data every morning — so Tier 2 decides on facts, and Tier 3 gets what it needs."),
      ] },
    ],
  },
];

/* ── Practice & quiz data ───────────────────────────────── */

const PRACTICE = [
  { when: "14 Oct", text: "A Major deviation is raised: tablet hardness out of trend at compression start-up, batch B2610-03. Owner QA Officer 1, due 13-Nov.",
    answer: "Register 01 · No. from eQMS · 14-Oct-26 · ‘Tablet hardness OOT at compression start-up’ · Compression · ONC-T01 / B2610-03 · Major · Under investigation · QA Officer 1 · Open · due 13-Nov-26 · closure blank.",
    href: `#/t2/reg/dev?new=1&prefill=${enc({ opened: "2026-10-14", desc: "Tablet hardness OOT at compression start-up", area: "Compression", product: "ONC-T01 / B2610-03", cls: "Major", root: "Under investigation", owner: "QA Officer 1", status: "Open", due: "2026-11-13", capa: "No", esc: "No" })}` },
  { when: "15 Oct", text: "QA approves the closure of deviation DEV-26-052 today.",
    answer: "Register 01 · find DEV-26-052 → Status = Closed · Closure Date = 15-Oct-26. Check ƒx Closed On Time and Data Check = OK.", href: "#/t2/reg/dev?id=DEV-26-052" },
  { when: "14 Oct", text: "Internal audit IA-26-10 requires a CAPA: retrain packaging staff on line clearance WI-PK-033, due 30-Nov.",
    answer: "Register 02 · No. from eQMS · 14-Oct-26 · Audit · IA-26-10 · ‘Retrain packaging staff on line clearance WI-PK-033’ · Corrective · Packaging · Open · due 30-Nov-26 · Effectiveness = Pending.",
    href: `#/t2/reg/capa?new=1&prefill=${enc({ opened: "2026-10-14", source: "Audit", link: "IA-26-10", desc: "Retrain packaging staff on line clearance WI-PK-033", type: "Corrective", owner: "Packaging", status: "Open", due: "2026-11-30", eff: "Pending" })}` },
  { when: "14 Oct", text: "Gemba walk: uncontrolled copy of WI-PK-033 at packaging line 2. Copy removed. Supervisor to verify all lines by 17-Oct.",
    answer: "Register 04 · INS-1014-1 · 14-Oct-26 · Packaging · your name · ‘Uncontrolled copy of WI-PK-033 at line 2 workstation’ · Documentation · Medium · ‘Copy removed, line briefed’ · Packaging Supervisor · Open · due 17-Oct-26.",
    href: `#/t2/reg/insp?new=1&prefill=${enc({ id: "INS-1014-1", opened: "2026-10-14", area: "Packaging", inspector: "QA Officer 1", desc: "Uncontrolled copy of WI-PK-033 at line 2 workstation", cat: "Documentation", sev: "Medium", action: "Copy removed, line briefed", owner: "Packaging Supervisor", status: "Open", due: "2026-10-17" })}` },
  { when: "17 Oct", text: "Batch B2610-05 released. Manufacture ended 12-Oct, BMR received 13-Oct, CoA 16-Oct, one BMR correction.",
    answer: "Register 05 · B2610-05 · product · Mfg 12-Oct · BMR 13-Oct · CoA 16-Oct · Released · decision 17-Oct · errors 1 · RFT No · releasing officer. ƒx lead time 5 d; ‘Released Late’ depends on the Setup target.",
    href: `#/t2/reg/rel?new=1&prefill=${enc({ id: "B2610-05", product: "ONC-T01 Tab 500 mg", mfg: "2026-10-12", bmr: "2026-10-13", coa: "2026-10-16", status: "Released", decision: "2026-10-17", errors: 1, rft: "No", officer: "Release Officer" })}` },
  { when: "Oct", text: "QA Officer 2 will be on leave three days this month.",
    answer: "Register 07 · QA Officer 2 row → Planned leave = 3 (until the days are logged as Leave in the Tier 1 daily log). ƒx Available Days and Utilisation recalculate; check the Load Status.", href: "#/t2/reg/load?id=QA%20Officer%202" },
  { when: "14 Oct", text: "The team decides CAPA is Critical today: a vendor delay needs Tier 3 support.",
    answer: "Daily Log 14-Oct → Override CAPA = Critical · Escalated to Tier 3 = Yes · reason in Remarks. Register 10 · ESC-26-xxx · 14-Oct-26 · CAPA · CAPA number · ‘Vendor delay blocks CAPA’ · ‘Purchasing decision on alternative vendor’ · Site Quality Head · owner · Open · response due date.",
    href: "#/t2/calendar?day=2026-10-14", href2: `#/t2/reg/esc?new=1&prefill=${enc({ opened: "2026-10-14", source: "CAPA", desc: "Vendor delay blocks CAPA", support: "Purchasing decision on alternative vendor", to: "Site Quality Head", owner: "QA Lead", status: "Open", due: "2026-10-21" })}` },
];

const QUIZ = [
  { q: "Which fields are you allowed to type in?", o: ["Every field of the record, including the ƒx values", "The cream fields only — ƒx values are calculated", "Only the Status field"], a: 1, e: "Cream fields only. Navy ƒx columns are formulas the app recalculates." },
  { q: "A deviation is Closed but has no Closure Date. What happens?", o: ["Nothing — the KPI ignores it", "Data Check flags ‘Completion date missing’ and the record cannot count as on time", "The app fills in today's date"], a: 1, e: "Data Check flags it; the record cannot count as closed on time until the date is entered." },
  { q: "Where do you change the reporting month?", o: ["Tier 2 Setup → Reporting month (or Month-end → roll the month)", "In the Daily Log", "In every register separately"], a: 0, e: "Setup → Reporting month. The calendar, Daily Log and monthly counts follow." },
  { q: "What turns a Q-calendar day red?", o: ["Fewer than 5 attendees", "An item overdue that day, a Critical deviation or High finding raised, or a manual ‘Critical’ override", "Any new record that day"], a: 1, e: "Critical = overdue item, Critical deviation / High finding raised, or a manual Critical." },
  { q: "How is CAPA on-time closure calculated?", o: ["Closed ÷ total CAPA", "Closed on time ÷ (closed + currently overdue)", "On-time ÷ open CAPA"], a: 1, e: "Closed on time ÷ (closed + currently overdue) — overdue items count against you before they close." },
  { q: "Why should you close a record rather than delete it?", o: ["Deleting is impossible", "Closed records stay for traceability, trending and the KPIs; delete only an entry made by mistake", "It saves space"], a: 1, e: "Registers stay cumulative: closed records remain for traceability and trending." },
  { q: "What do you do in KPI Trend at month-end?", o: ["Delete last month", "Freeze the month: copy every Live value into the month column", "Nothing, it is automatic"], a: 1, e: "❄ Freeze copies the live values into the month — the next month's trend arrows compare with them." },
  { q: "Fridays and Saturdays are not grey. What is your first check?", o: ["Setup: weekend days set, and ‘working days in month’ is correct (21 for Oct-2026)", "Re-enter all deviations", "Change the status date"], a: 0, e: "Setup → weekend days; the working-day count confirms it." },
  { q: "Tier 1: what makes the D (Delivery) letter red for a day?", o: ["A near miss", "Any action overdue, or a batch record beyond the review target", "A Medium finding"], a: 1, e: "D is red when an action is overdue or a record waits longer than the review target." },
  { q: "Tier 1: an issue cannot be solved at the huddle today. What do you do?", o: ["Wait for tomorrow's huddle", "Mark the action ‘Escalated to Tier 2 = Yes’ — it appears on both boards until closed", "Delete the action"], a: 1, e: "Escalated actions show on the Tier 1 board and in ‘From Tier 1’ on the Tier 2 dashboard." },
  { q: "How is the Quality Pulse / board health calculated?", o: ["(G + ½A) ÷ (G + A + R)", "G ÷ total KPIs", "Average of all KPI values"], a: 0, e: "Green counts fully, amber half, red zero; no-data KPIs are left out." },
  { q: "A skill has only one qualified officer (level ≥ 3). What does the matrix tell you?", o: ["Everything is fine", "Single point of failure — plan cross-training at the next huddle", "Remove the skill"], a: 1, e: "Fewer than two qualified people turns the count red." },
];

/* ── Renderers ──────────────────────────────────────────── */

function columnsBlock(tier, reg) {
  const sc = (tier === "t1" ? T1_REGISTERS : T2_REGISTERS)[reg];
  const lists = store[tier].lists;
  const rows = sc.fields.map((f) => {
    const src = f.type === "list" ? `Drop-down · ${(lists[f.list] || []).slice(0, 6).join(" · ")}${(lists[f.list] || []).length > 6 ? " …" : ""}` : f.type === "roster" ? "Drop-down · team roster" : f.type === "activity" ? "Drop-down · QA activity catalogue" : f.type === "date" ? "Date" : ["int", "num"].includes(f.type) ? "Number" : f.type === "pct" ? "Percent" : "Text";
    return `<tr><td><b>${esc(f.label)}</b>${f.req ? ' <span style="color:var(--r)">*</span>' : ""}</td><td>${esc(f.help || "")}</td><td class="muted" style="font-size:12px">${esc(src)}</td></tr>`;
  }).join("");
  const meta = sc.source ? `<div class="meta-row" style="margin:0"><span>Source <b>${esc(sc.source)}</b></span><span>Collected by <b>${esc(sc.who)}</b></span><span>When <b>${esc(sc.when)}</b></span>${sc.lifecycle?.length ? `<span class="lifecycle">${sc.lifecycle.map((x) => `<span>${esc(x)}</span>`).join("<i>→</i>")}</span>` : ""}</div>` : `<div class="meta-row" style="margin:0"><span>Collected by <b>${esc(sc.who)}</b></span><span>When <b>${esc(sc.when)}</b></span></div>`;
  return `<p>${esc(sc.lead)}</p>${meta}<div class="table-wrap"><table class="plain"><thead><tr><th>Column</th><th>What to enter · rule</th><th>Input</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><a class="btn sm primary" href="#/${tier}/reg/${reg}">Open ${esc(sc.title)} ›</a><a class="btn sm" href="#/${tier}/reg/${reg}?new=1">＋ Try a new record</a></div>`;
}

function blockHTML(b) {
  switch (b.type) {
    case "text": return `<p>${b.html}</p>`;
    case "callout": return `<div class="callout ${b.cls}">${b.html}</div>`;
    case "link": return `<div><a class="btn sm" href="${b.href}">${esc(b.label)} ›</a></div>`;
    case "cards": return `<div class="lcards">${b.items.map((c) => `<div class="lcard ${c.cls || ""}">${c.n != null ? `<span class="n">${c.n}</span>` : ""}<b>${esc(c.title)}</b><span>${esc(c.text)}</span></div>`).join("")}</div>`;
    case "flow": return `<div class="flow">${b.items.map((c) => `<div><small>${esc(c.small)}</small><b>${esc(c.title)}</b><span>${esc(c.text)}</span></div>`).join("")}</div>`;
    case "table": return `<div class="table-wrap"><table class="plain"><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "columns": return columnsBlock(b.tier, b.reg);
    case "sources": return `<div class="table-wrap"><table class="plain"><thead><tr><th>Register</th><th>Primary source</th><th>Collected by</th><th>When</th></tr></thead><tbody>${T2_ORDER.map((r) => { const sc = T2_REGISTERS[r]; return `<tr><td><a href="#/t2/reg/${r}"><b>${sc.no} ${esc(sc.title)}</b></a></td><td>${esc(sc.source)}</td><td>${esc(sc.who)}</td><td>${esc(sc.when)}</td></tr>`; }).join("")}
      <tr><td><a href="#/t2/calendar"><b>Daily Log</b></a></td><td>The Tier 2 stand-up itself</td><td>Board owner or scribe</td><td>Right after 10:30</td></tr></tbody></table></div>`;
    case "rhythm": return `<div class="rhythm">${RHYTHM.map((r) => `<div class="${r.tier}"><b>${r.t}</b><strong>${esc(r.title)}</strong><span>${esc(r.text)}</span></div>`).join("")}</div>`;
    case "flagged": return flaggedBlock();
    case "kpis2": return `<div class="table-wrap"><table class="plain"><thead><tr><th>KPI</th><th>Definition</th><th>Target</th><th>Amber</th></tr></thead><tbody>${store.t2.kpis.map((k) => `<tr><td><b>${esc(k.name)}</b></td><td>${esc(k.def)}</td><td>${esc(E.targetText(k))}</td><td>${k.unit === "%" ? pct(k.amber) : k.amber}</td></tr>`).join("")}</tbody></table></div>`;
    case "kpis1": return `<div class="table-wrap"><table class="plain"><thead><tr><th>Pillar</th><th>KPI</th><th>Definition</th><th>Target</th></tr></thead><tbody>${store.t1.kpis.map((k) => `<tr><td><b>${esc(k.pillar)}</b></td><td>${esc(k.name)}</td><td>${esc(k.def)}</td><td>${esc(E.targetText(k))}</td></tr>`).join("")}</tbody></table></div>`;
    case "ragcalc": return `<div class="card card-pad" data-ragcalc style="background:var(--surface-2)"><div class="card-head"><h2>Try it · RAG calculator</h2></div>
      <div class="form-grid calc-grid"><label class="field"><span>Actual</span><input type="number" step="any" name="v" value="86"></label><label class="field"><span>Better when</span><select name="b"><option>Higher</option><option>Lower</option></select></label>
      <label class="field"><span>Target</span><input type="number" step="any" name="t" value="90"></label><label class="field"><span>Amber limit</span><input type="number" step="any" name="a" value="80"></label></div><div data-out style="margin-top:12px"></div></div>`;
    case "pulsecalc": return `<div class="card card-pad" data-pulsecalc style="background:var(--surface-2)"><div class="card-head"><h2>Try it · Quality Pulse</h2></div>
      <div class="row" style="align-items:center;gap:20px"><div class="form-grid calc-grid"><label class="field"><span>Green</span><input type="number" min="0" name="g" value="5"></label><label class="field"><span>Amber</span><input type="number" min="0" name="a" value="5"></label><label class="field"><span>Red</span><input type="number" min="0" name="r" value="0"></label></div><div data-out></div></div></div>`;
    case "loadcalc": return `<div class="card card-pad" data-loadcalc style="background:var(--surface-2)"><div class="card-head"><h2>Try it · capacity in three numbers</h2></div>
      <div class="form-grid calc-grid"><label class="field"><span>ƒx Working days</span><input type="number" name="w" value="21"></label><label class="field"><span>Absence days</span><input type="number" name="ab" value="2"></label><label class="field"><span>Planned workload (person-days)</span><input type="number" name="p" value="18"></label></div><div data-out style="margin-top:12px"></div></div>`;
    case "practice": return practiceBlock();
    case "quiz": return quizBlock();
    default: return "";
  }
}

const RHYTHM = [
  { t: "08:00", title: "Update registers", text: "Each officer records yesterday's and this morning's events.", tier: "t2" },
  { t: "08:30", title: "Tier 1 huddle", text: "SQDCP letters, red KPIs, open actions, 3 priorities.", tier: "t1" },
  { t: "09:30", title: "Data check", text: "Clear every red Data Check flag. Draft priorities.", tier: "t2" },
  { t: "10:00", title: "Cut-off", text: "Data is frozen for the meeting. Late changes wait until 10:45.", tier: "t2" },
  { t: "10:30", title: "Tier 2 stand-up", text: "15 minutes at the dashboard, following the agenda.", tier: "t2" },
  { t: "10:45", title: "Daily Log", text: "Meeting held, attendees, overrides, priorities, escalations.", tier: "t2" },
  { t: "16:00", title: "Close the day", text: "Enter afternoon status changes so tomorrow starts clean.", tier: "t2" },
];
export { RHYTHM };

function flaggedBlock() {
  const t2 = E.t2Computed(store.t2);
  const t1 = E.t1Computed(store.t1, store.t1.setup.selDate);
  const rows = [
    ...Object.entries(t2).map(([reg, c]) => ({ tier: "t2", reg, n: E.flagged(c), sc: T2_REGISTERS[reg] })),
    ...Object.entries(t1).map(([reg, c]) => ({ tier: "t1", reg, n: E.flagged(c), sc: T1_REGISTERS[reg] })),
  ].filter((r) => r.sc && r.n);
  return rows.length ? `<div class="callout bad">Right now in this app: ${rows.map((r) => `<a href="#/${r.tier}/reg/${r.reg}?flag=1">${r.tier === "t1" ? "Tier 1" : "Tier 2"} ${esc(r.sc.title)} (${r.n})</a>`).join(" · ")}</div>`
    : `<div class="callout">Right now every register of both boards shows <b>✓ all records consistent</b>.</div>`;
}

function practiceBlock() {
  return `<div class="callout">Set up the demo first: <b>Reporting month = 01-Oct-2026 · Data as of = 17-Oct-2026</b>. <button class="btn sm primary" data-practice-setup>Set it up for me</button> <span class="muted">(Reload the demo in Setup afterwards to get September back.)</span></div>
    <div class="stack" style="gap:10px">${PRACTICE.map((p, i) => `<div class="card practice"><div class="when">${esc(p.when)}</div><div><b>Event ${i + 1}</b><p style="margin:2px 0 0">${esc(p.text)}</p><div class="answer" hidden data-ans="${i}"><b>Answer key · </b>${esc(p.answer)}</div></div>
      <div class="row" style="justify-content:flex-end"><a class="btn sm primary" href="${p.href}">Do it ›</a>${p.href2 ? `<a class="btn sm" href="${p.href2}">Escalation ›</a>` : ""}<button class="btn sm" data-show="${i}">Answer</button></div></div>`).join("")}</div>`;
}

function quizBlock() {
  const ans = store.prefs.quiz || {};
  const done = Object.keys(ans).length;
  const right = QUIZ.filter((q, i) => ans[i] === q.a).length;
  return `<div class="row"><span class="pill ${done === QUIZ.length ? (right >= 10 ? "G" : "A") : "info"}">Score ${right} / ${QUIZ.length}${done < QUIZ.length ? ` · ${QUIZ.length - done} to answer` : ""}</span><button class="btn sm" data-quizreset>Restart</button></div>
    <div class="stack" style="gap:10px">${QUIZ.map((q, i) => {
      const a = ans[i];
      return `<div class="card quiz-q"><h3><span class="n">${i + 1}</span>${esc(q.q)}</h3>${q.o.map((o, j) => {
        const cls = a == null ? "" : j === q.a ? "right" : j === a ? "wrong" : "";
        return `<button class="opt ${cls}" data-q="${i}" data-o="${j}" ${a != null ? "disabled" : ""}><b>${"ABC"[j]}</b><span>${esc(o)}</span></button>`;
      }).join("")}${a != null ? `<div class="explain">${a === q.a ? "✓ Correct. " : "✗ Not quite. "}${esc(q.e)}</div>` : ""}</div>`;
    }).join("")}</div>`;
}

function progress() {
  const done = MODULES.filter((m) => store.prefs.learned?.[m.id]).length;
  return { done, total: MODULES.length, pct: done / MODULES.length };
}

export function renderLearnHome(root) {
  const p = progress();
  root.innerHTML = `
    <section class="hero learn-hero">
      <div class="hero-grid"><div>
        <div class="eyebrow">QA masterclass · Tier 1 & Tier 2 daily management</div>
        <h1>Collecting and entering data on the tier boards</h1>
        <p>Step by step, every register, every column — so the boards tell the truth every morning at 08:30 and 10:30.</p>
        <div class="hero-meta"><span class="chip">Quality Assurance · Oncology OSD site</span><span class="chip">${MODULES.length} modules · about ${Math.round(MODULES.reduce((a, m) => a + m.min, 0) / 60 * 10) / 10} h</span><span class="chip">Training module v1.0 · October 2026</span></div>
        <div style="margin-top:16px;max-width:420px"><div class="row" style="justify-content:space-between;font-size:12.5px;color:#b8c7e0"><span>Your progress</span><b style="color:#fff">${p.done} / ${p.total} modules</b></div><div class="progress"><i style="width:${p.pct * 100}%"></i></div></div>
      </div>${ring(p.pct, p.pct === 1 ? "G" : "A", { size: 128 })}</div>
    </section>
    <div class="card card-pad" style="margin-bottom:16px"><div class="card-head"><h2>By the end of this masterclass you will be able to</h2></div>
      <div class="lcards">${[
        ["Set up the boards", "Configure month, weekend days, owner, roster and KPI targets."],
        ["Collect from the right source", "Know which record feeds every register, and who brings it."],
        ["Enter every register correctly", "Fill each column of the 16 registers, the Daily Log and QA Load."],
        ["Clear the data checks", "Read the Data Check flags and fix them before 10:00."],
        ["Read the boards", "Explain every tile, colour, letter and KPI."],
        ["Close the month", "Run the month-end roll-over and keep the history clean."],
      ].map(([t, x], i) => `<div class="lcard"><span class="n">${i + 1}</span><b>${t}</b><span>${x}</span></div>`).join("")}</div></div>
    <div class="modules">${MODULES.map((m) => `<a class="card module ${store.prefs.learned?.[m.id] ? "done" : ""}" href="#/learn/${m.id}">
      <span class="m-no">${store.prefs.learned?.[m.id] ? "✓" : m.no}</span><h3>${esc(m.title)}</h3><p>${esc(m.lead)}</p>
      <div class="m-foot"><span>${m.lessons.length} lessons</span><span>${m.min} min</span></div></a>`).join("")}</div>
    <div class="callout" style="margin-top:16px">Everything you see is the El Kendi September 2026 demo data. Practise freely — <b>Setup › Reload the September demo</b> puts it back at any time.</div>`;
}

export function renderModule(root, id) {
  root = fresh(root);
  const i = MODULES.findIndex((m) => m.id === id);
  const m = MODULES[i];
  if (!m) { renderLearnHome(root); return; }
  const prev = MODULES[i - 1], next = MODULES[i + 1];
  const done = !!store.prefs.learned?.[m.id];
  root.innerHTML = `
    <section class="hero" style="padding:20px 24px"><div class="hero-grid"><div>
      <div class="eyebrow">Module ${m.no} of ${MODULES.length} · ${m.min} min</div><h1>${esc(m.title)}</h1><p>${esc(m.lead)}</p></div>
      <a class="btn" href="#/learn">All modules</a></div></section>
    <nav class="toc" style="margin-bottom:14px">${m.lessons.map((l, k) => `<a href="#/learn/${m.id}" data-jump="${k}">${esc(l.title)}</a>`).join("")}</nav>
    <div class="stack">${m.lessons.map((l, k) => `<article class="card lesson" id="lesson-${k}"><header><span class="eyebrow">Module ${m.no} · lesson ${k + 1}</span><h2>${esc(l.title)}</h2></header>${l.blocks.map(blockHTML).join("")}</article>`).join("")}</div>
    <div class="row" style="margin-top:18px">${prev ? `<a class="btn" href="#/learn/${prev.id}">‹ ${esc(prev.title)}</a>` : ""}<span class="spacer"></span>
      <button class="btn ${done ? "" : "primary"}" data-done>${done ? "✓ Completed — mark as not done" : "Mark this module as completed"}</button>${next ? `<a class="btn primary" href="#/learn/${next.id}">${esc(next.title)} ›</a>` : ""}</div>`;

  $$("[data-jump]", root).forEach((a) => a.onclick = (e) => { e.preventDefault(); $(`#lesson-${a.dataset.jump}`, root).scrollIntoView({ behavior: "smooth" }); });
  $("[data-done]", root).onclick = () => {
    store.prefs.learned = { ...store.prefs.learned, [m.id]: !done };
    store.save();
    toast(done ? "Module marked as not done" : `Module ${m.no} completed ✓`);
    renderModule(root, id);
  };
  // interactive blocks
  const rc = $("[data-ragcalc]", root);
  if (rc) {
    const upd = () => {
      const f = (n) => +rc.querySelector(`[name=${n}]`).value;
      const r = E.rag(f("v"), rc.querySelector("[name=b]").value, f("t"), f("a"));
      $("[data-out]", rc).innerHTML = `<span class="pill ${r}" style="font-size:14px">${E.RAG_TEXT[r]}</span> <span class="muted">${rc.querySelector("[name=b]").value === "Higher" ? `≥ ${f("t")} → green · ≥ ${f("a")} → amber · below → red` : `≤ ${f("t")} → green · ≤ ${f("a")} → amber · above → red`}</span>`;
    };
    rc.oninput = upd; upd();
  }
  const pc = $("[data-pulsecalc]", root);
  if (pc) {
    const upd = () => {
      const g = +pc.querySelector("[name=g]").value || 0, a = +pc.querySelector("[name=a]").value || 0, r = +pc.querySelector("[name=r]").value || 0;
      const p = E.pulse([...Array(g).fill("G"), ...Array(a).fill("A"), ...Array(r).fill("R")]);
      $("[data-out]", pc).innerHTML = `<div class="row">${ring(p.score, p.rag, { size: 96 })}<span class="muted">(${g} + ½·${a}) ÷ ${g + a + r} = <b>${p.score === "" ? "—" : pct(p.score)}</b><br>≥ 85 % green · ≥ 65 % amber · below red</span></div>`;
    };
    pc.oninput = upd; upd();
  }
  const lc = $("[data-loadcalc]", root);
  if (lc) {
    const upd = () => {
      const w = +lc.querySelector("[name=w]").value || 0, ab = +lc.querySelector("[name=ab]").value || 0, p = +lc.querySelector("[name=p]").value || 0;
      const av = w - ab, u = av > 0 ? p / av : "";
      const st = store.t2.setup;
      const status = u === "" ? "—" : u > st.overLoad ? "Overloaded" : u >= st.highLoad ? "High load" : "Normal";
      $("[data-out]", lc).innerHTML = `<b>${w} − ${ab} = ${av}</b> available days · <b>${p} ÷ ${av} = ${pct(u)}</b> → <span class="pill ${status === "Normal" ? "G" : status === "High load" ? "A" : "R"}">${status}</span> <span class="muted">(≥ ${pct(st.highLoad)} high load · > ${pct(st.overLoad)} overloaded)</span>`;
    };
    lc.oninput = upd; upd();
  }
  root.addEventListener("click", async (e) => {
    const show = e.target.closest("[data-show]");
    if (show) { const a = $(`[data-ans="${show.dataset.show}"]`, root); a.hidden = !a.hidden; }
    const opt = e.target.closest("[data-q]");
    if (opt) {
      store.prefs.quiz = { ...store.prefs.quiz, [opt.dataset.q]: +opt.dataset.o };
      store.save();
      const y = scrollY; renderModule(root, id); scrollTo(0, y);
    }
    if (e.target.closest("[data-quizreset]")) { store.prefs.quiz = {}; store.save(); const y = scrollY; renderModule(root, id); scrollTo(0, y); }
    if (e.target.closest("[data-practice-setup]")) {
      const ok = await confirmDialog({ title: "Set up the practice?", body: "<p>Tier 2 Setup becomes <b>Reporting month = October 2026</b> and <b>Data as of = 17-Oct-2026</b>. The registers are kept.</p>", ok: "Set it up" });
      if (ok) { store.patch("t2", ["setup", "month"], "2026-10-01", "Reporting month"); store.patch("t2", ["setup", "statusDate"], "2026-10-17", "Status date"); toast("Practice set up: October 2026, as of 17-Oct"); }
    }
  });
}

export function learnProgress() { return progress(); }
