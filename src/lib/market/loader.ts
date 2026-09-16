import type { MarketDataset, MarketSeries, QualityIssue, SeriesKey } from "./types";

const KEYS: SeriesKey[] = ["ndx", "spx", "qqq", "spy", "tqqq", "spxl", "irx"];

let cache: MarketDataset | null = null;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return (await res.json()) as T;
}

interface LiveBar {
  dates: string[];
  close: number[];
  adjClose: number[];
}

/** Appends any live bars newer than the bundled history (one-day lag applied server-side). */
function mergeLive(series: MarketSeries, live: LiveBar | undefined): MarketSeries {
  if (!live || !live.dates.length) return series;
  const last = series.dates[series.dates.length - 1] ?? "";
  const dates = [...series.dates];
  const close = [...series.close];
  const adjClose = [...series.adjClose];
  for (let i = 0; i < live.dates.length; i++) {
    const d = live.dates[i]!;
    if (d <= last) continue;
    dates.push(d);
    close.push(live.close[i]!);
    adjClose.push(live.adjClose[i]!);
  }
  if (dates.length === series.dates.length) return series;
  return { ...series, dates, close, adjClose, retrieved: dates[dates.length - 1]! };
}

/** Loads every bundled market series once and tops it up with live daily bars. */
export async function loadMarketData(): Promise<MarketDataset> {
  if (cache) return cache;
  const [series, issues] = await Promise.all([
    Promise.all(KEYS.map((k) => getJson<MarketSeries>(`/data/${k}.json`))),
    getJson<QualityIssue[]>("/data/quality-issues.json"),
  ]);

  let live: Record<string, LiveBar> = {};
  try {
    const res = await fetch("/api/public/market-latest");
    if (res.ok) {
      const json = (await res.json()) as { series?: Record<string, LiveBar> };
      live = json.series ?? {};
    }
  } catch {
    /* offline or feed down — fall back to bundled history */
  }

  const out = { issues } as MarketDataset;
  KEYS.forEach((k, i) => {
    out[k] = mergeLive(series[i]!, live[k]);
  });
  cache = out;
  return out;
}

export const marketDataQuery = {
  queryKey: ["market-data"],
  queryFn: loadMarketData,
  staleTime: 30 * 60 * 1000,
  gcTime: Infinity,
  refetchOnWindowFocus: true,
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