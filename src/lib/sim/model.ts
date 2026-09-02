/**
 * Model versioning + reproducibility.
 *
 * Every result carries the model version that produced it. Quantitative
 * formulas must never change silently: bump MODEL_VERSION and record the
 * change in MODEL_CHANGELOG instead.
 */

export const MODEL_VERSION = "2.0.0";
export const MODEL_VERSION_LABEL = "v2.0 — Research Grade";

export interface ModelChange {
  area: string;
  oldFormula: string;
  newFormula: string;
  whyOldInadequate: string;
  whyNewRigorous: string;
  remainingLimitation: string;
}

/**
 * Documented formula changes between v1.0 (original) and v2.0 (research grade).
 * Rendered verbatim in the Methodology page so no change is invisible.
 */
export const MODEL_CHANGELOG: ModelChange[] = [
  {
    area: "Sharpe ratio",
    oldFormula: "CAGR / annualised volatility",
    newFormula:
      "(mean daily excess return x 252) / (stdev of daily excess return x sqrt(252)), excess = r_t - rf_t",
    whyOldInadequate:
      "It never subtracted a risk-free rate, so it was a return-to-risk ratio, not a Sharpe ratio. It also mixed a geometric numerator with an arithmetic denominator.",
    whyNewRigorous:
      "Uses the textbook definition with a consistent arithmetic excess-return basis and the historical 13-week T-bill as the risk-free leg.",
    remainingLimitation:
      "Daily leveraged returns are strongly non-normal, so Sharpe understates tail risk. Sortino, Calmar and Ulcer are reported alongside it.",
  },
  {
    area: "Calendar-year returns",
    oldFormula: "last observation in year / first observation in year - 1",
    newFormula: "NAV(last trading day of year Y) / NAV(last trading day of year Y-1) - 1",
    whyOldInadequate:
      "Using the first in-year observation silently drops the first trading day's return and produces a different number from every published annual return table.",
    whyNewRigorous:
      "Matches the standard December-close-to-December-close convention used by fund fact sheets.",
    remainingLimitation:
      "The first year of any sample has no prior December close and is explicitly reported as a partial (stub) period rather than an annual return.",
  },
  {
    area: "Drawdown",
    oldFormula: "one 'max drawdown' number derived from portfolio value",
    newFormula:
      "three separate measures: NAV drawdown, DCA portfolio drawdown, and contribution-relative loss (value / cumulative contributions - 1)",
    whyOldInadequate:
      "A DCA investor's experience is not the fund's drawdown; conflating them understates fund risk and misstates investor pain.",
    whyNewRigorous:
      "Each concept answers a distinct question and is labelled separately everywhere it appears.",
    remainingLimitation:
      "Contribution-relative loss is not a drawdown at all and is never annualised or compared with the other two.",
  },
  {
    area: "Financing cost",
    oldFormula: "(L - 1) x risk-free x day fraction, constant spread",
    newFormula:
      "(L - 1) x (rf_t + spread_t) x day fraction with a selectable model, including a state-dependent stress model and a mandatory sensitivity ladder",
    whyOldInadequate:
      "A single constant spread hides the fact that long-horizon leveraged outcomes are extremely sensitive to borrowing costs.",
    whyNewRigorous:
      "Financing is modular, explicitly labelled as an assumption and every headline result can be re-run at +0.5% / +1% / +2% / +3%.",
    remainingLimitation:
      "Actual swap and futures financing terms of TQQQ/SPXL are not public at daily granularity; all spreads remain modelling assumptions.",
  },
  {
    area: "Long-horizon projection",
    oldFormula: "none (historical backtest only)",
    newFormula:
      "seeded block-bootstrap and regime-aware Monte Carlo producing percentile distributions",
    whyOldInadequate:
      "A single historical path is one draw from an unknown distribution and cannot support a 30-50 year statement.",
    whyNewRigorous:
      "Block resampling preserves volatility clustering and crash clustering, and results are reported as distributions with reproducible seeds.",
    remainingLimitation:
      "Resampling can only reproduce regimes that appear in the sample. It cannot generate a genuinely unprecedented event, and it assumes the future is drawn from the same distribution as the past.",
  },
];

export interface ReproducibleConfigSummary {
  modelVersion: string;
  generatedAt: string;
  [key: string]: unknown;
}

/** Stable FNV-1a hash of a config object, used as a short simulation ID. */
export function configHash(obj: unknown): string {
  const json = stableStringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export const UNCERTAINTY_DISCLOSURE =
  "This is not a prediction of actual future ETF performance. The model estimates outcomes under historical data and user-specified assumptions. Future market structure, interest rates, volatility, regulation, fund structure, taxation, liquidity and ETF availability may differ materially from historical conditions.";
