# Quality Risk Manager

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
