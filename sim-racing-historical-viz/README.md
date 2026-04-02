# Slipstream Archive Lab

Standalone no-build web app for historical sim racing analysis.

## Open It

Open [index.html](c:\Users\josiah.koo\sim-racing-historical-viz\index.html) directly in a browser, then:

1. Upload a Markdown archive.
2. Review validation warnings in the overview panel.
3. Filter by season, era, division, team, or car.
4. Select drivers to compare and export a summary or chart.

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

## Notes For Cup Racing Data

- `S21` is treated as upcoming and excluded from completed-history leaderboards.
- `S14` is treated as a valid multi-class season.
- `Hana` can be shown from CPI/weighted-score data even if the career totals table is not updated yet.
