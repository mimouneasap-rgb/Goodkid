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
- **Dashboard.** Shows open, high/critical and overdue-review counts, average RPN, the RPN reduced by controls, and the top open risks.
- **CSV import/export** for backups, spreadsheets or moving data between machines.
- Data is saved in the browser (`localStorage`). Sample risks load on first use.

## Running

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
| `server.js` | Tiny static server with no dependencies |
| `tests/` | `node --test` unit tests |

## Notes

Data is stored only in the browser it was entered in, so export a CSV regularly as a
backup. To use this for regulated (GxP) records, add user authentication,
audit trails and electronic signatures (21 CFR Part 11 / EU Annex 11). This
app does not provide those.
