# El Kendi Oncology QA

A web app built from the *ElKendi_Oncology_QA_Master_Workbook.xlsx*. There is no sign-in and no server. The app recalculates every workbook formula in the browser from the raw tables.

**This repository holds no QA data.** The workbook's records are confidential, so the app opens on a welcome screen. Drop the master workbook there and it is read in the browser and kept on that device only.

## Views

| Group | View | What it shows |
| --- | --- | --- |
| Overview | **Home** | At-a-glance KPIs, module launcher, document control, assumptions and data gaps |
| | **Quality performance dashboard** | 8 filters, 10 KPI tiles with 30-day deltas, auto-written key messages, opened vs closed trend, status / department / root-cause Pareto / ageing charts, overdue watch-list |
| | **Management review** | ICH Q10 scorecard (16 KPIs with RAG status against tTargets), 4 gauges, “act this week” priority list, items due in 30 days, meeting details and decisions log |
| | **QMS metrics** | The 47 metrics of the site Quality Metrics Report (SOPGS0010/Onc) by quarter with targets and RAG status. 23 are calculated from the app data (deviation rates, RFT, batch acceptance, on-time closure, VMP and calibration execution, training, cycle times, 5S…); the others (EM, OOS/OOT, complaints, inspections…) are entered per quarter. Monthly trend explorer |
| | **SPC & trends** | c-chart, p-chart and backlog run chart with Western Electric / Nelson rules, and a phase I baseline option |
| Quality events | **Deviations**, **CAPA**, **Change control**, **Audit findings** | One dashboard each: year / status / department / class filters, 11 KPI tiles, opened vs closed trend, backlog run chart, on-time closure by quarter, workflow stage pipeline, status by year, classification, department stacks, department × month heat map, Pareto, ageing, time to close, 8-week due outlook, owner workload, products and rooms. Plus per type: class shift and F1–F4 flags (deviations), CAPA origin and effectiveness (CAPA), scope, permanent/temporary and V&Q gaps (CC), findings per audit, area × class heat map and closure per audit (findings) |
| | **Actions** | Every Scigeniq action under CC / CAPA / audits: overdue by department, origin, on-time closure, ageing, records with most open actions, action type, workload |
| | **Quality records** | All records, searchable, filterable and exportable |
| Product & batches | **Product view** | Product master, APQR matrix, records per quarter |
| | **Product lifecycle** | Phase board (pipeline → validation batches → validated → commercial), batches per month, batch stage × product, yields, batch-record cycle times, batch timeline |
| | **APQR** | Review schedule per product and year, and the EU GMP Ch.1.10 sections (i)–(xii) filled from suppliers, yields, failing batches, deviations, changes, variations, CAPA and qualification status |
| | **WIP management** | WIP lots by next step, hold-time countdown, age, quantity by product, rejection reports |
| | **API suppliers** | Registered API list, single-source APIs, manufacturers, countries, audit status |
| Site & assets | **Facility map**, **Room explorer**, **Equipment & calibration** | Floor-plan heat map, room profiles and the asset register (calibration dates come from the calibration program once it is loaded) |
| | **Calibration program** | Annual and monthly programs: monthly load by status, category, location, the month’s systems with their instruments (record a whole group as done in one step), annual calendar |
| | **Validation & requalification** | Utility and equipment schedules, VMP execution, requalifications due in 12 months, calendar |
| People & compliance | **Training plan** | Planned vs completed per month, cumulative plan, status by type, calendar, next trainings (mark one done in one click) |
| | **5S weekly QA audit** | Scored 20-point checklist (Sort, Set in order, Shine, Standardize, Sustain) with findings and actions, weekly score trend, score per S, area × week heat map, weakest criteria, area rotation plan |
| | **QA activity register** | 46 recurring QA activities from EU GMP / PIC/S PE 009, ICH Q7–Q12, Annexes 8, 11, 15, 16, 19, ISPE Baseline and Good Practice guides and GAMP 5, with frequency, last performance (derived from the app data where possible) and next due date |
| | **SOP library**, **FMEA risk register**, **Improvement board** | As in the workbook |
| Governance | **Data tables**, **Data quality** | Every table, editable; data-quality index and reconciliation checks |

Every KPI tile, chart bar, heat-map cell and map room can be clicked to drill down. Clicking a row opens a side panel with the full record: timeline, priority-score breakdown, parent/child links, room and asset. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> to search everything. The app also has an EN / FR switch (it uses the workbook's own translation table), light / dark / system themes, a phone layout and A4 landscape printing.

## Loading and updating the data

On first visit, drop the master workbook on the welcome screen. Afterwards, click **Update data** and drop any of these (several at once is fine):

- the **master workbook** (.xlsx), which reloads every workbook table;
- Scigeniq exports (.xlsx) for **Change Control**, **CAPA**, **Quality Event**, **Audit Findings** and **Actions** (the all-actions and open-actions exports are merged);
- the **batch tracker** (.xlsm) and the **WIP** workbook (.xlsx);
- controlled Word forms (.docx): the **annual and monthly calibration programs**, the **utility / equipment validation schedules**, **department training plans** and the **registered API list**.

Each file replaces only its own lists, and the import reports what it read from each one. Files are read in the browser with SheetJS (`vendor/`, loaded only for imports) and are never uploaded anywhere else.

## Editing data in the app

You don't need to go back to Excel for day-to-day updates. Everything can be changed in the app, and every KPI, chart and list recalculates immediately.

- **Quality records:** open any change control, CAPA or deviation and click **Edit**. You can change status, stage, dates, owner, classification and so on. Add new ones from **Quality records → New**; IDs continue the existing numbering (e.g. CC-KO-189). Setting a record to *Completed* fills in today's closing date.
- **Equipment** (including calibration dates and frequencies), **FMEA risks** (initial and residual S/O/D), **rooms**, **SOPs**: use **Edit** in their detail panels, or the **Add** buttons on their pages.
- **Improvements:** add cards, edit them, or move them to the next stage with the arrow on each card.
- **Predefined lists:** every editor offers controlled values (statuses, stages, classifications, departments, root causes, scopes, training types, calibration frequencies and intervals, batch types, WIP steps…) and suggests existing values (record IDs, rooms, assets, SOPs, products, people).
- **Operational pages:** record a calibration group as done, mark a training completed, run a 5S audit with its checklist, schedule an APQR, record a QA activity as performed, or enter a quarterly metric value by clicking its cell.
- **Data tables** (under Governance): every workbook table, including CCPs, logbooks, KPI targets, RPN bands, weights and products. Add, edit or delete any row (deleting asks for a second click). It also lists recent changes, with who made each one and when.

**Where changes are saved.** In the hosted app on claude.ai, the workbook and all changes live in the app's shared workspace. Everyone you share it with sees the same data, live, and each change records who made it. Each change is stored separately, so two people editing different records don't overwrite each other. People shared as Viewer or Commenter can read but not edit. When the app runs from GitHub Pages or a local server, the same editing works but is saved in that browser only.

**Re-importing** a Scigeniq export or the master workbook is still possible for bulk refreshes. It replaces those lists, together with any in-app changes made to them; other lists keep their changes. The import dialog says how many in-app changes exist before you import.

## How it is built

| Path | Purpose |
| --- | --- |
| `js/schema.js` | Column layout of each workbook table and the EN/FR translation table. No records |
| `js/workbook-data.js` | *Optional and git-ignored.* Raw workbook tables generated by `tools/extract_workbook.py`. When present, the app loads them without an import (useful for local work and for running the real-workbook tests) |
| `js/schema-ext.js` | Column layout of the tables added beyond the workbook (findings, actions, training, calibration and validation plans, suppliers, batches, WIP, rejections, APQR, 5S, QA activities, metric values). No records |
| `js/catalogs.js` | Reference knowledge: predefined lists for the editors, the QMS metric catalogue, the GMP QA-activity register, the 5S checklist and the APQR sections |
| `js/importers.js` | Reads the master workbook, Scigeniq exports, batch tracker, WIP workbook and the Word forms |
| `js/model.js` | Pure model: rebuilds tQR, tEquip, tFMEA, tRooms and tSOP calculated columns, plus KPIs, scorecard, SPC and reconciliation |
| `js/domain.js` | Pure calculations for training, calibration, validation, suppliers, batches, lifecycle, WIP, APQR, 5S, the activity register and the QMS metrics |
| `js/views-*.js` | One function per view: overview, site, QMS, quality events (`views-quality.js`), operations (`views-ops.js`), people & compliance (`views-people.js`), data tables |
| `js/store.js` | Where data lives: the shared claude.ai workspace (`db` capability) or this browser, plus `applyEdits` that layers in-app changes on the import |
| `js/editing.js` | Field definitions per table and the row editor form |
| `js/charts.js`, `js/ui.js` | SVG/HTML charts and UI components (no chart library) |
| `js/app.js` | Routing, side panel, search, tooltip, theme, language and import |

The model reproduces the workbook's rules: Scigeniq date parsing, the department alias map, room / asset / product matching (the first match in table order wins), overdue flags, the priority score, RPN bands from tBands, and the F1–F4 classification flags. `npm test` runs the model and domain tests on a small synthetic workspace. When the local data file exists, it also checks that the real records reconcile with the Scigeniq status counts recorded on the Data Quality sheet.

To create the local (git-ignored) data file:

```bash
python3 tools/extract_workbook.py ElKendi_Oncology_QA_Master_Workbook.xlsx oncology/js/workbook-data.js
```

Run `npm start` from the repository root and open <http://localhost:8080/oncology/>.

> Data entered here is not a GxP record. The app has no audit trail or electronic signatures (21 CFR Part 11 / EU Annex 11), just like the workbook.
