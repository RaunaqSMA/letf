import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
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
import { Callout, LoadingState, PageHeader, Section } from "@/components/app/primitives";
import { multiple, monthYear, percent } from "@/lib/format";
import { everyStartMonth, rollingAnalysis, startDateHeatmap } from "@/lib/sim/rolling";
import { useSimulation } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Rolling & Start-Date Analysis — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Rolling 1–20 year DCA windows, a start-year XIRR heatmap, and outcomes from every possible starting month.",
      },
      { property: "og:title", content: "Rolling & Start-Date Analysis — LETF DCA Lab" },
      {
        property: "og:description",
        content: "How much of a leveraged DCA outcome is decided by when you happened to start.",
      },
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
  const { result, isLoading, error, config } = useSimulation();

  const rolling = useMemo(
    () => (result ? rollingAnalysis(result.daily, config) : []),
    [result, config],
  );
  const heat = useMemo(
    () => (result ? startDateHeatmap(result.daily, config) : null),
    [result, config],
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
  if (isLoading || !result || !heat) return <LoadingState label="Running rolling windows…" />;

  const cellFor = (year: number, years: number) =>
    heat.cells.find((c) => c.startYear === year && c.years === years) ?? null;

  return (
    <div>
      <PageHeader
        title="Rolling & start-date analysis"
        subtitle={`Repeats the same $${config.contribution} ${config.frequency} plan from every possible starting point, so the headline number isn't a single lucky path.`}
      />

      <Section
        title="Rolling windows"
        description="Every start month, held for a fixed number of years. Money-weighted returns."
      >
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Holding period</th>
                <th className="label-xs px-3 py-2 text-right">Windows</th>
                <th className="label-xs px-3 py-2 text-right">Worst XIRR</th>
                <th className="label-xs px-3 py-2 text-right">Median XIRR</th>
                <th className="label-xs px-3 py-2 text-right">Best XIRR</th>
                <th className="label-xs px-3 py-2 text-right">Worst / median / best multiple</th>
                <th className="label-xs px-3 py-2 text-right">Ended below cost</th>
              </tr>
            </thead>
            <tbody>
              {rolling.map((r) => (
                <tr key={r.years} className="border-b border-border last:border-0">
                  <td className="num px-3 py-2 font-semibold">{r.years}y</td>
                  <td className="num px-3 py-2 text-right text-muted-foreground">{r.windows}</td>
                  <td className="num px-3 py-2 text-right text-loss">{percent(r.worstXirr, 1)}</td>
                  <td className="num px-3 py-2 text-right">{percent(r.medianXirr, 1)}</td>
                  <td className="num px-3 py-2 text-right text-gain">{percent(r.bestXirr, 1)}</td>
                  <td className="num px-3 py-2 text-right">
                    {multiple(r.worstMultiple)} / {multiple(r.medianMultiple)} /{" "}
                    {multiple(r.bestMultiple)}
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {percent(r.shareBelowContributions, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Start-year heatmap"
        description="XIRR by starting year and holding period. Blank cells are windows that extend past the end of the data."
      >
        <div className="overflow-x-auto border border-border bg-card p-3">
          <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="label-xs px-2 py-1 text-left">Start</th>
                {heat.years.map((y) => (
                  <th key={y} className="label-xs px-2 py-1 text-center">
                    {y}y
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heat.startYears.map((year) => (
                <tr key={year}>
                  <td className="num px-2 py-1 text-muted-foreground">{year}</td>
                  {heat.years.map((y) => {
                    const cell = cellFor(year, y);
                    return (
                      <td
                        key={y}
                        title={
                          cell
                            ? `${year}, ${y}y — XIRR ${percent(cell.xirr, 1)}, ${multiple(cell.multiple)} of cost, max DD ${percent(cell.maxDrawdown, 0)}`
                            : "no data"
                        }
                        className={cn(
                          "num px-2 py-1.5 text-center text-foreground",
                          cell ? heatColor(cell.xirr) : "bg-muted/30 text-muted-foreground",
                        )}
                      >
                        {cell ? percent(cell.xirr, 0) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Every starting month, held to today"
        description="XIRR of a plan begun in each month of the sample and continued to the final date."
        className="pb-12"
      >
        <div className="border border-border bg-card p-3">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={starts} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
                tickFormatter={monthYear}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => percent(v, 0)}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                labelFormatter={(l) => `Started ${monthYear(String(l))}`}
                formatter={(v: number) => [percent(v, 2), "XIRR"]}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" />
              <Bar dataKey="xirr" fill="var(--actual)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}