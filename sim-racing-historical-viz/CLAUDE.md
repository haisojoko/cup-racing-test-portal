# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cup Racing Data** is a standalone, no-build browser app for analyzing historical sim racing data from the Cup Racing league (iRacing/Assetto Corsa). Data is auto-loaded from a remote Markdown archive on GitHub. The app provides season browsing, driver profiles, head-to-head driver comparisons, and team statistics.

## Development

No build process. No dependencies required for the app itself.

- **Run locally**: Open `index.html` directly in a browser (or serve via any static file server)
- **Edit**: Modify `.js` or `.css` files, then refresh the browser
- **Debug**: Use browser DevTools; the app loads data from GitHub on startup
- **Deploy**: Any static file host (GitHub Pages, Cloudflare Workers, S3, etc.)

## Testing

- Run `npm test` before committing any code change
- All tests must pass before a PR can be merged
- When modifying `scripts/data.js`, add or update corresponding tests in `tests/`
- Install test dependencies: `npm install` (requires Node.js)

## Architecture

All logic is vanilla JavaScript (`"use strict"`, no frameworks, no modules/bundler):

- **`app.js`** — State management, event binding, tab navigation, shared utilities (formatting, escaping, color assignment), presets, and app initialization. Contains the global `state` object.
- **`scripts/data.js`** — All data logic: Markdown parser, dataset builder, validation, career aggregation, team aggregation, track analysis with Bayesian shrinkage, and the 6 scoring presets. Start here for any data/parsing work.
- **`scripts/views-season.js`** — Renders the Seasons view: season card grid, season detail drill-down (progression chart, standings, venue tables). Also contains shared table rendering utilities (`renderDataTable`, `prepareTableColumns`, etc.).
- **`scripts/views-analysis.js`** — Renders the Drivers view (driver list + full-page profile) and Compare view (driver picker, comparison cards, arc chart, top tracks).
- **`scripts/views-teams.js`** — Renders the Teams view: team leaderboard, team profile, team comparison, and WCC history.
- **`styles.css`** — All styles. Uses CSS custom properties (design tokens) defined at the top; no framework.

## UI Structure

The app has 4 main views accessible via the top navigation bar:

1. **Seasons** — Card grid of all seasons (filterable by era/division). Click a card to drill into season detail with championship progression chart, standings table, and venue results.
2. **Drivers** — Searchable driver list. Click a driver for full-page profile: career stats, index breakdown (preset-scored), top seasons fingerprints, season deltas, track performance.
3. **Compare** — Chip-based driver picker (up to 6). Shows composite scored comparison cards, season-over-season arc chart, Formula vs Sports breakdown, and top tracks per driver.
4. **Teams** — Sub-tabbed view: Totals leaderboard, Team profile, Team comparison, WCC History.

## Key Patterns

- Data auto-loads from GitHub on startup (no upload/paste UI).
- DOM references are cached in a `refs` object for performance.
- Data structures are plain objects; no classes or constructors.
- `createLookup()` / `groupBy()` / `sortBySeason()` are core utility functions in `data.js`.
- Every scoring preset normalizes each metric against the category maximum so scores are comparable.
- Season IDs like `S18a`/`S18b` require special handling in `sortBySeason()`.
- Team names like `"Josie + Toby"` are parsed to extract individual driver lists.
- `normalizeInlineText()` handles Mojibake (encoding artifacts) and placeholder values.
- 6 built-in presets: Balanced, Peak Season, Consistency, Championships, Wins & Podiums, Raw Pace.

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

The canonical dataset lives at `data/Cup_Racing_Complete_Data.md` (21+ seasons, ~30+ drivers).
