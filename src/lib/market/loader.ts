import type { MarketDataset, MarketSeries, QualityIssue, SeriesKey } from "./types";

const KEYS: SeriesKey[] = ["ndx", "spx", "qqq", "spy", "tqqq", "spxl", "irx"];

let cache: MarketDataset | null = null;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return (await res.json()) as T;
}

/** Loads every bundled market series once and caches it in memory. */
export async function loadMarketData(): Promise<MarketDataset> {
  if (cache) return cache;
  const [series, issues] = await Promise.all([
    Promise.all(KEYS.map((k) => getJson<MarketSeries>(`/data/${k}.json`))),
    getJson<QualityIssue[]>("/data/quality-issues.json"),
  ]);
  const out = { issues } as MarketDataset;
  KEYS.forEach((k, i) => {
    out[k] = series[i]!;
  });
  cache = out;
  return out;
}

export const marketDataQuery = {
  queryKey: ["market-data"],
  queryFn: loadMarketData,
  staleTime: Infinity,
  gcTime: Infinity,
};

/** Index of the last observation on or before `date`. -1 when none. */
export function indexAtOrBefore(dates: string[], date: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]! <= date) {
      res = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return res;
}

/** Index of the first observation on or after `date`. -1 when none. */
export function indexAtOrAfter(dates: string[], date: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]! >= date) {
      res = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return res;
}