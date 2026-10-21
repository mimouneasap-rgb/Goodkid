# El Kendi Oncology QA

A web app built from the *ElKendi_Oncology_QA_Master_Workbook.xlsx*. There is no sign-in and no server. The app recalculates every workbook formula in the browser from the raw tables.

**This repository holds no QA data.** The workbook's records are confidential, so the app opens on a welcome screen. Drop the master workbook there and it is read in the browser and kept on that device only.

## Views

| Group | View | What it shows |
| --- | --- | --- |
| Overview | **Home** | At-a-glance KPIs, module launcher, document control, assumptions and data gaps |
| | **Quality performance dashboard** | 8 filters, 10 KPI tiles with 30-day deltas, auto-written key messages, opened vs closed trend, status / department / root-cause Pareto / ageing charts, overdue watch-list |
| | **Management review** | ICH Q10 scorecard (16 KPIs with RAG status against tTargets), 4 gauges, “act this week” priority list, items due in 30 days, meeting details and decisions log |
| | **SPC & trends** | c-chart, p-chart and backlog run chart with Western Electric / Nelson rules, and a phase I baseline option |
| Site & assets | **Facility map** | Floor-plan heat map by 9 metrics, with the architectural drawing ELK.DWG.048 v1.2 |
| | **Room explorer** | Room profile, equipment, records, FMEA risks, pressure cascade, CCPs, SOPs, forms and improvements |
| | **Equipment & calibration** | Calibration KPIs, status by register, top rooms, 12-month due timeline, and a filterable register of 499 assets |
| | **Product view** | Product master, APQR matrix, records per quarter, and deviation / CC / CAPA lists per product |
| Quality system | **Quality records** | All 350 change controls, CAPAs and deviations, searchable, filterable and exportable |
| | **CAPA & deviation analytics** | Overdue rate, effectiveness-check coverage, deviation → CAPA linkage, classification flags F1–F4, owner workload |
| | **Change control tracker** | Stage pipeline, ageing, scope, impacted rooms, changes without a V&Q folder |
| | **FMEA risk register** | Initial and residual S × O heat maps, RPN by process step, top risks, Annex 01 summary |
| | **Improvement board** | Kanban with benefit and owner charts |
| | **SOP & document library** | Review cockpit, department / site / language split, logbooks and forms |
| Governance | **Data quality** | Data-quality index, 17 reconciliation checks, data gaps, source-document inconsistencies |

Every KPI tile, chart bar, heat-map cell and map room can be clicked to drill down. Clicking a row opens a side panel with the full record: timeline, priority-score breakdown, parent/child links, room and asset. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> to search everything. The app also has an EN / FR switch (it uses the workbook's own translation table), light / dark / system themes, a phone layout and A4 landscape printing.

## Loading and updating the data

On first visit, drop the master workbook on the welcome screen. Afterwards, click **Update data** and drop either file:

- the **master workbook** (.xlsx), which reloads every table, or
- a Scigeniq **allTasks_report** export for Change Control, CAPA or Quality Event, which replaces just that list.

Files are read in the browser with SheetJS (`vendor/`, loaded only for imports) and are never uploaded. The import reads the data tables, the Lists settings (RPN bands, KPI targets, weights, products), the notes and document control on Home and Data Quality, the floor-plan grid and the embedded layout drawing. The imported data and anything you enter (confirmed room/asset links, approval actions, management-review details and decisions) is saved in this browser's `localStorage`. **Export my entries** downloads it as JSON. **Remove data from this browser** clears it again.

## Editing data in the app

You don't need to go back to Excel for day-to-day updates. Everything can be changed in the app, and every KPI, chart and list recalculates immediately.

- **Quality records:** open any change control, CAPA or deviation and click **Edit**. You can change status, stage, dates, owner, classification and so on. Add new ones from **Quality records → New**; IDs continue the existing numbering (e.g. CC-KO-189). Setting a record to *Completed* fills in today's closing date.
- **Equipment** (including calibration dates and frequencies), **FMEA risks** (initial and residual S/O/D), **rooms**, **SOPs**: use **Edit** in their detail panels, or the **Add** buttons on their pages.
- **Improvements:** add cards, edit them, or move them to the next stage with the arrow on each card.
- **Data tables** (under Governance): every workbook table, including CCPs, logbooks, KPI targets, RPN bands, weights and products. Add, edit or delete any row (deleting asks for a second click). It also lists recent changes, with who made each one and when.

**Where changes are saved.** In the hosted app on claude.ai, the workbook and all changes live in the app's shared workspace. Everyone you share it with sees the same data, live, and each change records who made it. Each change is stored separately, so two people editing different records don't overwrite each other. People shared as Viewer or Commenter can read but not edit. When the app runs from GitHub Pages or a local server, the same editing works but is saved in that browser only.

**Re-importing** a Scigeniq export or the master workbook is still possible for bulk refreshes. It replaces those lists, together with any in-app changes made to them; other lists keep their changes. The import dialog says how many in-app changes exist before you import.

## How it is built

| Path | Purpose |
| --- | --- |
| `js/schema.js` | Column layout of each workbook table and the EN/FR translation table. No records |
| `js/workbook-data.js` | *Optional and git-ignored.* Raw workbook tables generated by `tools/extract_workbook.py`. When present, the app loads them without an import (useful for local work and for running the real-workbook tests) |
| `js/model.js` | Pure model: rebuilds tQR, tEquip, tFMEA, tRooms and tSOP calculated columns, plus KPIs, scorecard, SPC and reconciliation |
| `js/views-*.js` | One function per view (`views-data.js` is the Data tables page) |
| `js/store.js` | Where data lives: the shared claude.ai workspace (`db` capability) or this browser, plus `applyEdits` that layers in-app changes on the import |
| `js/editing.js` | Field definitions per table and the row editor form |
| `js/charts.js`, `js/ui.js` | SVG/HTML charts and UI components (no chart library) |
| `js/app.js` | Routing, side panel, search, tooltip, theme, language and import |

The model reproduces the workbook's rules: Scigeniq date parsing, the department alias map, room / asset / product matching (the first match in table order wins), overdue flags, the priority score, RPN bands from tBands, and the F1–F4 classification flags. `npm test` runs the model tests on a small synthetic workbook. When the local data file exists, it also checks that the real records reconcile with the Scigeniq status counts recorded on the Data Quality sheet.

To create the local (git-ignored) data file:

```bash
python3 tools/extract_workbook.py ElKendi_Oncology_QA_Master_Workbook.xlsx oncology/js/workbook-data.js
```

Run `npm start` from the repository root and open <http://localhost:8080/oncology/>.

> Data entered here is not a GxP record. The app has no audit trail or electronic signatures (21 CFR Part 11 / EU Annex 11), just like the workbook.
