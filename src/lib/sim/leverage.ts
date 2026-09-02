import { indexAtOrAfter, indexAtOrBefore } from "@/lib/market/loader";
import { INSTRUMENTS, type MarketDataset } from "@/lib/market/types";
import { createFinancingModel, type FinancingContext } from "./financing";
import type {
  DailySeries,
  ExpenseScheduleEntry,
  ExtremeDay,
  SimulationConfig,
  WipeoutEvent,
} from "./types";

const DAY_MS = 86400000;
/** Absolute leveraged daily move above which a day is logged as "extreme". */
export const EXTREME_DAY_THRESHOLD = 0.15;

function dayCount(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS));
}

export interface LeveragedBuild {
  daily: DailySeries;
  warnings: string[];
  financingAssumption: string;
  expenseAssumption: string;
}

function expenseAt(schedule: ExpenseScheduleEntry[], fallback: number, date: string): number {
  if (!schedule || schedule.length === 0) return fallback;
  let r = fallback;
  for (const e of schedule) {
    if (date >= e.from) r = e.ratio;
  }
  return r;
}

/**
 * Builds the daily-reset leveraged NAV path.
 *
 * Synthetic segment, stated exactly:
 *   r_t          = underlying total-return for day t
 *   gross_t      = L * r_t
 *   financing_t  = (L - 1) * financing_rate_annual(t) * day_fraction_t
 *   expense_t    = expense_ratio_annual(t) * day_fraction_t
 *   other_t      = (slippage + calibration drag) * day_fraction_t
 *   net_t        = gross_t - financing_t - expense_t - other_t
 *   NAV_t        = NAV_(t-1) * (1 + net_t)
 *
 * Only (L - 1) units of exposure are financed, because 1 unit is funded by
 * the investor's own capital. day_fraction uses ACT/365 calendar days so
 * weekends and holidays accrue financing, as they do in reality.
 *
 * Actual segment (on/after ETF inception, when enabled): the NAV path
 * continues using the ETF's own total-return daily changes. No modelled costs
 * are applied there — the fund's real costs are already inside its returns.
 *
 * Volatility decay is never added as a fudge factor; it emerges from the
 * daily compounding above.
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
    stress: config.stressFinancing,
    shift: config.financingShift,
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

  const extraDrag =
    config.slippageDrag +
    (config.calibrationMode === "conservative" ? config.conservativeExtraDrag : 0);
  const expenseAssumption =
    config.expenseSchedule.length > 0
      ? `Dated expense schedule (${config.expenseSchedule
          .map((e) => `${e.from}: ${(e.ratio * 100).toFixed(2)}%`)
          .join(", ")}).`
      : `Constant ${(config.expenseRatio * 100).toFixed(2)}% annual expense ratio applied across the whole modelled period (assumption).`;

  const startIdx = indexAtOrAfter(under.dates, windowStart);
  const endIdx = indexAtOrBefore(under.dates, config.endDate);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    return {
      daily: emptySeries(),
      warnings: [...warnings, "No market data in the selected window."],
      financingAssumption: financing.assumption,
      expenseAssumption,
    };
  }

  const n = endIdx - startIdx + 1;
  const dates: string[] = new Array(n);
  const underlying = new Float64Array(n);
  const underlyingReturn = new Float64Array(n);
  const grossLeveragedReturn = new Float64Array(n);
  const financingCost = new Float64Array(n);
  const expenseCost = new Float64Array(n);
  const otherCost = new Float64Array(n);
  const financingRate = new Float64Array(n);
  const dailyReturn = new Float64Array(n);
  const nav = new Float64Array(n);
  const peak = new Float64Array(n);
  const drawdown = new Float64Array(n);
  const dataType = new Uint8Array(n);
  const wipeouts: WipeoutEvent[] = [];
  const extremeDays: ExtremeDay[] = [];
  let clippedDays = 0;

  const actualStart = useActual ? indexAtOrAfter(actual.dates, inst.inception) : -1;
  let inceptionIndex = -1;
  let navValue = 100;
  let runningPeak = navValue;
  let prevActual = -1;
  let wipedOut = false;

  // Rolling state for the stress financing model.
  let underPeak = -Infinity;
  const volWindow: number[] = [];
  const VOL_WINDOW = 21;

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

    // Financing state context (computed from the underlying, always available).
    if (px > underPeak) underPeak = px;
    volWindow.push(r);
    if (volWindow.length > VOL_WINDOW) volWindow.shift();
    let trailingVol = 0;
    if (volWindow.length >= 5) {
      const mu = volWindow.reduce((a, b) => a + b, 0) / volWindow.length;
      let v = 0;
      for (const x of volWindow) v += (x - mu) * (x - mu);
      trailingVol = Math.sqrt(v / volWindow.length) * Math.sqrt(252);
    }
    const ctx: FinancingContext = {
      underlyingDrawdown: underPeak > 0 ? Math.max(0, 1 - px / underPeak) : 0,
      trailingVol,
    };

    const yearFrac = k > 0 ? dayCount(dates[k - 1]!, date) / 365 : 0;
    const finRate = financing.annualRate(date, ctx);
    const finDrag = k > 0 ? (config.leverage - 1) * finRate * yearFrac : 0;
    const expDrag = k > 0 ? expenseAt(config.expenseSchedule, config.expenseRatio, date) * yearFrac : 0;
    const othDrag = k > 0 ? extraDrag * yearFrac : 0;
    financingRate[k] = finRate;

    let net: number;
    let gross = 0;
    if (isActual) {
      const ai = indexAtOrBefore(actual.dates, date);
      const aPx = ai >= 0 ? actual.adjClose[ai]! : NaN;
      if (prevActual > 0 && isFinite(aPx) && aPx > 0) {
        net = aPx / prevActual - 1;
      } else {
        net = 0;
      }
      if (isFinite(aPx) && aPx > 0) prevActual = aPx;
      gross = net;
      grossLeveragedReturn[k] = net;
      financingCost[k] = 0;
      expenseCost[k] = 0;
      otherCost[k] = 0;
      dataType[k] = 1;
    } else {
      gross = config.leverage * r;
      net = gross - finDrag - expDrag - othDrag;
      grossLeveragedReturn[k] = gross;
      financingCost[k] = -finDrag;
      expenseCost[k] = -expDrag;
      otherCost[k] = -othDrag;
      dataType[k] = 0;
    }

    // Extreme daily moves are NOT clipped by default. Clipping, when enabled,
    // is counted and surfaced in the UI.
    let clipped = false;
    if (config.clipExtremeReturns && Math.abs(net) > config.clipLimit) {
      net = Math.sign(net) * config.clipLimit;
      clipped = true;
      clippedDays++;
    }

    const navBefore = navValue;
    if (k > 0 && !wipedOut) navValue = navValue * (1 + net);

    // A daily-reset fund is wiped out by a -100% (or worse) day: record the
    // termination event rather than letting the path go negative.
    if (!wipedOut && k > 0 && navValue <= 0) {
      wipedOut = true;
      wipeouts.push({
        date,
        underlyingReturn: r,
        grossLeveragedReturn: gross,
        navBefore,
        navAfter: 0,
      });
      navValue = 0;
    }

    dailyReturn[k] = k > 0 ? net : 0;
    nav[k] = navValue;
    if (navValue > runningPeak) runningPeak = navValue;
    peak[k] = runningPeak;
    drawdown[k] = runningPeak > 0 ? navValue / runningPeak - 1 : 0;

    if (k > 0 && Math.abs(net) >= EXTREME_DAY_THRESHOLD) {
      extremeDays.push({
        date,
        underlyingReturn: r,
        leveragedReturn: net,
        nav: navValue,
        drawdownAfter: drawdown[k]!,
        dataType: dataType[k] === 1 ? "ACTUAL" : "SYNTHETIC",
        clipped,
      });
    }
  }

  if (useSynthetic && dates[0]! < inst.inception) {
    warnings.push(
      `${dates[0]} → ${inst.inception}: SYNTHETIC reconstruction. These are modelled values, not actual ${inst.id} prices.`,
    );
  }
  if (!useActual) {
    warnings.push(`Actual ${inst.id} data is disabled — the whole path is modelled.`);
  }
  if (wipeouts.length > 0) {
    warnings.push(
      `Modelled wipeout on ${wipeouts[0]!.date}: a ${(wipeouts[0]!.underlyingReturn * 100).toFixed(1)}% underlying day implies a total loss at ${config.leverage}x daily leverage. The path is held at zero afterwards.`,
    );
  }
  if (clippedDays > 0) {
    warnings.push(
      `Extreme-return clipping is ENABLED and altered ${clippedDays} day(s) at ±${(config.clipLimit * 100).toFixed(0)}%. Results are not the unclipped model. Disable clipping in the simulator to see the raw path.`,
    );
  }
  if (config.calibrationMode === "conservative") {
    warnings.push(
      `Conservative calibration adds ${(config.conservativeExtraDrag * 100).toFixed(2)}% annual drag to synthetic periods as a stress allowance for tracking error.`,
    );
  }

  return {
    daily: {
      dates,
      underlying,
      underlyingReturn,
      grossLeveragedReturn,
      financingCost,
      expenseCost,
      otherCost,
      financingRate,
      dailyReturn,
      nav,
      peak,
      drawdown,
      dataType,
      inceptionIndex,
      wipeouts,
      extremeDays,
      clippedDays,
    },
    warnings,
    financingAssumption: financing.assumption,
    expenseAssumption,
  };
}

export function emptySeries(): DailySeries {
  return {
    dates: [],
    underlying: new Float64Array(0),
    underlyingReturn: new Float64Array(0),
    grossLeveragedReturn: new Float64Array(0),
    financingCost: new Float64Array(0),
    expenseCost: new Float64Array(0),
    otherCost: new Float64Array(0),
    financingRate: new Float64Array(0),
    dailyReturn: new Float64Array(0),
    nav: new Float64Array(0),
    peak: new Float64Array(0),
    drawdown: new Float64Array(0),
    dataType: new Uint8Array(0),
    inceptionIndex: -1,
    wipeouts: [],
    extremeDays: [],
    clippedDays: 0,
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
