# El Kendi Oncology QA

A web app built from the *ElKendi_Oncology_QA_Master_Workbook.xlsx*. There is no sign-in and no server. The app recalculates every workbook formula in the browser from the raw tables.

**This repository holds no QA data.** The workbook's records are confidential, so the app opens on a welcome screen. Drop the master workbook there and it is read in the browser and kept on that device only.

## Views

| Group | View | What it shows |
| --- | --- | --- |
| Overview | **Home** | At-a-glance KPIs, what's due in the next 30 days, module launcher, document control, assumptions and data gaps |
| | **What's due** | One cockpit of everything due across the modules — open quality records and actions, SOP reviews and review requests, calibrations, qualifications, training, APQRs and their tasks, 5S audits and findings, GMP activities, supplier audits, documents whose index validity ends, WIP hold times, FMEA and improvement actions — grouped overdue / this week / within 30 days / later (30-day, 90-day or 1-year horizon), with the load per week, per module, per owner and per department; every line opens its record or page |
| | **Quality performance dashboard** | 8 filters, 10 KPI tiles with 30-day deltas, auto-written key messages, opened vs closed trend, status / department / root-cause Pareto / ageing charts, overdue watch-list |
| | **Management review** | ICH Q10 scorecard (16 KPIs with RAG status against tTargets), 4 gauges, “act this week” priority list, items due in 30 days, meeting details and decisions log |
| | **QMS metrics** | The 47 metrics of the site Quality Metrics Report (SOPGS0010/Onc) by quarter with targets and RAG status. 23 are calculated from the app data (deviation rates, RFT, batch acceptance, on-time closure, VMP and calibration execution, training, cycle times, 5S…); the others (EM, OOS/OOT, complaints, inspections…) are entered per quarter. Monthly trend explorer |
| | **SPC & trends** | c-chart, p-chart and backlog run chart with Western Electric / Nelson rules, and a phase I baseline option |
| Quality events | **Deviations**, **CAPA**, **Change control**, **Audit findings** | One dashboard each: year / status / department / class filters, 11 KPI tiles, opened vs closed trend, backlog run chart, on-time closure by quarter, workflow stage pipeline, status by year, classification, department stacks, department × month heat map, Pareto, ageing, time to close, 8-week due outlook, owner workload, products and rooms. Plus per type: class shift and F1–F4 flags (deviations), CAPA origin and effectiveness (CAPA), scope, permanent/temporary and V&Q gaps (CC), findings per audit, area × class heat map and closure per audit (findings) |
| | **Actions** | Every Scigeniq action under CC / CAPA / audits: overdue by department, origin, on-time closure, ageing, records with most open actions, action type, workload |
| | **Quality records** | All records, searchable, filterable and exportable |
| Product & batches | **Product view** | Product master, APQR matrix, records per quarter |
| | **Product lifecycle** | Phase board (pipeline → validation batches → validated → commercial), batches per month, batch stage × product, yields, batch-record cycle times, batch timeline |
| | **APQR** | The APQR programme in five tabs: a programme dashboard (hero rings, KPIs, the 8 workflow phases, plan by month, plan-to-approval funnel, RAG, task status, departments, data streams, dosage forms, workload, due outlook, ageing, bottlenecks, a product × data-stream readiness grid and a workflow timeline); the annual plan as a month-by-month calendar with plan ↔ Scigeniq reconciliation; product workflows with per-department open tasks; the task register with workload; and the report builder, which fills EU GMP Ch.1.10 (i)–(xii) from the app data and adds an individuals control chart with Cpk / Ppk. **Each APQR has its own page** (`#/apqr?p=…`, previous / next between products): a hero with progress rings and the days left to the report due date, the phase stepper, tasks by department as cards, a task timeline, data streams, key facts and progress per department; an editable task list (quick close, add, bulk insert); the twelve review sections with their status, owner, evidence and comment; and the decision with an approval readiness check and its change history. Workflows renamed “Duplicated” in Scigeniq are kept out of the progress and listed for cancellation. A site filter separates the plan sites from other sites. Statuses are measured at the date of the Scigeniq export |
| | **WIP management** | WIP lots by next step, hold-time countdown, age, quantity by product, rejection reports |
| | **API suppliers** | Registered API list, single-source APIs, manufacturers, countries, audit status |
| Site & assets | **Facility map**, **Room explorer**, **Equipment & calibration** | Floor-plan heat map, room profiles and the asset register (calibration dates come from the calibration program once it is loaded) |
| | **Calibration program** | Annual and monthly programs: monthly load by status, category, location, the month’s systems with their instruments (record a whole group as done in one step), annual calendar |
| | **Validation & requalification** | Utility and equipment schedules, VMP execution, requalifications due in 12 months, calendar |
| People & compliance | **Training plan** | Planned vs completed per month, cumulative plan, status by type, calendar, next trainings (mark one done in one click) |
| | **5S QA audit** | 20 audit areas with their own 75-criterion checklists scored 0–3. Dashboard (score hero, 5S radar, rating mix, area × S heat map, ranking, findings by priority and by S, weakest criteria), area cards with risk class, frequency, trend and linked rooms, a risk-based audit schedule (critical weekly, high bi-weekly, medium monthly, low quarterly), findings tracked to closure (due date set by priority), audit history, and a fast audit form. The facility map can colour rooms by 5S score or open findings |
| | **QA activity register** | 46 recurring QA activities from EU GMP / PIC/S PE 009, ICH Q7–Q12, Annexes 8, 11, 15, 16, 19, ISPE Baseline and Good Practice guides and GAMP 5, with frequency, last performance (derived from the app data where possible) and next due date |
| | **SOP & document library** | The site's document system synced from a **Google Drive** library: the sync walks the whole folder tree, sorts every file by document type (SOPs, batch manufacturing and packaging records, manufacturing and packaging orders, bills of materials, finished-product, raw-material and packaging specifications, test methods, batch assessment records, asset registers, item codes, master indexes…), keeps **obsolete** and **uncontrolled-copy** folders apart from the effective set, and skips system files. **Documents**: the register of every controlled document other than SOPs, by type, department, product and folder. **Product dossiers**: each product's documents in one matrix, with the required ones missing and products found in documents but absent from the product list. **Index check**: the latest edition of each department's master document index (IndXX/Onc, scanned PDFs read through the connector) compared with Drive — documents at the listed revision, newer revisions in Drive, listed documents with no file, Drive documents an index misses, index anomalies and validity dates; an SOP without its own dates takes them from its index. **Each SOP shows a résumé, not its full text**: purpose, scope, who does what, the key steps by stage (with the forms filled at each step) and the critical points, extracted by the app when the SOP is read, or written by **Claude** on request (one SOP, or all of them as a job; the page's `sample` capability on the viewer's own Claude account) and saved for everyone; the full SOP stays one click away in Drive. **Forms, templates & attachments**: every form an SOP lists in its related documents and attaches at the end of its file (form, logbook, checklist, template, annex), with what it records (sections, fields, table columns), its revision as listed and as attached, the steps that fill it and the other SOPs that use it; a **Forms & templates** tab gathers them across the library with the workbook's form register. The SOP register (codes, revisions, site and language read from the file names; the highest controlled revision is current). A library dashboard (review status, departments, languages, effective years, most-cited SOPs, SOPs per part of the app) with cards or a table and filters; **each SOP on its own page**, read live from Drive: table of contents, find-in-SOP, links to the SOPs it cites and is cited by, distribution list, change controls, SOP history, every revision and copy in Drive, and where it is used in the app; **search inside every SOP** (Drive full-text search, with the matching sentences); **SOPs by page** (which SOPs govern each part of the app, matched on titles, with manual links); and **Google Drive sync** (sync the register, then read the SOP contents once to fill effective and validity dates, purposes, distribution and cross-references). Every page shows its governing SOPs under its title, and the GMP activity register lists them per activity. Reading Drive uses each viewer's own Google Drive connector; without it the register still works and SOPs open in Drive |
| | **FMEA risk register**, **Improvement board** | As in the workbook |
| Governance | **Data tables**, **Audit trail**, **Data quality** | Every table, editable; every change made in the app with who, when, the record and each field's old and new value (filters by period, table, person and action; CSV export); data-quality index and reconciliation checks |

Every KPI tile, chart bar, heat-map cell and map room can be clicked to drill down. Clicking a row opens a side panel with the full record: timeline, priority-score breakdown, parent/child links, room and asset. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> to search everything. The app also has an EN / FR switch (it uses the workbook's own translation table), light / dark / system themes, a phone layout and A4 landscape printing.

## Loading and updating the data

On first visit, drop the master workbook on the welcome screen. Afterwards, click **Update data** and drop any of these (several at once is fine):

- the **master workbook** (.xlsx), which reloads every workbook table;
- Scigeniq exports (.xlsx) for **Change Control**, **CAPA**, **Quality Event**, **Audit Findings** and **Actions** (the all-actions and open-actions exports are merged);
- the **batch tracker** (.xlsm) and the **WIP** workbook (.xlsx);
- the **5S area checklists** workbook (.xlsx) and the **APQR master tracker** or a Scigeniq **APQR** export (.xlsx);
- the Scigeniq **all-tasks report** (`allTasks_report.xlsx`): its APQR workflows and data-collection tasks are merged into the APQR task list (same reference and title = same task, so comments typed in the app are kept). When the report lists open tasks only, an APQR task that was open before and is no longer listed is marked “Closed (inferred)”; other Scigeniq tasks in the report are ignored;
- controlled Word forms (.docx): the **annual and monthly calibration programs**, the **utility / equipment validation schedules**, **department training plans**, the **registered API list** and the **APQR annual plan**.

Each file replaces only its own lists, and the import reports what it read from each one. Files are read in the browser with SheetJS (`vendor/`, loaded only for imports) and are never uploaded anywhere else.

## Editing data in the app

You don't need to go back to Excel for day-to-day updates. Everything can be changed in the app, and every KPI, chart and list recalculates immediately.

- **Quality records:** open any change control, CAPA or deviation and click **Edit**. You can change status, stage, dates, owner, classification and so on. Add new ones from **Quality records → New**; IDs continue the existing numbering (e.g. CC-KO-189). Setting a record to *Completed* fills in today's closing date.
- **Equipment** (including calibration dates and frequencies), **FMEA risks** (initial and residual S/O/D), **rooms**, **SOPs**: use **Edit** in their detail panels, or the **Add** buttons on their pages.
- **Improvements:** add cards, edit them, or move them to the next stage with the arrow on each card.
- **SOP résumés:** every part of an SOP's résumé has its own pencil (purpose, scope, when it applies, who does what, key steps, critical points, training), or edit them all at once. Roles, steps and critical points are lists you can add to, reorder and delete from; a step names who does it and the forms it fills. An edited résumé is kept when the SOP file is read again, the page says when the file changed after the edit, and Claude only replaces it on a second click. The SOP file in Drive is never changed.
- **Forms, templates and attachments:** edit a form's title, type, current revision, owner SOP, sections, fields to fill and table columns; add one the SOP uses but whose file does not show it; remove one wrongly found (it can be restored). Corrections live in the forms register and win over what the SOP file says, only for what was changed.
- **SOP reviews and revisions:** request a review from an SOP's page or the **Reviews & revisions** tab (which lists the SOPs that need one, and why), move it from *Requested* to *In progress* and *In approval*, then close it: *No change* restarts the review period from the closing date, *Revised* records the new revision and its effective date (the page flags the Drive file until it is updated), *Withdrawn* retires the SOP. A review done without a request can be recorded directly.
- **Predefined lists:** every editor offers controlled values (statuses, stages, classifications, departments, root causes, scopes, training types, calibration frequencies and intervals, batch types, WIP steps…) and suggests existing values (record IDs, rooms, assets, SOPs, products, people).
- **Operational pages:** record a calibration group as done, mark a training completed, run a 5S audit with its area checklist and close its findings, record an APQR decision (CAPA required, conclusion, approval), record a QA activity as performed, or enter a quarterly metric value by clicking its cell.
- **Data tables** (under Governance): every workbook table, including the APQR, 5S, training and batch tables, CCPs, logbooks, KPI targets, RPN bands, weights and products. Add, edit or delete any row (deleting asks for a second click). It also lists recent changes, with who made each one and when.
- **Bulk insert:** on the Data tables page, and on the APQR tasks, plan and per-APQR pages, paste rows copied from Excel (first line = column names) or pick a CSV / Excel file. Columns are matched by name (Scigeniq report headers are understood for APQR tasks), the preview shows how many rows are new and how many update an existing row with the same key (e.g. APQR task reference + title), and the rows are saved in one go. Missing department, data stream, dosage form and site of APQR tasks are filled in from the task type and product.

**Where changes are saved.** In the hosted app on claude.ai, the workbook and all changes live in the app's shared workspace. Everyone you share it with sees the same data, live, and each change records who made it. Changes apply at once, and each one is written to the **audit trail** (who, when, which record, old → new for every field, and why for automatic ones such as a Drive read or a résumé by Claude); the trail is append-only and each record's page shows its own history. Each change is stored separately, so two people editing different records don't overwrite each other. People shared as Viewer or Commenter can read but not edit. When the app runs from GitHub Pages or a local server, the same editing works but is saved in that browser only.

**Re-importing** a Scigeniq export or the master workbook is still possible for bulk refreshes. It replaces those lists, together with any in-app changes made to them; other lists keep their changes. The Scigeniq all-tasks report is the exception: it merges into the APQR task list and keeps the changes made in the app. The import dialog says how many in-app changes exist before you import.

## How it is built

| Path | Purpose |
| --- | --- |
| `js/schema.js` | Column layout of each workbook table and the EN/FR translation table. No records |
| `js/workbook-data.js` | *Optional and git-ignored.* Raw workbook tables generated by `tools/extract_workbook.py`. When present, the app loads them without an import (useful for local work and for running the real-workbook tests) |
| `js/schema-ext.js` | Column layout of the tables added beyond the workbook (findings, actions, training, calibration and validation plans, suppliers, batches, WIP, rejections, APQR, 5S, QA activities, metric values). No records |
| `js/catalogs.js` | Reference knowledge: predefined lists for the editors, the QMS metric catalogue, the GMP QA-activity register, the 5S checklist and the APQR sections |
| `js/sopkit.js` | Reads SOP codes from file names, groups a folder's revisions, turns an SOP's text into sections, header, history, distribution and cross-references, extracts its résumé and its forms, templates and attachments, and unfolds bilingual SOPs |
| `js/sop-ai.js` | SOP résumés written by Claude (`sample` capability): the prompt, the answer checked and bounded, one SOP or a job over all of them |
| `js/dockit.js` | Document control: document types, obsolete and uncontrolled folders, codes and revisions of every document type, products from names, and the master indexes read from their scanned text |
| `js/sop-drive.js` | Google Drive through the viewer's connector (`mcp` capability): crawl the folder tree, read and search documents, sync the SOP and document registers, read SOP contents and the master indexes |
| `js/importers.js` | Reads the master workbook, Scigeniq exports, batch tracker, WIP workbook and the Word forms; merges the Scigeniq task report and bulk-inserted rows |
| `js/bulk.js` | The bulk-insert panel: pasted or file rows, column matching, preview, save |
| `js/model.js` | Pure model: rebuilds tQR, tEquip, tFMEA, tRooms and tSOP calculated columns, plus KPIs, scorecard, SPC and reconciliation |
| `js/domain.js` | Pure calculations for training, calibration, validation, suppliers, batches, lifecycle, WIP, the APQR programme and process capability, 5S audits and schedule, the activity register and the QMS metrics |
| `js/views-*.js` | One function per view: overview, site, QMS, quality events (`views-quality.js`), operations (`views-ops.js`), APQR (`views-apqr.js`, one APQR's page in `views-apqr-item.js`), SOP library (`views-sop.js`; documents, product dossiers, index check and library map in `views-doc.js`), 5S (`views-fives.js`), people & compliance (`views-people.js`), data tables |
| `js/store.js` | Where data lives: the shared claude.ai workspace (`db` capability) or this browser, plus `applyEdits` that layers in-app changes on the import |
| `js/editing.js` | Field definitions per table and the row editor form |
| `js/sopwork.js` | Work done in the app on SOPs (pure): edited résumés, form corrections in the register, review requests, what closing them means and the SOPs that need one |
| `js/views-sop-edit.js`, `js/views-sop-review.js` | The résumé and form editors; the reviews & revisions tab and each SOP's review card |
| `js/audit.js`, `js/views-audit.js` | The audit trail: field-by-field changes (a résumé part by part, its lists item by item), the trail page and a record's history |
| `js/cockpit.js`, `js/views-cockpit.js` | Everything due across the modules, bucketed by urgency, and its page |
| `js/charts.js`, `js/ui.js` | SVG/HTML charts and UI components (no chart library) |
| `js/app.js` | Routing, side panel, search, tooltip, theme, language and import |

The model reproduces the workbook's rules: Scigeniq date parsing, the department alias map, room / asset / product matching (the first match in table order wins), overdue flags, the priority score, RPN bands from tBands, and the F1–F4 classification flags. `npm test` runs the model, domain, programme and importer tests on small synthetic data. When the local data file exists, it also checks that the real records reconcile with the Scigeniq status counts recorded on the Data Quality sheet.

To create the local (git-ignored) data file:

```bash
python3 tools/extract_workbook.py ElKendi_Oncology_QA_Master_Workbook.xlsx oncology/js/workbook-data.js
```

Run `npm start` from the repository root and open <http://localhost:8080/oncology/>.

> Data entered here is not a GxP record. The app has no audit trail or electronic signatures (21 CFR Part 11 / EU Annex 11), just like the workbook.
