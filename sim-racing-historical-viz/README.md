# Slipstream Archive Lab

Standalone no-build web app for historical sim racing analysis.

## Deploy

This project now includes a minimal `wrangler.toml` for Cloudflare Workers static-assets deploys.

- Run `wrangler deploy` from this folder to publish the site as static assets.
- The deploy uses the project root as the asset directory.
- `.assetsignore` excludes local project docs/config files from the public bundle.

## Open It

Open [index.html](c:\Users\josiah.koo\sim-racing-historical-viz\index.html) directly in a browser, then:

1. Upload a Markdown archive (default cup racing .md is located in the project `data` folder).
3. Review validation warnings in the overview panel.
4. Filter by season, era, division, team, or car.
5. Select drivers to compare and export a summary or chart.

## Current Import Expectations

The importer is built around these Markdown sections:

- `## Season Registry`
- `## Full Career Statistics`
- `## CPI Rankings`
- `## All-Time Weighted Score Rankings`
- `# Season-by-Season Results`

It also tolerates:

- upcoming seasons marked with `TBD`
- multi-class seasons with multiple WDC winners
- placeholder cells like `TBD` or `Maybe` in drill-down tables
- one-off text annotations in team standings such as upgrade notes
- drivers present in CPI/weighted-score sections but missing from career totals
