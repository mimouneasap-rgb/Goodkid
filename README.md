# Quality Risk Manager & SOP Library

This repository holds two installable web apps:

- **Quality Risk Manager** (`/`): an FMEA-style quality risk register, described below.
- **SOP Library** (`/sop/`): the SOP library, with each SOP linked to its forms, templates,
  logbooks and annexes. See [SOP Library](#sop-library).

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
npm start          # serves the apps at http://localhost:8080 and http://localhost:8080/sop/
npm test           # runs the unit tests for the risk and SOP library logic
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

## SOP Library

The SOP Library (`sop/`) turns a folder of SOP files (Word and PDF) into a searchable,
linked library that works offline.

- **Overview:** counts of current SOPs, forms, templates, logbooks and annexes, attachments by
  department, a "Needs attention" list, an 18-month periodic-review calendar, and the most
  referenced SOPs.
- **Library:** cards or a table with full-text search (accents ignored) and highlighted
  matches. Filter by department, language, site, review state, attachment type and file status.
  Export the results as CSV.
- **SOP page:** purpose, scope, responsibilities, tools, references and source file. It also has:
  - **Forms & records:** every form, template, logbook and annex of the SOP, with its fields,
    plus records the SOP uses from other SOPs.
  - **Linked SOPs:** references in both directions with a network diagram, including references
    to SOPs missing from the library.
  - **Procedure outline, revision history, glossary and full text** (searchable).
  - Print a one-page summary or every blank form at once.
- **Forms & Records:** all attachments by type, searchable by code, title, field or parent SOP.
  Each one opens as a **digital record**:
  - Its fields become an entry form.
  - Entries are kept with time and author.
  - Entries are voided with a reason, never deleted.
  - Export entries as CSV, or print the record blank or filled in (wide logbooks print landscape).
- **Editing:** every SOP has an **Edit** button and the library has **New SOP**. The editor covers:
  - details, dates, text sections, lists, glossary and revision history;
  - linked SOPs, and each attachment's code, title, type and fields.

  Each save needs a reason and a name, and goes into the SOP's **Changes** tab and the change log. Edits are kept separately from the
  library file: you can revert an SOP, restore a removed one, export the edited library as JSON and
  export the change log as CSV. In a claude.ai page edits are shared with everyone who opens the
  page; elsewhere they are saved in the browser.
- **Relationship map:** a zoomable map of how SOPs reference each other, coloured by department.
- **Library data:**
  - Import the library file.
  - Back up and restore entries.
  - Export library and forms CSVs.
  - See a data-quality report: overdue reviews, missing references, duplicates and untitled attachments.
- Command palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> or <kbd>/</kbd>), light/dark theme
  and a phone layout.

### Your SOP data stays private

The repository contains **no SOP content**. Until you load your own library the app shows a small
fictional demo. Your library is a JSON file built from your SOP folder:

```bash
python3 sop/tools/build_library.py "path/to/SOP folder" -o sop-library.json \
    --source-name "SOP's 1" --source-url "https://drive.google.com/drive/folders/…"
```

The script needs Python 3 (standard library only) and, for PDFs, `pdftotext` from poppler.
It reads:

- SOP codes, versions and sections.
- Revision history and effective dates (the QMex PDF header is used when present).
- Related SOPs.
- Attachments (`…/FE01`, `TF02`, `AE03`… → forms, templates, annexes; titles with
  "log book / registre" → logbooks) and the field names from their tables.

`--manifest files.json` maps downloaded file ids to their original names. `--overrides DIR`
merges reviewed corrections (for scanned PDFs, for example).

Load the file with **Import library** (or drag it onto the page). It is stored in the
browser's IndexedDB on that device only. To share it with a team, put it at
`sop/data/sop-library.json` on a **private** server and the app loads it on its own.
`sop/data/` is git-ignored so the file cannot be committed by mistake.

Digital entries are a working aid, not a validated 21 CFR Part 11 / Annex 11 system: the
signed paper record or the validated system remains the GMP record.

### SOP Library layout

| Path | Purpose |
| --- | --- |
| `sop/index.html`, `sop/css/sop.css` | App shell and design system |
| `sop/js/model.js` | Pure library logic: indexing, linking, search, statistics, graph layout, CSV |
| `sop/js/main.js` | Views, routing, command palette, digital records and printing |
| `sop/js/store.js` | IndexedDB storage for the library and entries |
| `sop/js/edits.js` | Where edits are kept: the page database on claude.ai, otherwise this browser |
| `sop/js/demo-data.js` | Fictional demo library |
| `sop/tools/build_library.py` | Builds `sop-library.json` from a folder of SOP files |
| `sop/tools/bundle_single.py` | Packs the app into one HTML file (`--embed` for a claude.ai page: no printing, saves via the page's download prompt) |
| `sop/manifest.webmanifest`, `sop/sw.js`, `sop/icons/` | Installable offline app |

## Notes

Data is stored only in the browser it was entered in, so export a CSV regularly as a
backup. To use this for regulated (GxP) records, add user authentication,
audit trails and electronic signatures (21 CFR Part 11 / EU Annex 11). This
app does not provide those.
