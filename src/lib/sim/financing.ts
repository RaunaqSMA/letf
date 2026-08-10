import { indexAtOrBefore } from "@/lib/market/loader";
import type { MarketSeries } from "@/lib/market/types";
import type { FinancingModelId } from "./types";

export interface FinancingModel {
  id: FinancingModelId;
  label: string;
  description: string;
  /** Annualised financing rate (decimal) charged on borrowed exposure for `date`. */
  annualRate(date: string): number;
}

export const FINANCING_MODEL_META: Record<FinancingModelId, { label: string; description: string }> = {
  none: {
    label: "No financing cost",
    description: "Counterfactual only: assumes leverage is free. Not realistic.",
  },
  fixed: {
    label: "Fixed financing rate",
    description: "A single constant annual borrowing rate for the whole period.",
  },
  riskfree: {
    label: "Historical risk-free rate",
    description: "13-week US Treasury bill yield (^IRX) with no dealer spread.",
  },
  riskfree_spread: {
    label: "Historical risk-free + spread (default)",
    description:
      "13-week T-bill yield plus an estimated swap/derivative financing spread. This is the default research model.",
  },
  custom: {
    label: "Custom spread over risk-free",
    description: "Historical T-bill yield plus a spread you choose.",
  },
};

/**
 * Builds a financing model. `irx` holds the 13-week T-bill discount yield in
 * percent; rows with invalid values were removed upstream, so the last valid
 * observation is carried forward.
 */
export function createFinancingModel(
  id: FinancingModelId,
  opts: { irx: MarketSeries; fixedRate: number; spread: number },
): FinancingModel {
  const meta = FINANCING_MODEL_META[id];
  const rateAt = (date: string): number => {
    const i = indexAtOrBefore(opts.irx.dates, date);
    if (i < 0) return opts.irx.close[0]! / 100;
    return opts.irx.close[i]! / 100;
  };

  const annualRate = (date: string): number => {
    switch (id) {
      case "none":
        return 0;
      case "fixed":
        return opts.fixedRate;
      case "riskfree":
        return rateAt(date);
      case "custom":
      case "riskfree_spread":
      default:
        return rateAt(date) + opts.spread;
    }
  };

  return { id, label: meta.label, description: meta.description, annualRate };
}