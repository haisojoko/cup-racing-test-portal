import { describe, it, expect } from "vitest";
const data = require("../scripts/data.js");

const {
  normalizeSeasonId, getSeasonOrder, sortBySeason,
  normalizeInlineText, normalizeMarkdown, parseMarkdownTable,
  parseDriverCell, parseTeamMembers, normalizeTeamName, parseNumberish,
  parseDecimal, parsePercent, buildEraLabel, splitCsvLike, parseWinnerList,
  groupBy, uniqueList, createLookup, deriveRate, deriveAverage,
  averageOf, sumOf, maxOf, normalizeAgainstMax,
  isPlaceholderValue, normalizeCarSpec, makeSeasonDriverKey,
  parseDataset,
  buildTrackAggregates, extractResultMarkers, getTrackList, getTrackLeaderboard,
  getTrackRaceResults, getDriverTrackRaces,
} = data;

// ---- Season ID utilities ----

describe("normalizeSeasonId", () => {
  it("prefixes bare numbers with S", () => {
    expect(normalizeSeasonId("5")).toBe("S5");
    expect(normalizeSeasonId("18")).toBe("S18");
  });

  it("strips 'Season ' prefix", () => {
    expect(normalizeSeasonId("Season 3")).toBe("S3");
    expect(normalizeSeasonId("Season 18a")).toBe("S18a");
  });

  it("keeps existing S prefix", () => {
    expect(normalizeSeasonId("S1")).toBe("S1");
    expect(normalizeSeasonId("S18b")).toBe("S18b");
  });

  it("returns empty for empty input", () => {
    expect(normalizeSeasonId("")).toBe("");
    expect(normalizeSeasonId(null)).toBe("");
  });
});

describe("getSeasonOrder", () => {
  it("orders plain seasons numerically", () => {
    expect(getSeasonOrder("S1")).toBe(10);
    expect(getSeasonOrder("S5")).toBe(50);
    expect(getSeasonOrder("S19")).toBe(190);
  });

  it("orders split seasons after their base", () => {
    expect(getSeasonOrder("S18a")).toBe(181);
    expect(getSeasonOrder("S18b")).toBe(182);
    expect(getSeasonOrder("S18a")).toBeLessThan(getSeasonOrder("S18b"));
    expect(getSeasonOrder("S18b")).toBeLessThan(getSeasonOrder("S19"));
  });

  it("returns MAX_SAFE_INTEGER for unparseable IDs", () => {
    expect(getSeasonOrder("garbage")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("sortBySeason", () => {
  it("sorts season objects chronologically", () => {
    const items = [
      { seasonId: "S19" },
      { seasonId: "S1" },
      { seasonId: "S18b" },
      { seasonId: "S18a" },
      { seasonId: "S5" },
    ];
    const sorted = sortBySeason(items);
    expect(sorted.map((i) => i.seasonId)).toEqual(["S1", "S5", "S18a", "S18b", "S19"]);
  });
});

// ---- Text normalization ----

describe("normalizeInlineText", () => {
  it("strips bold markers and extra whitespace", () => {
    expect(normalizeInlineText("**Josie** (WCC)")).toBe("Josie (WCC)");
    expect(normalizeInlineText("  hello   world  ")).toBe("hello world");
  });

  it("strips backticks", () => {
    expect(normalizeInlineText("`code`")).toBe("code");
  });

  it("handles null/undefined", () => {
    expect(normalizeInlineText(null)).toBe("");
    expect(normalizeInlineText(undefined)).toBe("");
  });
});

describe("normalizeMarkdown", () => {
  it("strips BOM and normalizes line endings", () => {
    expect(normalizeMarkdown("﻿hello\r\nworld")).toBe("hello\nworld");
  });

  it("strips BOM without altering normal content", () => {
    const result = normalizeMarkdown("hello world");
    expect(result).toBe("hello world");
  });
});

// ---- Parsing utilities ----

describe("parseMarkdownTable", () => {
  it("parses a simple table", () => {
    const lines = [
      "| Name | Score |",
      "| --- | --- |",
      "| Alice | 10 |",
      "| Bob | 20 |",
    ];
    const rows = parseMarkdownTable(lines);
    expect(rows).toHaveLength(2);
    expect(rows[0].Name).toBe("Alice");
    expect(rows[0].Score).toBe("10");
    expect(rows[1].Name).toBe("Bob");
  });

  it("returns empty for too few lines", () => {
    expect(parseMarkdownTable(["| A |"])).toEqual([]);
  });
});

describe("parseDriverCell", () => {
  it("extracts driver name and WDC/WCC flags", () => {
    const result = parseDriverCell("Josie **WDC** (WCC)");
    expect(result.name).toBe("Josie");
    expect(result.wdc).toBe(true);
    expect(result.wcc).toBe(true);
  });

  it("handles plain name", () => {
    const result = parseDriverCell("Toby");
    expect(result.name).toBe("Toby");
    expect(result.wdc).toBe(false);
    expect(result.wcc).toBe(false);
  });
});

describe("parseTeamMembers", () => {
  it("splits team on +", () => {
    expect(parseTeamMembers("Josie + Toby")).toEqual(["Josie", "Toby"]);
    expect(parseTeamMembers("Lee + Green Kyle + Colin")).toEqual(["Lee", "Green Kyle", "Colin"]);
  });

  it("returns empty for TBD", () => {
    expect(parseTeamMembers("TBD")).toEqual([]);
  });
});

describe("normalizeTeamName", () => {
  it("sorts members alphabetically", () => {
    expect(normalizeTeamName("James + Isaac")).toBe("Isaac + James");
    expect(normalizeTeamName("Isaac + James")).toBe("Isaac + James");
  });

  it("handles three-member teams", () => {
    expect(normalizeTeamName("Lee + Green Kyle + Colin")).toBe("Colin + Green Kyle + Lee");
    expect(normalizeTeamName("Colin + Green Kyle + Lee")).toBe("Colin + Green Kyle + Lee");
  });

  it("leaves single-driver names unchanged", () => {
    expect(normalizeTeamName("Vale")).toBe("Vale");
  });

  it("normalizes whitespace and bold markers", () => {
    expect(normalizeTeamName("  **Josie** +  Toby ")).toBe("Josie + Toby");
  });

  it("handles TBD gracefully", () => {
    expect(normalizeTeamName("TBD")).toBe("TBD");
  });
});

describe("parseNumberish", () => {
  it("extracts numbers from strings", () => {
    expect(parseNumberish("42")).toBe(42);
    expect(parseNumberish("3.14")).toBe(3.14);
    expect(parseNumberish("1,234")).toBe(1234);
  });

  it("returns null for non-numeric", () => {
    expect(parseNumberish("n/a")).toBe(null);
    expect(parseNumberish(null)).toBe(null);
  });
});

describe("parsePercent", () => {
  it("parses percentage values", () => {
    expect(parsePercent("88.9%")).toBe(88.9);
    expect(parsePercent("100.0%")).toBe(100.0);
  });

  it("returns null for missing values", () => {
    expect(parsePercent(null)).toBe(null);
  });
});

describe("splitCsvLike", () => {
  it("splits comma-separated values", () => {
    expect(splitCsvLike("Spa, Bahrain, Okayama")).toEqual(["Spa", "Bahrain", "Okayama"]);
  });
});

describe("parseWinnerList", () => {
  it("parses single winner", () => {
    const result = parseWinnerList("Josie");
    expect(result).toEqual([{ name: "Josie", label: "" }]);
  });

  it("parses multi-class winners with labels", () => {
    const result = parseWinnerList("Josie (GT3), Toby (Street)");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Josie", label: "GT3" });
    expect(result[1]).toEqual({ name: "Toby", label: "Street" });
  });

  it("returns empty for TBD", () => {
    expect(parseWinnerList("TBD")).toEqual([]);
  });
});

// ---- Era and classification ----

describe("buildEraLabel", () => {
  it("assigns correct era buckets", () => {
    expect(buildEraLabel("S1")).toBe("S1-S5");
    expect(buildEraLabel("S5")).toBe("S1-S5");
    expect(buildEraLabel("S6")).toBe("S6-S10");
    expect(buildEraLabel("S11")).toBe("S11-S15");
    expect(buildEraLabel("S18a")).toBe("S16-S20");
    expect(buildEraLabel("S21")).toBe("S21+");
  });
});

describe("isPlaceholderValue", () => {
  it("detects TBD and Maybe", () => {
    expect(isPlaceholderValue("TBD")).toBe(true);
    expect(isPlaceholderValue("Maybe")).toBe(true);
    expect(isPlaceholderValue("Josie")).toBe(false);
  });
});

describe("normalizeCarSpec", () => {
  it("classifies formula and sports types", () => {
    expect(normalizeCarSpec("Formula")).toBe("formula");
    expect(normalizeCarSpec("Formula Car Season")).toBe("formula");
    expect(normalizeCarSpec("Sports")).toBe("sports");
    expect(normalizeCarSpec("Sports Car")).toBe("sports");
  });
});

// ---- Collection utilities ----

describe("groupBy", () => {
  it("groups items by key", () => {
    const items = [
      { type: "a", val: 1 },
      { type: "b", val: 2 },
      { type: "a", val: 3 },
    ];
    const result = groupBy(items, "type");
    expect(result.a).toHaveLength(2);
    expect(result.b).toHaveLength(1);
  });
});

describe("uniqueList", () => {
  it("deduplicates and removes falsy", () => {
    expect(uniqueList(["a", "b", "a", "", null, "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("createLookup", () => {
  it("creates key-value map", () => {
    const items = [{ id: "x", v: 1 }, { id: "y", v: 2 }];
    const lookup = createLookup(items, "id");
    expect(lookup.x.v).toBe(1);
    expect(lookup.y.v).toBe(2);
  });
});

// ---- Math utilities ----

describe("deriveRate", () => {
  it("calculates percentage", () => {
    expect(deriveRate(5, 10)).toBe(50.0);
    expect(deriveRate(3, 9)).toBeCloseTo(33.3, 1);
  });

  it("returns null for zero denominator", () => {
    expect(deriveRate(5, 0)).toBe(null);
  });
});

describe("normalizeAgainstMax", () => {
  it("normalizes value against maximum", () => {
    expect(normalizeAgainstMax(50, 100)).toBe(0.5);
    expect(normalizeAgainstMax(100, 100)).toBe(1);
  });

  it("returns 0 for null or zero max", () => {
    expect(normalizeAgainstMax(null, 100)).toBe(0);
    expect(normalizeAgainstMax(50, 0)).toBe(0);
  });
});

describe("maxOf", () => {
  it("finds max value via getter", () => {
    const items = [{ score: 3 }, { score: 7 }, { score: 1 }];
    expect(maxOf(items, (i) => i.score)).toBe(7);
  });

  it("returns 0 for empty array", () => {
    expect(maxOf([], (i) => i.score)).toBe(0);
  });
});

describe("averageOf", () => {
  it("averages a numeric field", () => {
    const items = [{ pts: 10 }, { pts: 20 }, { pts: 30 }];
    expect(averageOf(items, "pts")).toBe(20);
  });

  it("returns null for empty input", () => {
    expect(averageOf([], "pts")).toBe(null);
  });
});

// ---- Full parser smoke test ----

describe("parseDataset", () => {
  const MINIMAL_MD = `# Test League

## Season Registry

| Season | Type | Car | Venues | Races/Venue | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Formula | Tatuus FA01 | Spa, Monza | 3 | Josie | Josie + Toby |
| S2 | Sports | Miata | Laguna Seca | 3 | Toby | Toby + Lee |

## Weighted Score Formula

Win% x 0.20 + Podium% x 0.20

## Full Career Statistics

| Driver | WDC | WCC | Wins | Podiums | Poles | FLs | Points | Races | Win% | Pod% | Pts/Race | FL% | Top5 | Top5% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Josie | 1 | 1 | 5 | 10 | 3 | 2 | 350 | 18 | 27.8% | 55.6% | 19.4 | 11.1% | 14 | 77.8% |
| Toby | 1 | 1 | 4 | 8 | 2 | 3 | 300 | 18 | 22.2% | 44.4% | 16.7 | 16.7% | 12 | 66.7% |

## CPI Rankings

| Rank | Driver | CPI | Avg WS | Peak WS | Avg Pts Rate | Avg Top5 Rate | WDCs | WCCs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie | 1.400 | 0.700 | 0.900 | 80.0% | 77.8% | 1 | 1 |
| 2 | Toby | 1.200 | 0.600 | 0.800 | 70.0% | 66.7% | 1 | 1 |

## All-Time Weighted Score Rankings

| Rank | Driver | Season | W.Score | Win% | Pod% | Top5% | Pts/Race | FL% | Pole% | PtsRate | Part. | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie | S1 | 0.9000 | 33.3% | 66.7% | 88.9% | 22.0 | 11.1% | 22.2% | 85.0% | 100.0% | Yes | Yes |
| 2 | Toby | S2 | 0.8000 | 33.3% | 55.6% | 77.8% | 18.0 | 22.2% | 11.1% | 75.0% | 100.0% | Yes | Yes |
| 3 | Josie | S2 | 0.5000 | 22.2% | 44.4% | 66.7% | 16.0 | 11.1% | 11.1% | 65.0% | 100.0% | | |
| 4 | Toby | S1 | 0.4000 | 11.1% | 33.3% | 55.6% | 14.0 | 11.1% | 0% | 60.0% | 100.0% | | Yes |
`;

  const NON_STARTERS_MD = `# Test League

## Season Registry

| Season | Type | Car | Venues | Races/Venue | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Formula | Tatuus FA01 | Spa | 3 | Josie | Josie + Toby |

## Weighted Score Formula

Win% x 0.20 + Podium% x 0.20

## Full Career Statistics

| Driver | WDC | WCC | Wins | Podiums | Poles | FLs | Points | Races | Win% | Pod% | Pts/Race | FL% | Top5 | Top5% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Josie | 1 | 1 | 2 | 3 | 1 | 1 | 68 | 3 | 66.7% | 100.0% | 22.7 | 33.3% | 3 | 100.0% |
| Toby | 0 | 1 | 0 | 1 | 0 | 0 | 15 | 1 | 0.0% | 100.0% | 15.0 | 0.0% | 1 | 100.0% |
| Ghost | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.0% | 0.0% | 0.0 | 0.0% | 0 | 0.0% |

## CPI Rankings

| Rank | Driver | CPI | Avg WS | Peak WS | Avg Pts Rate | Avg Top5 Rate | WDCs | WCCs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie | 1.400 | 0.700 | 0.900 | 80.0% | 77.8% | 1 | 1 |
| 2 | Toby | 1.200 | 0.600 | 0.800 | 70.0% | 66.7% | 0 | 1 |

## All-Time Weighted Score Rankings

| Rank | Driver | Season | W.Score | Win% | Pod% | Top5% | Pts/Race | FL% | Pole% | PtsRate | Part. | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie | S1 | 0.9000 | 66.7% | 100.0% | 100.0% | 22.7 | 33.3% | 33.3% | 90.0% | 100.0% | Yes | Yes |
| 2 | Toby | S1 | 0.4000 | 0.0% | 100.0% | 100.0% | 15.0 | 0.0% | 0.0% | 60.0% | 33.3% | | Yes |

## Season 1 Results

**Type:** Formula
**Car:** Tatuus FA01
**Venues:** Spa
**Races Per Venue:** 3
**WDC:** Josie
**WCC:** Josie + Toby

### Season Standings

| Pos | Driver | Points | Wins | Podiums | Poles | FLs | Races | Part. | Pts Rate | Top 5 Rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie **WDC** (WCC) | 68 | 2 | 3 | 1 | 1 | 3 | 100.0% | 90.0% | 100.0% |
| 2 | Toby (WCC) | 15 | 0 | 1 | 0 | 0 | 1 | 33.3% | 60.0% | 100.0% |
| 3 | Ghost | 0 | 0 | 0 | 0 | 0 | 0 | 0.0% | 0.0% | 0.0% |

### Team Standings (WCC)

| Team | Points |
| --- | --- |
| Josie + Toby | 83 |

#### Venue 1: Spa

| Driver | R1 Pos | R1 Pts | R2 Pos | R2 Pts | R3 Pos | R3 Pts | Day Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Josie | 1 | 25 | 2 | 18 | 1 | 25 | 68 |
| Toby | DNS | 0 | 3 | 15 | DNS | 0 | 15 |
| Ghost | DNS | 0 | DNS | 0 | DNS | 0 | 0 |
`;

  it("parses without throwing", () => {
    expect(() => parseDataset("test.md", MINIMAL_MD, "test")).not.toThrow();
  });

  it("extracts correct season count", () => {
    const ds = parseDataset("test.md", MINIMAL_MD, "test");
    expect(ds.seasonCatalog).toHaveLength(2);
    expect(ds.stats.seasonCount).toBe(2);
  });

  it("extracts correct driver count", () => {
    const ds = parseDataset("test.md", MINIMAL_MD, "test");
    expect(ds.stats.driverCount).toBe(2);
    expect(ds.careerRecords.map((r) => r.driver).sort()).toEqual(["Josie", "Toby"]);
  });

  it("parses weighted score records", () => {
    const ds = parseDataset("test.md", MINIMAL_MD, "test");
    expect(ds.weightedRecords).toHaveLength(4);
    expect(ds.weightedRecords[0].weightedScore).toBe(0.9);
    expect(ds.weightedRecords[0].driver).toBe("Josie");
  });

  it("parses career CPI values", () => {
    const ds = parseDataset("test.md", MINIMAL_MD, "test");
    const josie = ds.careerRecords.find((r) => r.driver === "Josie");
    expect(josie.cpi).toBe(1.4);
    expect(josie.wdc).toBe(1);
  });

  it("builds filter options", () => {
    const ds = parseDataset("test.md", MINIMAL_MD, "test");
    expect(ds.filterOptions.seasons.length).toBe(2);
    expect(ds.filterOptions.divisions.length).toBe(2);
    expect(ds.filterOptions.drivers.length).toBe(2);
  });

  it("throws on missing weighted score table", () => {
    const broken = "# Test\n## Season Registry\n| Season | Type | Car | Venues | Races/Venue | WDC | WCC |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | F | car | venue | 3 | X | Y |\n";
    expect(() => parseDataset("bad.md", broken, "test")).toThrow();
  });

  it("omits season standings rows when the driver has zero starts", () => {
    const ds = parseDataset("non-starters.md", NON_STARTERS_MD, "test");
    const detail = ds.seasonDetails.find((season) => season.seasonId === "S1");

    expect(detail.standings.map((row) => row.driver)).toEqual(["Josie", "Toby"]);
    expect(ds.seasonStandings.some((row) => row.driver === "Ghost")).toBe(false);
  });

  it("omits venue rows only when every race in the round is DNS", () => {
    const ds = parseDataset("non-starters.md", NON_STARTERS_MD, "test");
    const detail = ds.seasonDetails.find((season) => season.seasonId === "S1");
    const rows = detail.venues[0].rows;

    expect(rows.map((row) => row.driver)).toEqual(["Josie", "Toby"]);
    expect(rows.find((row) => row.driver === "Toby").races.some((race) => race.position === "DNS")).toBe(true);
  });
});

describe("makeSeasonDriverKey", () => {
  it("creates consistent lookup keys", () => {
    expect(makeSeasonDriverKey("S1", "Josie")).toBe("S1::josie");
    expect(makeSeasonDriverKey("Season 18a", " **Toby** ")).toBe("S18a::toby");
  });
});

// ---- Track analysis ----

describe("extractResultMarkers", () => {
  it("detects pole and fastest-lap tokens", () => {
    expect(extractResultMarkers("1 (P,FL)")).toEqual({ pole: true, fastestLap: true });
    expect(extractResultMarkers("3 (FL)")).toEqual({ pole: false, fastestLap: true });
    expect(extractResultMarkers("6 (P)")).toEqual({ pole: true, fastestLap: false });
  });

  it("returns all-false for unmarked or missing cells", () => {
    expect(extractResultMarkers("4")).toEqual({ pole: false, fastestLap: false });
    expect(extractResultMarkers("DNS")).toEqual({ pole: false, fastestLap: false });
    expect(extractResultMarkers("")).toEqual({ pole: false, fastestLap: false });
    expect(extractResultMarkers(null)).toEqual({ pole: false, fastestLap: false });
  });
});

describe("track aggregation", () => {
  // Two seasons at the same track so a driver's record accumulates across seasons.
  const TRACK_MD = `# Track Test League

## Season Registry

| Season | Type | Car | Venues | Races/Venue | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Formula | Tatuus FA01 | Suzuka | 2 | Josie | Josie + Toby |
| S2 | Formula | Tatuus FA01 | Suzuka | 2 | Josie | Josie + Toby |

## Weighted Score Formula

Win% x 0.20 + Podium% x 0.20

## Full Career Statistics

| Driver | WDC | WCC | Wins | Podiums | Poles | FLs | Points | Races | Win% | Pod% | Pts/Race | FL% | Top5 | Top5% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Josie | 2 | 2 | 3 | 4 | 2 | 3 | 100 | 4 | 75.0% | 100.0% | 25.0 | 75.0% | 4 | 100.0% |
| Toby | 0 | 2 | 1 | 4 | 1 | 1 | 80 | 4 | 25.0% | 100.0% | 20.0 | 25.0% | 4 | 100.0% |

## CPI Rankings

| Rank | Driver | CPI | Avg WS | Peak WS | Avg Pts Rate | Avg Top5 Rate | WDCs | WCCs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie | 1.400 | 0.700 | 0.900 | 80.0% | 100.0% | 2 | 2 |
| 2 | Toby | 1.200 | 0.600 | 0.800 | 70.0% | 100.0% | 0 | 2 |

## All-Time Weighted Score Rankings

| Rank | Driver | Season | W.Score | Win% | Pod% | Top5% | Pts/Race | FL% | Pole% | PtsRate | Part. | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie | S1 | 0.9000 | 75.0% | 100.0% | 100.0% | 25.0 | 75.0% | 50.0% | 90.0% | 100.0% | Yes | Yes |
| 2 | Toby | S1 | 0.4000 | 25.0% | 100.0% | 100.0% | 20.0 | 25.0% | 25.0% | 60.0% | 100.0% | | Yes |

## Season 1 Results

**Type:** Formula
**Car:** Tatuus FA01
**Venues:** Suzuka
**Races Per Venue:** 2
**WDC:** Josie
**WCC:** Josie + Toby

### Season Standings

| Pos | Driver | Points | Wins | Podiums | Poles | FLs | Races | Part. | Pts Rate | Top 5 Rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie **WDC** (WCC) | 50 | 1 | 2 | 1 | 2 | 2 | 100.0% | 90.0% | 100.0% |
| 2 | Toby (WCC) | 40 | 1 | 2 | 1 | 1 | 2 | 100.0% | 80.0% | 100.0% |

#### Venue 1: Suzuka

| Driver | R1 Pos | R1 Pts | R2 Pos | R2 Pts | Day Total |
| --- | --- | --- | --- | --- | --- |
| Josie | 1 (P,FL) | 25 | 2 (FL) | 18 | 43 |
| Toby | 2 | 18 | 1 (P) | 25 | 43 |

## Season 2 Results

**Type:** Formula
**Car:** Tatuus FA01
**Venues:** Suzuka
**Races Per Venue:** 2
**WDC:** Josie
**WCC:** Josie + Toby

### Season Standings

| Pos | Driver | Points | Wins | Podiums | Poles | FLs | Races | Part. | Pts Rate | Top 5 Rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Josie **WDC** (WCC) | 50 | 2 | 2 | 1 | 1 | 2 | 100.0% | 90.0% | 100.0% |
| 2 | Toby (WCC) | 40 | 0 | 2 | 0 | 0 | 2 | 100.0% | 80.0% | 100.0% |

#### Venue 1: Suzuka

| Driver | R1 Pos | R1 Pts | R2 Pos | R2 Pts | Day Total |
| --- | --- | --- | --- | --- | --- |
| Josie | 1 (P) | 25 | 1 | 25 | 50 |
| Toby | 3 | 15 | 2 | 18 | 33 |
`;

  const dataset = parseDataset("track.md", TRACK_MD, "test");
  const aggregates = buildTrackAggregates(dataset);
  const josie = aggregates.find((e) => e.driver === "Josie" && e.track === "Suzuka");
  const toby = aggregates.find((e) => e.driver === "Toby" && e.track === "Suzuka");

  it("accumulates starts, wins, podiums and points across seasons", () => {
    expect(josie.starts).toBe(4);
    expect(josie.wins).toBe(3); // R1 S1, R1 S2, R2 S2
    expect(josie.podiums).toBe(4);
    expect(josie.top5s).toBe(4);
    expect(josie.totalPoints).toBe(93);
  });

  it("counts poles and fastest laps parsed from position markers", () => {
    expect(josie.poles).toBe(2); // S1 R1 (P), S2 R1 (P)
    expect(josie.fastestLaps).toBe(2); // S1 R1 (FL), S1 R2 (FL)
    expect(toby.poles).toBe(1); // S1 R2 (P)
    expect(toby.fastestLaps).toBe(0);
  });

  it("computes average finishing position", () => {
    // Josie finishes: 1, 2, 1, 1 -> mean 1.25
    expect(josie.avgFinish).toBeCloseTo(1.25, 5);
    // Toby finishes: 2, 1, 3, 2 -> mean 2.0
    expect(toby.avgFinish).toBeCloseTo(2.0, 5);
  });

  it("tracks the seasons a driver appeared at the venue", () => {
    expect(josie.seasonIds.sort()).toEqual(["S1", "S2"]);
  });

  it("returns chronological per-race results with markers", () => {
    const races = getTrackRaceResults(dataset, "Suzuka");
    // 2 drivers x 2 seasons x 2 races = 8 race rows
    expect(races.length).toBe(8);
    // ordered S1 before S2
    expect(races[0].seasonId).toBe("S1");
    expect(races[races.length - 1].seasonId).toBe("S2");
    const firstJosie = races.find((r) => r.driver === "Josie");
    expect(firstJosie.pole).toBe(true);
    expect(firstJosie.fastestLap).toBe(true);
    expect(firstJosie.didStart).toBe(true);
  });

  it("filters race history to a single driver", () => {
    const josieRaces = getDriverTrackRaces(dataset, "Josie", "Suzuka");
    expect(josieRaces.length).toBe(4);
    expect(josieRaces.every((r) => r.driver === "Josie")).toBe(true);
    expect(josieRaces.map((r) => r.position)).toEqual([1, 2, 1, 1]);
  });
});

describe("getTrackList", () => {
  it("groups aggregates into distinct tracks sorted by name", () => {
    const aggregates = [
      { driver: "A", track: "Spa", starts: 4, seasonIds: ["S1", "S2"] },
      { driver: "B", track: "Spa", starts: 2, seasonIds: ["S2"] },
      { driver: "A", track: "Monza", starts: 3, seasonIds: ["S1"] },
    ];
    const list = getTrackList(aggregates);
    expect(list.map((t) => t.track)).toEqual(["Monza", "Spa"]);
    const spa = list.find((t) => t.track === "Spa");
    expect(spa.starts).toBe(6);
    expect(spa.driverCount).toBe(2);
    expect(spa.seasonCount).toBe(2);
  });
});

describe("getTrackLeaderboard", () => {
  it("filters to one track and ranks by wins then podiums then points", () => {
    const aggregates = [
      { driver: "A", track: "Spa", wins: 1, podiums: 3, top5s: 3, totalPoints: 90, avgFinish: 2 },
      { driver: "B", track: "Spa", wins: 3, podiums: 3, top5s: 3, totalPoints: 60, avgFinish: 1.5 },
      { driver: "C", track: "Monza", wins: 5, podiums: 5, top5s: 5, totalPoints: 200, avgFinish: 1 },
    ];
    const rows = getTrackLeaderboard(aggregates, "Spa");
    expect(rows.map((r) => r.driver)).toEqual(["B", "A"]);
    expect(rows.every((r) => r.track === "Spa")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Penalty placements (S21 Monza R4: James recorded at P99)
// ---------------------------------------------------------------------------

describe("isPenaltyPlacement", () => {
  const { isPenaltyPlacement, PENALTY_POSITION_MIN } = data;

  it("flags a position far outside any real field", () => {
    expect(isPenaltyPlacement(99)).toBe(true);
  });

  it("never flags a plausible finishing position", () => {
    // The largest field the league has ever run is 19.
    expect(isPenaltyPlacement(1)).toBe(false);
    expect(isPenaltyPlacement(19)).toBe(false);
    expect(isPenaltyPlacement(PENALTY_POSITION_MIN - 1)).toBe(false);
  });

  it("ignores non-numeric input", () => {
    expect(isPenaltyPlacement(null)).toBe(false);
    expect(isPenaltyPlacement("99")).toBe(false);
  });
});

describe("buildTrackAggregates — penalty placements", () => {
  const { buildTrackAggregates } = data;

  const dataset = {
    seasonDetails: [{
      seasonId: "S21",
      venues: [{
        venueName: "Monza",
        rows: [{
          driver: "James",
          races: [
            { position: "1", points: 30 },
            { position: "2", points: 25 },
            { position: "3", points: 22 },
            { position: "99", points: 1 },  // stewards' penalty placement
          ],
        }],
      }],
    }],
  };

  it("keeps the penalty race as a start but out of the average", () => {
    const entry = buildTrackAggregates(dataset).find((e) => e.driver === "James");
    expect(entry.starts).toBe(4);
    expect(entry.avgFinish).toBe(2);           // (1+2+3)/3, not (1+2+3+99)/4
    expect(entry.penaltyPlacements).toBe(1);
    expect(entry.finishSamples).toBe(3);
  });

  it("still counts its points and its win/podium tallies correctly", () => {
    const entry = buildTrackAggregates(dataset).find((e) => e.driver === "James");
    expect(entry.totalPoints).toBe(78);        // the 1 point survives
    expect(entry.wins).toBe(1);
    expect(entry.podiums).toBe(3);
  });
});
