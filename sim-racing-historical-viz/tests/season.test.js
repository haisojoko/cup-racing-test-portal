import { describe, it, expect } from "vitest";

// views-season.js expects helpers that data.js and app.js define at runtime.
globalThis.uniqueList = (arr) => Array.from(new Set(arr));
globalThis.normalizeInlineText = (v) => String(v == null ? "" : v).trim();
globalThis.escapeHtml = (v) => String(v);
globalThis.seriesColor = (i) => `color-${i}`;
globalThis.formatPercent = (v) => `${v}%`;
globalThis.formatInteger = (v) => String(v);

const { splitStandingsByClass } = require("../scripts/views-season.js");

// S14 shape: two championships interleaved in one archive table. Toby (Street)
// outscored Josie (GT3) while winning a different title.
const splitSeason = {
  seasonLabel: "S14",
  isSplitChampionship: true,
  wdcWinners: [
    { name: "Josie", label: "GT3" },
    { name: "Toby", label: "Street" },
  ],
  standings: [
    { driver: "Josie", className: "GT3", points: 487 },
    { driver: "Toby", className: "Street", points: 507 },
    { driver: "Lee", className: "GT3", points: 343 },
    { driver: "Joyce", className: "Street", points: 346 },
  ],
};

// S18a shape: two classes, one championship. Must stay a single table.
const combinedSeason = {
  seasonLabel: "S18a",
  isSplitChampionship: false,
  wdcWinners: [{ name: "James", label: "" }],
  standings: [
    { driver: "Josie", className: "Hypercar", points: 400 },
    { driver: "James", className: "GT3", points: 420 },
  ],
};

describe("splitStandingsByClass", () => {
  it("splits a season with a title per class", () => {
    const groups = splitStandingsByClass(splitSeason);
    expect(groups.map((g) => g.title)).toEqual(["GT3 Standings", "Street Standings"]);
    expect(groups[0].rows.map((r) => r.driver)).toEqual(["Josie", "Lee"]);
    expect(groups[1].rows.map((r) => r.driver)).toEqual(["Toby", "Joyce"]);
  });

  it("names each class champion from the archive's WDC labels", () => {
    const groups = splitStandingsByClass(splitSeason);
    expect(groups[0].champion).toBe("Josie");
    expect(groups[1].champion).toBe("Toby");
  });

  it("scopes each class's gap chart to its own rows", () => {
    expect(splitStandingsByClass(splitSeason).every((g) => g.scopedChart)).toBe(true);
  });

  it("keeps a single table when two classes share one championship", () => {
    const groups = splitStandingsByClass(combinedSeason);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Standings");
    expect(groups[0].rows).toHaveLength(2);
  });

  it("keeps a single table on a single-class season", () => {
    const groups = splitStandingsByClass({
      seasonLabel: "S20", isSplitChampionship: false, wdcWinners: [],
      standings: [{ driver: "Josie", className: "", points: 500 }],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Standings");
  });

  it("keeps unclassified drivers visible in their own group", () => {
    const groups = splitStandingsByClass({
      ...splitSeason,
      standings: [...splitSeason.standings, { driver: "Lika", className: "", points: 0 }],
    });
    expect(groups.map((g) => g.title)).toContain("Unclassified");
    expect(groups.at(-1).rows.map((r) => r.driver)).toEqual(["Lika"]);
  });

  it("does not split when the registry claims two WDCs but no class is known", () => {
    const groups = splitStandingsByClass({
      seasonLabel: "S14", isSplitChampionship: true, wdcWinners: [],
      standings: [{ driver: "Josie", className: "", points: 1 }],
    });
    expect(groups).toHaveLength(1);
  });
});
