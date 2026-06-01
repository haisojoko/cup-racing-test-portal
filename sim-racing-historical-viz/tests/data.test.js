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
