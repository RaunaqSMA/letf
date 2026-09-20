import { money, number as fmtNumber, signedPercent } from "@/lib/format";
import type { HoldingValued } from "@/lib/portfolio/types";

export function HoldingsTable({
  holdings,
  live,
}: {
  holdings: HoldingValued[];
  /** symbol (uppercase) → "Live · HH:MM ET" label for intraday-valued rows. */
  live?: Record<string, string>;
}) {
  const open = holdings.filter((h) => h.units > 1e-9);
  if (open.length === 0) {
    return (
      <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        No open holdings yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/60">
          <tr className="border-b border-border">
            <th className="label-xs px-3 py-2 text-left">Symbol</th>
            <th className="label-xs px-3 py-2 text-right">Units</th>
            <th className="label-xs px-3 py-2 text-right">Average cost</th>
            <th className="label-xs px-3 py-2 text-right">Invested</th>
            <th className="label-xs px-3 py-2 text-right">Current price</th>
            <th className="label-xs px-3 py-2 text-right">Current value</th>
            <th className="label-xs px-3 py-2 text-right">Unrealised P/L</th>
            <th className="label-xs px-3 py-2 text-right">Return</th>
          </tr>
        </thead>
        <tbody>
          {open.map((h) => (
            <tr key={`${h.symbol}-${h.currency}`} className="border-b border-border last:border-0">
              <td className="num px-3 py-2 font-medium">
                {h.symbol}
                <span className="ml-2 text-[10px] text-muted-foreground">{h.currency}</span>
              </td>
              <td className="num px-3 py-2 text-right">{fmtNumber(h.units, 4)}</td>
              <td className="num px-3 py-2 text-right">{money(h.averageCost, h.currency)}</td>
              <td className="num px-3 py-2 text-right">{money(h.invested, h.currency)}</td>
              <td className="num px-3 py-2 text-right">
                {h.currentPrice === null ? (
                  <span className="text-xs text-muted-foreground">Price unavailable</span>
                ) : (
                  <>
                    {money(h.currentPrice, h.currency)}
                    {live?.[h.symbol.toUpperCase()] ? (
                      <div className="text-[10px] font-medium text-primary">
                        {live[h.symbol.toUpperCase()]}
                      </div>
                    ) : null}
                  </>
                )}
              </td>
              <td className="num px-3 py-2 text-right">
                {h.currentValue === null ? "—" : money(h.currentValue, h.currency)}
              </td>
              <td
                className={`num px-3 py-2 text-right ${
                  (h.unrealized ?? 0) >= 0 ? "text-gain" : "text-loss"
                }`}
              >
                {h.unrealized === null ? "—" : money(h.unrealized, h.currency)}
              </td>
              <td
                className={`num px-3 py-2 text-right ${
                  (h.returnPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                }`}
              >
                {signedPercent(h.returnPct, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
