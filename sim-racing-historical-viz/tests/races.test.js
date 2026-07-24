import { describe, it, expect } from "vitest";

// views-races.js expects a couple of globals defined by other script files at
// runtime (uniqueList from data.js, seriesColor from app.js). Provide them.
globalThis.uniqueList = (arr) => Array.from(new Set(arr));
globalThis.seriesColor = (i) => `color-${i}`;

const races = require("../scripts/views-races.js");
const {
  isValidLap, fmtLap, lapTimeDomain, describeDelta,
  raceSeasonKey, sortedRaceSeasonIds, collectSeasonRaces, seasonDriverList,
  buildBattleSeries, laneTicks,
  computeFastestLaps, computePaceRows, computeOvertakeTallies, computeQualGaps,
  computeHeadToHead, computeH2HQualRows, computeH2HRaceRows, overtakesMadeBy,
  computeCrashMatrix,
  medianOf, cleanLapPool, lapDeviation, fmtDeviation, computeGridToFlagRows,
} = races;

// ---- lap value helpers ----

describe("isValidLap", () => {
  it("accepts realistic lap times", () => {
    expect(isValidLap(134001)).toBe(true);
    expect(isValidLap(58204)).toBe(true);
  });
  it("rejects zero, negatives, non-numbers, and absurd outliers", () => {
    expect(isValidLap(0)).toBe(false);
    expect(isValidLap(-5)).toBe(false);
    expect(isValidLap(600001)).toBe(false);
    expect(isValidLap(null)).toBe(false);
    expect(isValidLap("134001")).toBe(false);
    expect(isValidLap(Infinity)).toBe(false);
  });
});

describe("fmtLap", () => {
  it("formats sub-minute and over-minute laps", () => {
    expect(fmtLap(134001)).toBe("2:14.001");
    expect(fmtLap(58204)).toBe("58.204");
    expect(fmtLap(60000)).toBe("1:00.000");
  });
  it("returns a dash for invalid input", () => {
    expect(fmtLap(0)).toBe("—");
    expect(fmtLap(null)).toBe("—");
  });
});

describe("lapTimeDomain", () => {
  it("clips high outliers out of the upper bound", () => {
    const values = [90000, 91000, 92000, 91500, 90500, 447000];
    const { lo, hi } = lapTimeDomain(values);
    expect(lo).toBeLessThanOrEqual(90000);
    expect(hi).toBeLessThan(447000);
  });
  it("handles an empty pool", () => {
    expect(lapTimeDomain([])).toEqual({ lo: 0, hi: 1 });
  });
});

// ---- season/selection helpers ----

describe("raceSeasonKey / sortedRaceSeasonIds", () => {
  it("sorts numerically with suffix ordering", () => {
    const index = { seasons: { S18b: {}, S4: {}, S18a: {}, S10: {} } };
    expect(sortedRaceSeasonIds(index)).toEqual(["S4", "S10", "S18a", "S18b"]);
  });
});

const fixtureSeason = {
  season: "S99",
  events: [
    {
      eventId: "e2", venue: "Sonoma", venueOrder: 2, date: "2024-02-01",
      qualifying: { qual1: { times: { A: { bestMs: 91000 }, B: { bestMs: 91500 }, C: { bestMs: 90000 } } } },
      races: {
        "1": {
          grid: ["C", "A", "B"],
          gridConfidence: "high",
          result: [
            { driver: "C", position: 1, bestLapMs: 90000 },
            { driver: "A", position: 2, bestLapMs: 90500 },
            { driver: "B", position: 3, bestLapMs: 92000 },
          ],
          positions: { C: [1, 1], A: [2, 2], B: [3, 3] },
          laps: { C: [95000, 90000], A: [96000, 90500], B: [97000, 92000] },
          pace: { C: { avgMs: 92500, bestMs: 90000, lapsUsed: 2 }, A: { avgMs: 93250, bestMs: 90500, lapsUsed: 2 }, B: { avgMs: 94500, bestMs: 92000, lapsUsed: 2 } },
          overtakes: [
            { lap: 1, driver: "A", passed: "B" },
            { lap: 2, driver: "C", passed: "A" },
            { lap: 2, driver: "A", passed: "C" },
          ],
          contacts: [
            { driver1: "A", driver2: "B", impactSpeed: 12 },
            { driver1: "A", driver2: "C", impactSpeed: 5 },
          ],
        },
      },
    },
    {
      eventId: "e1", venue: "Monza", venueOrder: 1, date: "2024-01-01",
      qualifying: {},
      races: {
        "1": {
          grid: ["A", "B"], gridConfidence: "high",
          result: [{ driver: "A", position: 1, bestLapMs: 88000 }, { driver: "B", position: 2, bestLapMs: 89000 }],
          positions: { A: [1], B: [2] },
          laps: { A: [88000], B: [89000] },
          pace: { A: { avgMs: 88000 }, B: { avgMs: 89000 } },
          overtakes: [],
        },
      },
    },
  ],
};

describe("collectSeasonRaces", () => {
  it("flattens events in venueOrder then race number", () => {
    const races = collectSeasonRaces(fixtureSeason);
    expect(races.map((r) => `${r.venue}#${r.raceId}`)).toEqual(["Monza#1", "Sonoma#1"]);
  });
});

describe("seasonDriverList", () => {
  it("returns sorted unique drivers across every race", () => {
    expect(seasonDriverList(fixtureSeason)).toEqual(["A", "B", "C"]);
  });
});

// ---- per-race computations ----

describe("buildBattleSeries", () => {
  it("prepends the grid slot as lap 0", () => {
    const race = fixtureSeason.events[0].races["1"];
    const battle = buildBattleSeries(race);
    const c = battle.series.find((s) => s.driver === "C");
    expect(c.points[0]).toEqual({ lap: 0, position: 1 });
    expect(battle.maxLaps).toBe(2);
    expect(battle.driverCount).toBe(3);
  });
});

describe("laneTicks", () => {
  it("always includes grid (0) and the final lap", () => {
    const ticks = laneTicks(12);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(12);
  });
});

describe("computeFastestLaps", () => {
  it("sorts by best lap and computes gap to fastest", () => {
    const rows = computeFastestLaps(fixtureSeason.events[0].races["1"]);
    expect(rows.map((r) => r.driver)).toEqual(["C", "A", "B"]);
    expect(rows[0].gapMs).toBe(0);
    expect(rows[1].gapMs).toBe(500);
  });
});

describe("computePaceRows", () => {
  it("ranks by average pace and derives spread + gap", () => {
    const rows = computePaceRows(fixtureSeason.events[0].races["1"]);
    expect(rows[0].driver).toBe("C");
    expect(rows[0].rank).toBe(1);
    expect(rows[0].gapMs).toBe(0);
    expect(rows[1].gapMs).toBe(750);
    // Lap 1 (95000) is not part of the counted pool, so the one remaining lap
    // is both best and slowest. This previously read 5000 because the slowest
    // lap was taken from the raw list while the best came from the clean one.
    expect(rows[0].spreadMs).toBe(0);
  });
});

// Enough laps per driver to exercise the clean-lap pool and the deviation
// stats. Steady laps within a tenth; Scrappy swings by three seconds. Both
// have a slow lap 1, and Scrappy also has an off-track lap far over 120% of
// their median — neither should reach the counted pool.
const paceRace = {
  grid: ["Steady", "Scrappy"],
  result: [
    { driver: "Steady", position: 1, bestLapMs: 90000 },
    { driver: "Scrappy", position: 2, bestLapMs: 90000 },
  ],
  laps: {
    Steady: [120000, 90000, 90100, 90200],
    Scrappy: [120000, 90000, 93000, 96000, 200000],
  },
  pace: {},
};

describe("cleanLapPool", () => {
  it("drops lap 1 and laps slower than 120% of the median", () => {
    expect(cleanLapPool(paceRace.laps.Steady)).toEqual([90000, 90100, 90200]);
    expect(cleanLapPool(paceRace.laps.Scrappy)).toEqual([90000, 93000, 96000]);
  });
  it("returns nothing when there is no lap beyond the first", () => {
    expect(cleanLapPool([95000])).toEqual([]);
    expect(cleanLapPool([])).toEqual([]);
    expect(cleanLapPool(undefined)).toEqual([]);
  });
  it("ignores invalid lap values", () => {
    expect(cleanLapPool([120000, 90000, 0, 90100])).toEqual([90000, 90100]);
  });
});

describe("medianOf", () => {
  it("averages the middle pair on even-length input", () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([])).toBe(null);
  });
});

describe("lapDeviation", () => {
  it("measures how far laps sit from their own average", () => {
    const steady = lapDeviation([90000, 90100, 90200]);
    expect(Math.round(steady.stdevMs)).toBe(82);
    expect(steady.cvPct).toBeCloseTo(0.0906, 3);
    const scrappy = lapDeviation([90000, 93000, 96000]);
    expect(Math.round(scrappy.stdevMs)).toBe(2449);
  });
  it("is null when there are fewer than two laps to compare", () => {
    expect(lapDeviation([90000])).toEqual({ stdevMs: null, cvPct: null });
    expect(lapDeviation([])).toEqual({ stdevMs: null, cvPct: null });
  });
});

describe("computePaceRows deviation", () => {
  const rows = computePaceRows(paceRace);
  it("reports deviation from each driver's own average", () => {
    expect(rows.map((r) => r.driver)).toEqual(["Steady", "Scrappy"]);
    expect(rows[0].stdevMs).toBe(82);
    expect(rows[1].stdevMs).toBe(2449);
  });
  it("keeps spread on the same counted laps as best and average", () => {
    expect(rows[0].spreadMs).toBe(200); // excludes the 120000 opening lap
    expect(rows[1].spreadMs).toBe(6000); // excludes the 200000 off-track lap
  });
  it("separates drivers that a raw best-to-slowest spread would not", () => {
    // The whole point of the column: same best lap, very different consistency.
    expect(rows[0].bestMs).toBe(rows[1].bestMs);
    expect(rows[1].stdevMs).toBeGreaterThan(rows[0].stdevMs * 10);
  });
});

describe("computeGridToFlagRows", () => {
  const race = {
    grid: ["C", "B", "A", "Ghost"],
    result: [
      { driver: "A", position: 1 },
      { driver: "B", position: 2 },
      { driver: "C", position: 3 },
      { driver: "D", position: 4 },
    ],
    qualVsRace: {
      A: { qualPosition: 1, finishPosition: 1, delta: 0 },
      B: { qualPosition: 2, finishPosition: 2, delta: 0 },
      C: { qualPosition: 3, finishPosition: 3, delta: 0 },
    },
  };
  const rows = computeGridToFlagRows(race);

  it("measures movement from the actual starting slot, biggest gain first", () => {
    expect(rows.map((r) => r.driver)).toEqual(["A", "B", "C", "D"]);
    expect(rows[0]).toMatchObject({ startPos: 3, finishPos: 1, moved: 2 });
    expect(rows[1].moved).toBe(0);
    expect(rows[2]).toMatchObject({ startPos: 1, finishPos: 3, moved: -2 });
  });

  it("keeps the qualifying slot alongside so reversed grids stay readable", () => {
    // A started 3rd but qualified 1st: gained 2 on track, lost nothing to the
    // field they had already beaten. qualVsRace alone would report delta 0.
    expect(rows[0].qualPos).toBe(1);
    expect(rows[0].qualDelta).toBe(0);
    expect(rows[0].moved).toBe(2);
  });

  it("sorts drivers with no recorded start last instead of ahead of losses", () => {
    const d = rows.find((r) => r.driver === "D");
    expect(d.startPos).toBe(null);
    expect(d.moved).toBe(null);
    expect(rows[rows.length - 1].driver).toBe("D");
  });

  it("omits grid entries that never appear in the result", () => {
    expect(rows.some((r) => r.driver === "Ghost")).toBe(false);
  });
});

describe("computeOvertakeTallies", () => {
  it("counts passes made and suffered per driver", () => {
    const rows = computeOvertakeTallies(fixtureSeason.events[0].races["1"]);
    const a = rows.find((r) => r.driver === "A");
    expect(a.made).toBe(2);
    expect(a.suffered).toBe(1);
    expect(a.net).toBe(1);
    const b = rows.find((r) => r.driver === "B");
    expect(b.made).toBe(0);
    expect(b.suffered).toBe(1);
  });
});

describe("computeQualGaps", () => {
  it("sorts by best qual lap with gap to pole", () => {
    const rows = computeQualGaps(fixtureSeason.events[0].qualifying.qual1);
    expect(rows.map((r) => r.driver)).toEqual(["C", "A", "B"]);
    expect(rows[0].gapMs).toBe(0);
    expect(rows[1].gapMs).toBe(1000);
  });
});

describe("computeHeadToHead", () => {
  it("tallies shared races, finishes, wins, pace, and overtakes", () => {
    const h2h = computeHeadToHead(fixtureSeason, "A", "B");
    expect(h2h.together).toBe(2); // both raced Monza and Sonoma
    expect(h2h.aAhead).toBe(2);
    expect(h2h.bAhead).toBe(0);
    expect(h2h.aWins).toBe(1); // Monza
    expect(h2h.bWins).toBe(0);
    expect(h2h.aBestLap).toBe(88000);
    expect(h2h.races.length).toBe(2);
    expect(h2h.aTotalOt).toBe(2); // A made 2 passes in Sonoma R1
    expect(h2h.bTotalOt).toBe(0);
    expect(h2h.aOutqual).toBe(1); // A faster than B in Sonoma qual
    expect(h2h.bOutqual).toBe(0);
  });

  it("averages lap deviation as a share of pace so venues weigh equally", () => {
    const season = {
      season: "S98",
      events: [
        {
          eventId: "e1", venue: "Short", venueOrder: 1,
          qualifying: {},
          races: {
            "1": {
              result: [{ driver: "A", position: 1 }, { driver: "B", position: 2 }],
              // Same absolute scatter at both venues, but the second venue's
              // laps are ~4x longer, so a raw millisecond average would let
              // the long track dominate. As a share of pace, A stays at 1%.
              laps: { A: [99000, 49500, 50500], B: [99000, 50000, 50000] },
              pace: {},
              overtakes: [],
            },
          },
        },
        {
          eventId: "e2", venue: "Long", venueOrder: 2,
          qualifying: {},
          races: {
            "1": {
              result: [{ driver: "A", position: 1 }, { driver: "B", position: 2 }],
              laps: { A: [400000, 198000, 202000], B: [400000, 200000, 200000] },
              pace: {},
              overtakes: [],
            },
          },
        },
      ],
    };
    const h2h = computeHeadToHead(season, "A", "B");
    expect(h2h.aAvgDevPct).toBeCloseTo(1, 5); // 1% at both venues
    expect(h2h.bAvgDevPct).toBe(0); // metronomic
    expect(h2h.aDevRaces).toBe(2);
  });

  it("leaves average deviation null when no race has enough laps", () => {
    const h2h = computeHeadToHead(fixtureSeason, "A", "B");
    expect(h2h.aAvgDevPct).toBe(null);
  });
});

describe("overtakesMadeBy", () => {
  it("counts only passes made by the driver", () => {
    const race = fixtureSeason.events[0].races["1"];
    expect(overtakesMadeBy(race, "A")).toBe(2);
    expect(overtakesMadeBy(race, "B")).toBe(0);
    expect(overtakesMadeBy(race, "C")).toBe(1);
  });
});

describe("computeH2HQualRows", () => {
  it("returns one row per quali session with a signed delta", () => {
    const rows = computeH2HQualRows(fixtureSeason, "A", "B");
    expect(rows.length).toBe(1); // only Sonoma had qualifying
    expect(rows[0].aMs).toBe(91000);
    expect(rows[0].bMs).toBe(91500);
    expect(rows[0].deltaMs).toBe(-500); // A faster
  });
});

describe("computeH2HRaceRows", () => {
  it("returns per-race FL gap, pace delta, and overtakes for shared races", () => {
    const rows = computeH2HRaceRows(fixtureSeason, "A", "B");
    expect(rows.length).toBe(2); // both raced Monza + Sonoma
    const sonoma = rows.find((r) => r.race.includes("Sonoma"));
    expect(sonoma.flDeltaMs).toBe(-1500); // A best 90500 vs B 92000
    expect(sonoma.aPace).toBe(93250);
    expect(sonoma.bPace).toBe(94500);
    expect(sonoma.paceDeltaMs).toBe(-1250); // A 93250 vs B 94500
    expect(sonoma.aOt).toBe(2);
    expect(sonoma.bOt).toBe(0);
  });
});

describe("describeDelta", () => {
  it("names the faster driver and the gap", () => {
    expect(describeDelta(null, "Josie", "Toby")).toEqual({ text: "—", side: null });
    expect(describeDelta(0, "Josie", "Toby")).toEqual({ text: "even", side: null });
    expect(describeDelta(-500, "Josie", "Toby")).toEqual({ text: "Josie by 0.500s", side: "first" });
    expect(describeDelta(1250, "Josie", "Toby")).toEqual({ text: "Toby by 1.250s", side: "second" });
  });
});

describe("computeCrashMatrix", () => {
  it("counts contact involvement per driver per race and totals", () => {
    const model = computeCrashMatrix(fixtureSeason);
    expect(model.totalContacts).toBe(2); // both in Sonoma R1
    const a = model.rows.find((r) => r.driver === "A");
    expect(a.total).toBe(2); // A in both contacts
    const b = model.rows.find((r) => r.driver === "B");
    expect(b.total).toBe(1);
    // Monza had no contacts, so only Sonoma's column carries counts.
    const sonomaCol = model.cols.find((c) => c.venue === "Sonoma").key;
    expect(a[sonomaCol]).toBe(2);
    expect(model.max).toBe(2);
  });
});
