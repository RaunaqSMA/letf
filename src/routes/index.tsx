import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { DrawdownChart, PortfolioChart } from "@/components/app/charts";
import {
  Callout,
  DataTypeBadge,
  LoadingState,
  Metric,
  PageHeader,
  Section,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { INSTRUMENTS } from "@/lib/market/types";
import { currency, monthsLabel, monthYear, percent, shortDate, signedPercent } from "@/lib/format";
import { analyseCrash, CRASHES } from "@/lib/sim/crashes";
import { useSimulation } from "@/lib/sim/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Headline results for dollar-cost averaging into a 3x leveraged ETF: money-weighted return, drawdowns and crash survival.",
      },
      { property: "og:title", content: "Dashboard — LETF DCA Lab" },
      {
        property: "og:description",
        content:
          "Headline results for dollar-cost averaging into a 3x leveraged ETF over full market history.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { result, isLoading, error, config } = useSimulation();
  const inst = INSTRUMENTS[config.instrument];

  const crashRows = useMemo(
    () => (result ? CRASHES.map((c) => ({ event: c, stats: analyseCrash(result, c) })) : []),
    [result],
  );

  if (error) {
    return (
      <div className="p-8">
        <Callout title="Market data failed to load">{error.message}</Callout>
      </div>
    );
  }
  if (isLoading || !result) return <LoadingState />;

  const gained = result.profit >= 0;

  return (
    <div>
      <PageHeader
        title={`${inst.id} · $${config.contribution.toLocaleString()} ${config.frequency} DCA`}
        subtitle={`${shortDate(result.startDate)} → ${shortDate(result.endDate)} · ${result.contributionCount} contributions · ${percent(result.syntheticShare, 0)} of the path is reconstructed, pre-inception data.`}
        actions={
          <>
            <DataTypeBadge
              type={
                result.syntheticShare === 0
                  ? "ACTUAL"
                  : result.syntheticShare === 1
                    ? "SYNTHETIC"
                    : "MIXED"
              }
            />
            <Button asChild variant="outline" size="sm">
              <Link to="/simulator">Configure</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Final value"
          value={currency(result.finalValue)}
          emphasis
          tone={gained ? "gain" : "loss"}
          sub={`vs ${currency(result.totalContributions)} invested`}
        />
        <Metric
          label="Profit / loss"
          value={currency(result.profit)}
          emphasis
          tone={gained ? "gain" : "loss"}
          sub={signedPercent(result.totalReturn) + " on cost"}
        />
        <Metric
          label="XIRR"
          value={percent(result.xirr, 2)}
          emphasis
          tone={(result.xirr ?? 0) >= 0 ? "gain" : "loss"}
          tip="Money-weighted annualised return — the internal rate of return of the actual contribution schedule. This is the honest number for a DCA plan."
        />
        <Metric
          label="Max portfolio drawdown"
          value={percent(result.maxDrawdown, 1)}
          tone="loss"
          sub={shortDate(result.maxDrawdownDate)}
          tip="Largest peak-to-trough decline of the invested portfolio value, contributions included."
        />
        <Metric
          label="Max fund NAV drawdown"
          value={percent(result.navMaxDrawdown, 1)}
          tone="loss"
          sub={shortDate(result.navMaxDrawdownDate)}
          tip="Largest decline of the leveraged fund itself, independent of when you invested."
        />
        <Metric
          label="Longest recovery"
          value={monthsLabel(result.longestRecoveryMonths, result.longestRecoveryOngoing)}
          tip="Longest time from a portfolio peak back to that same peak."
        />
      </div>

      {result.warnings.length > 0 ? (
        <div className="px-4 pt-6 md:px-8">
          <Callout title="Interpretation notes">
            <ul className="list-disc space-y-1 pl-4">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}

      <Section
        title="Portfolio value vs. contributions"
        description="The dashed marker is the fund's real inception date. Everything to its left is a daily-reset reconstruction, not a price anyone could have traded."
      >
        <div className="border border-border bg-card p-3">
          <PortfolioChart
            data={result.portfolio}
            inceptionDate={config.useSyntheticHistory ? inst.inception : null}
          />
        </div>
      </Section>

      <Section
        title="Drawdown"
        description="Leverage compounds losses as aggressively as gains. The fund's own drawdown is far deeper than the drawdown a steady contributor experiences."
      >
        <div className="border border-border bg-card p-3">
          <DrawdownChart
            data={result.portfolio}
            inceptionDate={config.useSyntheticHistory ? inst.inception : null}
          />
        </div>
      </Section>

      <Section
        title="Crash windows"
        description="How the same plan behaved through the four worst stretches in the sample."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/crashes">Full crash studies</Link>
          </Button>
        }
      >
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Event</th>
                <th className="label-xs px-3 py-2 text-left">Window</th>
                <th className="label-xs px-3 py-2 text-right">Underlying</th>
                <th className="label-xs px-3 py-2 text-right">{inst.id} NAV</th>
                <th className="label-xs px-3 py-2 text-right">Portfolio DD</th>
                <th className="label-xs px-3 py-2 text-right">Recovery</th>
              </tr>
            </thead>
            <tbody>
              {crashRows.map(({ event, stats }) => (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{event.name}</td>
                  <td className="num px-3 py-2 text-xs text-muted-foreground">
                    {monthYear(event.start)} – {monthYear(event.end)}
                  </td>
                  <td className="num px-3 py-2 text-right text-loss">
                    {percent(stats.underlyingDecline, 1)}
                  </td>
                  <td className="num px-3 py-2 text-right text-loss">
                    {percent(stats.navDecline, 1)}
                  </td>
                  <td className="num px-3 py-2 text-right text-loss">
                    {percent(stats.portfolioDecline, 1)}
                  </td>
                  <td className="num px-3 py-2 text-right text-xs">
                    {monthsLabel(stats.portfolioRecoveryMonths)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Risk & consistency" className="pb-12">
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
          <Metric
            label="Annualised volatility"
            value={percent(result.volatility, 1)}
            tip="Standard deviation of daily fund returns, annualised over 252 trading days."
          />
          <Metric
            label="Return / volatility"
            value={result.sharpe === null ? "—" : result.sharpe.toFixed(2)}
            tip="Crude Sharpe-like ratio: XIRR divided by annualised volatility. No risk-free subtraction."
          />
          <Metric
            label="Best / worst year"
            value={`${signedPercent(result.bestYear?.return ?? null, 0)} / ${signedPercent(result.worstYear?.return ?? null, 0)}`}
            sub={
              result.bestYear && result.worstYear
                ? `${result.bestYear.year} vs ${result.worstYear.year}`
                : undefined
            }
          />
          <Metric
            label="Months under water"
            value={String(result.monthsBelowContributions)}
            tip="Month-ends where the portfolio was worth less than the money paid into it."
          />
        </div>
      </Section>
    </div>
  );
}