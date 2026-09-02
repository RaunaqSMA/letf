import type { CustomEntry, DailySeries, Frequency, SimulationConfig } from "./types";

/** Indices of the trading days on which a contribution lands. */
export function contributionIndices(
  dates: string[],
  frequency: Frequency,
  timing: "first" | "last",
): number[] {
  if (dates.length === 0) return [];
  if (frequency === "once") return [0];

  const bucketOf = (d: string): string => {
    const y = d.slice(0, 4);
    const m = Number(d.slice(5, 7));
    switch (frequency) {
      case "monthly":
        return d.slice(0, 7);
      case "quarterly":
        return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
      case "yearly":
        return y;
      case "weekly": {
        const t = new Date(d + "T00:00:00Z");
        const day = t.getUTCDay();
        const monday = new Date(t.getTime() - ((day + 6) % 7) * 86400000);
        return monday.toISOString().slice(0, 10);
      }
      default:
        return d;
    }
  };

  const out: number[] = [];
  let currentBucket = "";
  let lastIdx = -1;
  for (let i = 0; i < dates.length; i++) {
    const b = bucketOf(dates[i]!);
    if (b !== currentBucket) {
      if (timing === "last" && lastIdx >= 0) out.push(lastIdx);
      if (timing === "first") out.push(i);
      currentBucket = b;
    }
    lastIdx = i;
  }
  if (timing === "last" && lastIdx >= 0) out.push(lastIdx);
  return out;
}

export interface DCAPath {
  /** Cumulative units held after each trading day */
  units: Float64Array;
  contributions: Float64Array;
  value: Float64Array;
  /** Cumulative cash actually invested after transaction costs. */
  invested: Float64Array;
  buyIndices: number[];
  unitsBought: number[];
  /** Contribution amount for each buy index */
  amounts: number[];
  /** Volume-weighted average NAV paid, after each buy. */
  averageCostAt: number[];
  totalTransactionCost: number;
}

/** Maps manual entries onto the first trading day on/after each entry date. */
export function customIndices(
  dates: string[],
  entries: CustomEntry[],
): { index: number; amount: number }[] {
  if (dates.length === 0) return [];
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const out: { index: number; amount: number }[] = [];
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    if (!e.date || e.amount <= 0) continue;
    if (e.date > last || e.date < first) continue;
    let lo = 0;
    let hi = dates.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid]! >= e.date) {
        found = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    if (found >= 0) out.push({ index: found, amount: e.amount });
  }
  return out;
}

export type DcaConfig = Pick<
  SimulationConfig,
  | "contribution"
  | "frequency"
  | "timing"
  | "transactionCost"
  | "customEntries"
  | "startingCapital"
  | "contributionGrowth"
  | "indexContributionsToInflation"
  | "inflationRate"
  | "contributionStartDate"
  | "contributionEndDate"
>;

/**
 * Runs contribution-based DCA over a precomputed NAV path.
 *
 * Contribution schedule rules, all explicit:
 *  - `startingCapital` is invested on the first trading day of the window.
 *  - recurring contributions respect `contributionStartDate` / `contributionEndDate`.
 *  - the recurring amount grows at `contributionGrowth` (or `inflationRate`
 *    when contributions are indexed to inflation), compounded annually from
 *    the first recurring contribution.
 *  - `transactionCost` is deducted from each contribution before units are
 *    bought, so contributions and invested cash are tracked separately.
 */
export function runDCA(daily: Pick<DailySeries, "dates" | "nav">, config: DcaConfig): DCAPath {
  const n = daily.dates.length;
  const units = new Float64Array(n);
  const contributions = new Float64Array(n);
  const invested = new Float64Array(n);
  const value = new Float64Array(n);
  if (n === 0) {
    return {
      units,
      contributions,
      value,
      invested,
      buyIndices: [],
      unitsBought: [],
      amounts: [],
      averageCostAt: [],
      totalTransactionCost: 0,
    };
  }

  const custom = config.frequency === "custom";
  const customHits = custom ? customIndices(daily.dates, config.customEntries ?? []) : [];
  const growth = config.indexContributionsToInflation
    ? config.inflationRate
    : config.contributionGrowth;

  const from = config.contributionStartDate || daily.dates[0]!;
  const to = config.contributionEndDate || daily.dates[n - 1]!;

  const scheduled = custom
    ? customHits.map((h) => h.index)
    : contributionIndices(daily.dates, config.frequency, config.timing).filter((i) => {
        const d = daily.dates[i]!;
        return d >= from && d <= to;
      });

  const amountAt = new Map<number, number>();
  if (custom) {
    for (const h of customHits) amountAt.set(h.index, (amountAt.get(h.index) ?? 0) + h.amount);
  } else if (scheduled.length > 0) {
    const anchor = Date.parse(daily.dates[scheduled[0]!]!);
    for (const i of scheduled) {
      const yrs = (Date.parse(daily.dates[i]!) - anchor) / (365 * 86400000);
      const amt = config.contribution * Math.pow(1 + growth, yrs);
      amountAt.set(i, (amountAt.get(i) ?? 0) + amt);
    }
  }
  if (config.startingCapital > 0) {
    amountAt.set(0, (amountAt.get(0) ?? 0) + config.startingCapital);
    if (!scheduled.includes(0)) scheduled.unshift(0);
  }

  const buySet = new Set(scheduled);
  const uniqueBuyIndices = [...buySet].sort((a, b) => a - b);
  const unitsBought: number[] = [];
  const amounts: number[] = [];
  const averageCostAt: number[] = [];

  let cumUnits = 0;
  let cumContrib = 0;
  let cumInvested = 0;
  let txCost = 0;
  for (let i = 0; i < n; i++) {
    if (buySet.has(i)) {
      const price = daily.nav[i]!;
      const amount = amountAt.get(i) ?? 0;
      const cost = amount > 0 ? Math.min(config.transactionCost, amount) : 0;
      const investedNow = Math.max(0, amount - cost);
      const bought = price > 0 ? investedNow / price : 0;
      cumUnits += bought;
      cumContrib += amount;
      cumInvested += investedNow;
      txCost += cost;
      unitsBought.push(bought);
      amounts.push(amount);
      averageCostAt.push(cumUnits > 0 ? cumInvested / cumUnits : 0);
    }
    units[i] = cumUnits;
    contributions[i] = cumContrib;
    invested[i] = cumInvested;
    value[i] = cumUnits * daily.nav[i]!;
  }
  return {
    units,
    contributions,
    value,
    invested,
    buyIndices: uniqueBuyIndices,
    unitsBought,
    amounts,
    averageCostAt,
    totalTransactionCost: txCost,
  };
}
