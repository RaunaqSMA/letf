import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ConfigPanel } from "@/components/app/ConfigPanel";
import { PortfolioChart } from "@/components/app/charts";
import {
  Callout,
  DataTypeBadge,
  LoadingState,
  Metric,
  PageHeader,
  Section,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { currency, number as fmtNumber, percent, shortDate, signedPercent } from "@/lib/format";
import { INSTRUMENTS } from "@/lib/market/types";
import {
  configJson,
  dailyCsv,
  downloadCsv,
  downloadJson,
  exportFilename,
  ledgerCsv,
  monthlyCsv,
} from "@/lib/sim/export";
import { useSimulation } from "@/lib/sim/store";

export const Route = createFileRoute("/simulator")({
  head: () => ({
    meta: [
      { title: "Simulator — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Configure leverage, financing model, expense ratio and contribution schedule, then inspect the full daily DCA ledger.",
      },
      { property: "og:title", content: "Simulator — LETF DCA Lab" },
      {
        property: "og:description",
        content:
          "Configure financing, fees and contributions, then inspect the full leveraged-ETF DCA ledger.",
      },
    ],
  }),
  component: SimulatorPage,
});

const PAGE_SIZE = 60;

function SimulatorPage() {
  const { result, isLoading, error, config } = useSimulation();
  const outputRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(PAGE_SIZE);
  const inst = INSTRUMENTS[config.instrument];

  const ledger = useMemo(() => (result ? [...result.ledger].reverse() : []), [result]);

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
        title="Simulator"
        subtitle="Every assumption is explicit. Change one and the whole daily path is recomputed with daily-reset compounding."
      />
      <div className="grid grid-cols-1 gap-px bg-border xl:grid-cols-[360px_1fr]">
        <div className="bg-background p-4 md:p-6">
          <ConfigPanel
            onRun={() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>

        <div ref={outputRef} className="bg-background">
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            <Metric label="Final value" value={currency(result.finalValue)} tone="gain" />
            <Metric label="Invested" value={currency(result.totalContributions)} />
            <Metric
              label="Profit"
              value={currency(result.profit)}
              tone={result.profit >= 0 ? "gain" : "loss"}
              sub={signedPercent(result.totalReturn)}
            />
            <Metric
              label="XIRR"
              value={percent(result.xirr, 2)}
              tone={(result.xirr ?? 0) >= 0 ? "gain" : "loss"}
            />
          </div>

          <Section title="Simulated path">
            <div className="border border-border bg-card p-3">
              <PortfolioChart
                data={result.portfolio}
                inceptionDate={config.useSyntheticHistory ? inst.inception : null}
              />
            </div>
          </Section>

          <Section
            title="DCA ledger"
            description={`Every contribution, the NAV it bought at, and whether that NAV is actual or reconstructed. ${result.ledger.length} rows, newest first.`}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(exportFilename(result, "ledger"), ledgerCsv(result))
                  }
                >
                  <Download className="size-3.5" /> Ledger
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(exportFilename(result, "monthly"), monthlyCsv(result))
                  }
                >
                  <Download className="size-3.5" /> Monthly
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsv(exportFilename(result, "daily"), dailyCsv(result))}
                >
                  <Download className="size-3.5" /> Daily
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="num gap-1.5"
                  onClick={() =>
                    downloadJson(exportFilename(result, "config", "json"), configJson(result))
                  }
                >
                  <Download className="size-3.5" /> Config
                </Button>
              </>
            }
          >
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="border-b border-border">
                    <th className="label-xs px-3 py-2 text-left">Date</th>
                    <th className="label-xs px-3 py-2 text-left">Type</th>
                    <th className="label-xs px-3 py-2 text-right">NAV</th>
                    <th className="label-xs px-3 py-2 text-right">Contribution</th>
                    <th className="label-xs px-3 py-2 text-right">Units bought</th>
                    <th className="label-xs px-3 py-2 text-right">Total units</th>
                    <th className="label-xs px-3 py-2 text-right">Invested</th>
                    <th className="label-xs px-3 py-2 text-right">Value</th>
                    <th className="label-xs px-3 py-2 text-right">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, rows).map((r) => (
                    <tr key={r.date} className="border-b border-border last:border-0">
                      <td className="num px-3 py-1.5">{shortDate(r.date)}</td>
                      <td className="px-3 py-1.5">
                        <DataTypeBadge type={r.dataType} />
                      </td>
                      <td className="num px-3 py-1.5 text-right">{currency(r.nav, { decimals: 2 })}</td>
                      <td className="num px-3 py-1.5 text-right">
                        {currency(r.contribution, { decimals: 2 })}
                      </td>
                      <td className="num px-3 py-1.5 text-right">{fmtNumber(r.unitsBought, 4)}</td>
                      <td className="num px-3 py-1.5 text-right">{fmtNumber(r.cumulativeUnits, 2)}</td>
                      <td className="num px-3 py-1.5 text-right">
                        {currency(r.cumulativeContributions)}
                      </td>
                      <td className="num px-3 py-1.5 text-right">{currency(r.portfolioValue)}</td>
                      <td
                        className={`num px-3 py-1.5 text-right ${r.profitLoss >= 0 ? "text-gain" : "text-loss"}`}
                      >
                        {currency(r.profitLoss)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {signedPercent(r.portfolioReturn)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows < ledger.length ? (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => setRows((r) => r + 120)}>
                  Show more ({ledger.length - rows} remaining)
                </Button>
              </div>
            ) : null}
          </Section>
        </div>
      </div>
    </div>
  );
}