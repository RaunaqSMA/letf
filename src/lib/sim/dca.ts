import type { DailySeries, Frequency, SimulationConfig } from "./types";

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
}

/** Runs contribution-based DCA over a precomputed NAV path. */
export function runDCA(
  daily: Pick<DailySeries, "dates" | "nav">,
  config: Pick<SimulationConfig, "contribution" | "frequency" | "timing" | "transactionCost">,
): DCAPath {
  const n = daily.dates.length;
  const units = new Float64Array(n);
  const contributions = new Float64Array(n);
  const value = new Float64Array(n);
  const buyIndices = contributionIndices(daily.dates, config.frequency, config.timing);
  const buySet = new Set(buyIndices);
  const unitsBought: number[] = [];

  let cumUnits = 0;
  let cumContrib = 0;
  for (let i = 0; i < n; i++) {
    if (buySet.has(i)) {
      const price = daily.nav[i]!;
      const invested = Math.max(0, config.contribution - config.transactionCost);
      const bought = price > 0 ? invested / price : 0;
      cumUnits += bought;
      cumContrib += config.contribution;
      unitsBought.push(bought);
    }
    units[i] = cumUnits;
    contributions[i] = cumContrib;
    value[i] = cumUnits * daily.nav[i]!;
  }
  return { units, contributions, value, buyIndices, unitsBought };
}