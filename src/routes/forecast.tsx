import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Callout, LoadingState, Metric, PageHeader, Section } from "@/components/app/primitives";
import { DistributionRow, DistributionTable } from "@/components/app/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { currency, multiple, percent } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/market/types";
import {
  DEFAULT_MC_CONFIG,
  DEFAULT_STRATEGIES,
  runMonteCarlo,
  type MonteCarloConfig,
} from "@/lib/sim/montecarlo";
import { useSimulation } from "@/lib/sim/store";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Forecast Lab — Block-Bootstrap Outcomes | LETF DCA Lab" },
      {
        name: "description",
        content:
          "Resample historical daily returns in blocks to see the range of long-horizon outcomes for 3x, 2x and unlevered DCA plans. Seeded and reproducible.",
      },
      { property: "og:title", content: "Forecast Lab — LETF DCA Lab" },
      {
        property: "og:description",
        content: "What-if distributions for leveraged DCA, built by block bootstrap. Not a prediction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForecastPage,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function ForecastPage() {
  const { result, data, config, isLoading, error } = useSimulation();
  const [mc, setMc] = useState<MonteCarloConfig>({
    ...DEFAULT_MC_CONFIG,
    contribution: config.contribution,
  });
  const [runToken, setRunToken] = useState(0);
  const [pending, setPending] = useState<MonteCarloConfig>(mc);

  const underlyingReturns = useMemo(() => {
    if (!result) return null;
    const src = result.daily.underlyingReturn;
    const out = new Float64Array(Math.max(0, src.length - 1));
    for (let i = 1; i < src.length; i++) out[i - 1] = src[i]!;
    return out;
  }, [result]);

  const output = useMemo(() => {
    if (!underlyingReturns || !result) return null;
    void runToken;
    return runMonteCarlo(
      underlyingReturns,
      { from: result.startDate, to: result.endDate },
      mc,
      DEFAULT_STRATEGIES.map((s) =>
        s.leverage === 3
          ? { ...s, expenseRatio: INSTRUMENTS[config.instrument].expenseRatio }
          : s,
      ),
    );
  }, [underlyingReturns, result, mc, runToken, config.instrument]);

  if (error) {
    return (
      <div className="p-8">
        <Callout title="Market data failed to load">{error.message}</Callout>
      </div>
    );
  }
  if (isLoading || !result || !output || !data) return <LoadingState label="Resampling history…" />;

  const trajectory = output.strategies[0]!.medianTrajectory.map((pt, idx) => {
    const row: Record<string, number> = { year: pt.year };
    output.strategies.forEach((s) => {
      row[s.strategy.id] = s.medianTrajectory[idx]?.value ?? 0;
    });
    return row;
  });

  const totalContributed = mc.contribution * mc.contributionsPerYear * mc.years;

  return (
    <div>
      <PageHeader
        title="Forecast lab"
        subtitle="Block bootstrap over the historical daily returns of the selected underlying. It answers 'what range of outcomes is consistent with this history?' — never 'what will happen'."
      />

      <Section
        title="Scenario settings"
        description="Everything is seeded: the same settings and seed always produce identical output."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setMc(pending);
                setRunToken((t) => t + 1);
              }}
            >
              Run {pending.paths.toLocaleString()} paths
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPending({ ...DEFAULT_MC_CONFIG, contribution: config.contribution });
                setMc({ ...DEFAULT_MC_CONFIG, contribution: config.contribution });
                setRunToken((t) => t + 1);
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="label-xs">Horizon: {pending.years} years</Label>
            <Slider
              min={5}
              max={50}
              step={5}
              value={[pending.years]}
              onValueChange={([v]) => setPending((p) => ({ ...p, years: v ?? p.years }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Paths: {pending.paths.toLocaleString()}</Label>
            <Slider
              min={200}
              max={5000}
              step={200}
              value={[pending.paths]}
              onValueChange={([v]) => setPending((p) => ({ ...p, paths: v ?? p.paths }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Block length: {pending.blockDays} trading days</Label>
            <Slider
              min={5}
              max={126}
              step={1}
              value={[pending.blockDays]}
              onValueChange={([v]) => setPending((p) => ({ ...p, blockDays: v ?? p.blockDays }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">
              Stressed blocks: {percent(pending.stressBlockShare, 0)}
            </Label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[pending.stressBlockShare]}
              onValueChange={([v]) =>
                setPending((p) => ({ ...p, stressBlockShare: v ?? p.stressBlockShare }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Volatility scale: {pending.volatilityScale.toFixed(2)}x</Label>
            <Slider
              min={0.5}
              max={2}
              step={0.05}
              value={[pending.volatilityScale]}
              onValueChange={([v]) =>
                setPending((p) => ({ ...p, volatilityScale: v ?? p.volatilityScale }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">
              Drift adjustment: {percent(pending.driftAdjustment, 1)} / yr
            </Label>
            <Slider
              min={-0.06}
              max={0.06}
              step={0.005}
              value={[pending.driftAdjustment]}
              onValueChange={([v]) =>
                setPending((p) => ({ ...p, driftAdjustment: v ?? p.driftAdjustment }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Financing rate</Label>
            <Input
              type="number"
              step="0.5"
              value={(pending.financingRate * 100).toFixed(1)}
              onChange={(e) =>
                setPending((p) => ({ ...p, financingRate: Number(e.target.value) / 100 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Seed</Label>
            <Input
              value={pending.seed}
              onChange={(e) => setPending((p) => ({ ...p, seed: e.target.value }))}
            />
          </div>
        </div>
      </Section>

      <Section title="Sampled market">
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="History resampled"
            value={`${output.historyDays.toLocaleString()} days`}
            sub={`${output.historyFrom} → ${output.historyTo}`}
          />
          <Metric
            label="Sampled volatility"
            value={percent(output.sampledUnderlyingVolatility, 1)}
            sub="Annualised, unlevered"
          />
          <Metric
            label="Sampled drift"
            value={percent(output.sampledUnderlyingDrift, 1)}
            sub="Annualised arithmetic mean"
          />
          <Metric
            label="Total contributed"
            value={currency(totalContributed)}
            sub={`${mc.contributionsPerYear}× ${currency(mc.contribution)} per year`}
          />
        </div>
      </Section>

      <Section
        title="Median wealth path by strategy"
        description="The median of each year's simulated portfolio values. No single path follows this line."
      >
        <div className="h-80 border border-border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trajectory}>
              <CartesianGrid strokeDasharray="2 4" className="stroke-border" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                width={64}
                tickFormatter={(v: number) => currency(v, { compact: true })}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: number, name) => [
                  currency(v),
                  output.strategies.find((s) => s.strategy.id === name)?.strategy.label ?? name,
                ]}
                labelFormatter={(l) => `Year ${l}`}
              />
              <Legend
                formatter={(v) =>
                  output.strategies.find((s) => s.strategy.id === v)?.strategy.label ?? v
                }
                wrapperStyle={{ fontSize: 11 }}
              />
              {output.strategies.map((s, i) => (
                <Line
                  key={s.strategy.id}
                  type="monotone"
                  dataKey={s.strategy.id}
                  stroke={COLORS[i % COLORS.length]}
                  dot={false}
                  strokeWidth={1.6}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {output.strategies.map((s) => (
        <Section
          key={s.strategy.id}
          title={s.strategy.label}
          description={`${s.paths.toLocaleString()} simulated paths over ${mc.years} years.`}
        >
          <div className="space-y-3">
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Median terminal value" value={currency(s.medianTerminal ?? 0)} />
              <Metric
                label="Mean terminal value"
                value={currency(s.meanTerminal ?? 0)}
                sub="Pulled up by the right tail"
                tip="For skewed outcomes the mean is a poor description of the typical experience; the median is what a coin-flip investor would more likely see."
              />
              <Metric
                label="Ended below money paid in"
                value={percent(s.shareBelowContributions, 0)}
                tone={s.shareBelowContributions > 0.2 ? "loss" : "neutral"}
              />
              <Metric
                label="Wiped out"
                value={percent(s.shareWipedOut, 0)}
                tone={s.shareWipedOut > 0 ? "loss" : "neutral"}
                tip="A path where NAV reached zero. A daily-reset fund is terminated by a single move of -100/L percent in the underlying."
              />
              <Metric
                label="Beat the 1x DCA path"
                value={percent(s.shareBeatBenchmark, 0)}
                tip="Compared path-by-path against the unlevered strategy simulated on the identical return sequence."
              />
            </div>
            <DistributionTable>
              <DistributionRow label="Terminal value" dist={s.terminal} format={(v) => currency(v)} />
              <DistributionRow label="Value / contributions" dist={s.multiple} format={(v) => multiple(v)} />
              <DistributionRow label="Annualised return" dist={s.cagr} format={(v) => percent(v, 1)} />
              <DistributionRow label="Max drawdown" dist={s.maxDrawdown} format={(v) => percent(v, 0)} />
            </DistributionTable>
          </div>
        </Section>
      ))}

      <Section title="How to read this">
        <Callout title="A resampling of one history is not a forecast">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Every path is stitched from real blocks of the last {output.historyDays.toLocaleString()}{" "}
              trading days. If the future looks unlike that sample in drift, volatility or financing
              cost, none of these distributions apply.
            </li>
            <li>
              Block bootstrap preserves short-run volatility clustering but not multi-year regimes
              such as a decade-long derating. Use the stressed-block and volatility-scale controls
              to probe those cases deliberately.
            </li>
            <li>
              Financing is held at a constant {percent(mc.financingRate, 1)} here. Historically it
              has ranged from near zero to above 5%, and it rises exactly when leverage hurts most.
            </li>
            <li>Percentages are frequencies within the simulation, not probabilities of reality.</li>
          </ul>
        </Callout>
      </Section>
    </div>
  );
}
