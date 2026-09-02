import { indexAtOrBefore } from "@/lib/market/loader";
import type { MarketSeries } from "@/lib/market/types";
import type { FinancingModelId, StressFinancingConfig } from "./types";

/** State of the market on the day being financed, used by the stress model. */
export interface FinancingContext {
  /** Underlying drawdown as a positive decimal (0.25 = 25% below peak). */
  underlyingDrawdown: number;
  /** Trailing 21-day annualised volatility of the underlying (decimal). */
  trailingVol: number;
}

export const NEUTRAL_CONTEXT: FinancingContext = { underlyingDrawdown: 0, trailingVol: 0 };

export interface FinancingModel {
  id: FinancingModelId;
  label: string;
  description: string;
  /** Annualised financing rate (decimal) charged on borrowed exposure for `date`. */
  annualRate(date: string, ctx?: FinancingContext): number;
  /** Human-readable statement of exactly what was assumed. */
  assumption: string;
}

export const FINANCING_MODEL_META: Record<
  FinancingModelId,
  { label: string; description: string }
> = {
  none: {
    label: "A — Zero financing",
    description:
      "Theoretical only: assumes the borrowed 2x exposure is free. Never realistic; use it to isolate the pure leverage/volatility effect.",
  },
  fixed: {
    label: "B — Fixed financing rate",
    description: "A single constant annual borrowing rate for the whole period.",
  },
  riskfree: {
    label: "C0 — Historical risk-free, no spread",
    description: "13-week US Treasury bill yield (^IRX) with a zero dealer spread.",
  },
  riskfree_spread: {
    label: "C — Historical risk-free + spread (default)",
    description:
      "13-week T-bill yield plus an assumed swap/futures financing spread. Spread is a modelling assumption, not a disclosed fund cost.",
  },
  custom: {
    label: "C+ — Custom spread over risk-free",
    description: "Historical T-bill yield plus a spread you choose.",
  },
  stress: {
    label: "D — Stress financing (state dependent)",
    description:
      "T-bill plus a spread that widens when the underlying is in drawdown or realised volatility spikes, capped at a maximum rate. All levels are user-specified assumptions.",
  },
};

/** Parallel shifts used by the mandatory financing-sensitivity ladder. */
export const FINANCING_SHIFTS = [0, 0.005, 0.01, 0.02, 0.03];

/**
 * Builds a financing model. `irx` holds the 13-week T-bill discount yield in
 * percent; rows with invalid values were removed upstream, so the last valid
 * observation is carried forward.
 *
 * The rate returned here is the *full* annual borrowing rate. The caller
 * charges it on the borrowed portion only, i.e. (L - 1) units of exposure.
 */
export function createFinancingModel(
  id: FinancingModelId,
  opts: {
    irx: MarketSeries;
    fixedRate: number;
    spread: number;
    stress: StressFinancingConfig;
    /** Parallel shift added to the final rate (sensitivity ladder). */
    shift?: number;
  },
): FinancingModel {
  const meta = FINANCING_MODEL_META[id];
  const shift = opts.shift ?? 0;
  const rateAt = (date: string): number => {
    if (opts.irx.dates.length === 0) return 0;
    const i = indexAtOrBefore(opts.irx.dates, date);
    if (i < 0) return opts.irx.close[0]! / 100;
    return opts.irx.close[i]! / 100;
  };

  const stressSpread = (ctx: FinancingContext): number => {
    const s = opts.stress;
    const level = s.trigger === "underlying_drawdown" ? ctx.underlyingDrawdown : ctx.trailingVol;
    if (level >= s.extremeLevel) return s.extremeSpread;
    if (level >= s.crisisLevel) return s.crisisSpread;
    return s.baseSpread;
  };

  const annualRate = (date: string, ctx: FinancingContext = NEUTRAL_CONTEXT): number => {
    let r: number;
    switch (id) {
      case "none":
        return 0;
      case "fixed":
        r = opts.fixedRate;
        break;
      case "riskfree":
        r = rateAt(date);
        break;
      case "stress":
        r = Math.min(opts.stress.maxRate, rateAt(date) + stressSpread(ctx));
        break;
      case "custom":
      case "riskfree_spread":
      default:
        r = rateAt(date) + opts.spread;
        break;
    }
    return Math.max(0, r + shift);
  };

  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  let assumption: string;
  switch (id) {
    case "none":
      assumption = "Financing assumed free (0.00%). Counterfactual only.";
      break;
    case "fixed":
      assumption = `Constant ${pct(opts.fixedRate)} annual financing rate on the borrowed exposure.`;
      break;
    case "riskfree":
      assumption = "Historical 13-week T-bill yield, zero spread. Understates real borrowing cost.";
      break;
    case "stress":
      assumption = `Historical T-bill + ${pct(opts.stress.baseSpread)} normally, ${pct(
        opts.stress.crisisSpread,
      )} above ${
        opts.stress.trigger === "underlying_drawdown"
          ? `${pct(opts.stress.crisisLevel)} underlying drawdown`
          : `${pct(opts.stress.crisisLevel)} trailing volatility`
      }, ${pct(opts.stress.extremeSpread)} beyond ${pct(
        opts.stress.extremeLevel,
      )}, capped at ${pct(opts.stress.maxRate)}. All levels are assumptions.`;
      break;
    default:
      assumption = `Historical T-bill + assumed ${pct(opts.spread)} spread. The spread is a modelling assumption, not a disclosed fund financing cost.`;
  }
  if (shift !== 0) assumption += ` Sensitivity shift applied: ${shift >= 0 ? "+" : ""}${pct(shift)}.`;

  return { id, label: meta.label, description: meta.description, annualRate, assumption };
}

export const DEFAULT_STRESS_FINANCING: StressFinancingConfig = {
  baseSpread: 0.006,
  crisisSpread: 0.02,
  extremeSpread: 0.04,
  trigger: "underlying_drawdown",
  crisisLevel: 0.2,
  extremeLevel: 0.4,
  maxRate: 0.15,
};
