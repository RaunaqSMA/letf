import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { DrawdownChart, PortfolioChart } from "@/components/app/charts";
import { Callout, LoadingState, Metric, PageHeader, Section } from "@/components/app/primitives";
import { currency, monthsLabel, percent, shortDate, signedPercent } from "@/lib/format";
import { INSTRUMENTS, type InstrumentId } from "@/lib/market/types";
import { lumpSumComparison } from "@/lib/sim/rolling";
import { useSimulation } from "@/lib/sim/store";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare — LETF DCA Lab" },
      {
        name: "description",
        content:
          "TQQQ vs SPXL under identical assumptions, plus dollar-cost averaging against a single lump-sum entry.",
      },
      { property: "og:title", content: "Compare — LETF DCA Lab" },
      {
        property: "og:description",
        content: "TQQQ vs SPXL and DCA vs lump sum under identical financing and fee assumptions.",
      },
    ],
  }),
  component: ComparePage,
});

const IDS: InstrumentId[] = ["TQQQ", "SPXL"];

function ComparePage() {
  const { resultFor, result, isLoading, error, config } = useSimulation();

  const results = useMemo(
    () => IDS.map((id) => ({ id, result: resultFor(id) })),
    [resultFor],
  );

  const combined = useMemo(() => {
    const [a, b] = results;
    if (!a?.result || !b?.result) return [];
    const map = new Map<string, { date: string; TQQQ?: number; SPXL?: number; contributions: number }>();
    for (const p of a.result.portfolio)
      map.set(p.date, { date: p.date, TQQQ: p.value, contributions: p.contributions });
    for (const p of b.result.portfolio) {
      const row = map.get(p.date);
      if (row) row.SPXL = p.value;
    }
    return [...map.values()].filter((r) => r.TQQQ !== undefined && r.SPXL !== undefined);
  }, [results]);

  const lump = useMemo(
    () =>
      result
        ? lumpSumComparison(
            result.daily,
            result.totalContributions,
            result.portfolio.map((p) => p.value),
            result.portfolio.map((p) => p.contributions),
          )
        : null,
    [result],
  );

  if (error) {
    return (
      <div className="p-8">
        <Callout title="Market data failed to load">{error.message}</Callout>
      </div>
    );
  }
  if (isLoading || !result || !lump) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Comparisons"
        subtitle={`Identical schedule, dates, financing model and costs applied to each fund: $${config.contribution} ${config.frequency}, ${shortDate(result.startDate)} → ${shortDate(result.endDate)}.`}
      />

      <Section title="TQQQ vs SPXL" description="Same plan, different underlying index.">
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Fund</th>
                <th className="label-xs px-3 py-2 text-right">Final value</th>
                <th className="label-xs px-3 py-2 text-right">Invested</th>
                <th className="label-xs px-3 py-2 text-right">XIRR</th>
                <th className="label-xs px-3 py-2 text-right">Max portfolio DD</th>
                <th className="label-xs px-3 py-2 text-right">Max NAV DD</th>
                <th className="label-xs px-3 py-2 text-right">Volatility</th>
                <th className="label-xs px-3 py-2 text-right">Longest recovery</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ id, result: r }) =>
                r ? (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="num px-3 py-2 font-semibold">
                      {id}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {INSTRUMENTS[id].name}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">{currency(r.finalValue)}</td>
                    <td className="num px-3 py-2 text-right">{currency(r.totalContributions)}</td>
                    <td
                      className={`num px-3 py-2 text-right ${(r.xirr ?? 0) >= 0 ? "text-gain" : "text-loss"}`}
                    >
                      {percent(r.xirr, 2)}
                    </td>
                    <td className="num px-3 py-2 text-right text-loss">
                      {percent(r.maxDrawdown, 1)}
                    </td>
                    <td className="num px-3 py-2 text-right text-loss">
                      {percent(r.navMaxDrawdown, 1)}
                    </td>
                    <td className="num px-3 py-2 text-right">{percent(r.volatility, 1)}</td>
                    <td className="num px-3 py-2 text-right text-xs">
                      {monthsLabel(r.longestRecoveryMonths, r.longestRecoveryOngoing)}
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>

        {combined.length > 5 ? (
          <div className="mt-4 border border-border bg-card p-3">
            <PortfolioChart
              data={combined}
              series={[
                { key: "TQQQ", name: "TQQQ portfolio", color: "var(--actual)" },
                { key: "SPXL", name: "SPXL portfolio", color: "var(--synthetic)" },
                { key: "contributions", name: "Contributions", color: "var(--muted-foreground)" },
              ]}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title={`DCA vs lump sum — ${config.instrument}`}
        description="The lump sum invests the DCA plan's entire total on the first day, which is not a like-for-like risk comparison but is the usual counterfactual people ask about."
      >
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
          <Metric
            label="DCA final value"
            value={currency(result.finalValue)}
            sub={`XIRR ${percent(result.xirr, 2)}`}
          />
          <Metric
            label="Lump sum final value"
            value={currency(lump.lumpFinalValue)}
            sub={`XIRR ${percent(lump.lumpXirr, 2)}`}
          />
          <Metric
            label="Max drawdown"
            value={`${percent(result.maxDrawdown, 1)} / ${percent(lump.lumpMaxDrawdown, 1)}`}
            tone="loss"
            sub="DCA / lump sum"
          />
          <Metric
            label="Time under water"
            value={`${lump.dcaTimeUnderwaterMonths} / ${lump.lumpTimeUnderwaterMonths} mo`}
            sub="DCA / lump sum"
          />
        </div>
        <div className="mt-4">
          <Callout tone="info">
            Difference in final value:{" "}
            <span className="num text-foreground">
              {currency(result.finalValue - lump.lumpFinalValue)}
            </span>{" "}
            ({signedPercent(result.finalValue / lump.lumpFinalValue - 1)}) in favour of{" "}
            {result.finalValue >= lump.lumpFinalValue ? "DCA" : "lump sum"}.
          </Callout>
        </div>
      </Section>

      <Section title="Drawdown side by side" className="pb-12">
        <div className="border border-border bg-card p-3">
          <DrawdownChart
            data={result.portfolio}
            series={[
              { key: "drawdown", name: `${config.instrument} DCA portfolio`, color: "var(--loss)" },
              { key: "navDrawdown", name: `${config.instrument} NAV`, color: "var(--synthetic)" },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}