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
