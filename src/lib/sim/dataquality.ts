/**
 * Automated dataset audit.
 *
 * Research results are only as good as the inputs, so every series is checked
 * for gaps, duplicates, non-positive prices, implausible jumps and stale
 * (repeated) values. The report is surfaced verbatim in the UI rather than
 * being silently fixed.
 */

import type { MarketDataset, MarketSeries, SeriesKey } from "@/lib/market/types";

export type AuditSeverity = "info" | "warning" | "error";

export interface AuditFinding {
  series: string;
  severity: AuditSeverity;
  type: "gap" | "duplicate" | "non-positive" | "jump" | "stale" | "ordering" | "coverage";
  date: string;
  detail: string;
}

export interface SeriesAudit {
  key: string;
  symbol: string;
  source: string;
  retrieved: string;
  observations: number;
  first: string;
  last: string;
  years: number;
  /** Trading days expected from the weekday count, minus market holidays. */
  expectedApprox: number;
  coverage: number;
  gaps: number;
  longestGapDays: number;
  longestGapAt: string | null;
  duplicates: number;
  nonPositive: number;
  extremeJumps: number;
  staleRuns: number;
  findings: AuditFinding[];
}

export interface DatasetAudit {
  series: SeriesAudit[];
  findings: AuditFinding[];
  totalObservations: number;
  errors: number;
  warnings: number;
  /** Latest common date across every series — the honest end of the sample. */
  commonEnd: string | null;
  commonStart: string | null;
  verdict: "clean" | "minor issues" | "attention needed";
}

const DAY_MS = 86400000;

function weekdaysBetween(a: string, b: string): number {
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (!isFinite(start) || !isFinite(end) || end < start) return 0;
  let count = 0;
  for (let t = start; t <= end; t += DAY_MS) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** Audits one series. `jumpLimit` is the absolute daily move treated as suspect. */
export function auditSeries(key: string, s: MarketSeries, jumpLimit = 0.25): SeriesAudit {
  const findings: AuditFinding[] = [];
  const n = s.dates.length;
  let duplicates = 0;
  let nonPositive = 0;
  let extremeJumps = 0;
  let gaps = 0;
  let longestGapDays = 0;
  let longestGapAt: string | null = null;
  let staleRuns = 0;
  let staleLen = 0;

  for (let i = 0; i < n; i++) {
    const d = s.dates[i]!;
    const px = s.adjClose[i]!;
    if (i > 0) {
      const prev = s.dates[i - 1]!;
      if (d === prev) {
        duplicates++;
        findings.push({
          series: key,
          severity: "error",
          type: "duplicate",
          date: d,
          detail: "The same trading date appears twice.",
        });
      } else if (d < prev) {
        findings.push({
          series: key,
          severity: "error",
          type: "ordering",
          date: d,
          detail: `Out-of-order date: ${d} follows ${prev}.`,
        });
      } else {
        const days = Math.round((Date.parse(d) - Date.parse(prev)) / DAY_MS);
        if (days > 5) {
          gaps++;
          if (days > longestGapDays) {
            longestGapDays = days;
            longestGapAt = prev;
          }
          if (days > 10) {
            findings.push({
              series: key,
              severity: "warning",
              type: "gap",
              date: prev,
              detail: `${days} calendar days with no observation (${prev} → ${d}).`,
            });
          }
        }
      }
      const prevPx = s.adjClose[i - 1]!;
      if (prevPx > 0 && px > 0) {
        const r = px / prevPx - 1;
        if (Math.abs(r) > jumpLimit) {
          extremeJumps++;
          findings.push({
            series: key,
            severity: "warning",
            type: "jump",
            date: d,
            detail: `Daily move of ${(r * 100).toFixed(1)}% — verify against the source before trusting it.`,
          });
        }
        if (r === 0) {
          staleLen++;
          if (staleLen === 5) {
            staleRuns++;
            findings.push({
              series: key,
              severity: "info",
              type: "stale",
              date: d,
              detail: "Five or more consecutive unchanged closes — possible carried-forward values.",
            });
          }
        } else staleLen = 0;
      }
    }
    if (!(px > 0)) {
      nonPositive++;
      findings.push({
        series: key,
        severity: key === "irx" ? "info" : "error",
        type: "non-positive",
        date: d,
        detail:
          key === "irx"
            ? "Non-positive T-bill yield (this genuinely happened in 2020 and 2008); carried forward."
            : "Non-positive price — excluded from return calculations.",
      });
    }
  }

  const first = n ? s.dates[0]! : "—";
  const last = n ? s.dates[n - 1]! : "—";
  const expectedApprox = n ? Math.round(weekdaysBetween(first, last) * 0.96) : 0;
  const years = n
    ? Math.max(0, (Date.parse(last) - Date.parse(first)) / (365.25 * DAY_MS))
    : 0;
  const coverage = expectedApprox > 0 ? Math.min(1, n / expectedApprox) : 0;
  if (coverage < 0.95 && n > 0) {
    findings.push({
      series: key,
      severity: "warning",
      type: "coverage",
      date: last,
      detail: `Only ${(coverage * 100).toFixed(1)}% of expected trading days are present.`,
    });
  }

  return {
    key,
    symbol: s.symbol,
    source: s.source,
    retrieved: s.retrieved,
    observations: n,
    first,
    last,
    years,
    expectedApprox,
    coverage,
    gaps,
    longestGapDays,
    longestGapAt,
    duplicates,
    nonPositive,
    extremeJumps,
    staleRuns,
    findings,
  };
}

const SERIES_KEYS: SeriesKey[] = ["ndx", "spx", "qqq", "spy", "tqqq", "spxl", "irx"];

export function auditDataset(data: MarketDataset): DatasetAudit {
  const series = SERIES_KEYS.map((k) => auditSeries(k, data[k], k === "tqqq" || k === "spxl" ? 0.35 : 0.25));
  const findings = series.flatMap((s) => s.findings);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const withData = series.filter((s) => s.observations > 0);
  const commonEnd = withData.length
    ? withData.map((s) => s.last).sort()[0]!
    : null;
  const commonStart = withData.length
    ? withData.map((s) => s.first).sort().at(-1)!
    : null;
  return {
    series,
    findings,
    totalObservations: series.reduce((a, s) => a + s.observations, 0),
    errors,
    warnings,
    commonEnd,
    commonStart,
    verdict: errors > 0 ? "attention needed" : warnings > 5 ? "minor issues" : "clean",
  };
}
