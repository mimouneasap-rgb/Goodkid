# APQR Command Center

A web app for running the Annual Product Quality Review (APQR) programme at
ELKENDI. It combines the 2026 annual plan, the Scigeniq workflows and tasks,
team workload, statistical studies and the two governing SOPs in one place.
There is no sign-in, and everything can be edited in the browser.

It starts from four source documents:

| Source | What it provides |
| --- | --- |
| APQR Annual Plan 2026 (template QA0021E/TE02/03) | 247 products with final product code, planned month, previous report and review period |
| Master tracker workbook: Scigeniq plan PQRP-KE-1 | 199 approved products with their Scigeniq review periods |
| Master tracker workbook: Scigeniq export of 28/07/2026 | 784 tasks across 68 products |
| SOPQA0021E Rev. 16 and SOPQA0152E-01 | Phases, roles, time limits, content requirements, numbering and Cpk rules |

With the status date set to the export date, the app reproduces the
workbook's dashboard: 329 completed tasks, 8 overdue, 6 duplicate workflows,
and RAG 1 / 61 / 0 / 6. The unit tests check these figures.

## What it does

- **Overview.** A hero chart shows every planned product as one tile, grouped
  by planned month and coloured by status. Below it: KPI tiles, the task
  burn-up, workflow stages, department completion, live workflow RAG, a
  prioritised "needs attention" list, top workloads, the lifecycle pipeline
  and coverage by dosage form. Every figure links to the rows behind it.
- **Annual plan.** A 12-month calendar or a sortable table, with filters by
  scope, form, month and status. Report numbers follow SOPQA0021E §10.6
  (`APQR/TB114P01/0323`). The report due date is the end of the review
  period plus 3 months (§10.3.6). You can add products or edit their plan
  details.
- **Workflows.** One row per product with a live Scigeniq workflow, matching
  the tracker sheet: progress, overdue count, open tasks per department as a
  heat strip, bottleneck, RAG, and an editable QA comment.
- **Tasks.** The full register with search and filters. Each task opens in an
  editor, and bulk actions can assign, move stage, complete or cancel tasks.
- **People.** Workload cards or a table per assignee: open, overdue,
  completion, department mix and next due date.
- **Product dossier.** Everything about one APQR:
  - a stepper for the 7 SOPQA0152E phases;
  - a milestone timeline (review period, planned month, annex and final
    report limits, report due);
  - department data collection with annex numbers (`TB114P01/0323/PR`);
  - the 14 content requirements of §10.4.1;
  - statistical studies;
  - CAPA planning;
  - committee sign-off, from which you can close or reopen the APQR;
  - a printable status report built on template QA0021E/TE01/11;
  - the change history.

  Duplicate Scigeniq workflows can be resolved here by cancelling the
  superseded ones.
- **Statistics lab** (Annex 6 / Phase 5). Paste batch results to get:
  - Cp, Cpk, Pp and Ppk;
  - an individuals control chart with Western Electric run rules;
  - a histogram with the fitted normal curve and an Anderson–Darling
    normality test;
  - the SOP interpretation: above 1.33 excellent; 1.00–1.33 monitor;
    below 1.00 CAPA mandatory.

  Studies are saved to the product, and a programme-wide chart compares
  capability across all saved studies.
- **SOP guide.** The process flow and its time limits, the Scigeniq phases,
  the requirement-by-department matrix, roles and key rules, plus live
  data-quality checks (duplicates, period mismatches, scope gaps).
- **Data & settings.**
  - Settings: the status date (data snapshot, today, or a custom date), the
    report-due lag and warning windows, and your name for the change history.
  - Import: a new Scigeniq export (`.xlsx` or `.csv`), or a backup.
  - Export: a multi-sheet Excel workbook, a JSON backup, or CSVs.
  - Change history and a reset to the source data.
- Light, dark and auto themes, a phone layout with a bottom tab bar, a
  search palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> or <kbd>/</kbd>),
  undo (<kbd>Ctrl</kbd> <kbd>Z</kbd>), and offline use once it is installed as an app.

## Running it

It needs Node.js 18 or later to serve the files. There is nothing to install.

```bash
npm start   # then open http://localhost:8080/apqr/
npm test    # unit tests for the programme logic, statistics and Excel reader/writer
```

Any static web host works, including GitHub Pages (the app is at `/apqr/`).
The browser has to load it over `http(s)://`, because ES modules do not load
from `file://`.

## Refreshing the data each month

1. Export the APQR status report from Scigeniq to Excel.
2. In **Data & settings → Import**, drop the file. The app finds the
   **Data** sheet (or the tracker's **Task Register**) and shows a preview.
   It then replaces the task list. Plan details, statistics, CAPA decisions,
   requirement status and approvals are kept.
3. Set the status date to **Today** once you keep the data current here.

## Data and compliance

- Run from this repository (or any static host), data is saved in this
  browser's local storage, on this device only. Export a backup regularly,
  and use the JSON backup to move between devices.
- Published as a claude.ai page, the app uses the page's shared database
  (`js/sync.js`). Everyone the page is shared with sees the same products,
  tasks and change history, live. People with view-only access can look but
  not change anything. Personal settings, such as the status date, stay on
  each device. Products are stored grouped by planned month and tasks grouped
  by product, so two people editing different items do not overwrite each
  other.
- Scigeniq remains the system of record. This app is a tracking and planning
  aid. It does not provide the controls of 21 CFR Part 11 or EU GMP Annex 11:
  it has no authentication or e-signatures, and its change history is not
  tamper-evident.
- Excel files are read and written by `js/xlsx.js` using the browser's built-in
  zip streams. No third-party code is loaded.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/apqr.css` | App shell and design system (light and dark) |
| `js/app.js` | Navigation, routing, search palette, task editor |
| `js/store.js` | State, local storage, undo and change history |
| `js/sync.js` | Shared workspace when published on claude.ai |
| `js/model.js` | Programme logic: dates, RAG, phases, KPIs, numbering, CSV, Scigeniq import |
| `js/stats.js` | Capability, control limits, run rules, normality |
| `js/sop.js` | Content transcribed from the two SOPs |
| `js/charts.js` | SVG charts |
| `js/xlsx.js`, `js/io.js` | Excel reader/writer, import and export |
| `js/views/*.js` | One module per page |
| `js/seed-data.js` | Starting data generated from the source documents |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app and offline cache |
