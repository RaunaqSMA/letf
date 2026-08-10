import { indexAtOrBefore } from "@/lib/market/loader";
import { INSTRUMENTS, type MarketDataset } from "@/lib/market/types";
import { buildLeveragedSeries } from "./leverage";
import type { SimulationConfig } from "./types";

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

  return {
    points,
    observations: n,
    correlation,
    meanTrackingDifference: meanDiff * 252,
    trackingError,
    cumulativeDifference: last.diff,
    maxDifference: maxDiff,
    from: points[0]!.date,
    to: last.date,
  };
}