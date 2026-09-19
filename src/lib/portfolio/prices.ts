import type { MarketDataset, SeriesKey } from "@/lib/market/types";

const SYMBOL_SERIES: Record<string, SeriesKey> = {
  TQQQ: "tqqq",
  SPXL: "spxl",
  QQQ: "qqq",
  SPY: "spy",
  NDX: "ndx",
  SPX: "spx",
};

/** Latest available close for a symbol, or null when the app has no data for it. */
export function latestPrice(
  data: MarketDataset | undefined,
  symbol: string,
): { price: number; date: string } | null {
  const series = priceSeries(data, symbol);
  if (!series || !series.dates.length) return null;
  const i = series.dates.length - 1;
  return { price: series.close[i]!, date: series.dates[i]! };
}

export function priceSeries(
  data: MarketDataset | undefined,
  symbol: string,
): { dates: string[]; close: number[] } | null {
  if (!data) return null;
  const key = SYMBOL_SERIES[symbol.toUpperCase()];
  if (!key) return null;
  const s = data[key];
  return s ? { dates: s.dates, close: s.close } : null;
}

/** Close on or before `date`, or null. */
export function priceAt(
  data: MarketDataset | undefined,
  symbol: string,
  date: string,
): number | null {
  const s = priceSeries(data, symbol);
  if (!s) return null;
  let lo = 0;
  let hi = s.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.dates[mid]! <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? s.close[found]! : null;
}

export const KNOWN_PRICE_SYMBOLS = Object.keys(SYMBOL_SERIES);
