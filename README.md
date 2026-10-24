# Quality Risk Manager and QE Investigator

This repository holds two installable web apps:

- **Quality Risk Manager** (`/`): an FMEA risk register (described below).
- **QE Investigator** (`/qe/`): drafts every stage of a Scigeniq quality event from a deviation description, with Claude, following the El Kendi Oncology site procedures SOPQA0015E/Onc ver. 04 and SOPQA0146E/Onc ver. 02.

## QE Investigator

1. **Describe the deviation:** the description, dates, product, batch, area, equipment, immediate actions and scope. The app shows the selections Scigeniq will make mandatory for that scope (AE05).
2. **Analyse with Claude:** drafts the *Open* (Quality Event Form, Where/What/Who/Why), *In Review* (S × O × D with justifications, RPN class, historical review, QA decision) and *Investigation Planning* stages (investigation and standalone-action tasks per department), plus ranked candidate causes, interview questions, containment and the regulatory references that apply.
3. **Investigation data:** a checklist of the evidence to collect for each 6M factor. It combines a built-in library filtered by scope with items Claude adds for the specific event. Mark each item *compliant*, *anomaly* or *N/A* and write what the record showed. OOS events also show the Phase 1a / 1b / 2 laboratory checklists.
4. **Complete investigation with Claude:** drafts the Investigation Form (6M with an evidence-based assessment per factor, 5 Whys, root cause category), the *After Investigation Details* (impact on product, patient, other batches and validation status; CAPA with owners, due dates and effectiveness check; change control; the 13 impact assessment questions; final RPN; batch disposition) and the QA Manager approval with the QP decision.
5. **Compliance check:** tests the record against the SOP and the main regulations, for example: the 1-working-day logging rule, mandatory investigations for major and critical deviations, quarantine, the 30-working-day due date and extensions, "not determined" root causes needing a risk assessment, human error needing formal justification, and 6M answers that contradict the impact questions.

Every field can be copied for pasting into Scigeniq, and edited in place. *Copy all* and *Print / PDF* export the whole record. The **Masterclass** page gathers the workflow, RPN scales, Exhibit examples, scope matrix, root cause methods, the data library, OOS phases, recurring inspection findings and references (EU GMP Ch. 1/5/6/8, Annexes 11/15/16, ICH Q7/Q9(R1)/Q10, 21 CFR 211, FDA OOS and data integrity guidance, MHRA, PIC/S, WHO). The **Events** page lists saved events with the semi-annual trending tables of SOP 10.10.

Without a Claude connection, **Draft without AI** fills the same forms from the SOP rules and your findings, with `[TO COMPLETE: …]` placeholders.

### Connecting Claude

The app uses Claude Opus 5.5 by default, with structured JSON output, adaptive thinking and server-side refusal fallback. You can choose Sonnet 5.5 or Fable 5.1 and the effort level in **Settings**. Pick one of two connection modes:

- **Local server (recommended):** the API key stays on the server.
  ```bash
  npm install                              # once, installs @anthropic-ai/sdk
  ANTHROPIC_API_KEY=sk-ant-... npm start   # then open http://localhost:8080/qe/
  ```
- **This browser:** for the hosted (GitHub Pages) version, enter your own API key in **Settings**. It is stored only in that browser.
- **Published on claude.ai:** `npm run build:artifact` packs the app into `dist/qe-investigator.html`, published as a claude.ai artifact. There, Claude runs on the viewer's own Claude account (no API key), each viewer's events are saved privately in their claude.ai storage, and "Download report" replaces printing.

The event details are sent to the Anthropic API. Do not include patient data. Claude only drafts: every form must be reviewed, completed and approved by the responsible people in Scigeniq. The app is not a validated GMP system, and the records saved in the browser are working drafts, not GMP records.

## Quality Risk Manager

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

Requires Node.js 18 or later. The apps themselves have no dependencies. `npm install` is only needed for the Claude server proxy.

```bash
npm start          # serves both apps at http://localhost:8080 (set PORT to change)
npm test           # runs the unit tests
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
| `qe/index.html`, `qe/css/qe.css` | QE Investigator shell and styles |
| `qe/js/sop.js` | Site SOP rules: RPN classes, scopes and mandatory fields, workflow stages, working-day deadlines, compliance check, trending |
| `qe/js/knowledge.js` | 6M investigation data library, OOS phase checklists, methods, regulatory references, inspection findings |
| `qe/js/claude.js` | System prompt, JSON schemas, request building and the two Claude connection modes |
| `qe/js/drafts.js` | Offline drafts built from the rules |
| `qe/js/record.js` | Records, data checklist and the stage-by-stage report and text export |
| `qe/js/app.js` | QE Investigator UI |
| `server.js` | Static server, plus the `/api/claude` proxy when `ANTHROPIC_API_KEY` is set |
| `tests/` | `node --test` unit tests |

## Notes

Data is stored only in the browser it was entered in, so export a CSV regularly as a
backup. To use this for regulated (GxP) records, add user authentication,
audit trails and electronic signatures (21 CFR Part 11 / EU Annex 11). This
app does not provide those.
