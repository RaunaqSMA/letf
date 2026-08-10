import { contributionIndices } from "./dca";
import type { DailySeries, SimulationConfig } from "./types";
import { xirr, type CashFlow } from "./xirr";

export interface RollingWindowStats {
  years: number;
  windows: number;
  bestXirr: number | null;
  worstXirr: number | null;
  medianXirr: number | null;
  bestMultiple: number;
  worstMultiple: number;
  medianMultiple: number;
  shareBelowContributions: number;
}

export interface StartMonthOutcome {
  start: string;
  years: number;
  xirr: number | null;
  multiple: number;
  maxDrawdown: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Runs a DCA window starting at trading-day index `startIdx` and lasting
 * `years`, reusing the already-computed NAV path.
 */
function runWindow(
  daily: Pick<DailySeries, "dates" | "nav">,
  buyIdx: number[],
  startIdx: number,
  endIdx: number,
  contribution: number,
): { xirr: number | null; multiple: number; maxDrawdown: number } {
  let units = 0;
  let contrib = 0;
  const flows: CashFlow[] = [];
  for (const i of buyIdx) {
    if (i < startIdx) continue;
    if (i > endIdx) break;
    const price = daily.nav[i]!;
    if (price <= 0) continue;
    units += contribution / price;
    contrib += contribution;
    flows.push({ date: daily.dates[i]!, amount: -contribution });
  }
  if (contrib === 0) return { xirr: null, multiple: 0, maxDrawdown: 0 };

  let peak = 0;
  let maxDD = 0;
  let running = 0;
  let contribSoFar = 0;
  const buySet = new Set(buyIdx);
  for (let i = startIdx; i <= endIdx; i++) {
    if (buySet.has(i) && daily.nav[i]! > 0) {
      running += contribution / daily.nav[i]!;
      contribSoFar += contribution;
    }
    const v = running * daily.nav[i]!;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < maxDD) maxDD = dd;
    }
  }
  void contribSoFar;

  const finalValue = units * daily.nav[endIdx]!;
  flows.push({ date: daily.dates[endIdx]!, amount: finalValue });
  return { xirr: xirr(flows), multiple: finalValue / contrib, maxDrawdown: maxDD };
}

const ROLLING_YEARS = [1, 3, 5, 10, 15, 20];

export function rollingAnalysis(
  daily: Pick<DailySeries, "dates" | "nav">,
  config: Pick<SimulationConfig, "contribution" | "frequency" | "timing">,
): RollingWindowStats[] {
  const n = daily.dates.length;
  if (n < 2) return [];
  const buyIdx = contributionIndices(daily.dates, config.frequency === "once" ? "monthly" : config.frequency, config.timing);
  const monthStarts = contributionIndices(daily.dates, "monthly", "first");

  return ROLLING_YEARS.map((years) => {
    const xs: number[] = [];
    const ms: number[] = [];
    let below = 0;
    for (const startIdx of monthStarts) {
      const targetDate = shiftYears(daily.dates[startIdx]!, years);
      if (targetDate > daily.dates[n - 1]!) break;
      let endIdx = startIdx;
      while (endIdx < n - 1 && daily.dates[endIdx + 1]! <= targetDate) endIdx++;
      if (endIdx <= startIdx) continue;
      const r = runWindow(daily, buyIdx, startIdx, endIdx, config.contribution);
      if (r.xirr !== null) xs.push(r.xirr);
      ms.push(r.multiple);
      if (r.multiple < 1) below++;
    }
    return {
      years,
      windows: ms.length,
      bestXirr: xs.length ? Math.max(...xs) : null,
      worstXirr: xs.length ? Math.min(...xs) : null,
      medianXirr: median(xs),
      bestMultiple: ms.length ? Math.max(...ms) : 0,
      worstMultiple: ms.length ? Math.min(...ms) : 0,
      medianMultiple: median(ms) ?? 0,
      shareBelowContributions: ms.length ? below / ms.length : 0,
    };
  }).filter((r) => r.windows > 0);
}

function shiftYears(date: string, years: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export interface HeatmapCell {
  startYear: number;
  years: number;
  xirr: number | null;
  multiple: number;
  maxDrawdown: number;
}

/** XIRR heatmap: every starting year x every holding duration. */
export function startDateHeatmap(
  daily: Pick<DailySeries, "dates" | "nav">,
  config: Pick<SimulationConfig, "contribution" | "frequency" | "timing">,
): { cells: HeatmapCell[]; years: number[]; startYears: number[] } {
  const n = daily.dates.length;
  if (n < 2) return { cells: [], years: [], startYears: [] };
  const buyIdx = contributionIndices(daily.dates, config.frequency === "once" ? "monthly" : config.frequency, config.timing);
  const yearStarts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const y = Number(daily.dates[i]!.slice(0, 4));
    if (!yearStarts.has(y)) yearStarts.set(y, i);
  }
  const cells: HeatmapCell[] = [];
  const startYears = [...yearStarts.keys()].sort((a, b) => a - b);
  for (const y of startYears) {
    const startIdx = yearStarts.get(y)!;
    for (const years of ROLLING_YEARS) {
      const targetDate = shiftYears(daily.dates[startIdx]!, years);
      if (targetDate > daily.dates[n - 1]!) continue;
      let endIdx = startIdx;
      while (endIdx < n - 1 && daily.dates[endIdx + 1]! <= targetDate) endIdx++;
      if (endIdx <= startIdx) continue;
      const r = runWindow(daily, buyIdx, startIdx, endIdx, config.contribution);
      cells.push({ startYear: y, years, ...r });
    }
  }
  return { cells, years: ROLLING_YEARS, startYears };
}

export interface EveryStartMonthPoint {
  start: string;
  xirr: number | null;
  multiple: number;
  maxDrawdown: number;
}

/** DCA from every possible starting month, always held to the final date. */
export function everyStartMonth(
  daily: Pick<DailySeries, "dates" | "nav">,
  config: Pick<SimulationConfig, "contribution" | "frequency" | "timing">,
): EveryStartMonthPoint[] {
  const n = daily.dates.length;
  if (n < 2) return [];
  const buyIdx = contributionIndices(daily.dates, config.frequency === "once" ? "monthly" : config.frequency, config.timing);
  const monthStarts = contributionIndices(daily.dates, "monthly", "first");
  const out: EveryStartMonthPoint[] = [];
  for (const startIdx of monthStarts) {
    if (startIdx >= n - 20) break;
    const r = runWindow(daily, buyIdx, startIdx, n - 1, config.contribution);
    out.push({ start: daily.dates[startIdx]!, ...r });
  }
  return out;
}

export interface LumpSumComparison {
  lumpFinalValue: number;
  lumpXirr: number | null;
  lumpMaxDrawdown: number;
  lumpTimeUnderwaterMonths: number;
  dcaTimeUnderwaterMonths: number;
}

/** Invests the DCA plan's total contributions on day one instead. */
export function lumpSumComparison(
  daily: Pick<DailySeries, "dates" | "nav">,
  totalContributions: number,
  dcaValue: ArrayLike<number>,
  dcaContributions: ArrayLike<number>,
): LumpSumComparison {
  const n = daily.dates.length;
  const units = totalContributions / daily.nav[0]!;
  let peak = 0;
  let maxDD = 0;
  let lumpUnderDays = 0;
  let dcaUnderDays = 0;
  for (let i = 0; i < n; i++) {
    const v = units * daily.nav[i]!;
    if (v > peak) peak = v;
    const dd = v / peak - 1;
    if (dd < maxDD) maxDD = dd;
    if (v < totalContributions) lumpUnderDays++;
    if (dcaValue[i]! < dcaContributions[i]!) dcaUnderDays++;
  }
  const finalValue = units * daily.nav[n - 1]!;
  const lumpXirr = xirr([
    { date: daily.dates[0]!, amount: -totalContributions },
    { date: daily.dates[n - 1]!, amount: finalValue },
  ]);
  return {
    lumpFinalValue: finalValue,
    lumpXirr,
    lumpMaxDrawdown: maxDD,
    lumpTimeUnderwaterMonths: Math.round((lumpUnderDays / 252) * 12),
    dcaTimeUnderwaterMonths: Math.round((dcaUnderDays / 252) * 12),
  };
}