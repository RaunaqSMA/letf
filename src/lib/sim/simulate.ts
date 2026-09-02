import { indexAtOrBefore } from "@/lib/market/loader";
import { INSTRUMENTS, type MarketDataset } from "@/lib/market/types";
import { runDCA } from "./dca";
import { drawdownEpisodes, monthsBetween } from "./drawdown";
import { buildLeveragedSeries, buildPlainSeries, emptySeries } from "./leverage";
import {
  calendarYearReturns,
  drawdownSummary,
  seriesStats,
  summariseCalendarYears,
  yearFraction,
  type SeriesStats,
} from "./metrics";
import { configHash, MODEL_VERSION } from "./model";
import type {
  DCARow,
  DrawdownTriad,
  PortfolioPoint,
  SimulationConfig,
  SimulationResult,
} from "./types";
import { xirr, type CashFlow } from "./xirr";

function emptyStats(): SeriesStats {
  return seriesStats([], []);
}

function emptyResult(config: SimulationConfig, warnings: string[]): SimulationResult {
  return {
    config,
    modelVersion: MODEL_VERSION,
    simulationId: configHash(config),
    daily: emptySeries(),
    ledger: [],
    portfolio: [],
    totalContributions: 0,
    finalValue: 0,
    profit: 0,
    totalReturn: 0,
    xirr: null,
    dca: {
      totalContributions: 0,
      startingCapital: config.startingCapital,
      finalValue: 0,
      realFinalValue: 0,
      profit: 0,
      totalReturn: 0,
      units: 0,
      averagePurchasePrice: 0,
      xirr: null,
      twr: null,
      contributionCount: 0,
      monthsBelowContributions: 0,
    },
    drawdowns: {
      navMaxDrawdown: 0,
      navMaxDrawdownDate: "—",
      portfolioMaxDrawdown: 0,
      portfolioMaxDrawdownDate: "—",
      worstContributionRelative: 0,
      worstContributionRelativeDate: "—",
      worstContributionShortfall: 0,
    },
    navStats: emptyStats(),
    underlyingStats: emptyStats(),
    calendarYears: summariseCalendarYears([]),
    maxDrawdown: 0,
    maxDrawdownDate: "—",
    navMaxDrawdown: 0,
    navMaxDrawdownDate: "—",
    episodes: [],
    longestRecoveryMonths: null,
    longestRecoveryOngoing: false,
    contributionCount: 0,
    startDate: "—",
    endDate: "—",
    syntheticShare: 0,
    inceptionDate: INSTRUMENTS[config.instrument].inception,
    volatility: 0,
    sharpe: null,
    bestYear: null,
    worstYear: null,
    monthsBelowContributions: 0,
    warnings,
  };
}

/** Full pipeline: leveraged NAV -> DCA -> drawdowns -> risk stats. */
export function runSimulation(data: MarketDataset, config: SimulationConfig): SimulationResult {
  const inst = INSTRUMENTS[config.instrument];
  const { daily, warnings, financingAssumption, expenseAssumption } = buildLeveragedSeries(
    data,
    config,
  );
  const n = daily.dates.length;
  if (n < 2) return emptyResult(config, warnings);

  const dca = runDCA(daily, config);

  // Risk-free lookup shared by every Sharpe/Sortino calculation.
  const riskFreeAt = (date: string): number => {
    if (data.irx.dates.length === 0) return 0;
    const i = indexAtOrBefore(data.irx.dates, date);
    return (i < 0 ? data.irx.close[0]! : data.irx.close[i]!) / 100;
  };

  // Three separate loss concepts. They are never merged.
  const portfolio: PortfolioPoint[] = new Array(n);
  let peak = 0;
  let maxDD = 0;
  let maxDDDate = daily.dates[0]!;
  let worstRel = 0;
  let worstRelDate = daily.dates[0]!;
  let worstShortfall = 0;
  const t0 = daily.dates[0]!;
  for (let i = 0; i < n; i++) {
    const v = dca.value[i]!;
    const c = dca.contributions[i]!;
    if (v > peak) peak = v;
    const dd = peak > 0 ? v / peak - 1 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDDate = daily.dates[i]!;
    }
    const rel = c > 0 ? v / c - 1 : 0;
    if (c > 0 && rel < worstRel) {
      worstRel = rel;
      worstRelDate = daily.dates[i]!;
      worstShortfall = v - c;
    }
    const yrs = yearFraction(t0, daily.dates[i]!);
    portfolio[i] = {
      date: daily.dates[i]!,
      value: v,
      contributions: c,
      profit: v - c,
      drawdown: dd,
      navDrawdown: daily.drawdown[i]!,
      contributionRelative: rel,
      realValue: v / Math.pow(1 + config.inflationRate, yrs),
      dataType: daily.dataType[i] === 1 ? "ACTUAL" : "SYNTHETIC",
    };
  }

  const navDD = drawdownSummary(daily.dates, daily.nav);
  const drawdowns: DrawdownTriad = {
    navMaxDrawdown: navDD.maxDrawdown,
    navMaxDrawdownDate: navDD.maxDrawdownDate,
    portfolioMaxDrawdown: maxDD,
    portfolioMaxDrawdownDate: maxDDDate,
    worstContributionRelative: worstRel,
    worstContributionRelativeDate: worstRelDate,
    worstContributionShortfall: worstShortfall,
  };

  const ledger: DCARow[] = dca.buyIndices.map((i, k) => {
    const cumUnits = dca.units[i]!;
    const cumContrib = dca.contributions[i]!;
    const value = dca.value[i]!;
    return {
      date: daily.dates[i]!,
      underlyingPrice: daily.underlying[i]!,
      nav: daily.nav[i]!,
      dataType: daily.dataType[i] === 1 ? "ACTUAL" : "SYNTHETIC",
      contribution: dca.amounts[k] ?? config.contribution,
      unitsBought: dca.unitsBought[k] ?? 0,
      cumulativeUnits: cumUnits,
      cumulativeContributions: cumContrib,
      portfolioValue: value,
      profitLoss: value - cumContrib,
      portfolioReturn: cumContrib > 0 ? value / cumContrib - 1 : 0,
      averageCost: dca.averageCostAt[k] ?? 0,
    };
  });

  const totalContributions = dca.contributions[n - 1]!;
  const finalValue = dca.value[n - 1]!;
  const flows: CashFlow[] = dca.buyIndices.map((i, k) => ({
    date: daily.dates[i]!,
    amount: -(dca.amounts[k] ?? config.contribution),
  }));
  flows.push({ date: daily.dates[n - 1]!, amount: finalValue });

  const episodes = drawdownEpisodes(daily.dates, dca.value, 0.15);
  let longestRecoveryMonths: number | null = null;
  let longestRecoveryOngoing = false;
  for (const ep of episodes) {
    const span =
      ep.recoveryDate === null
        ? monthsBetween(ep.peakDate, daily.dates[n - 1]!)
        : monthsBetween(ep.peakDate, ep.recoveryDate);
    if (longestRecoveryMonths === null || span > longestRecoveryMonths) {
      longestRecoveryMonths = span;
      longestRecoveryOngoing = ep.recoveryDate === null;
    }
  }

  const navStats = seriesStats(daily.dates, daily.nav, riskFreeAt);
  const underKey =
    config.underlyingMode === "price_index" ? inst.underlyingIndex : inst.underlyingTR;
  const plain = buildPlainSeries(
    data[underKey].dates,
    data[underKey].adjClose,
    daily.dates[0]!,
    daily.dates[n - 1]!,
  );
  const underlyingStats = seriesStats(plain.dates, plain.nav, riskFreeAt);

  const calendarYears = summariseCalendarYears(calendarYearReturns(daily.dates, daily.nav));

  let monthsBelow = 0;
  let lastMonth = "";
  for (let i = 0; i < n; i++) {
    const m = daily.dates[i]!.slice(0, 7);
    if (m === lastMonth) continue;
    lastMonth = m;
    if (dca.contributions[i]! > 0 && dca.value[i]! < dca.contributions[i]!) monthsBelow++;
  }

  let syntheticDays = 0;
  for (let i = 0; i < n; i++) if (daily.dataType[i] === 0) syntheticDays++;

  const allWarnings = [...warnings];
  if (config.startDate < inst.inception && !config.useSyntheticHistory) {
    allWarnings.push(
      `Synthetic history is off, so the simulation starts at the actual ${inst.id} inception (${inst.inception}) instead of ${config.startDate}.`,
    );
  }
  if (navStats.sampleTooShort) {
    allWarnings.push(
      "Fewer than one year of trading days in the window — volatility, Sharpe, skewness and kurtosis are not statistically meaningful and are shown for completeness only.",
    );
  }

  const years = yearFraction(daily.dates[0]!, daily.dates[n - 1]!);
  const realFinalValue = finalValue / Math.pow(1 + config.inflationRate, years);

  const result: SimulationResult = {
    config,
    modelVersion: MODEL_VERSION,
    simulationId: configHash(config),
    daily,
    ledger,
    portfolio,
    totalContributions,
    finalValue,
    profit: finalValue - totalContributions,
    totalReturn: totalContributions > 0 ? finalValue / totalContributions - 1 : 0,
    xirr: xirr(flows),
    dca: {
      totalContributions,
      startingCapital: config.startingCapital,
      finalValue,
      realFinalValue,
      profit: finalValue - totalContributions,
      totalReturn: totalContributions > 0 ? finalValue / totalContributions - 1 : 0,
      units: dca.units[n - 1]!,
      averagePurchasePrice:
        dca.units[n - 1]! > 0 ? dca.invested[n - 1]! / dca.units[n - 1]! : 0,
      xirr: xirr(flows),
      // Time-weighted return = the NAV path's own CAGR, independent of timing.
      twr: navStats.cagr,
      contributionCount: dca.buyIndices.length,
      monthsBelowContributions: monthsBelow,
    },
    drawdowns,
    navStats,
    underlyingStats,
    calendarYears,
    maxDrawdown: maxDD,
    maxDrawdownDate: maxDDDate,
    navMaxDrawdown: navDD.maxDrawdown,
    navMaxDrawdownDate: navDD.maxDrawdownDate,
    episodes,
    longestRecoveryMonths,
    longestRecoveryOngoing,
    contributionCount: dca.buyIndices.length,
    startDate: daily.dates[0]!,
    endDate: daily.dates[n - 1]!,
    syntheticShare: syntheticDays / n,
    inceptionDate: inst.inception,
    volatility: navStats.volatility,
    sharpe: navStats.sharpe,
    bestYear: calendarYears.best
      ? { year: calendarYears.best.year, return: calendarYears.best.return! }
      : null,
    worstYear: calendarYears.worst
      ? { year: calendarYears.worst.year, return: calendarYears.worst.return! }
      : null,
    monthsBelowContributions: monthsBelow,
    warnings: allWarnings,
  };

  // Assumption disclosure travels with the result.
  result.warnings.push(`Financing assumption: ${financingAssumption}`);
  result.warnings.push(`Expense assumption: ${expenseAssumption}`);
  return result;
}

export function dayDiff(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
}
