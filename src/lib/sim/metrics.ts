/**
 * Risk and return statistics.
 *
 * Every formula here is stated explicitly in the doc comment above it so that
 * the Methodology page and the code cannot drift apart.
 */

export const TRADING_DAYS = 252;

export function percentileOf(sortedAsc: number[], p: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0]!;
  const idx = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

export function quantiles(values: number[], ps: number[]): (number | null)[] {
  const s = [...values].sort((a, b) => a - b);
  return ps.map((p) => percentileOf(s, p));
}

export function medianOf(values: number[]): number | null {
  return percentileOf([...values].sort((a, b) => a - b), 0.5);
}

export function meanOf(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function dayDiff(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
}

/** Years between two ISO dates on an ACT/365 basis. */
export function yearFraction(a: string, b: string): number {
  return dayDiff(a, b) / 365;
}

/** CAGR = (end / start)^(1 / years) - 1. Null when the inputs are unusable. */
export function cagrOf(start: number, end: number, years: number): number | null {
  if (!(start > 0) || !(end > 0) || !(years > 0)) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

export interface DrawdownSummary {
  maxDrawdown: number;
  maxDrawdownDate: string;
  peakDate: string;
  /** Mean of the daily drawdown series (always <= 0). */
  averageDrawdown: number;
  /** Longest peak -> trough span, in calendar days. */
  maxDrawdownDurationDays: number;
  /** Longest peak -> full-recovery span, in calendar days. Null when still underwater. */
  maxRecoveryDurationDays: number | null;
  /** True when the series has not regained its all-time peak by the final date. */
  underwaterAtEnd: boolean;
  /**
   * Ulcer Index = sqrt(mean(drawdown_pct^2)), drawdown in percent.
   * Penalises depth *and* duration, unlike max drawdown.
   */
  ulcerIndex: number;
}

export function drawdownSummary(dates: string[], values: ArrayLike<number>): DrawdownSummary {
  const n = Math.min(dates.length, values.length);
  const empty: DrawdownSummary = {
    maxDrawdown: 0,
    maxDrawdownDate: "—",
    peakDate: "—",
    averageDrawdown: 0,
    maxDrawdownDurationDays: 0,
    maxRecoveryDurationDays: null,
    underwaterAtEnd: false,
    ulcerIndex: 0,
  };
  if (n === 0) return empty;

  let peak = -Infinity;
  let peakDate = dates[0]!;
  let maxDD = 0;
  let maxDDDate = dates[0]!;
  let maxDDPeakDate = dates[0]!;
  let ddSum = 0;
  let sqSum = 0;
  let count = 0;

  // Duration tracking
  let curPeakDate = dates[0]!;
  let curTroughDate = dates[0]!;
  let curTrough = Infinity;
  let underwater = false;
  let maxDDDur = 0;
  let maxRecDur: number | null = null;

  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (!isFinite(v) || v <= 0) continue;
    if (v >= peak) {
      if (underwater) {
        const rec = dayDiff(curPeakDate, dates[i]!);
        if (maxRecDur === null || rec > maxRecDur) maxRecDur = rec;
        const dur = dayDiff(curPeakDate, curTroughDate);
        if (dur > maxDDDur) maxDDDur = dur;
      }
      peak = v;
      peakDate = dates[i]!;
      curPeakDate = dates[i]!;
      curTrough = Infinity;
      underwater = false;
    } else {
      underwater = true;
      if (v < curTrough) {
        curTrough = v;
        curTroughDate = dates[i]!;
      }
    }
    const dd = peak > 0 ? v / peak - 1 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDDate = dates[i]!;
      maxDDPeakDate = curPeakDate;
    }
    ddSum += dd;
    sqSum += (dd * 100) * (dd * 100);
    count++;
  }
  if (underwater) {
    const dur = dayDiff(curPeakDate, curTroughDate);
    if (dur > maxDDDur) maxDDDur = dur;
  }
  void peakDate;

  return {
    maxDrawdown: maxDD,
    maxDrawdownDate: maxDDDate,
    peakDate: maxDDPeakDate,
    averageDrawdown: count ? ddSum / count : 0,
    maxDrawdownDurationDays: maxDDDur,
    maxRecoveryDurationDays: maxRecDur,
    underwaterAtEnd: underwater,
    ulcerIndex: count ? Math.sqrt(sqSum / count) : 0,
  };
}

export interface SeriesStats {
  observations: number;
  years: number;
  startDate: string;
  endDate: string;
  totalReturn: number;
  cagr: number | null;
  /** Annualised stdev of daily returns x sqrt(252) (population stdev). */
  volatility: number;
  /** Annualised stdev of daily returns below the risk-free MAR. */
  downsideDeviation: number;
  /** Mean annualised risk-free rate over the sample. */
  meanRiskFree: number;
  /** (mean daily excess x 252) / (stdev daily excess x sqrt 252). */
  sharpe: number | null;
  /** (mean daily excess x 252) / downside deviation. */
  sortino: number | null;
  /** CAGR / |max drawdown|. */
  calmar: number | null;
  ulcerIndex: number;
  maxDrawdown: number;
  maxDrawdownDate: string;
  averageDrawdown: number;
  maxDrawdownDurationDays: number;
  maxRecoveryDurationDays: number | null;
  underwaterAtEnd: boolean;
  skewness: number;
  excessKurtosis: number;
  /** Historical 5% daily VaR (a negative number). */
  var95Daily: number | null;
  /** Mean of daily returns at or below VaR95 (expected shortfall). */
  cvar95Daily: number | null;
  bestDay: number;
  worstDay: number;
  /** True when the sample is too short for the higher moments to mean anything. */
  sampleTooShort: boolean;
}

/**
 * Full statistics for a NAV path.
 *
 * `riskFreeAt(date)` returns the *annualised* risk-free rate as a decimal.
 * Daily risk-free is taken as rf_annual / 252 (simple), consistent with the
 * arithmetic daily excess-return basis used for Sharpe and Sortino.
 */
export function seriesStats(
  dates: string[],
  nav: ArrayLike<number>,
  riskFreeAt?: (date: string) => number,
): SeriesStats {
  const n = Math.min(dates.length, nav.length);
  if (n < 2) {
    return {
      observations: n,
      years: 0,
      startDate: dates[0] ?? "—",
      endDate: dates[n - 1] ?? "—",
      totalReturn: 0,
      cagr: null,
      volatility: 0,
      downsideDeviation: 0,
      meanRiskFree: 0,
      sharpe: null,
      sortino: null,
      calmar: null,
      ulcerIndex: 0,
      maxDrawdown: 0,
      maxDrawdownDate: "—",
      averageDrawdown: 0,
      maxDrawdownDurationDays: 0,
      maxRecoveryDurationDays: null,
      underwaterAtEnd: false,
      skewness: 0,
      excessKurtosis: 0,
      var95Daily: null,
      cvar95Daily: null,
      bestDay: 0,
      worstDay: 0,
      sampleTooShort: true,
    };
  }

  const rets: number[] = [];
  const excess: number[] = [];
  let rfSum = 0;
  for (let i = 1; i < n; i++) {
    const prev = nav[i - 1]!;
    const cur = nav[i]!;
    if (!(prev > 0) || !isFinite(cur)) continue;
    const r = cur / prev - 1;
    if (!isFinite(r)) continue;
    rets.push(r);
    const rfA = riskFreeAt ? riskFreeAt(dates[i]!) : 0;
    rfSum += rfA;
    excess.push(r - rfA / TRADING_DAYS);
  }
  const m = rets.length;
  const meanR = meanOf(rets);
  let varSum = 0;
  let m3 = 0;
  let m4 = 0;
  for (const r of rets) {
    const d = r - meanR;
    varSum += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const variance = m > 0 ? varSum / m : 0;
  const sd = Math.sqrt(Math.max(0, variance));
  const volatility = sd * Math.sqrt(TRADING_DAYS);
  const skewness = m > 2 && sd > 0 ? m3 / m / Math.pow(sd, 3) : 0;
  const excessKurtosis = m > 3 && sd > 0 ? m4 / m / Math.pow(sd, 4) - 3 : 0;

  const meanRf = m > 0 ? rfSum / m : 0;
  const meanEx = meanOf(excess);
  let exVarSum = 0;
  let downSum = 0;
  let downCount = 0;
  for (const e of excess) {
    const d = e - meanEx;
    exVarSum += d * d;
    if (e < 0) {
      downSum += e * e;
      downCount++;
    }
  }
  const exSd = m > 0 ? Math.sqrt(Math.max(0, exVarSum / m)) : 0;
  // Downside deviation uses the full sample in the denominator (Sortino, 1991).
  const downsideDeviation = m > 0 ? Math.sqrt(downSum / m) * Math.sqrt(TRADING_DAYS) : 0;
  void downCount;

  const years = yearFraction(dates[0]!, dates[n - 1]!);
  const totalReturn = nav[0]! > 0 ? nav[n - 1]! / nav[0]! - 1 : 0;
  const cagr = cagrOf(nav[0]!, nav[n - 1]!, years);
  const dd = drawdownSummary(dates.slice(0, n), nav);

  const sortedRets = [...rets].sort((a, b) => a - b);
  const var95 = percentileOf(sortedRets, 0.05);
  let cvar95: number | null = null;
  if (var95 !== null) {
    const tail = sortedRets.filter((r) => r <= var95);
    cvar95 = tail.length ? meanOf(tail) : var95;
  }

  const annExcess = meanEx * TRADING_DAYS;
  const annExcessSd = exSd * Math.sqrt(TRADING_DAYS);

  return {
    observations: n,
    years,
    startDate: dates[0]!,
    endDate: dates[n - 1]!,
    totalReturn,
    cagr,
    volatility,
    downsideDeviation,
    meanRiskFree: meanRf,
    sharpe: annExcessSd > 0 ? annExcess / annExcessSd : null,
    sortino: downsideDeviation > 0 ? annExcess / downsideDeviation : null,
    calmar: cagr !== null && dd.maxDrawdown < 0 ? cagr / Math.abs(dd.maxDrawdown) : null,
    ulcerIndex: dd.ulcerIndex,
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownDate: dd.maxDrawdownDate,
    averageDrawdown: dd.averageDrawdown,
    maxDrawdownDurationDays: dd.maxDrawdownDurationDays,
    maxRecoveryDurationDays: dd.maxRecoveryDurationDays,
    underwaterAtEnd: dd.underwaterAtEnd,
    skewness,
    excessKurtosis,
    var95Daily: var95,
    cvar95Daily: cvar95,
    bestDay: sortedRets.length ? sortedRets[sortedRets.length - 1]! : 0,
    worstDay: sortedRets.length ? sortedRets[0]! : 0,
    sampleTooShort: m < TRADING_DAYS,
  };
}

export interface CalendarYearReturn {
  year: number;
  /** Null when there is no prior-December close to anchor the year. */
  return: number | null;
  /** Return measured from the first available observation (stub period). */
  partialReturn: number | null;
  /** False for the first (stub) year and for an incomplete final year. */
  complete: boolean;
  startNav: number;
  endNav: number;
  tradingDays: number;
}

/**
 * Calendar-year returns on the standard convention:
 *   return(Y) = NAV(last trading day of Y) / NAV(last trading day of Y-1) - 1
 *
 * The first year of a sample has no prior December close: it is reported with
 * `return = null` and a clearly-labelled `partialReturn` stub instead.
 * The final year is marked incomplete when the sample ends before 31 December.
 */
export function calendarYearReturns(
  dates: string[],
  nav: ArrayLike<number>,
): CalendarYearReturn[] {
  const n = Math.min(dates.length, nav.length);
  if (n === 0) return [];
  const lastOfYear = new Map<number, { idx: number; nav: number }>();
  const firstOfYear = new Map<number, { idx: number; nav: number }>();
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const y = Number(dates[i]!.slice(0, 4));
    lastOfYear.set(y, { idx: i, nav: nav[i]! });
    if (!firstOfYear.has(y)) firstOfYear.set(y, { idx: i, nav: nav[i]! });
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  const years = [...lastOfYear.keys()].sort((a, b) => a - b);
  const finalDate = dates[n - 1]!;
  const out: CalendarYearReturn[] = [];
  for (const y of years) {
    const prev = lastOfYear.get(y - 1);
    const cur = lastOfYear.get(y)!;
    const first = firstOfYear.get(y)!;
    const anchor = prev ? prev.nav : first.nav;
    const isFirst = !prev;
    const isFinalIncomplete = y === years[years.length - 1] && finalDate.slice(5) < "12-25";
    out.push({
      year: y,
      return: prev && prev.nav > 0 ? cur.nav / prev.nav - 1 : null,
      partialReturn: anchor > 0 ? cur.nav / anchor - 1 : null,
      complete: !isFirst && !isFinalIncomplete,
      startNav: anchor,
      endNav: cur.nav,
      tradingDays: counts.get(y) ?? 0,
    });
  }
  return out;
}

export interface CalendarYearSummary {
  rows: CalendarYearReturn[];
  completeYears: number;
  best: CalendarYearReturn | null;
  worst: CalendarYearReturn | null;
  median: number | null;
  mean: number | null;
  positiveShare: number | null;
  negativeShare: number | null;
}

export function summariseCalendarYears(rows: CalendarYearReturn[]): CalendarYearSummary {
  const complete = rows.filter((r) => r.complete && r.return !== null);
  const vals = complete.map((r) => r.return!);
  let best: CalendarYearReturn | null = null;
  let worst: CalendarYearReturn | null = null;
  for (const r of complete) {
    if (!best || r.return! > best.return!) best = r;
    if (!worst || r.return! < worst.return!) worst = r;
  }
  const pos = vals.filter((v) => v > 0).length;
  return {
    rows,
    completeYears: complete.length,
    best,
    worst,
    median: medianOf(vals),
    mean: vals.length ? meanOf(vals) : null,
    positiveShare: vals.length ? pos / vals.length : null,
    negativeShare: vals.length ? (vals.length - pos) / vals.length : null,
  };
}
