import { createFileRoute } from "@tanstack/react-router";

/**
 * Live top-up for the bundled market history.
 *
 * Returns only recent daily bars for each series; the client merges anything
 * newer than what ships in /public/data. Today's (possibly incomplete) bar is
 * dropped, giving the deliberate one-day lag.
 */

const SYMBOLS: Record<string, string> = {
  ndx: "^NDX",
  spx: "^GSPC",
  qqq: "QQQ",
  spy: "SPY",
  tqqq: "TQQQ",
  spxl: "SPXL",
  irx: "^IRX",
};

interface Bar {
  dates: string[];
  close: number[];
  adjClose: number[];
}

function isoDay(ts: number): string {
  // Yahoo timestamps are exchange-open instants; the UTC date is the trade date.
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function fetchSeries(symbol: string, cutoff: string): Promise<Bar> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=6mo&interval=1d&includeAdjustedClose=true`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
  const json = (await res.json()) as any;
  const r = json?.chart?.result?.[0];
  const stamps: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const adj: (number | null)[] = r?.indicators?.adjclose?.[0]?.adjclose ?? closes;

  const out: Bar = { dates: [], close: [], adjClose: [] };
  for (let i = 0; i < stamps.length; i++) {
    const d = isoDay(stamps[i]!);
    if (d >= cutoff) continue; // one-day lag: never include today's live bar
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const a = adj[i];
    out.dates.push(d);
    out.close.push(c);
    out.adjClose.push(a != null && Number.isFinite(a) ? a : c);
  }
  return out;
}

export const Route = createFileRoute("/api/public/market-latest")({
  server: {
    handlers: {
      GET: async () => {
        const cutoff = new Date().toISOString().slice(0, 10); // today (UTC), excluded
        const keys = Object.keys(SYMBOLS);
        const results = await Promise.all(
          keys.map(async (k) => {
            try {
              return [k, await fetchSeries(SYMBOLS[k]!, cutoff)] as const;
            } catch {
              return [k, null] as const;
            }
          }),
        );
        const series: Record<string, Bar> = {};
        for (const [k, v] of results) if (v) series[k] = v;

        return new Response(JSON.stringify({ asOf: cutoff, series }), {
          headers: {
            "content-type": "application/json",
            // refresh at most hourly at the edge
            "cache-control": "public, max-age=300, s-maxage=1800",
          },
        });
      },
    },
  },
});
