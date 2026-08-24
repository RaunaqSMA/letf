import { INSTRUMENTS, type MarketDataset } from "@/lib/market/types";
import { runDCA } from "./dca";
import { drawdownEpisodes, monthsBetween } from "./drawdown";
import { buildLeveragedSeries } from "./leverage";
import type {
  DCARow,
  PortfolioPoint,
  SimulationConfig,
  SimulationResult,
} from "./types";
import { xirr, type CashFlow } from "./xirr";

function emptyResult(config: SimulationConfig, warnings: string[]): SimulationResult {
  return {
    config,
    daily: {
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
    },
    ledger: [],
    portfolio: [],
    totalContributions: 0,
    finalValue: 0,
    profit: 0,
    totalReturn: 0,
    xirr: null,
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
    volatility: 0,
    sharpeLike: 0,
    bestYear: null,
    worstYear: null,
    monthsBelowContributions: 0,
    warnings,
  };
}

/** Full pipeline: leveraged NAV -> DCA -> drawdowns -> money-weighted return. */
export function runSimulation(data: MarketDataset, config: SimulationConfig): SimulationResult {
  const inst = INSTRUMENTS[config.instrument];
  const { daily, warnings } = buildLeveragedSeries(data, config);
  const n = daily.dates.length;
  if (n < 2) return emptyResult(config, warnings);

  const dca = runDCA(daily, config);

  // Portfolio drawdown is measured on portfolio value, which differs from NAV
  // drawdown because fresh contributions keep arriving.
  const portfolio: PortfolioPoint[] = new Array(n);
  let peak = 0;
  let maxDD = 0;
  let maxDDDate = daily.dates[0]!;
  for (let i = 0; i < n; i++) {
    const v = dca.value[i]!;
    if (v > peak) peak = v;
    const dd = peak > 0 ? v / peak - 1 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDDate = daily.dates[i]!;
    }
    portfolio[i] = {
      date: daily.dates[i]!,
      value: v,
      contributions: dca.contributions[i]!,
      profit: v - dca.contributions[i]!,
      drawdown: dd,
      navDrawdown: daily.drawdown[i]!,
      dataType: daily.dataType[i] === 1 ? "ACTUAL" : "SYNTHETIC",
    };
  }

  let navMaxDD = 0;
  let navMaxDDDate = daily.dates[0]!;
  for (let i = 0; i < n; i++) {
    if (daily.drawdown[i]! < navMaxDD) {
      navMaxDD = daily.drawdown[i]!;
      navMaxDDDate = daily.dates[i]!;
    }
  }

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

  // NAV statistics
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 1; i < n; i++) {
    const r = daily.dailyReturn[i]!;
    if (!isFinite(r)) continue;
    sum += r;
    sumSq += r * r;
    count++;
  }
  const mean = count ? sum / count : 0;
  const variance = count > 1 ? sumSq / count - mean * mean : 0;
  const volatility = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
  const cagr =
    Math.pow(daily.nav[n - 1]! / daily.nav[0]!, 365 / Math.max(1, dayDiff(daily.dates[0]!, daily.dates[n - 1]!))) - 1;
  const sharpeLike = volatility > 0 ? cagr / volatility : 0;

  const yearly = new Map<number, { first: number; last: number }>();
  for (let i = 0; i < n; i++) {
    const y = Number(daily.dates[i]!.slice(0, 4));
    const cur = yearly.get(y);
    if (!cur) yearly.set(y, { first: daily.nav[i]!, last: daily.nav[i]! });
    else cur.last = daily.nav[i]!;
  }
  let bestYear: SimulationResult["bestYear"] = null;
  let worstYear: SimulationResult["worstYear"] = null;
  for (const [year, v] of yearly) {
    const ret = v.last / v.first - 1;
    if (!bestYear || ret > bestYear.return) bestYear = { year, return: ret };
    if (!worstYear || ret < worstYear.return) worstYear = { year, return: ret };
  }

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

  return {
    config,
    daily,
    ledger,
    portfolio,
    totalContributions,
    finalValue,
    profit: finalValue - totalContributions,
    totalReturn: totalContributions > 0 ? finalValue / totalContributions - 1 : 0,
    xirr: xirr(flows),
    maxDrawdown: maxDD,
    maxDrawdownDate: maxDDDate,
    navMaxDrawdown: navMaxDD,
    navMaxDrawdownDate: navMaxDDDate,
    episodes,
    longestRecoveryMonths,
    longestRecoveryOngoing,
    contributionCount: dca.buyIndices.length,
    startDate: daily.dates[0]!,
    endDate: daily.dates[n - 1]!,
    syntheticShare: syntheticDays / n,
    volatility,
    sharpeLike,
    bestYear,
    worstYear,
    monthsBelowContributions: monthsBelow,
    warnings: allWarnings,
  };
}

export function dayDiff(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
}