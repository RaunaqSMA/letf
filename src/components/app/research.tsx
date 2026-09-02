import { useMemo } from "react";

import { Callout, Section } from "@/components/app/primitives";
import { percent } from "@/lib/format";
import type { Distribution } from "@/lib/sim/rolling-advanced";
import type { SimulationResult } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

/** Every modelling assumption, listed verbatim. */
export function AssumptionsPanel({
  result,
  compact = false,
}: {
  result: SimulationResult;
  compact?: boolean;
}) {
  return (
    <div className="border border-border bg-card">
      <div className="label-xs border-b border-border px-4 py-2.5">
        Assumptions in force · model {result.modelVersion} · run {result.simulationId}
      </div>
      <ul className={cn("divide-y divide-border/60", compact ? "text-xs" : "text-sm")}>
        {result.assumptions.map((a) => (
          <li key={a} className="px-4 py-2 leading-relaxed text-muted-foreground">
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatGrid({
  rows,
  columns = 2,
}: {
  rows: { label: string; value: string; tone?: "gain" | "loss" | "neutral"; hint?: string }[];
  columns?: number;
}) {
  return (
    <div
      className={cn(
        "grid gap-px border border-border bg-border",
        columns === 4
          ? "sm:grid-cols-2 xl:grid-cols-4"
          : columns === 3
            ? "sm:grid-cols-3"
            : "sm:grid-cols-2",
      )}
    >
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3 bg-card px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {r.label}
            {r.hint ? <span className="block text-[11px] opacity-70">{r.hint}</span> : null}
          </span>
          <span
            className={cn(
              "num text-sm font-medium",
              r.tone === "gain" && "text-gain",
              r.tone === "loss" && "text-loss",
            )}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}


const DIST_COLS: { key: keyof Distribution; label: string }[] = [
  { key: "min", label: "Min" },
  { key: "p5", label: "P5" },
  { key: "p25", label: "P25" },
  { key: "median", label: "Median" },
  { key: "mean", label: "Mean" },
  { key: "p75", label: "P75" },
  { key: "p95", label: "P95" },
  { key: "max", label: "Max" },
];

export function DistributionRow({
  label,
  dist,
  format,
}: {
  label: string;
  dist: Distribution;
  format: (v: number) => string;
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-3 py-2 text-xs text-muted-foreground">{label}</td>
      {DIST_COLS.map((c) => {
        const v = dist[c.key] as number | null;
        return (
          <td key={c.key} className="num px-3 py-2 text-right text-xs">
            {v === null ? "—" : format(v)}
          </td>
        );
      })}
    </tr>
  );
}

export function DistributionTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="label-xs px-3 py-2 text-left">Measure</th>
            {DIST_COLS.map((c) => (
              <th key={c.key} className="label-xs px-3 py-2 text-right">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export interface ConclusionInput {
  result: SimulationResult;
  /** Historical frequency of 3x beating 1x over the longest available horizon. */
  longHorizonBeatShare?: number | null;
  longHorizonYears?: number | null;
  worstHorizonCagr?: number | null;
  syntheticShare: number;
}

/**
 * The Research Conclusion panel. It states what the evidence supports and,
 * just as importantly, what it does not.
 */
export function ResearchConclusion({
  result,
  longHorizonBeatShare = null,
  longHorizonYears = null,
  worstHorizonCagr = null,
  syntheticShare,
}: ConclusionInput) {
  const verdict = useMemo(() => {
    const beat = longHorizonBeatShare;
    const dd = result.drawdowns.navMaxDrawdown;
    const xirr = result.xirr;
    const lines: string[] = [];

    if (xirr !== null) {
      lines.push(
        `Over this specific window (${result.startDate} → ${result.endDate}), the ${result.config.leverage}x daily-reset strategy delivered a money-weighted return of ${percent(xirr)} per year on contributed capital.`,
      );
    }
    lines.push(
      `The fund NAV fell ${percent(result.drawdowns.navMaxDrawdown)} from peak to trough, while the portfolio's own value fell ${percent(result.drawdowns.portfolioMaxDrawdown)} and, at the worst moment, was ${percent(result.drawdowns.worstContributionRelative)} below the money paid in. Those are three different numbers and only the last one is what the investor's statement shows.`,
    );
    if (beat !== null && longHorizonYears !== null) {
      lines.push(
        `Across overlapping ${longHorizonYears}-year windows in this sample, the leveraged path finished ahead of the unlevered index in ${percent(beat, 0)} of windows. Overlapping windows are not independent observations, so this is a historical frequency, not a probability.`,
      );
    }
    if (worstHorizonCagr !== null) {
      lines.push(
        `The worst such window compounded at ${percent(worstHorizonCagr)} per year — the outcome an investor with unlucky timing actually received.`,
      );
    }
    if (dd <= -0.9) {
      lines.push(
        "A drawdown beyond -90% means recovery requires a more-than-tenfold gain. Position sizing, not conviction, is what determines survival here.",
      );
    }
    return lines;
  }, [result, longHorizonBeatShare, longHorizonYears, worstHorizonCagr]);

  return (
    <Section
      title="Research conclusion"
      description="Generated from the numbers on this page, restated in plain language."
    >
      <div className="space-y-3">
        <div className="border border-border bg-card p-4 text-sm leading-relaxed">
          {verdict.map((line) => (
            <p key={line} className="mb-3 last:mb-0">
              {line}
            </p>
          ))}
        </div>
        <Callout title="What this evidence cannot tell you">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {percent(syntheticShare, 0)} of this simulation is synthetic reconstruction, not
              observed fund prices. It reproduces the mechanics of a daily-reset fund but not the
              real fund's tracking error, borrow availability, or trading frictions.
            </li>
            <li>
              One market history is one sample. Nothing here estimates the probability of any future
              outcome; the resampling and sensitivity pages exist to show how sensitive conclusions
              are to that single sample.
            </li>
            <li>
              A leveraged ETF has no guarantee of continued existence. Sponsors close funds, and a
              sufficiently large single-day move against the position terminates it outright.
            </li>
            <li>This is a research tool. It is not investment advice.</li>
          </ul>
        </Callout>
      </div>
    </Section>
  );
}
