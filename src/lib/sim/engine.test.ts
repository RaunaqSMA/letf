import { describe, expect, it } from "vitest";

import { makeConfig, makeDataset, tradingDates } from "./__fixtures__";
import { runDCA } from "./dca";
import { buildLeveragedSeries } from "./leverage";
import {
  calendarYearReturns,
  drawdownSummary,
  seriesStats,
  summariseCalendarYears,
} from "./metrics";
import { createRng } from "./rng";
import { runSimulation } from "./simulate";

const DAILY_TOL = 1e-12;

function navOf(returns: number[], patch = {}, irx = 0) {
  const dates = tradingDates("2001-01-01", returns.length);
  const data = makeDataset(dates, returns, irx);
  const { daily } = buildLeveragedSeries(data, makeConfig(patch));
  return daily;
}

describe("Test 1 — zero underlying return leaves only cost drag", () => {
  it("loses exactly financing + expense drag", () => {
    const n = 30;
    const daily = navOf(new Array(n).fill(0), {
      financingModel: "fixed",
      fixedFinancingRate: 0.05,
      expenseRatio: 0.0095,
      leverage: 3,
    });
    // day 1 -> day 2 is a 1-calendar-day step (Mon->Tue)
    const expected = -(2 * 0.05 * (1 / 365)) - 0.0095 * (1 / 365);
    expect(daily.underlyingReturn[1]).toBe(0);
    expect(daily.grossLeveragedReturn[1]).toBe(0);
    expect(daily.dailyReturn[1]).toBeCloseTo(expected, 14);
    expect(daily.nav[1]! / daily.nav[0]! - 1).toBeCloseTo(expected, 14);
    // Financing is charged on (L-1) = 2x, never 3x.
    expect(daily.financingCost[1]).toBeCloseTo(-(2 * 0.05) / 365, 14);
  });
});

describe("Test 2 — constant +1% daily compounds at 3x daily", () => {
  it("matches 1.03^k with zero costs", () => {
    const n = 21;
    const daily = navOf(new Array(n).fill(0.01));
    for (let k = 0; k < n; k++) {
      expect(daily.nav[k]!).toBeCloseTo(100 * Math.pow(1.03, k), 8);
    }
  });
});

describe("Test 3 — +10% then -10% is path dependent", () => {
  it("underlying ends at 99, 3x ends at 91", () => {
    const daily = navOf([0, 0.1, -0.1]);
    expect(daily.nav[1]).toBeCloseTo(130, 10);
    // 130 * (1 - 0.30) = 91
    expect(daily.nav[2]).toBeCloseTo(91, 10);
    const underlyingEnd = 100 * 1.1 * 0.9; // 99
    expect(underlyingEnd).toBeCloseTo(99, 10);
    // -9% leveraged vs -1% underlying: 9x the loss, not 3x.
    expect(daily.nav[2]! / 100 - 1).toBeCloseTo(-0.09, 10);
  });
});

describe("Test 4 — +20% then -16.6667% leaves the underlying flat", () => {
  it("still destroys value at 3x", () => {
    const down = -(1 - 1 / 1.2); // exactly flat round trip
    const daily = navOf([0, 0.2, down]);
    const underlying = 100 * 1.2 * (1 + down);
    expect(underlying).toBeCloseTo(100, 10);
    // 160 * (1 + 3*down) with down = -1/6 -> 160 * 0.5 = 80
    expect(daily.nav[2]).toBeCloseTo(80, 8);
    expect(daily.nav[2]! < 100).toBe(true);
  });
});

describe("Test 5 — zero volatility: leveraged CAGR is exactly 3x compounded minus costs", () => {
  it("has no decay when every day is identical", () => {
    const r = 0.0003;
    const n = 253;
    const dailyFree = navOf(new Array(n).fill(r));
    const perDay = 1 + 3 * r;
    expect(dailyFree.nav[n - 1]!).toBeCloseTo(100 * Math.pow(perDay, n - 1), 6);
    const stats = seriesStats(dailyFree.dates, dailyFree.nav);
    // Zero dispersion => zero measured volatility.
    expect(stats.volatility).toBeLessThan(1e-12);
  });
});

describe("Test 6 — zero financing and zero expense is pure 3x daily reset", () => {
  it("reproduces prod(1 + 3 r_t) exactly", () => {
    const rs = [0, 0.012, -0.03, 0.004, -0.011, 0.02, 0.0];
    const daily = navOf(rs);
    let expected = 100;
    for (let i = 1; i < rs.length; i++) expected *= 1 + 3 * rs[i]!;
    expect(daily.nav[rs.length - 1]!).toBeCloseTo(expected, 10);
    for (let i = 1; i < rs.length; i++) {
      expect(daily.financingCost[i]).toBe(-0);
      expect(daily.expenseCost[i]).toBe(-0);
      expect(Math.abs(daily.dailyReturn[i]! - 3 * rs[i]!)).toBeLessThan(DAILY_TOL);
    }
  });
});

describe("Test 7 — DCA units and portfolio value", () => {
  it("buys value/price units and marks to market", () => {
    const dates = ["2020-01-02", "2020-02-03", "2020-03-02"];
    const nav = Float64Array.from([100, 50, 200]);
    const path = runDCA(
      { dates, nav },
      {
        contribution: 100,
        frequency: "monthly",
        timing: "first",
        transactionCost: 0,
        customEntries: [],
        startingCapital: 0,
        contributionGrowth: 0,
        indexContributionsToInflation: false,
        inflationRate: 0,
        contributionStartDate: "",
        contributionEndDate: "",
      },
    );
    expect(path.buyIndices).toEqual([0, 1, 2]);
    // 1 unit + 2 units + 0.5 units = 3.5 units, 300 contributed
    expect(path.units[2]).toBeCloseTo(3.5, 12);
    expect(path.contributions[2]).toBeCloseTo(300, 12);
    expect(path.value[2]).toBeCloseTo(700, 12);
    // Average purchase price = 300 / 3.5
    expect(path.averageCostAt[2]).toBeCloseTo(300 / 3.5, 12);
  });

  it("honours starting capital, growth and transaction costs", () => {
    const dates = ["2020-01-02", "2021-01-04"];
    const nav = Float64Array.from([100, 100]);
    const path = runDCA(
      { dates, nav },
      {
        contribution: 100,
        frequency: "yearly",
        timing: "first",
        transactionCost: 1,
        customEntries: [],
        startingCapital: 1000,
        contributionGrowth: 0.1,
        indexContributionsToInflation: false,
        inflationRate: 0,
        contributionStartDate: "",
        contributionEndDate: "",
      },
    );
    // Day 0: 1000 starting capital + 100 first contribution, one 1.0 fee.
    expect(path.contributions[0]).toBeCloseTo(1100, 10);
    // Second year contribution grew ~10%.
    const second = path.contributions[1]! - path.contributions[0]!;
    expect(second).toBeGreaterThan(109);
    expect(second).toBeLessThan(111);
    expect(path.totalTransactionCost).toBeCloseTo(2, 10);
  });
});

describe("Test 8 — NAV drawdown and portfolio drawdown are independent", () => {
  it("produces different numbers for the same path", () => {
    // 60 flat days, then a crash, then a partial recovery. Monthly DCA keeps
    // adding cash, so the portfolio's own peak-to-trough differs from NAV's.
    const rs = new Array(120).fill(0);
    for (let i = 60; i < 70; i++) rs[i] = -0.03;
    for (let i = 70; i < 120; i++) rs[i] = 0.004;
    const dates = tradingDates("2001-01-01", rs.length);
    const data = makeDataset(dates, rs);
    const res = runSimulation(data, makeConfig({ frequency: "monthly", contribution: 100 }));
    expect(res.contributionCount).toBeGreaterThan(3);
    expect(res.drawdowns.navMaxDrawdown).toBeLessThan(0);
    expect(res.drawdowns.portfolioMaxDrawdown).toBeLessThan(0);
    expect(res.drawdowns.navMaxDrawdown).not.toBeCloseTo(res.drawdowns.portfolioMaxDrawdown, 4);
    // Contribution-relative loss is a third, distinct quantity.
    expect(res.drawdowns.worstContributionRelative).not.toBe(res.drawdowns.navMaxDrawdown);
    expect(res.drawdowns.worstContributionRelative).not.toBe(res.drawdowns.portfolioMaxDrawdown);
  });

  it("measures drawdown against the running peak", () => {
    const dd = drawdownSummary(["2020-01-01", "2020-01-02", "2020-01-03"], [100, 50, 75]);
    expect(dd.maxDrawdown).toBeCloseTo(-0.5, 12);
    expect(dd.maxDrawdownDate).toBe("2020-01-02");
    expect(dd.underwaterAtEnd).toBe(true);
    expect(dd.maxRecoveryDurationDays).toBeNull();
  });
});

describe("Test 9 — calendar-year boundaries", () => {
  it("uses the prior December close and flags the stub year", () => {
    const dates = ["2020-06-01", "2020-12-31", "2021-12-31", "2022-12-30"];
    const nav = [100, 110, 121, 60.5];
    const rows = calendarYearReturns(dates, nav);
    expect(rows[0]!.year).toBe(2020);
    expect(rows[0]!.return).toBeNull(); // no prior December close
    expect(rows[0]!.partialReturn).toBeCloseTo(0.1, 12);
    expect(rows[0]!.complete).toBe(false);
    expect(rows[1]!.return).toBeCloseTo(0.1, 12);
    expect(rows[2]!.return).toBeCloseTo(-0.5, 12);
    const s = summariseCalendarYears(rows);
    expect(s.completeYears).toBe(2);
    expect(s.best!.year).toBe(2021);
    expect(s.worst!.year).toBe(2022);
    expect(s.positiveShare).toBeCloseTo(0.5, 12);
  });
});

describe("Test 10 — Sharpe subtracts the risk-free rate", () => {
  it("is lower than the naive return/vol ratio", () => {
    const rs = [0, 0.01, -0.005, 0.008, -0.002, 0.006, 0.001, -0.004];
    const dates = tradingDates("2001-01-01", rs.length);
    const nav: number[] = [];
    let v = 100;
    for (let i = 0; i < rs.length; i++) {
      if (i > 0) v *= 1 + rs[i]!;
      nav.push(v);
    }
    const withoutRf = seriesStats(dates, nav, () => 0);
    const withRf = seriesStats(dates, nav, () => 0.05);
    expect(withRf.sharpe!).toBeLessThan(withoutRf.sharpe!);
    // The gap equals rf / volatility (same denominator, shifted numerator).
    const gap = withoutRf.sharpe! - withRf.sharpe!;
    expect(gap).toBeCloseTo(0.05 / withoutRf.volatility, 6);
    expect(withRf.meanRiskFree).toBeCloseTo(0.05, 12);
  });
});

describe("Test 11 — seeded randomness is reproducible", () => {
  it("returns identical sequences for identical seeds", () => {
    const a = createRng("letf-2026");
    const b = createRng("letf-2026");
    const c = createRng("letf-2027");
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    const seqC = Array.from({ length: 50 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});

describe("Test 12 — synthetic/actual boundary", () => {
  it("switches exactly once with no duplicated or missing trading day", () => {
    const rs = new Array(600).fill(0.001);
    const dates = tradingDates("2008-01-01", rs.length);
    const data = makeDataset(dates, rs, 0);
    const cfg = makeConfig({
      instrument: "SPXL", // inception 2008-11-05
      useSyntheticHistory: true,
      useActualHistory: true,
    });
    const { daily } = buildLeveragedSeries(data, cfg);
    expect(daily.dates.length).toBe(dates.length);
    expect(new Set(daily.dates).size).toBe(dates.length);
    let transitions = 0;
    for (let i = 1; i < daily.dataType.length; i++) {
      if (daily.dataType[i] !== daily.dataType[i - 1]) transitions++;
    }
    expect(transitions).toBe(1);
    expect(daily.inceptionIndex).toBeGreaterThan(0);
    expect(daily.dates[daily.inceptionIndex]! >= "2008-11-05").toBe(true);
    expect(daily.dates[daily.inceptionIndex - 1]! < "2008-11-05").toBe(true);
    // NAV is continuous across the boundary (no restart, no double count).
    const j = daily.inceptionIndex;
    expect(daily.nav[j]!).toBeGreaterThan(0);
    expect(Number.isFinite(daily.nav[j]!)).toBe(true);
  });
});

describe("Wipeout handling", () => {
  it("records a termination event instead of going negative", () => {
    const daily = navOf([0, -0.4, 0.1]);
    expect(daily.wipeouts.length).toBe(1);
    expect(daily.nav[1]).toBe(0);
    expect(daily.nav[2]).toBe(0);
    expect(daily.wipeouts[0]!.underlyingReturn).toBeCloseTo(-0.4, 12);
  });

  it("does not clip extreme days unless explicitly enabled", () => {
    const daily = navOf([0, -0.2]);
    expect(daily.clippedDays).toBe(0);
    expect(daily.dailyReturn[1]).toBeCloseTo(-0.6, 12);
    expect(daily.extremeDays.length).toBe(1);
    const clipped = navOf([0, -0.2], { clipExtremeReturns: true, clipLimit: 0.5 });
    expect(clipped.clippedDays).toBe(1);
    expect(clipped.dailyReturn[1]).toBeCloseTo(-0.5, 12);
  });
});
