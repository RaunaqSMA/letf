import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { downsample } from "@/components/app/charts";
import {
  Callout,
  DataTypeBadge,
  LoadingState,
  Metric,
  PageHeader,
  Section,
} from "@/components/app/primitives";
import { number as fmtNumber, percent, shortDate } from "@/lib/format";
import { INSTRUMENTS, type SeriesKey } from "@/lib/market/types";
import { useSimulation } from "@/lib/sim/store";
import { validateModel } from "@/lib/sim/validation";

export const Route = createFileRoute("/data")({
  head: () => ({
    meta: [
      { title: "Data & Model Validation — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Source series, coverage and quality issues, plus how closely the reconstructed model tracks the real leveraged ETF.",
      },
      { property: "og:title", content: "Data & Model Validation — LETF DCA Lab" },
      {
        property: "og:description",
        content: "Source data coverage and tracking error between the synthetic model and the real ETF.",
      },
    ],
  }),
  component: DataPage,
});

const SERIES_LABELS: Record<SeriesKey, string> = {
  ndx: "Nasdaq-100 price index",
  spx: "S&P 500 price index",
  qqq: "QQQ — Nasdaq-100 total-return proxy",
  spy: "SPY — S&P 500 total-return proxy",
  tqqq: "TQQQ — actual fund history",
  spxl: "SPXL — actual fund history",
  irx: "13-week US Treasury bill yield",
};

function DataPage() {
  const { data, config, isLoading, error } = useSimulation();
  const inst = INSTRUMENTS[config.instrument];

  const validation = useMemo(
    () => (data ? validateModel(data, config) : null),
    [data, config],
  );

  const validationChart = useMemo(
    () =>
      validation
        ? downsample(
            validation.points.map((p) => ({
              date: p.date,
              synthetic: p.synthetic,
              actual: p.actual,
            })),
          )
        : [],
    [validation],
  );

  if (error) {
    return (
      <div className="p-8">
        <Callout title="Market data failed to load">{error.message}</Callout>
      </div>
    );
  }
  if (isLoading || !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Data & model validation"
        subtitle="Every series used, where it came from, and how far the reconstruction drifts from the real fund."
      />

      <Section title="Source series">
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Series</th>
                <th className="label-xs px-3 py-2 text-left">Symbol</th>
                <th className="label-xs px-3 py-2 text-left">Coverage</th>
                <th className="label-xs px-3 py-2 text-right">Observations</th>
                <th className="label-xs px-3 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SERIES_LABELS) as SeriesKey[]).map((key) => {
                const s = data[key];
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{SERIES_LABELS[key]}</td>
                    <td className="num px-3 py-2">{s.symbol}</td>
                    <td className="num px-3 py-2 text-xs">
                      {s.dates[0]} → {s.dates[s.dates.length - 1]}
                    </td>
                    <td className="num px-3 py-2 text-right">{s.dates.length.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={`Model validation — ${inst.id}`}
        description={`Synthetic reconstruction run over the period where the real fund exists, both indexed to 100 at ${inst.inception}.`}
        actions={<DataTypeBadge type="MIXED" />}
      >
        {!validation ? (
          <Callout>Not enough overlapping data to validate this instrument.</Callout>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 xl:grid-cols-6">
              <Metric label="Observations" value={validation.observations.toLocaleString()} />
              <Metric
                label="Daily return correlation"
                value={fmtNumber(validation.correlation, 4)}
                tone="gain"
              />
              <Metric
                label="Mean daily difference"
                value={percent(validation.meanTrackingDifference, 4)}
                tip="Average synthetic daily return minus actual daily return."
              />
              <Metric
                label="Tracking error (ann.)"
                value={percent(validation.trackingError, 2)}
                tip="Annualised standard deviation of the daily return differences."
              />
              <Metric
                label="Cumulative difference"
                value={percent(validation.cumulativeDifference, 1)}
                tone={validation.cumulativeDifference >= 0 ? "gain" : "loss"}
                sub={`${shortDate(validation.from)} → ${shortDate(validation.to)}`}
              />
              <Metric
                label="Largest daily gap"
                value={percent(validation.maxDifference, 2)}
                tone="loss"
              />
            </div>

            <div className="mt-4 border border-border bg-card p-3">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={validationChart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={48}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    scale="log"
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => fmtNumber(v, 0)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                    labelFormatter={(l) => shortDate(String(l))}
                    formatter={(v: number, name) => [fmtNumber(v, 1), String(name)]}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual fund"
                    stroke="var(--actual)"
                    dot={false}
                    strokeWidth={1.6}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="synthetic"
                    name="Synthetic model"
                    stroke="var(--synthetic)"
                    dot={false}
                    strokeWidth={1.4}
                    strokeDasharray="4 3"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Section>

      <Section title="Data quality log" className="pb-12">
        {data.issues.length === 0 ? (
          <Callout tone="info">No missing, invalid or duplicate observations were flagged.</Callout>
        ) : (
          <div className="max-h-96 overflow-auto border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="border-b border-border">
                  <th className="label-xs px-3 py-2 text-left">Series</th>
                  <th className="label-xs px-3 py-2 text-left">Date</th>
                  <th className="label-xs px-3 py-2 text-left">Type</th>
                  <th className="label-xs px-3 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.issues.slice(0, 400).map((i, idx) => (
                  <tr key={`${i.series}-${i.date}-${idx}`} className="border-b border-border last:border-0">
                    <td className="num px-3 py-1.5">{i.series}</td>
                    <td className="num px-3 py-1.5">{i.date}</td>
                    <td className="num px-3 py-1.5 text-xs uppercase text-muted-foreground">
                      {i.type}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{i.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}