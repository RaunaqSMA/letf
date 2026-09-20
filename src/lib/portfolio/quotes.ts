import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { priceSeries } from "./prices";
import type { MarketDataset } from "@/lib/market/types";

export interface ExternalQuote {
  price: number;
  date: string;
  dates: string[];
  close: number[];
  /** Latest intraday price during market hours (null outside them). */
  livePrice?: number | null;
  /** ISO timestamp of livePrice. */
  liveTime?: string | null;
}

/**
 * Latest prices + 1y history for symbols the bundled market data does not
 * cover (any US ticker, e.g. NVDA). Returns an empty map while loading or
 * when a symbol cannot be quoted — callers fall back to "Price unavailable".
 */
export function useExternalQuotes(
  symbols: string[],
  market: MarketDataset | undefined,
): Record<string, ExternalQuote> {
  const missing = useMemo(
    () =>
      [
        ...new Set(
          symbols
            .map((s) => s.toUpperCase())
            .filter((s) => s && !priceSeries(market, s)),
        ),
      ].sort(),
    [symbols, market],
  );

  const query = useQuery({
    queryKey: ["external-quotes", missing.join(",")],
    enabled: missing.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/public/quotes?symbols=${encodeURIComponent(missing.join(","))}`,
      );
      if (!res.ok) throw new Error("Quote lookup failed");
      const json = (await res.json()) as { quotes: Record<string, ExternalQuote> };
      return json.quotes ?? {};
    },
  });

  return query.data ?? {};
}

/**
 * Live intraday quotes for ALL given symbols (including the bundled research
 * tickers). Refreshes every minute while open; used only by the Records page —
 * research charts keep the one-day-lagged daily close.
 */
export function useLiveQuotes(symbols: string[]): Record<string, ExternalQuote> {
  const wanted = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))].sort(),
    [symbols],
  );

  const query = useQuery({
    queryKey: ["live-quotes", wanted.join(",")],
    enabled: wanted.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/public/quotes?symbols=${encodeURIComponent(wanted.join(","))}`,
      );
      if (!res.ok) throw new Error("Live quote lookup failed");
      const json = (await res.json()) as { quotes: Record<string, ExternalQuote> };
      return json.quotes ?? {};
    },
  });

  return query.data ?? {};
}

/** "Live · 14:32 ET" label for an intraday quote timestamp. */
export function liveQuoteLabel(liveTime: string | null | undefined): string {
  if (!liveTime) return "Live";
  const t = new Date(liveTime);
  if (Number.isNaN(t.getTime())) return "Live";
  const hm = t.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
  return `Live · ${hm} IST`;
}
