---
Project description
-------------------

💡 This md file describes only one TAB= Assets_Performance,commented in app.js as  ==TA DATA GRAPH ===

*This project purpose is to store data from Google Sheet in Supabase Postgres using GitHub Pages Website: https://defi.yuchkal.org/ as a frontend*

**Last docs update:** 2026-10-01
---
Setup
-----

1. GitHub Pages for the website.
2. Supabase Postgres for the database.
3. A small scheduled sync function that imports data from Google Sheets into Postgres.
4. Frontend fetches prepared data from Supabase API or your own backend endpoint.

---

Practical Implementation Plan
-----------------------------

1. Keep your current Google Sheet as the source of truth.
2. Create database tables for raw imports and daily aggregated earnings.
3. Build a small sync script that reads Google Sheets API and upserts rows into the database.
4. Expose only read-only API endpoints for the website.
5. In GitHub Pages, use fetch() to load earnings JSON and render charts/cards/tables.

---

Supabase Configuration and Specification
----------------------------------------

- DB located at : https://supabase.com/dashboard/project/vphdvuvofpkogemvejff/editor/25391?schema=public
- DB consist of table(s):
  [TA_DATA]
  id (int8)
  value(varchar)
  created_at(timestamptz)
  created_at_minsk(timestamp)

**DONE**

---

Step-by-Step implementation Plan
--------------------------------

1. In web-project need to create button named <Load></load>. This button suppose to be under Total Assests panel.

**DONE** → later **REMOVED** (2026-09-28, see Modification Plan item 8). Sync now runs only via scheduler (step 4).

2. When I press button Load data from Google sheet : https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/edit?gid=0#gid=0  column = Y2 are loaded and saved to Supabase in table TA_DATA
3. Each time button <Load></load> pressed the following action happens for TA_DATA table:

- Id inserted like increment starting from 1
- value inserted from google sheet described in step 2
- created_at inserted as date-time of insert in format = YYYY-MM-DD-HH24:MI. Time suppose to be UTC+3

 **DONE**

4. Need to implement some task scheduler service that will be load data described in Step 2 automatically.
   Scheduler service need to be run in background and do exactly the sa,e as manually pressed button <Load></load>.
   Scheduler service need to be run every-day at 15:00 UTC+3(Minsk Time).

**DONE**

6. Need to create the following graph with the following attributes:

 -- Prototype picture: ![alt text](image.png)
 -- Graph location on site: ![alt text](image-1.png)
 -- Graph description:
  ** Graph should have 2 axis: x-axis and y-axis
  ** X-axis: Date taken from supabase in format YYYY-MM-DD: [table= ta_data; column=created_at_minsk]
  ** Y-axis: Value taken from supabase; values should be negative(e.g -32.42) and potitive(e.g. 33.41); zero value shoul be in the middle of Y-axis : [table =ta_data; column=value]
  ** If graph goes to negative value it should be painted in red color; if graph goes to positive value it should be painted in green color.

**DONE**

---

Modification Plan
-----------------

1. Y-axis currently has the following values= -40; -20; 0; 20; 40. Need to modify it to make it more precise: suggestion: -40; -35; -20; .... and so on. Also it should be a pointer like <-------> going from Y-axis value in parallel with X-axis.Ref ![Pointer](image-2.png)

**DONE** (2026-09-25)

Implementation details (`app.js` → section `TA DATA GRAPH`, `style.css`, `index.html`):
- New constants: `TA_Y_STEP = 5`, `TA_Y_DEFAULT_MAX = 40`, `TA_CHART_HEIGHT = 520`.
- `computeSymmetricBounds()` now always returns a fixed step of 5 and a symmetric range of at least -40..40.
  If a value ever exceeds ±40, the range grows symmetrically to the next multiple of 5 (e.g. ±45), keeping step 5.
- Y-axis labels: -40; -35; -30; -25; -20; -15; -10; -5; 0; 5; 10; 15; 20; 25; 30; 35; 40 (integer format, multiples of 10 and 0 in bold).
- Horizontal pointer lines: a dashed line (`- - - -`, dash 6px / gap 4px) is drawn from every Y-axis value across the whole plot, parallel to the X-axis.
  Lines at multiples of 10 are brighter (major), lines at ±5, ±15, ... are dimmer (minor). The 0 line stays solid and brightest.
- Small tick marks (6px) added on the Y-axis at each value.
- Grid lines are pixel-snapped (`Math.round(y) + 0.5`) for crisp 1px rendering.
- Chart height increased from 420px to 520px (`TA_CHART_HEIGHT` in `app.js`, `#taDataChart { min-height: 520px }` in `style.css`, canvas `height="520"` in `index.html`). Left margin reduced 70 → 56px (shorter labels), bottom margin 60 → 70px for rotated date labels.
- `niceStep()` is no longer used by the chart (kept in code, harmless).
2. Remove Reload button from TA DATA GRAPH **DONE** (2026-09-25)
3. Last Date shown on Graph should be date from last row taken from ta_data table from supabase db **DONE** — `Last Updated` pill = `created_at_minsk` of the latest `ta_data` row; latest row is always kept visible on X-axis.
4. Need to optimise code or DB performance :: issue with Loading Graph at first login to site - it takes a long time to proceed **🔲 PLANNED (not started)**
5. Need to change Latest Date: <YYYY-MM-DD> as Last shown date to Last updated: <YYYY-MM-DD>. Buiseness logic does not change, only words(from Latest Date--> to Last updated ). Color should be also changed to be more visible on panel. **DONE** (2026-09-25)
6. Hover tooltip on each chart dot should show date and percentage in format `YYYY-MM-DD / %` (e.g. `2026-09-24 / 5.82`).

**DONE** (2026-09-25)

Implementation details (`app.js` → section `TA DATA GRAPH`, function `drawTaDataChart()`):
- Tooltip text (`valueText` in `taChartHoverPoints`) changed from raw value (`String(p.rawValue)`) to `` `${p.xLabel} / ${p.y.toFixed(2)}` ``.
- Date = `created_at_minsk` trimmed to `YYYY-MM-DD` (`formatTaDateLabel()`); value always shown with 2 decimals.
- Tooltip color logic unchanged: green for value >= 0, red for negative. Hover radius unchanged (14px around each dot).

7. Implementation details for items 2 and 5 (2026-09-25):
- **Reload button removed**: `<button id="reloadTaChartBtn">` and its empty `.ta-chart-header` wrapper removed from `index.html`;
  `reloadTaChartBtn` constant + click listener removed from `app.js`; `.ta-chart-header`, `.ta-chart-title`, `.ta-chart-reload-btn*` CSS removed from `style.css`.
  Graph loads on page open. (The refresh after the **Load** button no longer exists — Load button removed 2026-09-28, item 8.)
- **Last Updated label**: text changed from `Latest date: YYYY-MM-DD` to `Last Updated: YYYY-MM-DD` (business logic unchanged — date of the last `ta_data` row, `created_at_minsk`).
  New helper `setTaChartLastUpdated(dateText)` renders it as a pill: label in accent cyan `#2ebac6` (bold), date in white (extra-bold),
  cyan-tinted background + border + soft glow (`.ta-chart-status.is-updated`, `.ta-chart-status-label`, `.ta-chart-status-date`).
  `setTaChartStatus(text, kind)` gained an optional class; errors now shown in red (`.is-error`). Font size 12px → 13px.

8. Load button removed from Total Assets card (2026-09-28) — manual Sheet → Supabase sync is no longer available in the UI;
   `ta_data` is filled only by the daily scheduler (15:00 UTC+3). Graph no longer refreshes after a manual Load (no such button). See `AI/TAB=Percentage_Assets/Improvement_percentage_assets.md` → Improvement 3.

---

Current behaviour summary (2026-10-01)
--------------------------------------

| Item | Behaviour |
| ---- | --------- |
| Data source | Supabase `ta_data` via Edge Function `ta-data-readonly`, rows with `id >= 13`, sorted by `created_at_minsk` |
| Data input | Supabase Daily Scheduler 15:00 UTC+3 → `quick-processor` (Sheet `Y2` → new row). No manual Load / Reload buttons |
| Last Updated pill | `Last Updated: YYYY-MM-DD` = date of latest `ta_data` row (cyan pill, errors in red). **Not** the Google Sheet date — that one is on the assets row (Sheet1 `S3`) |
| Y-axis | Fixed step 5, range −40..40 (extends symmetrically in steps of 5 if needed); dashed pointer lines, brighter every 10, solid 0 line |
| X-axis | Dates `YYYY-MM-DD` (rotated), latest row always labelled |
| Line | Green ≥ 0, red < 0, split exactly at zero crossing |
| Tooltip | Hover a dot → `YYYY-MM-DD / value` (2 decimals), green/red |
| Size | Canvas height 520px, full width |
| Open item | Item 4 — first-load performance optimisation |
