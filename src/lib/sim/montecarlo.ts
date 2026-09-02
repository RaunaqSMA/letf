/**
 * Probabilistic forecasting by block bootstrap.
 *
 * We resample *blocks* of consecutive historical daily returns rather than
 * individual days, because volatility clusters: shuffling day by day destroys
 * exactly the serial structure that drives leverage decay. Optionally the
 * bootstrap is regime-aware, drawing calm and stressed blocks in proportions
 * you control, so you can ask "what if the next 50 years are more turbulent
 * than the last 25?".
 *
 * This is a *what-if* engine, not a prediction. The sample it resamples from
 * is one particular history of one particular market, so the output describes
 * the range of outcomes consistent with that history — nothing more.
 */

import { cagrOf, percentileOf, TRADING_DAYS } from "./metrics";
import { createRng } from "./rng";
import { describe, type Distribution } from "./rolling-advanced";

export interface MonteCarloStrategy {
  id: string;
  label: string;
  leverage: number;
  expenseRatio: number;
  /** Extra annual drag (slippage, calibration) applied daily. */
  extraDrag: number;
  /** true = invest the whole budget on day one instead of contributing. */
  lumpSum: boolean;
}

export interface MonteCarloConfig {
  paths: number;
  years: number;
  seed: string;
  /** Mean block length in trading days (geometric block bootstrap). */
  blockDays: number;
  contribution: number;
  /** Contributions per year (12 = monthly). */
  contributionsPerYear: number;
  startingCapital: number;
  /** Annual financing rate applied to borrowed exposure. */
  financingRate: number;
  /** Share of blocks drawn from the most volatile quintile of history. */
  stressBlockShare: number;
  /** Multiplier applied to every sampled return's deviation from its mean. */
  volatilityScale: number;
  /** Annual drift adjustment added to the resampled underlying returns. */
  driftAdjustment: number;
}

export const DEFAULT_MC_CONFIG: MonteCarloConfig = {
  paths: 2000,
  years: 30,
  seed: "letf-lab-v2",
  blockDays: 21,
  contribution: 100,
  contributionsPerYear: 12,
  startingCapital: 0,
  financingRate: 0.04,
  stressBlockShare: 0,
  volatilityScale: 1,
  driftAdjustment: 0,
};

export interface MonteCarloPathSummary {
  terminalValue: number;
  totalContributions: number;
  multiple: number;
  cagr: number | null;
  maxDrawdown: number;
  wipedOut: boolean;
  endedBelowContributions: boolean;
}

export interface MonteCarloStrategyResult {
  strategy: MonteCarloStrategy;
  paths: number;
  terminal: Distribution;
  multiple: Distribution;
  cagr: Distribution;
  maxDrawdown: Distribution;
  /** Historical-frequency style outcome shares across simulated paths. */
  shareWipedOut: number;
  shareBelowContributions: number;
  shareBeatBenchmark: number;
  shareDrawdownOver80: number;
  medianTerminal: number | null;
  meanTerminal: number | null;
  /** Terminal value at each decile, for the fan chart. */
  fan: { percentile: number; value: number }[];
  /** Median terminal value trajectory (sampled yearly) for charting. */
  medianTrajectory: { year: number; value: number }[];
}

export interface MonteCarloResult {
  config: MonteCarloConfig;
  strategies: MonteCarloStrategyResult[];
  /** Realised annualised volatility of the resampled underlying, for sanity. */
  sampledUnderlyingVolatility: number;
  sampledUnderlyingDrift: number;
  historyFrom: string;
  historyTo: string;
  historyDays: number;
  warnings: string[];
}

export const DEFAULT_STRATEGIES: MonteCarloStrategy[] = [
  { id: "letf3x", label: "3x LETF, DCA", leverage: 3, expenseRatio: 0.0095, extraDrag: 0, lumpSum: false },
  { id: "index", label: "1x index, DCA", leverage: 1, expenseRatio: 0.0003, extraDrag: 0, lumpSum: false },
  { id: "letf2x", label: "2x LETF, DCA", leverage: 2, expenseRatio: 0.0095, extraDrag: 0, lumpSum: false },
];

interface BlockPool {
  returns: Float64Array;
  /** Start indices allowed for calm blocks and for stressed blocks. */
  calmStarts: Int32Array;
  stressStarts: Int32Array;
}

/** Splits history into calm and stressed block starts by trailing volatility. */
function buildPool(returns: Float64Array, blockDays: number): BlockPool {
  const n = returns.length;
  const maxStart = Math.max(1, n - blockDays);
  const vols: { i: number; v: number }[] = [];
  for (let i = 0; i < maxStart; i++) {
    let sq = 0;
    for (let k = 0; k < blockDays; k++) {
      const r = returns[i + k] ?? 0;
      sq += r * r;
    }
    vols.push({ i, v: Math.sqrt(sq / blockDays) });
  }
  const sorted = [...vols].sort((a, b) => a.v - b.v);
  const cut = Math.floor(sorted.length * 0.8);
  const calm = sorted.slice(0, cut).map((x) => x.i);
  const stress = sorted.slice(cut).map((x) => x.i);
  return {
    returns,
    calmStarts: Int32Array.from(calm.length ? calm : vols.map((x) => x.i)),
    stressStarts: Int32Array.from(stress.length ? stress : vols.map((x) => x.i)),
  };
}

/**
 * Runs the bootstrap. `underlyingReturns` are daily *unlevered* total returns
 * from the historical sample.
 */
export function runMonteCarlo(
  underlyingReturns: Float64Array,
  meta: { from: string; to: string },
  config: MonteCarloConfig,
  strategies: MonteCarloStrategy[] = DEFAULT_STRATEGIES,
): MonteCarloResult {
  const warnings: string[] = [];
  const history = underlyingReturns;
  if (history.length < 250) {
    warnings.push("Fewer than one year of historical returns — bootstrap output is not meaningful.");
  }

  let mean = 0;
  for (let i = 0; i < history.length; i++) mean += history[i]!;
  mean = history.length ? mean / history.length : 0;

  const blockDays = Math.max(1, Math.round(config.blockDays));
  const pool = buildPool(history, blockDays);
  const totalDays = Math.max(1, Math.round(config.years * TRADING_DAYS));
  const contributionEvery = Math.max(
    1,
    Math.round(TRADING_DAYS / Math.max(1, config.contributionsPerYear)),
  );
  const driftPerDay = config.driftAdjustment / TRADING_DAYS;

  // Yearly checkpoints for the median trajectory.
  const checkpoints: number[] = [];
  for (let y = 1; y <= Math.floor(config.years); y++) {
    checkpoints.push(Math.min(totalDays - 1, y * TRADING_DAYS - 1));
  }

  let sampledSum = 0;
  let sampledSq = 0;
  let sampledCount = 0;

  const results: MonteCarloStrategyResult[] = [];
  const perStrategyPaths: MonteCarloPathSummary[][] = strategies.map(() => []);
  const perStrategyCheckpoints: number[][][] = strategies.map(() =>
    checkpoints.map(() => [] as number[]),
  );

  for (let p = 0; p < config.paths; p++) {
    // Each path gets its own deterministic stream keyed on the master seed.
    const rng = createRng(`${config.seed}#${p}`);
    const path = new Float64Array(totalDays);
    let filled = 0;
    while (filled < totalDays) {
      const stressed = rng.next() < config.stressBlockShare;
      const starts = stressed ? pool.stressStarts : pool.calmStarts;
      const start = starts[rng.int(starts.length)] ?? 0;
      const len = Math.min(blockDays, totalDays - filled);
      for (let k = 0; k < len; k++) {
        const raw = pool.returns[(start + k) % pool.returns.length] ?? 0;
        const scaled = mean + (raw - mean) * config.volatilityScale + driftPerDay;
        path[filled + k] = scaled;
        sampledSum += scaled;
        sampledSq += scaled * scaled;
        sampledCount++;
      }
      filled += len;
    }

    for (let sIdx = 0; sIdx < strategies.length; sIdx++) {
      const st = strategies[sIdx]!;
      const dailyDrag =
        ((st.leverage - 1) * config.financingRate + st.expenseRatio + st.extraDrag) / TRADING_DAYS;
      const budget = config.contribution * config.contributionsPerYear * config.years;
      let nav = 100;
      let units = 0;
      let contributions = 0;
      let peak = 0;
      let maxDD = 0;
      let wiped = false;

      if (st.lumpSum) {
        const initial = config.startingCapital + budget;
        units = initial / nav;
        contributions = initial;
      } else if (config.startingCapital > 0) {
        units = config.startingCapital / nav;
        contributions = config.startingCapital;
      }

      let cpIdx = 0;
      for (let t = 0; t < totalDays; t++) {
        const r = path[t]!;
        const net = st.leverage * r - dailyDrag;
        nav = nav * (1 + net);
        if (nav <= 0) {
          nav = 0;
          wiped = true;
        }
        if (!st.lumpSum && t % contributionEvery === 0) {
          if (nav > 0) units += config.contribution / nav;
          contributions += config.contribution;
        }
        const value = units * nav;
        if (value > peak) peak = value;
        if (peak > 0) {
          const dd = value / peak - 1;
          if (dd < maxDD) maxDD = dd;
        }
        if (cpIdx < checkpoints.length && t === checkpoints[cpIdx]) {
          perStrategyCheckpoints[sIdx]![cpIdx]!.push(value);
          cpIdx++;
        }
      }

      const terminalValue = units * nav;
      perStrategyPaths[sIdx]!.push({
        terminalValue,
        totalContributions: contributions,
        multiple: contributions > 0 ? terminalValue / contributions : 0,
        cagr: cagrOf(Math.max(1e-9, contributions), Math.max(1e-9, terminalValue), config.years),
        maxDrawdown: maxDD,
        wipedOut: wiped,
        endedBelowContributions: terminalValue < contributions,
      });
    }
  }

  // Benchmark = the first 1x strategy, else the first strategy.
  const benchIdx = Math.max(
    0,
    strategies.findIndex((s) => s.leverage === 1),
  );

  for (let sIdx = 0; sIdx < strategies.length; sIdx++) {
    const rows = perStrategyPaths[sIdx]!;
    const bench = perStrategyPaths[benchIdx]!;
    const terminals = rows.map((r) => r.terminalValue).sort((a, b) => a - b);
    let beat = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.terminalValue > (bench[i]?.terminalValue ?? 0)) beat++;
    }
    const share = (pred: (r: MonteCarloPathSummary) => boolean) =>
      rows.length ? rows.filter(pred).length / rows.length : 0;
    results.push({
      strategy: strategies[sIdx]!,
      paths: rows.length,
      terminal: describe(rows.map((r) => r.terminalValue)),
      multiple: describe(rows.map((r) => r.multiple)),
      cagr: describe(rows.map((r) => r.cagr).filter((v): v is number => v !== null)),
      maxDrawdown: describe(rows.map((r) => r.maxDrawdown)),
      shareWipedOut: share((r) => r.wipedOut),
      shareBelowContributions: share((r) => r.endedBelowContributions),
      shareBeatBenchmark: rows.length ? beat / rows.length : 0,
      shareDrawdownOver80: share((r) => r.maxDrawdown <= -0.8),
      medianTerminal: percentileOf(terminals, 0.5),
      meanTerminal: terminals.length ? terminals.reduce((a, b) => a + b, 0) / terminals.length : null,
      fan: [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].map((q) => ({
        percentile: q,
        value: percentileOf(terminals, q) ?? 0,
      })),
      medianTrajectory: checkpoints.map((_, cIdx) => {
        const vals = [...perStrategyCheckpoints[sIdx]![cIdx]!].sort((a, b) => a - b);
        return { year: cIdx + 1, value: percentileOf(vals, 0.5) ?? 0 };
      }),
    });
  }

  const sMean = sampledCount ? sampledSum / sampledCount : 0;
  const sVar = sampledCount ? sampledSq / sampledCount - sMean * sMean : 0;

  return {
    config,
    strategies: results,
    sampledUnderlyingVolatility: Math.sqrt(Math.max(0, sVar)) * Math.sqrt(TRADING_DAYS),
    sampledUnderlyingDrift: sMean * TRADING_DAYS,
    historyFrom: meta.from,
    historyTo: meta.to,
    historyDays: history.length,
    warnings,
  };
}
