import { Metric } from "@/components/app/primitives";
import { money, signedPercent } from "@/lib/format";
import type { CurrencyTotals } from "@/lib/portfolio/portfolioCalculations";

export function PortfolioSummary({
  totals,
  transactionCount,
}: {
  totals: CurrencyTotals[];
  transactionCount: number;
}) {
  if (totals.length === 0) {
    return null;
  }
  return (
    <div className="space-y-4">
      {totals.map((t) => (
        <div key={t.currency}>
          {totals.length > 1 ? (
            <div className="label-xs mb-2">{t.currency} totals</div>
          ) : null}
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-5">
            <Metric label="Total invested" value={money(t.invested, t.currency, 0)} />
            <Metric
              label="Portfolio value"
              value={t.value === null ? "Price unavailable" : money(t.value, t.currency, 0)}
              tone="gain"
              sub="Last available market price"
            />
            <Metric
              label="Unrealised P/L"
              value={t.unrealized === null ? "—" : money(t.unrealized, t.currency, 0)}
              tone={(t.unrealized ?? 0) >= 0 ? "gain" : "loss"}
              sub={signedPercent(t.returnPct, 2)}
            />
            <Metric
              label="Realised P/L (FIFO)"
              value={money(t.realized, t.currency, 0)}
              tone={t.realized >= 0 ? "gain" : "loss"}
            />
            <Metric
              label="Holdings / records"
              value={`${t.holdings} / ${transactionCount}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
