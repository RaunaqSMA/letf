import { createFileRoute } from "@tanstack/react-router";

/**
 * Public latest-price + recent history lookup for arbitrary tickers
 * (e.g. personal records in NVDA, AAPL…). The bundled market history only
 * covers the seven research series, so this tops up anything else.
 *
 * GET /api/public/quotes?symbols=NVDA,AAPL
 * → { asOf, quotes: { NVDA: { price, date, dates[], close[] } } }
 *
 * One-day lag is preserved: today's incomplete bar is dropped.
 */

const SYMBOL_RE = /^[A-Za-z0-9.\-^]{1,20}(:[A-Za-z]{1,10})?$/;
const MAX_SYMBOLS = 12;

interface QuoteOut {
  price: number;
  date: string;
  dates: string[];
  close: number[];
  /** Latest intraday price during market hours (null outside them). */
  livePrice: number | null;
  /** ISO timestamp of livePrice. */
  liveTime: string | null;
}

function isoDay(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** "NVDA:NASDAQ" → "NVDA" (Yahoo uses the bare ticker). */
function toYahooSymbol(symbol: string): string {
  return symbol.split(":")[0]!;
}

async function fetchQuote(symbol: string, cutoff: string): Promise<QuoteOut | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}` +
    `?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const r = json?.chart?.result?.[0];
  const meta = r?.meta ?? {};
  const stamps: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];

  const lp = meta?.regularMarketPrice;
  const lt = meta?.regularMarketTime;
  const livePrice = typeof lp === "number" && Number.isFinite(lp) ? lp : null;
  const liveTime =
    typeof lt === "number" && Number.isFinite(lt) ? new Date(lt * 1000).toISOString() : null;

  const dates: string[] = [];
  const close: number[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const d = isoDay(stamps[i]!);
    if (d >= cutoff) continue;
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    dates.push(d);
    close.push(c);
  }
  if (!dates.length && livePrice === null) return null;
  return {
    price: close.length ? close[close.length - 1]! : livePrice!,
    date: dates.length ? dates[dates.length - 1]! : (liveTime ?? cutoff).slice(0, 10),
    dates,
    close,
    livePrice,
    liveTime,
  };
}

export const Route = createFileRoute("/api/public/quotes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("symbols") ?? "";
        const symbols = [
          ...new Set(
            raw
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter((s) => SYMBOL_RE.test(s)),
          ),
        ].slice(0, MAX_SYMBOLS);

        if (!symbols.length) {
          return new Response(JSON.stringify({ quotes: {} }), {
            headers: { "content-type": "application/json" },
          });
        }

        const cutoff = new Date().toISOString().slice(0, 10);
        const entries = await Promise.all(
          symbols.map(async (s) => {
            try {
              return [s, await fetchQuote(s, cutoff)] as const;
            } catch {
              return [s, null] as const;
            }
          }),
        );
        const quotes: Record<string, QuoteOut> = {};
        for (const [s, q] of entries) if (q) quotes[s] = q;

        return new Response(JSON.stringify({ asOf: cutoff, quotes }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store, max-age=0",
          },
        });
      },
    },
  },
});
