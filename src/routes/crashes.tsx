import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PortfolioChart } from "@/components/app/charts";
import {
  Callout,
  DataTypeBadge,
  LoadingState,
  Metric,
  PageHeader,
  Section,
} from "@/components/app/primitives";
import { StatGrid } from "@/components/app/research";
import { currency, monthsLabel, multiple, number as fmtNumber, percent, shortDate } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/market/types";
import { analyseCrash, CRASHES } from "@/lib/sim/crashes";
import { useSimulation } from "@/lib/sim/store";

export const Route = createFileRoute("/crashes")({
  head: () => ({
    meta: [
      { title: "Historical Crashes — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Dot-com, the GFC, COVID and 2022: how a 3x leveraged ETF and a steady DCA plan behaved through each drawdown and recovery.",
      },
      { property: "og:title", content: "Historical Crashes — LETF DCA Lab" },
      {
        property: "og:description",
        content: "How 3x leveraged ETFs behaved through the four worst drawdowns since 1999.",
      },
    ],
  }),
  component: CrashesPage,
});

function CrashesPage() {
  const { result, isLoading, error, config } = useSimulation();
  const inst = INSTRUMENTS[config.instrument];

  const studies = useMemo(
    () => (result ? CRASHES.map((c) => analyseCrash(result, c)) : []),
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

  return (
    <div>
      <PageHeader
        title="Historical crash studies"
        subtitle={`Each window is measured on the same ${inst.id} path your current configuration produces, including financing and fees.`}
      />

      {studies.map((s) => {
        const slice = result.portfolio.filter(
          (p) => p.date >= s.event.start && p.date <= (s.portfolioRecoveryDate ?? s.event.end),
        );
        return (
          <Section
            key={s.event.id}
            title={s.event.name}
            description={s.event.blurb}
            actions={<DataTypeBadge type={s.navDeclineDataType} />}
          >
            {!s.hasData ? (
              <Callout>No simulated data covers this window with the current start date.</Callout>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 xl:grid-cols-6">
                  <Metric
                    label="Underlying decline"
                    value={percent(s.underlyingDecline, 1)}
                    tone="loss"
                    sub={`${shortDate(s.peakDate)} → ${shortDate(s.troughDate)}`}
                  />
                  <Metric
                    label={`${inst.id} decline`}
                    value={percent(s.navDecline, 1)}
                    tone="loss"
                    tip="Daily-reset leverage turns a large index decline into a far larger fund decline than 3x the index move."
                  />
                  <Metric
                    label="Portfolio decline"
                    value={percent(s.portfolioDecline, 1)}
                    tone="loss"
                    sub={`${currency(s.portfolioAtPeak)} → ${currency(s.portfolioAtTrough)}`}
                  />
                  <Metric
                    label="Contributed during"
                    value={currency(s.contributedDuring)}
                    tip="Money added while prices were falling — the part of DCA that does the work."
                  />
                  <Metric
                    label="Fund NAV recovery"
                    value={monthsLabel(s.navRecoveryMonths)}
                    sub={s.navRecoveryDate ? shortDate(s.navRecoveryDate) : "still below peak"}
                  />
                  <Metric
                    label="Portfolio recovery"
                    value={monthsLabel(s.portfolioRecoveryMonths)}
                    sub={
                      s.portfolioRecoveryDate ? shortDate(s.portfolioRecoveryDate) : "still below peak"
                    }
                  />
                </div>
                <div className="mt-4">
                  <div className="label-xs mb-2">What the DCA investor lived through</div>
                  <StatGrid
                    columns={4}
                    rows={[
                      {
                        label: "Units bought in window",
                        value: fmtNumber(s.dca.unitsBoughtDuring, 3),
                        hint: `${percent(s.dca.unitsShareOfTotal, 1)} of all units ever bought`,
                      },
                      { label: "Money invested in window", value: currency(s.dca.contributionsDuring) },
                      {
                        label: "Average price paid",
                        value:
                          s.dca.averagePriceDuring === null
                            ? "—"
                            : fmtNumber(s.dca.averagePriceDuring, 2),
                        hint: "NAV units, indexed to 100 at start",
                      },
                      {
                        label: "Those units today",
                        value: currency(s.dca.terminalValueOfWindowUnits),
                        tone: "gain",
                      },
                      {
                        label: "Multiple on window money",
                        value:
                          s.dca.multipleOnWindowMoney === null
                            ? "—"
                            : multiple(s.dca.multipleOnWindowMoney),
                        tone:
                          (s.dca.multipleOnWindowMoney ?? 0) >= 1 ? "gain" : "loss",
                      },
                      {
                        label: "Worst unrealised loss",
                        value: currency(s.dca.worstUnrealisedLoss),
                        tone: "loss",
                        hint: `${percent(s.dca.worstUnrealisedLossPct, 1)} below money paid in`,
                      },
                      {
                        label: "Days below contributions",
                        value: s.dca.daysUnderwater.toLocaleString(),
                        hint: "Trading days with the account worth less than the cash paid in",
                      },
                      {
                        label: "Break-even after trough",
                        value: monthsLabel(s.dca.monthsToBreakEvenOnContributions),
                      },
                    ]}
                  />
                </div>
                {slice.length > 5 ? (
                  <div className="mt-4 border border-border bg-card p-3">
                    <PortfolioChart data={slice} />
                  </div>
                ) : null}
              </>
            )}
          </Section>
        );
      })}

      <div className="px-4 pb-12 md:px-8">
        <Callout title="Why the fund falls further than 3x">
          A 50% index decline is not a 150% fund decline — that is impossible. Daily resetting means
          the fund compounds each day&apos;s 3x move, so a long, choppy decline typically produces a
          fund drawdown well beyond 3x the index drawdown, and the recovery requires a much larger
          rebound to get back to even.
        </Callout>
      </div>
    </div>
  );
}