import type { MarketDataset, MarketSeries, SeriesKey } from "@/lib/market/types";
import { DEFAULT_STRESS_FINANCING } from "./financing";
import type { SimulationConfig } from "./types";

/** Consecutive weekday dates starting at `start` (skips Sat/Sun). */
export function tradingDates(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function seriesFromReturns(
  symbol: string,
  dates: string[],
  returns: number[],
  base = 100,
): MarketSeries {
  const close: number[] = [];
  let v = base;
  for (let i = 0; i < dates.length; i++) {
    if (i > 0) v *= 1 + (returns[i] ?? 0);
    close.push(v);
  }
  return {
    symbol,
    source: "fixture",
    retrieved: "2026-01-01",
    dates,
    close,
    adjClose: [...close],
  };
}

export function flatSeries(symbol: string, dates: string[], value: number): MarketSeries {
  return {
    symbol,
    source: "fixture",
    retrieved: "2026-01-01",
    dates,
    close: dates.map(() => value),
    adjClose: dates.map(() => value),
  };
}

/**
 * Builds a dataset where every underlying series follows `returns` and the
 * T-bill yield is a constant `irxPercent` (in percent, matching ^IRX).
 */
export function makeDataset(
  dates: string[],
  returns: number[],
  irxPercent = 0,
  actualReturns?: number[],
): MarketDataset {
  const under = seriesFromReturns("UNDER", dates, returns);
  const actual = seriesFromReturns("ACTUAL", dates, actualReturns ?? returns);
  const keys: SeriesKey[] = ["ndx", "spx", "qqq", "spy", "tqqq", "spxl"];
  const out = { issues: [] } as unknown as MarketDataset;
  for (const k of keys) out[k] = k === "tqqq" || k === "spxl" ? actual : under;
  out.irx = flatSeries("^IRX", dates, irxPercent);
  return out;
}

export function makeConfig(patch: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    instrument: "TQQQ",
    startDate: "1900-01-01",
    endDate: "2999-12-31",
    contribution: 100,
    frequency: "monthly",
    timing: "first",
    leverage: 3,
    financingModel: "none",
    fixedFinancingRate: 0,
    financingSpread: 0,
    stressFinancing: DEFAULT_STRESS_FINANCING,
    financingShift: 0,
    expenseRatio: 0,
    expenseSchedule: [],
    reinvestDistributions: true,
    useSyntheticHistory: true,
    useActualHistory: false,
    underlyingMode: "total_return",
    transactionCost: 0,
    slippageDrag: 0,
    calibrationMode: "theoretical",
    conservativeExtraDrag: 0,
    clipExtremeReturns: false,
    clipLimit: 0.9,
    startingCapital: 0,
    contributionGrowth: 0,
    indexContributionsToInflation: false,
    inflationRate: 0,
    contributionStartDate: "",
    contributionEndDate: "",
    customEntries: [],
    fxRate: 1,
    fxLabel: "USD",
    ...patch,
  };
}
