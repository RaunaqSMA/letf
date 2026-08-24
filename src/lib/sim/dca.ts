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
  buyIndices: number[];
  unitsBought: number[];
  /** Contribution amount for each buy index */
  amounts: number[];
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

/** Runs contribution-based DCA over a precomputed NAV path. */
export function runDCA(
  daily: Pick<DailySeries, "dates" | "nav">,
  config: Pick<
    SimulationConfig,
    "contribution" | "frequency" | "timing" | "transactionCost" | "customEntries"
  >,
): DCAPath {
  const n = daily.dates.length;
  const units = new Float64Array(n);
  const contributions = new Float64Array(n);
  const value = new Float64Array(n);
  const custom = config.frequency === "custom";
  const customHits = custom ? customIndices(daily.dates, config.customEntries ?? []) : [];
  const buyIndices = custom
    ? customHits.map((h) => h.index)
    : contributionIndices(daily.dates, config.frequency, config.timing);
  const amountAt = new Map<number, number>();
  if (custom) {
    for (const h of customHits) amountAt.set(h.index, (amountAt.get(h.index) ?? 0) + h.amount);
  }
  const buySet = new Set(buyIndices);
  const unitsBought: number[] = [];
  const amounts: number[] = [];

  let cumUnits = 0;
  let cumContrib = 0;
  for (let i = 0; i < n; i++) {
    if (buySet.has(i)) {
      const price = daily.nav[i]!;
      const amount = custom ? (amountAt.get(i) ?? 0) : config.contribution;
      const invested = Math.max(0, amount - config.transactionCost);
      const bought = price > 0 ? invested / price : 0;
      cumUnits += bought;
      cumContrib += amount;
      unitsBought.push(bought);
      amounts.push(amount);
    }
    units[i] = cumUnits;
    contributions[i] = cumContrib;
    value[i] = cumUnits * daily.nav[i]!;
  }
  const uniqueBuyIndices = [...buySet].sort((a, b) => a - b);
  return { units, contributions, value, buyIndices: uniqueBuyIndices, unitsBought, amounts };
}