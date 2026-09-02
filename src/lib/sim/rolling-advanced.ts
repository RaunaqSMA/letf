/**
 * Research-grade rolling-window analysis.
 *
 * Every window is an independent experiment: "if I had started here and held
 * for N years, what happened?". Because overlapping windows are not
 * independent samples, the reported percentages are described everywhere as
 * *historical frequencies within overlapping windows*, never as probabilities
 * of the future.
 */

import { contributionIndices } from "./dca";
import {
  cagrOf,
  dayDiff,
  drawdownSummary,
  medianOf,
  meanOf,
  percentileOf,
  yearFraction,
  TRADING_DAYS,
} from "./metrics";
import type { DailySeries, SimulationConfig } from "./types";
import { xirr, type CashFlow } from "./xirr";

export const ROLLING_HORIZONS = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50];

export interface WindowResult {
  start: string;
  end: string;
  years: number;
  /** Buy-and-hold CAGR of the leveraged NAV over the window. */
  navCagr: number | null;
  /** Buy-and-hold CAGR of the unlevered underlying over the same window. */
  underlyingCagr: number | null;
  /** Money-weighted return of a DCA plan run inside the window. */
  dcaXirr: number | null;
  /** Final DCA value / total contributions. */
  multiple: number;
  volatility: number;
  navMaxDrawdown: number;
  portfolioMaxDrawdown: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  /** Calendar days from the window's worst peak to full recovery, if any. */
  recoveryDays: number | null;
  endedBelowContributions: boolean;
  /** Fraction of the window that is synthetic reconstruction. */
  syntheticShare: number;
}

export interface Distribution {
  n: number;
  min: number | null;
  p1: number | null;
  p5: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  mean: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export function describe(values: number[]): Distribution {
  const clean = values.filter((v) => Number.isFinite(v));
  const s = [...clean].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s.length ? s[0]! : null,
    p1: percentileOf(s, 0.01),
    p5: percentileOf(s, 0.05),
    p10: percentileOf(s, 0.1),
    p25: percentileOf(s, 0.25),
    median: percentileOf(s, 0.5),
    mean: s.length ? meanOf(s) : null,
    p75: percentileOf(s, 0.75),
    p90: percentileOf(s, 0.9),
    p95: percentileOf(s, 0.95),
    p99: percentileOf(s, 0.99),
    max: s.length ? s[s.length - 1]! : null,
  };
}

export interface HorizonSummary {
  years: number;
  windows: number;
  overlapping: true;
  cagr: Distribution;
  xirr: Distribution;
  multiple: Distribution;
  navMaxDrawdown: Distribution;
  volatility: Distribution;
  sharpe: Distribution;
  /** Historical frequencies within the (overlapping) window sample. */
  shareCagrPositive: number;
  shareBeatUnderlying: number;
  shareCagrAbove8: number;
  shareCagrAbove10: number;
  shareDrawdownOver50: number;
  shareDrawdownOver80: number;
  shareEndedBelowContributions: number;
  firstStart: string;
  lastStart: string;
}

type PlanConfig = Pick<
  SimulationConfig,
  "contribution" | "frequency" | "timing"
>;

/** Runs one window over a precomputed path. Cheap enough for hundreds of windows. */
export function evaluateWindow(
  daily: Pick<DailySeries, "dates" | "nav" | "dataType">,
  underlyingNav: ArrayLike<number> | null,
  buySet: Set<number>,
  startIdx: number,
  endIdx: number,
  contribution: number,
  riskFreeAt?: (d: string) => number,
): WindowResult {
  const dates = daily.dates;
  const years = yearFraction(dates[startIdx]!, dates[endIdx]!);

  let units = 0;
  let contrib = 0;
  let peak = 0;
  let portMaxDD = 0;
  const flows: CashFlow[] = [];
  const rets: number[] = [];
  const excess: number[] = [];
  let synthetic = 0;

  const navSlice: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const p = daily.nav[i]!;
    navSlice.push(p);
    if (daily.dataType[i] === 0) synthetic++;
    if (buySet.has(i) && p > 0) {
      units += contribution / p;
      contrib += contribution;
      flows.push({ date: dates[i]!, amount: -contribution });
    }
    const v = units * p;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < portMaxDD) portMaxDD = dd;
    }
    if (i > startIdx) {
      const prev = daily.nav[i - 1]!;
      if (prev > 0 && Number.isFinite(p)) {
        const r = p / prev - 1;
        rets.push(r);
        const rf = riskFreeAt ? riskFreeAt(dates[i]!) : 0;
        excess.push(r - rf / TRADING_DAYS);
      }
    }
  }

  const finalValue = units * daily.nav[endIdx]!;
  if (contrib > 0) flows.push({ date: dates[endIdx]!, amount: finalValue });

  const mean = meanOf(rets);
  let varSum = 0;
  for (const r of rets) varSum += (r - mean) * (r - mean);
  const sd = rets.length ? Math.sqrt(varSum / rets.length) : 0;
  const volatility = sd * Math.sqrt(TRADING_DAYS);

  const meanEx = meanOf(excess);
  let exVar = 0;
  let downSq = 0;
  for (const e of excess) {
    exVar += (e - meanEx) * (e - meanEx);
    if (e < 0) downSq += e * e;
  }
  const exSd = excess.length ? Math.sqrt(exVar / excess.length) * Math.sqrt(TRADING_DAYS) : 0;
  const downDev = excess.length ? Math.sqrt(downSq / excess.length) * Math.sqrt(TRADING_DAYS) : 0;
  const annEx = meanEx * TRADING_DAYS;

  const dd = drawdownSummary(dates.slice(startIdx, endIdx + 1), navSlice);
  const navCagr = cagrOf(daily.nav[startIdx]!, daily.nav[endIdx]!, years);
  const underlyingCagr = underlyingNav
    ? cagrOf(underlyingNav[startIdx]!, underlyingNav[endIdx]!, years)
    : null;

  return {
    start: dates[startIdx]!,
    end: dates[endIdx]!,
    years,
    navCagr,
    underlyingCagr,
    dcaXirr: contrib > 0 ? xirr(flows) : null,
    multiple: contrib > 0 ? finalValue / contrib : 0,
    volatility,
    navMaxDrawdown: dd.maxDrawdown,
    portfolioMaxDrawdown: portMaxDD,
    sharpe: exSd > 0 ? annEx / exSd : null,
    sortino: downDev > 0 ? annEx / downDev : null,
    calmar: navCagr !== null && dd.maxDrawdown < 0 ? navCagr / Math.abs(dd.maxDrawdown) : null,
    recoveryDays: dd.maxRecoveryDurationDays,
    endedBelowContributions: contrib > 0 && finalValue < contrib,
    syntheticShare: (endIdx - startIdx + 1) > 0 ? synthetic / (endIdx - startIdx + 1) : 0,
  };
}

function shiftYears(date: string, years: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export interface RollingAnalysisOutput {
  horizons: HorizonSummary[];
  windowsByHorizon: Map<number, WindowResult[]>;
  /** Horizons requested but unavailable given the sample length. */
  unavailable: number[];
  sampleYears: number;
}

/**
 * Rolling analysis across every requested horizon, stepping one calendar
 * month at a time.
 */
export function rollingResearch(
  daily: Pick<DailySeries, "dates" | "nav" | "dataType">,
  underlyingNav: ArrayLike<number> | null,
  config: PlanConfig,
  opts: { horizons?: number[]; riskFreeAt?: (d: string) => number } = {},
): RollingAnalysisOutput {
  const horizons = opts.horizons ?? ROLLING_HORIZONS;
  const n = daily.dates.length;
  const windowsByHorizon = new Map<number, WindowResult[]>();
  const unavailable: number[] = [];
  if (n < 2) return { horizons: [], windowsByHorizon, unavailable: horizons, sampleYears: 0 };

  const planFreq = config.frequency === "once" || config.frequency === "custom"
    ? "monthly"
    : config.frequency;
  const buySet = new Set(contributionIndices(daily.dates, planFreq, config.timing));
  const monthStarts = contributionIndices(daily.dates, "monthly", "first");
  const sampleYears = yearFraction(daily.dates[0]!, daily.dates[n - 1]!);

  const summaries: HorizonSummary[] = [];
  for (const years of horizons) {
    const results: WindowResult[] = [];
    for (const startIdx of monthStarts) {
      const target = shiftYears(daily.dates[startIdx]!, years);
      if (target > daily.dates[n - 1]!) break;
      let endIdx = startIdx;
      while (endIdx < n - 1 && daily.dates[endIdx + 1]! <= target) endIdx++;
      if (endIdx <= startIdx) continue;
      results.push(
        evaluateWindow(
          daily,
          underlyingNav,
          buySet,
          startIdx,
          endIdx,
          config.contribution,
          opts.riskFreeAt,
        ),
      );
    }
    if (results.length === 0) {
      unavailable.push(years);
      continue;
    }
    windowsByHorizon.set(years, results);
    const cagrs = results.map((r) => r.navCagr).filter((v): v is number => v !== null);
    const withBench = results.filter((r) => r.navCagr !== null && r.underlyingCagr !== null);
    const share = (pred: (r: WindowResult) => boolean) =>
      results.length ? results.filter(pred).length / results.length : 0;
    summaries.push({
      years,
      windows: results.length,
      overlapping: true,
      cagr: describe(cagrs),
      xirr: describe(results.map((r) => r.dcaXirr).filter((v): v is number => v !== null)),
      multiple: describe(results.map((r) => r.multiple)),
      navMaxDrawdown: describe(results.map((r) => r.navMaxDrawdown)),
      volatility: describe(results.map((r) => r.volatility)),
      sharpe: describe(results.map((r) => r.sharpe).filter((v): v is number => v !== null)),
      shareCagrPositive: share((r) => (r.navCagr ?? 0) > 0),
      shareBeatUnderlying: withBench.length
        ? withBench.filter((r) => r.navCagr! > r.underlyingCagr!).length / withBench.length
        : 0,
      shareCagrAbove8: share((r) => (r.navCagr ?? -1) > 0.08),
      shareCagrAbove10: share((r) => (r.navCagr ?? -1) > 0.1),
      shareDrawdownOver50: share((r) => r.navMaxDrawdown <= -0.5),
      shareDrawdownOver80: share((r) => r.navMaxDrawdown <= -0.8),
      shareEndedBelowContributions: share((r) => r.endedBelowContributions),
      firstStart: results[0]!.start,
      lastStart: results[results.length - 1]!.start,
    });
  }

  return { horizons: summaries, windowsByHorizon, unavailable, sampleYears };
}

export interface StartDateCell {
  start: string;
  startYear: number;
  years: number;
  navCagr: number | null;
  endingWealth: number;
  multiple: number;
  navMaxDrawdown: number;
  beatUnderlying: boolean | null;
}

/**
 * Start-date sensitivity grid: X = start year, Y = horizon. Exposes sequence
 * risk by showing that the same strategy has wildly different outcomes
 * depending only on the entry date.
 */
export function startDateGrid(
  daily: Pick<DailySeries, "dates" | "nav" | "dataType">,
  underlyingNav: ArrayLike<number> | null,
  config: PlanConfig,
  horizons: number[] = [5, 10, 15, 20, 25, 30],
): { cells: StartDateCell[]; startYears: number[]; horizons: number[] } {
  const n = daily.dates.length;
  if (n < 2) return { cells: [], startYears: [], horizons: [] };
  const planFreq =
    config.frequency === "once" || config.frequency === "custom" ? "monthly" : config.frequency;
  const buySet = new Set(contributionIndices(daily.dates, planFreq, config.timing));

  const yearStart = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const y = Number(daily.dates[i]!.slice(0, 4));
    if (!yearStart.has(y)) yearStart.set(y, i);
  }
  const startYears = [...yearStart.keys()].sort((a, b) => a - b);
  const cells: StartDateCell[] = [];
  const usedHorizons = new Set<number>();
  for (const y of startYears) {
    const startIdx = yearStart.get(y)!;
    for (const years of horizons) {
      const target = shiftYears(daily.dates[startIdx]!, years);
      if (target > daily.dates[n - 1]!) continue;
      let endIdx = startIdx;
      while (endIdx < n - 1 && daily.dates[endIdx + 1]! <= target) endIdx++;
      if (endIdx <= startIdx) continue;
      const w = evaluateWindow(
        daily,
        underlyingNav,
        buySet,
        startIdx,
        endIdx,
        config.contribution,
      );
      usedHorizons.add(years);
      cells.push({
        start: w.start,
        startYear: y,
        years,
        navCagr: w.navCagr,
        endingWealth: w.multiple * config.contribution * Math.round((years * 12)),
        multiple: w.multiple,
        navMaxDrawdown: w.navMaxDrawdown,
        beatUnderlying:
          w.navCagr !== null && w.underlyingCagr !== null ? w.navCagr > w.underlyingCagr : null,
      });
    }
  }
  return {
    cells,
    startYears,
    horizons: horizons.filter((h) => usedHorizons.has(h)),
  };
}

export { dayDiff, medianOf };
