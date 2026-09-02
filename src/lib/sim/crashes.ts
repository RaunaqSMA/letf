import { indexAtOrAfter, indexAtOrBefore } from "@/lib/market/loader";
import type { SimulationResult } from "./types";

export interface CrashEvent {
  id: string;
  name: string;
  start: string;
  end: string;
  blurb: string;
}

export const CRASHES: CrashEvent[] = [
  {
    id: "dotcom",
    name: "Dot-com crash",
    start: "2000-03-10",
    end: "2002-10-09",
    blurb:
      "The Nasdaq-100 lost roughly four fifths of its value over two and a half years of grinding, high-volatility decline — the worst possible environment for a daily-reset 3x fund.",
  },
  {
    id: "gfc",
    name: "Global financial crisis",
    start: "2007-10-09",
    end: "2009-03-09",
    blurb:
      "A 17-month bear market with extreme realised volatility. Daily rebalancing compounds against the holder when large moves alternate in both directions.",
  },
  {
    id: "covid",
    name: "COVID crash",
    start: "2020-02-19",
    end: "2020-03-23",
    blurb:
      "Fast and violent: about five weeks from peak to trough, followed by an unusually quick recovery. Short, sharp declines hurt leverage less than long volatile ones.",
  },
  {
    id: "aug2011",
    name: "2011 debt-ceiling selloff",
    start: "2011-07-07",
    end: "2011-10-03",
    blurb:
      "A three-month shock with repeated 4-5% swings in both directions. Short but exceptionally volatile — the classic decay environment.",
  },
  {
    id: "q4_2018",
    name: "Q4 2018 selloff",
    start: "2018-10-01",
    end: "2018-12-24",
    blurb:
      "A rapid quarter-long derating into a rate-hiking cycle, recovered within months. Useful as a 'mild' comparison case.",
  },
  {
    id: "bear2022",
    name: "2022 bear market",
    start: "2021-11-19",
    end: "2022-12-28",
    blurb:
      "A rate-driven derating of long-duration growth assets, with financing costs rising at the same time leverage was losing money.",
  },
];

export interface CrashStats {
  event: CrashEvent;
  hasData: boolean;
  peakDate: string;
  troughDate: string;
  underlyingDecline: number;
  navDecline: number;
  navDeclineDataType: "SYNTHETIC" | "ACTUAL" | "MIXED";
  portfolioDecline: number;
  contributedDuring: number;
  portfolioAtPeak: number;
  portfolioAtTrough: number;
  navRecoveryDate: string | null;
  navRecoveryMonths: number | null;
  portfolioRecoveryDate: string | null;
  portfolioRecoveryMonths: number | null;
  /** What a DCA investor actually experienced through the event. */
  dca: CrashDCAExperience;
}

export interface CrashDCAExperience {
  /** Units accumulated between the peak and the trough. */
  unitsBoughtDuring: number;
  /** Share of all units ever bought that were bought inside this window. */
  unitsShareOfTotal: number;
  contributionsDuring: number;
  /** Average price paid inside the window. */
  averagePriceDuring: number | null;
  /** Value at the end of the sample of only the units bought in this window. */
  terminalValueOfWindowUnits: number;
  /** Multiple on money invested during the window, measured at sample end. */
  multipleOnWindowMoney: number | null;
  /** Worst gap between portfolio value and money contributed, in currency. */
  worstUnrealisedLoss: number;
  /** Same gap expressed against contributions at that moment. */
  worstUnrealisedLossPct: number;
  /** Trading days spent with the portfolio below total contributions. */
  daysUnderwater: number;
  /** Months from the trough until the portfolio again exceeded contributions. */
  monthsToBreakEvenOnContributions: number | null;
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return (
    (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth())
  );
}

/** Measures an event window against a completed simulation. */
export function analyseCrash(result: SimulationResult, event: CrashEvent): CrashStats {
  const { dates, nav, underlying, dataType } = result.daily;
  const empty: CrashStats = {
    event,
    hasData: false,
    peakDate: event.start,
    troughDate: event.end,
    underlyingDecline: 0,
    navDecline: 0,
    navDeclineDataType: "SYNTHETIC",
    portfolioDecline: 0,
    contributedDuring: 0,
    portfolioAtPeak: 0,
    portfolioAtTrough: 0,
    navRecoveryDate: null,
    navRecoveryMonths: null,
    portfolioRecoveryDate: null,
    portfolioRecoveryMonths: null,
    dca: {
      unitsBoughtDuring: 0,
      unitsShareOfTotal: 0,
      contributionsDuring: 0,
      averagePriceDuring: null,
      terminalValueOfWindowUnits: 0,
      multipleOnWindowMoney: null,
      worstUnrealisedLoss: 0,
      worstUnrealisedLossPct: 0,
      daysUnderwater: 0,
      monthsToBreakEvenOnContributions: null,
    },
  };
  if (dates.length === 0) return empty;
  const s = indexAtOrAfter(dates, event.start);
  const e = indexAtOrBefore(dates, event.end);
  if (s < 0 || e < 0 || e <= s) return empty;

  let troughIdx = s;
  for (let i = s; i <= e; i++) if (nav[i]! < nav[troughIdx]!) troughIdx = i;

  const navPeak = nav[s]!;
  const navTrough = nav[troughIdx]!;
  const portfolio = result.portfolio;
  const pv = (i: number) => portfolio[i]!.value;

  let portTroughIdx = s;
  for (let i = s; i <= e; i++) if (pv(i) < pv(portTroughIdx)) portTroughIdx = i;

  const contributedDuring =
    portfolio[e]!.contributions - portfolio[s]!.contributions;

  let navRecoveryIdx: number | null = null;
  for (let i = troughIdx; i < dates.length; i++) {
    if (nav[i]! >= navPeak) {
      navRecoveryIdx = i;
      break;
    }
  }
  const peakPortfolio = pv(s);
  let portRecoveryIdx: number | null = null;
  for (let i = portTroughIdx; i < dates.length; i++) {
    if (pv(i) >= peakPortfolio) {
      portRecoveryIdx = i;
      break;
    }
  }

  let sType = dataType[s]!;
  let mixed = false;
  for (let i = s; i <= troughIdx; i++) if (dataType[i] !== sType) mixed = true;

  // --- What the DCA investor lived through ---------------------------------
  let unitsDuring = 0;
  let moneyDuring = 0;
  for (let k = 0; k < result.ledger.length; k++) {
    const row = result.ledger[k]!;
    if (row.date < dates[s]! || row.date > dates[e]!) continue;
    unitsDuring += row.unitsBought;
    moneyDuring += row.contribution;
  }
  const totalUnits = result.daily.dates.length
    ? (result.ledger[result.ledger.length - 1]?.cumulativeUnits ?? 0)
    : 0;
  const finalNav = nav[dates.length - 1]!;
  const terminalValueOfWindowUnits = unitsDuring * finalNav;

  let worstLoss = 0;
  let worstLossPct = 0;
  let daysUnderwater = 0;
  for (let i = s; i <= e; i++) {
    const p = portfolio[i]!;
    const gap = p.value - p.contributions;
    if (p.contributions > 0 && gap < 0) {
      daysUnderwater++;
      if (gap < worstLoss) {
        worstLoss = gap;
        worstLossPct = gap / p.contributions;
      }
    }
  }
  let breakEven: number | null = null;
  for (let i = portTroughIdx; i < dates.length; i++) {
    const p = portfolio[i]!;
    if (p.contributions > 0 && p.value >= p.contributions) {
      breakEven = monthsBetween(dates[portTroughIdx]!, dates[i]!);
      break;
    }
  }

  return {
    event,
    hasData: true,
    dca: {
      unitsBoughtDuring: unitsDuring,
      unitsShareOfTotal: totalUnits > 0 ? unitsDuring / totalUnits : 0,
      contributionsDuring: moneyDuring,
      averagePriceDuring: unitsDuring > 0 ? moneyDuring / unitsDuring : null,
      terminalValueOfWindowUnits,
      multipleOnWindowMoney: moneyDuring > 0 ? terminalValueOfWindowUnits / moneyDuring : null,
      worstUnrealisedLoss: worstLoss,
      worstUnrealisedLossPct: worstLossPct,
      daysUnderwater,
      monthsToBreakEvenOnContributions: breakEven,
    },
    peakDate: dates[s]!,
    troughDate: dates[troughIdx]!,
    underlyingDecline: underlying[troughIdx]! / underlying[s]! - 1,
    navDecline: navTrough / navPeak - 1,
    navDeclineDataType: mixed ? "MIXED" : sType === 1 ? "ACTUAL" : "SYNTHETIC",
    portfolioDecline: peakPortfolio > 0 ? pv(portTroughIdx) / peakPortfolio - 1 : 0,
    contributedDuring,
    portfolioAtPeak: peakPortfolio,
    portfolioAtTrough: pv(portTroughIdx),
    navRecoveryDate: navRecoveryIdx === null ? null : dates[navRecoveryIdx]!,
    navRecoveryMonths:
      navRecoveryIdx === null ? null : monthsBetween(dates[s]!, dates[navRecoveryIdx]!),
    portfolioRecoveryDate: portRecoveryIdx === null ? null : dates[portRecoveryIdx]!,
    portfolioRecoveryMonths:
      portRecoveryIdx === null ? null : monthsBetween(dates[s]!, dates[portRecoveryIdx]!),
  };
}