import type { SimulationResult } from "./types";

function escapeCell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilename(result: SimulationResult, kind: string, ext = "csv"): string {
  const y1 = result.startDate.slice(0, 4);
  const y2 = result.endDate.slice(0, 4);
  return `${result.config.instrument}_${kind}_${y1}_${y2}.${ext}`;
}

export function ledgerCsv(result: SimulationResult): string {
  return toCsv(
    [
      "Date",
      "Underlying Price",
      "ETF NAV",
      "Data Type",
      "Contribution",
      "Units Purchased",
      "Cumulative Units",
      "Cumulative Contributions",
      "Portfolio Value",
      "Profit/Loss",
      "Portfolio Return",
    ],
    result.ledger.map((r) => [
      r.date,
      r.underlyingPrice.toFixed(4),
      r.nav.toFixed(6),
      r.dataType,
      r.contribution.toFixed(2),
      r.unitsBought.toFixed(8),
      r.cumulativeUnits.toFixed(8),
      r.cumulativeContributions.toFixed(2),
      r.portfolioValue.toFixed(2),
      r.profitLoss.toFixed(2),
      (r.portfolioReturn * 100).toFixed(4),
    ]),
  );
}

export function dailyCsv(result: SimulationResult): string {
  const d = result.daily;
  const rows: (string | number)[][] = [];
  for (let i = 0; i < d.dates.length; i++) {
    rows.push([
      d.dates[i]!,
      d.underlying[i]!.toFixed(4),
      (d.underlyingReturn[i]! * 100).toFixed(6),
      result.config.leverage,
      (d.financingCost[i]! * 100).toFixed(6),
      (d.expenseCost[i]! * 100).toFixed(6),
      (d.dailyReturn[i]! * 100).toFixed(6),
      d.nav[i]!.toFixed(6),
      d.peak[i]!.toFixed(6),
      (d.drawdown[i]! * 100).toFixed(4),
      d.dataType[i] === 1 ? "ACTUAL" : "SYNTHETIC",
      result.portfolio[i]!.value.toFixed(2),
      result.portfolio[i]!.contributions.toFixed(2),
    ]);
  }
  return toCsv(
    [
      "Date",
      "Underlying Close",
      "Underlying Return %",
      "Leverage",
      "Financing Drag %",
      "Expense Drag %",
      "Net Daily Return %",
      "NAV",
      "Running Peak",
      "NAV Drawdown %",
      "Data Type",
      "Portfolio Value",
      "Cumulative Contributions",
    ],
    rows,
  );
}

export function monthlyCsv(result: SimulationResult): string {
  const rows: (string | number)[][] = [];
  let lastMonth = "";
  result.portfolio.forEach((p, i) => {
    const m = p.date.slice(0, 7);
    const next = result.portfolio[i + 1];
    if (!next || next.date.slice(0, 7) !== m) {
      rows.push([
        m,
        p.date,
        result.daily.nav[i]!.toFixed(6),
        p.contributions.toFixed(2),
        p.value.toFixed(2),
        p.profit.toFixed(2),
        (p.drawdown * 100).toFixed(2),
        p.dataType,
      ]);
      lastMonth = m;
    }
  });
  void lastMonth;
  return toCsv(
    ["Month", "Last Trading Day", "NAV", "Cumulative Contributions", "Portfolio Value", "Profit", "Portfolio Drawdown %", "Data Type"],
    rows,
  );
}
/** Full reproducibility bundle: config, model version, assumptions, headline results. */
export function configJson(result: SimulationResult): string {
  return JSON.stringify(
    {
      modelVersion: result.modelVersion,
      simulationId: result.simulationId,
      exportedAt: new Date().toISOString(),
      window: { start: result.startDate, end: result.endDate },
      config: result.config,
      assumptions: result.assumptions,
      headline: {
        totalContributions: result.totalContributions,
        finalValue: result.finalValue,
        profit: result.profit,
        totalReturn: result.totalReturn,
        xirr: result.xirr,
        syntheticShare: result.syntheticShare,
      },
    },
    null,
    2,
  );
}

export function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
