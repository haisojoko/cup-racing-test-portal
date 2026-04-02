# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Slipstream Archive Lab** is a standalone, no-build browser app for analyzing historical sim racing data (Cup Racing League). Users upload Markdown-formatted season archives; the app parses them and provides leaderboards, driver comparisons, season breakdowns, and chart exports.

## Development

No build process. No dependencies. No install step.

- **Run locally**: Open `index.html` directly in a browser (or serve via any static file server)
- **Edit**: Modify `.js` or `.css` files, then refresh the browser
- **Debug**: Use browser DevTools; localStorage holds all persisted state and can be inspected/cleared there
- **Deploy**: Any static file host (GitHub Pages, S3, etc.)

## Architecture

All logic is vanilla JavaScript (`"use strict"`, no frameworks, no modules/bundler):

- **`app.js`** — State management, event binding, DOM orchestration, SVG chart rendering, and export (JSON/CSV/SVG). Contains the global `state` object and `STORAGE_KEYS` for localStorage persistence.
- **`scripts/data.js`** — All data logic: Markdown parser, dataset builder, validation, career aggregation, and the 6 scoring presets (Balanced, Peak, Consistency, Titles, Wins & Podiums, Raw Pace). Start here for any data/parsing work.
- **`scripts/views-season.js`** — Renders season detail UI: metadata cards, championship progression chart, class summaries, team standings, venue tables.
- **`scripts/views-analysis.js`** — Renders analysis UI: overview panel, driver picker, career/season leaderboards, and the Insights explorer.
- **`styles.css`** — All styles. Uses CSS custom properties (design tokens) defined at the top; no framework.

## Key Patterns

- DOM references are cached in a `refs` object in `app.js` for performance.
- Data structures are plain objects; no classes or constructors.
- `createLookup()` / `groupBy()` / `sortBySeason()` are core utility functions in `data.js`.
- Every scoring preset normalizes each metric against the category maximum so scores are comparable across datasets.
- Season IDs like `S18a`/`S18b` require special handling in `sortBySeason()`.
- Team names like `"Josie + Lee"` are parsed to extract individual driver lists.
- `normalizeInlineText()` handles Mojibake (encoding artifacts) and placeholder values (`"TBD"`, `"Maybe"`).

## Expected Markdown Data Format

The app parses structured Markdown with these sections (in `data.js`):

```
## Season Registry
## Weighted Score Formula
## Full Career Statistics
## CPI Rankings
## All-Time Weighted Score Rankings
## Championship Winners
## Season N Results
```

The sample dataset lives at `data/Cup_Racing_Complete_Data.md` (21+ seasons, ~30+ drivers).
