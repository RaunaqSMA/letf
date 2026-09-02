import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Callout, LoadingState, Metric, PageHeader, Section } from "@/components/app/primitives";
import { StatGrid } from "@/components/app/research";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { multiple, percent } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/market/types";
import { CURRENCY_PRESETS, TAX_PRESETS, investorView } from "@/lib/sim/investor";
import {
  DEFAULT_AXES,
  breakEvenVolatility,
  expectedGeometricReturn,
  optimalLeverage,
  pathDependenceDemo,
  runStressPath,
  sensitivityCube,
  stressPaths,
  type LeverageAssumptions,
} from "@/lib/sim/sensitivity";
import { useSimulation } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sensitivity")({
  head: () => ({
    meta: [
      { title: "Sensitivity Lab — When Does Leverage Work? | LETF DCA Lab" },
      {
        name: "description",
        content:
          "Break-even volatility, a drift × volatility × financing grid, engineered stress paths and the investor's after-inflation, after-tax view.",
      },
      { property: "og:title", content: "Sensitivity Lab — LETF DCA Lab" },
      {
        property: "og:description",
        content: "The conditions under which daily-reset leverage helps — and where it stops working.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SensitivityPage,
});

function SensitivityPage() {
  const { result, config, isLoading, error } = useSimulation();
  const inst = INSTRUMENTS[config.instrument];

  const [leverage, setLeverage] = useState(config.leverage);
  const [financing, setFinancing] = useState(0.04);
  const [taxId, setTaxId] = useState("none");
  const [currencyIdx, setCurrencyIdx] = useState(0);
  const [inflation, setInflation] = useState(0.03);

  const base: LeverageAssumptions = useMemo(
    () => ({
      drift: 0.08,
      volatility: 0.25,
      financingRate: financing,
      expenseRatio: inst.expenseRatio,
      extraDrag: config.slippageDrag,
    }),
    [financing, inst.expenseRatio, config.slippageDrag],
  );

  const cube = useMemo(
    () => sensitivityCube(leverage, base, DEFAULT_AXES),
    [leverage, base],
  );

  const [financingSlice, setFinancingSlice] = useState(0.04);
  const slice = cube.filter((c) => Math.abs(c.financingRate - financingSlice) < 1e-9);

  const stress = useMemo(
    () =>
      stressPaths().map((p) =>
        runStressPath(p, leverage, {
          financingRate: financing,
          expenseRatio: inst.expenseRatio,
          extraDrag: config.slippageDrag,
        }),
      ),
    [leverage, financing, inst.expenseRatio, config.slippageDrag],
  );

  const demo = useMemo(() => pathDependenceDemo(leverage), [leverage]);

  const view = useMemo(() => {
    if (!result) return null;
    const cur = CURRENCY_PRESETS[currencyIdx]!;
    return investorView(result, {
      fxRate: cur.rate,
      currencyLabel: cur.label,
      inflationRate: inflation,
      taxRules: TAX_PRESETS.find((t) => t.id === taxId) ?? TAX_PRESETS[0]!,
      currencyDrift: cur.drift,
    });
  }, [result, currencyIdx, inflation, taxId]);

  if (error) {
    return (
      <div className="p-8">
        <Callout title="Market data failed to load">{error.message}</Callout>
      </div>
    );
  }
  if (isLoading || !result || !view) return <LoadingState label="Building sensitivity grid…" />;

  const bev = breakEvenVolatility(leverage, {
    drift: base.drift,
    financingRate: base.financingRate,
    expenseRatio: base.expenseRatio,
    extraDrag: base.extraDrag,
  });
  const optimal = optimalLeverage(base);
  const cur = CURRENCY_PRESETS[currencyIdx]!;
  const fmtCur = (v: number) =>
    `${cur.label} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v)}`;

  return (
    <div>
      <PageHeader
        title="Sensitivity lab"
        subtitle="Leverage is not good or bad — it is conditional. These experiments map the conditions, using the same daily-reset equation as the historical engine."
      />

      <Section
        title="Assumption controls"
        description="Closed-form expectations under lognormal returns: g(L) = L·µ − L²σ²/2 − (L−1)·f − e."
      >
        <div className="grid gap-4 border border-border bg-card p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="label-xs">Leverage: {leverage.toFixed(1)}x</Label>
            <Slider
              min={1}
              max={5}
              step={0.5}
              value={[leverage]}
              onValueChange={([v]) => setLeverage(v ?? leverage)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Financing rate: {percent(financing, 1)}</Label>
            <Slider
              min={0}
              max={0.08}
              step={0.005}
              value={[financing]}
              onValueChange={([v]) => setFinancing(v ?? financing)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Grid financing slice: {percent(financingSlice, 1)}</Label>
            <Slider
              min={0}
              max={0.06}
              step={0.02}
              value={[financingSlice]}
              onValueChange={([v]) => setFinancingSlice(v ?? financingSlice)}
            />
          </div>
        </div>
      </Section>

      <Section title="Where the break-even sits">
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={`Break-even volatility at ${leverage}x`}
            value={bev === null ? "n/a" : percent(bev, 1)}
            sub="Above this, 1x wins"
            tip="The volatility at which the expected geometric return of the leveraged fund equals the unlevered index, holding drift and financing fixed."
          />
          <Metric
            label="Growth-optimal leverage"
            value={isFinite(optimal) ? `${optimal.toFixed(2)}x` : "—"}
            sub={`At µ=${percent(base.drift, 0)}, σ=${percent(base.volatility, 0)}`}
            tip="(µ − f) / σ². Maximising expected log growth; it says nothing about tolerable drawdown, and running at this level historically implies ruinous interim losses."
          />
          <Metric
            label={`Expected CAGR at ${leverage}x`}
            value={percent(expectedGeometricReturn(leverage, base), 1)}
            sub="Lognormal approximation"
          />
          <Metric
            label="Expected CAGR at 1x"
            value={percent(
              expectedGeometricReturn(1, { ...base, financingRate: 0, expenseRatio: 0.0003, extraDrag: 0 }),
              1,
            )}
            sub="Same drift and volatility"
          />
        </div>
      </Section>

      <Section
        title={`Drift × volatility grid at ${leverage}x (financing ${percent(financingSlice, 1)})`}
        description="Each cell is the expected annual advantage of leverage over the unlevered index. Green means leverage is expected to help."
      >
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Drift ↓ / Vol →</th>
                {DEFAULT_AXES.volatilities.map((v) => (
                  <th key={v} className="label-xs px-3 py-2 text-right">
                    {percent(v, 0)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEFAULT_AXES.drifts.map((d) => (
                <tr key={d} className="border-b border-border/60 last:border-0">
                  <td className="num px-3 py-1.5 font-semibold">{percent(d, 0)}</td>
                  {DEFAULT_AXES.volatilities.map((v) => {
                    const cell = slice.find((c) => c.drift === d && c.volatility === v);
                    const adv = cell?.advantage ?? 0;
                    return (
                      <td key={v} className="px-1 py-1">
                        <div
                          className={cn(
                            "num px-2 py-1 text-right text-xs",
                            adv > 0.05
                              ? "bg-gain/70"
                              : adv > 0
                                ? "bg-gain/30"
                                : adv > -0.05
                                  ? "bg-loss/25"
                                  : "bg-loss/60",
                          )}
                        >
                          {cell ? percent(adv, 1) : "—"}
                        </div>
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
        title="Engineered stress paths"
        description="Scenarios history has not delivered in this sample, run through the same equation."
      >
        <div className="space-y-2">
          {stress.map((s) => (
            <div key={s.path.id} className="border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{s.path.label}</h3>
                <span className="num text-xs text-muted-foreground">
                  {s.years.toFixed(1)} years
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {s.path.description}
              </p>
              <div className="mt-3">
                <StatGrid
                  columns={3}
                  rows={[
                    { label: "Underlying total return", value: percent(s.underlyingTotal, 1) },
                    {
                      label: `${leverage}x total return`,
                      value: s.wipedOut ? "Wiped out" : percent(s.leveragedTotal, 1),
                      tone: s.leveragedTotal < 0 || s.wipedOut ? "loss" : "gain",
                    },
                    {
                      label: `${leverage}x max drawdown`,
                      value: percent(s.leveragedMaxDrawdown, 0),
                      tone: "loss",
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Path dependence in twenty days"
        description="Two return sequences reaching a near-identical destination for the underlying, with very different leveraged results."
      >
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {demo.map((c) => (
            <div key={c.label} className="bg-card p-4">
              <div className="text-sm font-semibold">{c.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Underlying</span>
                  <span className="num">{percent(c.underlyingTotal, 2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{leverage}x daily reset</span>
                  <span className={cn("num", c.leveragedTotal < 0 ? "text-loss" : "text-gain")}>
                    {percent(c.leveragedTotal, 2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="What the investor actually keeps"
        description="The simulated result after currency translation, inflation and tax on disposal."
      >
        <div className="mb-4 grid gap-4 border border-border bg-card p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="label-xs">Currency</Label>
            <div className="flex flex-wrap gap-1">
              {CURRENCY_PRESETS.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setCurrencyIdx(i)}
                  className={cn(
                    "num border px-2 py-1 text-xs",
                    i === currencyIdx
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Inflation: {percent(inflation, 1)}</Label>
            <Slider
              min={0}
              max={0.1}
              step={0.005}
              value={[inflation]}
              onValueChange={([v]) => setInflation(v ?? inflation)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Tax treatment</Label>
            <div className="flex flex-wrap gap-1">
              {TAX_PRESETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTaxId(t.id)}
                  className={cn(
                    "border px-2 py-1 text-xs",
                    t.id === taxId
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <StatGrid
          columns={3}
          rows={[
            { label: `Contributed (${cur.label}, nominal)`, value: fmtCur(view.nominalContributions) },
            { label: "Final value (nominal)", value: fmtCur(view.nominalFinalValue) },
            {
              label: "Profit (nominal)",
              value: fmtCur(view.nominalProfit),
              tone: view.nominalProfit >= 0 ? "gain" : "loss",
            },
            { label: "Contributed (today's money)", value: fmtCur(view.realContributions) },
            { label: "Final value (today's money)", value: fmtCur(view.realFinalValue) },
            {
              label: "Purchasing-power multiple",
              value: multiple(view.purchasingPowerMultiple),
              tone: view.purchasingPowerMultiple >= 1 ? "gain" : "loss",
            },
            { label: "Tax due on disposal", value: fmtCur(view.taxDue), tone: "loss" },
            { label: "After-tax final value", value: fmtCur(view.afterTaxFinalValue) },
            {
              label: "After-tax, after-inflation value",
              value: fmtCur(view.afterTaxRealFinalValue),
            },
            { label: "Nominal XIRR", value: percent(view.nominalXirr, 1) },
            { label: "Real XIRR (after inflation)", value: percent(view.realXirr, 1) },
            { label: "After-tax annualised", value: percent(view.afterTaxXirr, 1) },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">{view.taxRules.note}</p>
      </Section>
    </div>
  );
}
