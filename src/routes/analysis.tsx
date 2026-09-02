import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { downsample } from "@/components/app/charts";
import { Callout, LoadingState, Metric, PageHeader, Section } from "@/components/app/primitives";
import { DistributionRow, DistributionTable } from "@/components/app/research";
import { multiple, monthYear, percent } from "@/lib/format";
import { buildPlainSeries } from "@/lib/sim/leverage";
import { everyStartMonth } from "@/lib/sim/rolling";
import { rollingResearch, startDateGrid, ROLLING_HORIZONS } from "@/lib/sim/rolling-advanced";
import { useSimulation } from "@/lib/sim/store";
import { INSTRUMENTS } from "@/lib/market/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Rolling & Start-Date Analysis — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Rolling 1–50 year windows with full percentile distributions, a start-year sensitivity grid, and outcomes from every possible starting month.",
      },
      { property: "og:title", content: "Rolling & Start-Date Analysis — LETF DCA Lab" },
      {
        property: "og:description",
        content: "How much of a leveraged DCA outcome is decided by when you happened to start.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalysisPage,
});

function heatColor(x: number | null): string {
  if (x === null) return "bg-muted";
  if (x <= -0.15) return "bg-loss/70";
  if (x <= 0) return "bg-loss/35";
  if (x < 0.1) return "bg-gain/20";
  if (x < 0.2) return "bg-gain/40";
  if (x < 0.35) return "bg-gain/60";
  return "bg-gain/85";
}

function AnalysisPage() {
  const { result, data, isLoading, error, config } = useSimulation();
  const [metric, setMetric] = useState<"cagr" | "drawdown">("cagr");

  // The unlevered benchmark path, aligned to the leveraged trading days.
  const underlyingNav = useMemo(() => {
    if (!result || !data) return null;
    const inst = INSTRUMENTS[config.instrument];
    const key = config.underlyingMode === "price_index" ? inst.underlyingIndex : inst.underlyingTR;
    const series = data[key];
    const plain = buildPlainSeries(
      series.dates,
      series.adjClose,
      result.startDate,
      result.endDate,
    );
    if (plain.dates.length !== result.daily.dates.length) return null;
    return plain.nav;
  }, [result, data, config.instrument, config.underlyingMode]);

  const research = useMemo(
    () =>
      result
        ? rollingResearch(result.daily, underlyingNav, config, { horizons: ROLLING_HORIZONS })
        : null,
    [result, underlyingNav, config],
  );

  const grid = useMemo(
    () => (result ? startDateGrid(result.daily, underlyingNav, config) : null),
    [result, underlyingNav, config],
  );

  const starts = useMemo(
    () =>
      result
        ? downsample(
            everyStartMonth(result.daily, config).map((p) => ({
              date: p.start,
              xirr: p.xirr ?? 0,
            })),
            360,
          )
        : [],
    [result, config],
  );

  if (error) {
    return (
      <div className="p-8">
        <Callout title="Market data failed to load">{error.message}</Callout>
      </div>
    );
  }
  if (isLoading || !result || !research || !grid) {
    return <LoadingState label="Running rolling windows…" />;
  }

  const longest = research.horizons.at(-1) ?? null;
  const cellFor = (year: number, years: number) =>
    grid.cells.find((c) => c.startYear === year && c.years === years) ?? null;

  return (
    <div>
      <PageHeader
        title="Rolling & start-date analysis"
        subtitle={`Repeats the same $${config.contribution} ${config.frequency} plan from every possible starting point, so the headline number isn't a single lucky path.`}
      />

      <Section title="Sample">
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Sample length"
            value={`${research.sampleYears.toFixed(1)} y`}
            sub={`${result.startDate} → ${result.endDate}`}
          />
          <Metric
            label="Longest horizon available"
            value={longest ? `${longest.years} y` : "—"}
            sub={longest ? `${longest.windows} overlapping windows` : undefined}
          />
          <Metric
            label="Horizons not testable"
            value={research.unavailable.length ? research.unavailable.map((y) => `${y}y`).join(", ") : "none"}
            sub="History is shorter than these windows"
            tip="A 50-year window cannot be evaluated on 27 years of data. Rather than extrapolate, the row is omitted."
          />
          <Metric
            label="Synthetic share"
            value={percent(result.syntheticShare, 0)}
            sub="Of trading days in the base path"
          />
        </div>
      </Section>

      <Section
        title="Rolling window distributions"
        description="Every start month, held for a fixed number of years. Windows overlap heavily, so treat these as descriptions of one history, not as probabilities."
      >
        <div className="space-y-6">
          {research.horizons.map((h) => (
            <div key={h.years} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="num text-sm font-semibold">{h.years}-year windows</h3>
                <span className="text-xs text-muted-foreground">
                  {h.windows} overlapping windows · {h.firstStart} → {h.lastStart}
                </span>
              </div>
              <DistributionTable>
                <DistributionRow label="Buy-and-hold CAGR" dist={h.cagr} format={(v) => percent(v, 1)} />
                <DistributionRow label="DCA XIRR" dist={h.xirr} format={(v) => percent(v, 1)} />
                <DistributionRow label="Value / contributions" dist={h.multiple} format={(v) => multiple(v)} />
                <DistributionRow
                  label="NAV max drawdown"
                  dist={h.navMaxDrawdown}
                  format={(v) => percent(v, 0)}
                />
                <DistributionRow label="Volatility" dist={h.volatility} format={(v) => percent(v, 0)} />
                <DistributionRow label="Sharpe" dist={h.sharpe} format={(v) => v.toFixed(2)} />
              </DistributionTable>
              <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { l: "Positive CAGR", v: h.shareCagrPositive },
                  { l: "Beat 1x index", v: h.shareBeatUnderlying },
                  { l: "CAGR above 10%", v: h.shareCagrAbove10 },
                  { l: "Drawdown worse than -80%", v: h.shareDrawdownOver80 },
                  { l: "Ended below money paid in", v: h.shareEndedBelowContributions },
                ].map((s) => (
                  <div key={s.l} className="bg-card px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{s.l}</div>
                    <div className="num text-sm font-semibold">{percent(s.v, 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Start-date sensitivity"
        description="Same strategy, same costs — only the entry year differs. The spread across a single row is sequence risk made visible."
        actions={
          <div className="flex gap-1 border border-border p-0.5">
            {(["cagr", "drawdown"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={cn(
                  "px-2.5 py-1 text-xs",
                  metric === m ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {m === "cagr" ? "CAGR" : "Max drawdown"}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Start year</th>
                {grid.horizons.map((h) => (
                  <th key={h} className="label-xs px-3 py-2 text-right">
                    {h}y
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.startYears.map((year) => {
                const any = grid.horizons.some((h) => cellFor(year, h));
                if (!any) return null;
                return (
                  <tr key={year} className="border-b border-border/60 last:border-0">
                    <td className="num px-3 py-1.5 font-semibold">{year}</td>
                    {grid.horizons.map((h) => {
                      const cell = cellFor(year, h);
                      const value =
                        cell === null ? null : metric === "cagr" ? cell.navCagr : cell.navMaxDrawdown;
                      return (
                        <td key={h} className="px-1 py-1">
                          <div
                            className={cn(
                              "num px-2 py-1 text-right text-xs",
                              metric === "cagr"
                                ? heatColor(value)
                                : value === null
                                  ? "bg-muted"
                                  : value <= -0.8
                                    ? "bg-loss/70"
                                    : value <= -0.5
                                      ? "bg-loss/40"
                                      : "bg-loss/15",
                            )}
                            title={
                              cell
                                ? `${cell.start} · CAGR ${percent(cell.navCagr, 1)} · max DD ${percent(cell.navMaxDrawdown, 0)}${cell.beatUnderlying === null ? "" : cell.beatUnderlying ? " · beat 1x" : " · lost to 1x"}`
                                : "Window extends past the data"
                            }
                          >
                            {value === null ? "—" : percent(value, 0)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Every possible starting month"
        description="Money-weighted return of the plan begun in each month and held to the end of the sample."
      >
        <div className="h-72 border border-border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={starts}>
              <CartesianGrid strokeDasharray="2 4" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={monthYear}
                minTickGap={48}
                tick={{ fontSize: 10 }}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 10 }}
                width={48}
              />
              <ReferenceLine y={0} className="stroke-border" />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: number) => [percent(v, 1), "XIRR"]}
                labelFormatter={(l: string) => `Started ${monthYear(l)}`}
              />
              <Bar dataKey="xirr" fill="hsl(var(--chart-1))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}
