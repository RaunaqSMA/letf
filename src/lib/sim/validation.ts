import { indexAtOrBefore } from "@/lib/market/loader";
import { INSTRUMENTS, type MarketDataset } from "@/lib/market/types";
import { buildLeveragedSeries } from "./leverage";
import { drawdownSummary, seriesStats, yearFraction, cagrOf } from "./metrics";
import type { CalibrationMode, SimulationConfig } from "./types";

export interface ValidationPoint {
  date: string;
  synthetic: number;
  actual: number;
  diff: number;
}

export interface ValidationResult {
  points: ValidationPoint[];
  observations: number;
  correlation: number;
  meanTrackingDifference: number;
  trackingError: number;
  cumulativeDifference: number;
  maxDifference: number;
  from: string;
  to: string;
  /** Head-to-head aggregate statistics over the overlap period. */
  comparison: ValidationComparison;
  /** Drag (annualised) that would align the model with reality. */
  calibration: CalibrationResult;
}

export interface ValidationComparison {
  years: number;
  syntheticCagr: number | null;
  actualCagr: number | null;
  cagrDifference: number | null;
  syntheticVolatility: number;
  actualVolatility: number;
  volatilityDifference: number;
  syntheticMaxDrawdown: number;
  actualMaxDrawdown: number;
  drawdownDifference: number;
  /** R^2 of daily synthetic vs actual returns. */
  rSquared: number;
  /** Slope of actual on synthetic — 1.0 means unbiased scaling. */
  beta: number;
  worstDailyDifference: number;
  /** Share of days where |synthetic - actual| exceeded 25bp. */
  shareDaysOver25bp: number;
}

export type { CalibrationMode };

export interface CalibrationResult {
  /** Annualised drag to add so the model matches actual history. */
  impliedAnnualDrag: number;
  /** Drag applied under each mode. */
  dragByMode: Record<CalibrationMode, number>;
  conservativeExtra: number;
  verdict: "good" | "acceptable" | "poor";
  note: string;
}

/** Extra annual drag implied by a calibration mode. */
export function calibrationDrag(
  mode: CalibrationMode,
  impliedAnnualDrag: number,
  conservativeExtra: number,
): number {
  switch (mode) {
    case "calibrated":
      return impliedAnnualDrag;
    case "conservative":
      return impliedAnnualDrag + conservativeExtra;
    case "theoretical":
    default:
      return 0;
  }
}

/**
 * Compares the modelled (synthetic) path against actual ETF returns over the
 * period where actual data exists. Answers "how good is the reconstruction?".
 */
export function validateModel(
  data: MarketDataset,
  config: SimulationConfig,
): ValidationResult | null {
  const inst = INSTRUMENTS[config.instrument];
  const actual = data[inst.actual];
  const modelConfig: SimulationConfig = {
    ...config,
    startDate: inst.inception,
    endDate: config.endDate,
    useSyntheticHistory: true,
    useActualHistory: false,
  };
  const { daily } = buildLeveragedSeries(data, modelConfig);
  if (daily.dates.length < 10) return null;

  const points: ValidationPoint[] = [];
  const synReturns: number[] = [];
  const actReturns: number[] = [];
  let prevActual = 0;
  let synIndexed = 100;
  let actIndexed = 100;

  for (let i = 0; i < daily.dates.length; i++) {
    const date = daily.dates[i]!;
    const ai = indexAtOrBefore(actual.dates, date);
    if (ai < 0) continue;
    if (actual.dates[ai] !== date) continue;
    const aPx = actual.adjClose[ai]!;
    if (prevActual > 0) {
      const ar = aPx / prevActual - 1;
      const sr = daily.dailyReturn[i]!;
      synReturns.push(sr);
      actReturns.push(ar);
      synIndexed *= 1 + sr;
      actIndexed *= 1 + ar;
      points.push({ date, synthetic: synIndexed, actual: actIndexed, diff: synIndexed / actIndexed - 1 });
    }
    prevActual = aPx;
  }
  if (points.length < 10) return null;

  const n = synReturns.length;
  const meanS = synReturns.reduce((a, b) => a + b, 0) / n;
  const meanA = actReturns.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varS = 0;
  let varA = 0;
  let diffSum = 0;
  let diffSq = 0;
  for (let i = 0; i < n; i++) {
    const ds = synReturns[i]! - meanS;
    const da = actReturns[i]! - meanA;
    cov += ds * da;
    varS += ds * ds;
    varA += da * da;
    const d = synReturns[i]! - actReturns[i]!;
    diffSum += d;
    diffSq += d * d;
  }
  const correlation = varS > 0 && varA > 0 ? cov / Math.sqrt(varS * varA) : 0;
  const meanDiff = diffSum / n;
  const trackingError = Math.sqrt(Math.max(0, diffSq / n - meanDiff * meanDiff)) * Math.sqrt(252);
  const last = points[points.length - 1]!;
  let maxDiff = 0;
  for (const p of points) if (Math.abs(p.diff) > Math.abs(maxDiff)) maxDiff = p.diff;

  const years = yearFraction(points[0]!.date, last.date);
  const synStats = seriesStats(
    points.map((p) => p.date),
    points.map((p) => p.synthetic),
  );
  const actStats = seriesStats(
    points.map((p) => p.date),
    points.map((p) => p.actual),
  );
  const synDD = drawdownSummary(points.map((p) => p.date), points.map((p) => p.synthetic));
  const actDD = drawdownSummary(points.map((p) => p.date), points.map((p) => p.actual));
  const synCagr = cagrOf(points[0]!.synthetic, last.synthetic, years);
  const actCagr = cagrOf(points[0]!.actual, last.actual, years);
  let worstDaily = 0;
  let over25 = 0;
  for (let i = 0; i < n; i++) {
    const d = synReturns[i]! - actReturns[i]!;
    if (Math.abs(d) > Math.abs(worstDaily)) worstDaily = d;
    if (Math.abs(d) > 0.0025) over25++;
  }
  const beta = varS > 0 ? cov / varS : 0;
  const comparison: ValidationComparison = {
    years,
    syntheticCagr: synCagr,
    actualCagr: actCagr,
    cagrDifference: synCagr !== null && actCagr !== null ? synCagr - actCagr : null,
    syntheticVolatility: synStats.volatility,
    actualVolatility: actStats.volatility,
    volatilityDifference: synStats.volatility - actStats.volatility,
    syntheticMaxDrawdown: synDD.maxDrawdown,
    actualMaxDrawdown: actDD.maxDrawdown,
    drawdownDifference: synDD.maxDrawdown - actDD.maxDrawdown,
    rSquared: correlation * correlation,
    beta,
    worstDailyDifference: worstDaily,
    shareDaysOver25bp: n > 0 ? over25 / n : 0,
  };

  // If the model is optimistic, the implied drag is positive: subtracting it
  // from synthetic returns would have reproduced actual history.
  const impliedAnnualDrag = comparison.cagrDifference ?? meanDiff * 252;
  const absDrag = Math.abs(impliedAnnualDrag);
  const calibration: CalibrationResult = {
    impliedAnnualDrag,
    dragByMode: {
      theoretical: 0,
      calibrated: impliedAnnualDrag,
      conservative: impliedAnnualDrag + config.conservativeExtraDrag,
    },
    conservativeExtra: config.conservativeExtraDrag,
    verdict: correlation > 0.99 && absDrag < 0.02 ? "good" : correlation > 0.97 && absDrag < 0.05 ? "acceptable" : "poor",
    note:
      correlation > 0.99 && absDrag < 0.02
        ? "The reconstruction tracks actual fund returns closely; synthetic history is usable for research, with the usual caveat that it is still modelled."
        : "The reconstruction diverges materially from actual fund returns. Treat synthetic history as indicative only and prefer the calibrated or conservative mode.",
  };

  return {
    points,
    observations: n,
    comparison,
    calibration,
    correlation,
    meanTrackingDifference: meanDiff * 252,
    trackingError,
    cumulativeDifference: last.diff,
    maxDifference: maxDiff,
    from: points[0]!.date,
    to: last.date,
  };
}