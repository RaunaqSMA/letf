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

  return {
    event,
    hasData: true,
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