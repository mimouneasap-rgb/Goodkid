# Goodkid quality apps

This repository holds two browser apps with no build step and no dependencies:

| App | Path | What it does |
| --- | --- | --- |
| **APQR Master Tracker** | [`apqr/`](apqr/) | Annual Product Quality Review programme tracker (plan vs execution, annexes progress, workload, data-quality signals). Imports the APQR master tracker workbook or a Scigeniq eQMS export. |
| **Quality Risk Manager** | `/` (root) | FMEA-style quality risk register (see below). |

## APQR Master Tracker

Open `apqr/` (locally: `npm start`, then http://localhost:8080/apqr/; once Pages is on, **https://mimouneasap-rgb.github.io/Goodkid/apqr/**).

### Getting data in

Drop a file anywhere on the page, or use **Import**. The app works out what kind of file it is and shows a preview before it changes anything.

| File | What it brings |
| --- | --- |
| APQR master tracker `.xlsx` (sheets *APQR Plan*, *Task Register*, *APQR Tracker*, *Dashboard*) | The approved plan, every Scigeniq task, QA comments, the previous-extract baseline (Prev %, movement block) and the report-date inputs |
| Scigeniq all-tasks export `.xlsx` / `.csv` | The monthly refresh. Columns are matched by header name (Reference ID, Type, Stage, Status, Title, Parent action, Assigned User, dates…) and you can adjust the mapping. Products come from the *Parent action*. "CM" tasks are mapped to Compliance. Approvals and the parent workflow are counted separately. Non-APQR rows (change controls, deviations…) are set aside on the Insights page. "Task - Duplicated" parents are matched back through their APQR reference or creation batch. The current figures can be saved as the comparison baseline first. |
| Plan sheet `.xlsx` | Product, Process, Review Start and Review End |
| App backup `.json` | A full restore |

### Calculations (same as the workbook)

- **Planned PQR month** = the month after the review period ends. **PQR overdue date** = the 1st of that month + 3 months (configurable). Every annexe of a product shares that due date.
- **% complete** = closed data-collection tasks ÷ all data-collection tasks. Approval signatures and the workflow itself are excluded.
- **RAG**: COMPLETE (workflow closed or all annexes closed) → OVERDUE (an overdue annexe, or the PQR overdue date has passed) → DUE SOON (workflow due date or PQR overdue date within 14 days) → ON TRACK.
- **Bottleneck**: the department holding the most open annexes ("several" on a tie).

### Screens

**Command centre** (hero KPIs, RAG split, KPI tiles, a month-by-month runway, annexe burn-up, departments, stages, dosage-form coverage, top workloads, movement vs baseline, quality signals) · **APQR tracker** (filterable, sortable product register, with a product file per row: timeline, annexes with inline stage editing, owner, priority, QA comments and history) · **Plan** (grouped by planned month, add/edit/remove products) · **Annexes progress** (the "Actual APQR Annexes Progress for (MM/YYYY)" chart and counts table per month, plus a department × month completion heatmap) · **Task register** (inline stage and assignee editing, add/edit/delete tasks, CSV export) · **Workload** · **Insights** (data-quality checks and excluded rows) · **Data & settings** (import, Excel/JSON export, baseline, rules, audit trail).

Every edit is written to an audit trail. The **Excel export** has the same layout as the master tracker (Dashboard, APQR Tracker, APQR Plan, Task Register, Owner Workload, Annexes Progress, Excluded Tasks, Audit Trail), so it opens in Excel and can be imported back.

Data is stored only in the browser it was entered in (`localStorage`). Files are read locally and never uploaded. Scigeniq remains the system of record. This tracker has no authentication or e-signatures (21 CFR Part 11 / EU Annex 11).

| Path | Purpose |
| --- | --- |
| `apqr/js/xlsx.js` | Dependency-free .xlsx reader/writer (zip + XML) and CSV parser |
| `apqr/js/engine.js` | Pure calculation engine (plan, tasks, products, KPIs, months, quality signals) |
| `apqr/js/importers.js` | Master tracker, Scigeniq and plan importers |
| `apqr/js/exporter.js` | Excel workbook and JSON backup export |
| `apqr/js/store.js`, `actions.js` | State, persistence, undo, audit trail and edit/import flows |
| `apqr/js/app.js`, `views-*.js`, `drawer.js`, `charts.js`, `ui.js` | Interface |
| `apqr/js/demo.js` | Fictional demo programme |
| `tests/apqr.test.js` | Unit tests (`npm test`) |

---

## Quality Risk Manager (root app)

A lightweight quality risk management (QRM) app for identifying, scoring,
controlling and reviewing quality risks, following the FMEA approach used in
ICH Q9 and ISO 14971.

## Features

- **Risk register** with ID, title, category, failure mode/hazard, cause, effect,
  controls, owner, status and next review date. Search, filter by level, status and category, and sort by any column.
- **FMEA scoring.** Severity, occurrence and detection are each rated 1–5. The app calculates:
  - **RPN** = S × O × D (1–125)
  - **Risk level** from S × O: Low (1–4), Medium (5–9), High (10–19), Critical (20–25)
- **Residual risk.** Re-score each risk after controls. A risk can only be **Closed** once its residual risk has been assessed.
- **Risk matrix.** A 5×5 heat map of initial or residual risk. Click a cell to see its risks.
- **Analysis.** Hover any chart for details, or switch it to a table. There are three charts:
  - **Effect of risk controls:** initial vs residual RPN for each risk, including the share of RPN removed by controls and how few risks make up 80% of open RPN (Pareto).
  - **Risk profile:** risk levels stacked by category, owner or status.
  - **Review schedule:** overdue reviews and reviews due in each of the next six months.
- **Overview.** A risk-posture summary that places every open risk on the 1–125 RPN scale. Below it are KPI tiles, a prioritised "Needs attention" list (overdue reviews, critical risks, high risks without verified controls, risks with no owner) and a recent-activity feed.
- **Change history.** Every save records what changed (status, initial or residual RPN, edited fields). The history appears in the risk editor and in the activity feed.
- **Risk editor.** Severity, occurrence and detection are picked with 1–5 rating buttons, and the RPN and level update as you choose.
- **Light, dark or system theme**, keyboard shortcuts (<kbd>N</kbd> new risk, <kbd>/</kbd> search) and a phone layout with a bottom tab bar.
- **CSV import/export** for backups, spreadsheets or moving data between machines.
- Data is saved in the browser (`localStorage`). Sample risks load on first use.

## Install it as an app

The app is a Progressive Web App. Once hosted, you can install it from the browser. It then gets its own icon, opens in its own window and works offline.

**Hosting (one-time):** in the GitHub repository, open **Settings → Pages**. Under *Build and deployment*, set **Source** to *Deploy from a branch*, choose branch `ccr-d4e1bb55-pqqfa8` and folder `/ (root)`, then click **Save**. After a minute or two the app is live at
**https://mimouneasap-rgb.github.io/Goodkid/**.

**Installing:**

| Device | Steps |
| --- | --- |
| Android (Chrome) | Open the link, then tap **Install app** in the page header or **⋮ → Install app** |
| iPhone / iPad (Safari) | Open the link, tap **Share → Add to Home Screen** |
| Windows / macOS / ChromeOS (Chrome or Edge) | Open the link, then click **Install app** in the page header or the install icon in the address bar |
| Mac (Safari 17+) | **File → Add to Dock** |

Your risks are stored on the device where you enter them. Use **Export CSV** to back them up or move them to another device.

## Running locally

Requires Node.js 18 or later. There are no dependencies to install.

```bash
npm start          # serves the app at http://localhost:8080 (set PORT to change)
npm test           # runs the unit tests for the scoring logic
```

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | App shell: dashboard, register, matrix and the risk editor dialog |
| `css/styles.css` | Styles, with light and dark mode |
| `js/risk.js` | Pure risk logic (scoring, validation, filtering, matrix, summary, CSV) |
| `js/charts.js` | SVG chart builders for the Analysis view |
| `js/app.js` | UI rendering and event handling |
| `js/sample-data.js` | Example risks loaded on first visit |
| `manifest.webmanifest`, `sw.js`, `icons/` | App manifest, offline service worker and icons |
| `server.js` | Tiny static server with no dependencies |
| `tests/` | `node --test` unit tests |

## Notes

Data is stored only in the browser it was entered in, so export a CSV regularly as a
backup. To use this for regulated (GxP) records, add user authentication,
audit trails and electronic signatures (21 CFR Part 11 / EU Annex 11). This
app does not provide those.
