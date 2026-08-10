import { indexAtOrAfter, indexAtOrBefore } from "@/lib/market/loader";
import { INSTRUMENTS, type MarketDataset } from "@/lib/market/types";
import { createFinancingModel } from "./financing";
import type { DailySeries, SimulationConfig } from "./types";

const DAY_MS = 86400000;

function dayCount(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS));
}

export interface LeveragedBuild {
  daily: DailySeries;
  warnings: string[];
}

/**
 * Builds the daily-reset leveraged NAV path.
 *
 * Synthetic segment: NAV_t = NAV_(t-1) * (1 + L*r_t - (L-1)*financing_t - expense_t).
 * Volatility decay is never added as a fudge factor; it emerges from the
 * daily compounding above.
 *
 * Actual segment (on/after ETF inception, when enabled): the NAV path
 * continues using the ETF's own total-return daily changes.
 */
export function buildLeveragedSeries(data: MarketDataset, config: SimulationConfig): LeveragedBuild {
  const inst = INSTRUMENTS[config.instrument];
  const warnings: string[] = [];
  const underlyingKey =
    config.underlyingMode === "price_index" ? inst.underlyingIndex : inst.underlyingTR;
  const under = data[underlyingKey];
  const actual = data[inst.actual];
  const financing = createFinancingModel(config.financingModel, {
    irx: data.irx,
    fixedRate: config.fixedFinancingRate,
    spread: config.financingSpread,
  });

  const useSynthetic = config.useSyntheticHistory;
  const useActual = config.useActualHistory;

  // Effective window start: synthetic OFF means the series cannot begin before inception.
  let windowStart = config.startDate;
  if (!useSynthetic && windowStart < inst.inception) windowStart = inst.inception;
  if (!useActual && config.endDate >= inst.inception && !useSynthetic) {
    warnings.push(
      "Both synthetic and actual history are disabled — nothing to simulate. Enable at least one source.",
    );
  }

  const startIdx = indexAtOrAfter(under.dates, windowStart);
  const endIdx = indexAtOrBefore(under.dates, config.endDate);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    return { daily: emptySeries(), warnings: [...warnings, "No market data in the selected window."] };
  }

  const n = endIdx - startIdx + 1;
  const dates: string[] = new Array(n);
  const underlying = new Float64Array(n);
  const underlyingReturn = new Float64Array(n);
  const financingCost = new Float64Array(n);
  const expenseCost = new Float64Array(n);
  const dailyReturn = new Float64Array(n);
  const nav = new Float64Array(n);
  const peak = new Float64Array(n);
  const drawdown = new Float64Array(n);
  const dataType = new Uint8Array(n);

  const actualStart = useActual ? indexAtOrAfter(actual.dates, inst.inception) : -1;
  let inceptionIndex = -1;
  let navValue = 100;
  let runningPeak = navValue;
  let prevActual = -1;

  for (let k = 0; k < n; k++) {
    const i = startIdx + k;
    const date = under.dates[i]!;
    const px = under.adjClose[i]!;
    const prevPx = under.adjClose[i - 1];
    dates[k] = date;
    underlying[k] = under.close[i]!;

    const isActual = useActual && actualStart >= 0 && date >= actual.dates[actualStart]!;
    if (isActual && inceptionIndex < 0) inceptionIndex = k;

    let r = 0;
    if (k > 0 && prevPx && prevPx > 0 && px > 0) r = px / prevPx - 1;
    underlyingReturn[k] = r;

    const yearFrac = k > 0 ? dayCount(dates[k - 1]!, date) / 365 : 0;
    const finRate = financing.annualRate(date);
    const finDrag = k > 0 ? (config.leverage - 1) * finRate * yearFrac : 0;
    const expDrag = k > 0 ? config.expenseRatio * yearFrac : 0;

    let net: number;
    if (isActual) {
      const ai = indexAtOrBefore(actual.dates, date);
      const aPx = ai >= 0 ? actual.adjClose[ai]! : NaN;
      if (prevActual > 0 && isFinite(aPx) && aPx > 0) {
        net = aPx / prevActual - 1;
      } else {
        net = 0;
      }
      if (isFinite(aPx) && aPx > 0) prevActual = aPx;
      financingCost[k] = 0;
      expenseCost[k] = 0;
      dataType[k] = 1;
    } else {
      net = config.leverage * r - finDrag - expDrag;
      financingCost[k] = -finDrag;
      expenseCost[k] = -expDrag;
      dataType[k] = 0;
    }

    if (k > 0) navValue = navValue * (1 + net);
    // A daily-reset fund cannot go below zero; -100% in one day wipes it out.
    if (navValue <= 0) navValue = 1e-8;
    dailyReturn[k] = k > 0 ? net : 0;
    nav[k] = navValue;
    if (navValue > runningPeak) runningPeak = navValue;
    peak[k] = runningPeak;
    drawdown[k] = navValue / runningPeak - 1;
  }

  if (useSynthetic && dates[0]! < inst.inception) {
    warnings.push(
      `${dates[0]} → ${inst.inception}: SYNTHETIC reconstruction. These are modelled values, not actual ${inst.id} prices.`,
    );
  }
  if (!useActual) {
    warnings.push(`Actual ${inst.id} data is disabled — the whole path is modelled.`);
  }

  return {
    daily: {
      dates,
      underlying,
      underlyingReturn,
      financingCost,
      expenseCost,
      dailyReturn,
      nav,
      peak,
      drawdown,
      dataType,
      inceptionIndex,
    },
    warnings,
  };
}

export function emptySeries(): DailySeries {
  return {
    dates: [],
    underlying: new Float64Array(0),
    underlyingReturn: new Float64Array(0),
    financingCost: new Float64Array(0),
    expenseCost: new Float64Array(0),
    dailyReturn: new Float64Array(0),
    nav: new Float64Array(0),
    peak: new Float64Array(0),
    drawdown: new Float64Array(0),
    dataType: new Uint8Array(0),
    inceptionIndex: -1,
  };
}

/** Builds an unlevered daily NAV path from a series (for index comparisons). */
export function buildPlainSeries(
  dates: string[],
  adjClose: number[],
  startDate: string,
  endDate: string,
): { dates: string[]; nav: Float64Array } {
  const s = indexAtOrAfter(dates, startDate);
  const e = indexAtOrBefore(dates, endDate);
  if (s < 0 || e < 0 || e <= s) return { dates: [], nav: new Float64Array(0) };
  const n = e - s + 1;
  const out = new Float64Array(n);
  const outDates: string[] = new Array(n);
  const base = adjClose[s]!;
  for (let k = 0; k < n; k++) {
    outDates[k] = dates[s + k]!;
    out[k] = (adjClose[s + k]! / base) * 100;
  }
  return { dates: outDates, nav: out };
}