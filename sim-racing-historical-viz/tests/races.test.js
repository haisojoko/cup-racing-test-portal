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
    expect(rows[0].spreadMs).toBe(5000); // 95000 - 90000
    expect(rows[1].gapMs).toBe(750);
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
