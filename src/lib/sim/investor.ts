/**
 * Investor-reality overlays.
 *
 * Nominal USD pre-tax returns are the least useful number for an actual
 * investor. These helpers convert a simulation into what the investor keeps:
 * after inflation, after currency translation, and after tax.
 */

import { cagrOf, yearFraction } from "./metrics";
import type { SimulationResult } from "./types";

export interface TaxRules {
  id: string;
  label: string;
  /** Applied to gains held longer than `longTermMonths`. */
  longTermRate: number;
  shortTermRate: number;
  longTermMonths: number;
  /** Annual tax-free allowance on gains, in currency units. */
  annualExemption: number;
  note: string;
}

export const TAX_PRESETS: TaxRules[] = [
  {
    id: "none",
    label: "No tax",
    longTermRate: 0,
    shortTermRate: 0,
    longTermMonths: 12,
    annualExemption: 0,
    note: "Pre-tax view. Useful for comparing strategies, not for planning.",
  },
  {
    id: "us",
    label: "US long-term capital gains (20%)",
    longTermRate: 0.2,
    shortTermRate: 0.37,
    longTermMonths: 12,
    annualExemption: 0,
    note: "Top federal long-term rate. Ignores state tax and the net investment income tax.",
  },
  {
    id: "in",
    label: "India — foreign equity/ETF",
    longTermRate: 0.125,
    shortTermRate: 0.3,
    longTermMonths: 24,
    annualExemption: 0,
    note: "Indicative only. Overseas ETF taxation depends on holding structure and changes frequently.",
  },
  {
    id: "uk",
    label: "UK capital gains (24%)",
    longTermRate: 0.24,
    shortTermRate: 0.24,
    longTermMonths: 0,
    annualExemption: 3000,
    note: "Applies the annual exempt amount once at disposal.",
  },
];

export interface InvestorView {
  currencyLabel: string;
  fxRate: number;
  /** Nominal values, translated to the display currency. */
  nominalFinalValue: number;
  nominalContributions: number;
  nominalProfit: number;
  /** Real (inflation-adjusted, in today's money) values. */
  realFinalValue: number;
  realContributions: number;
  realProfit: number;
  inflationRate: number;
  years: number;
  nominalCagr: number | null;
  realCagr: number | null;
  nominalXirr: number | null;
  realXirr: number | null;
  /** Tax computed on the terminal disposal of all units. */
  taxRules: TaxRules;
  taxableGain: number;
  taxDue: number;
  afterTaxFinalValue: number;
  afterTaxRealFinalValue: number;
  afterTaxXirr: number | null;
  /** Purchasing power: what the terminal value buys relative to day one. */
  purchasingPowerMultiple: number;
}

export interface InvestorOptions {
  fxRate: number;
  currencyLabel: string;
  inflationRate: number;
  taxRules: TaxRules;
  /** Annual currency depreciation vs USD (e.g. 0.03 for INR). */
  currencyDrift?: number;
}

/**
 * Applies FX, inflation and tax to a completed simulation. Contributions are
 * deflated using their own dates so the "real contributions" figure is the
 * true purchasing power sacrificed, not a naive division at the end.
 */
export function investorView(result: SimulationResult, opts: InvestorOptions): InvestorView {
  const years = result.startDate === "—" ? 0 : yearFraction(result.startDate, result.endDate);
  const drift = opts.currencyDrift ?? 0;
  const fxAt = (date: string) =>
    opts.fxRate * Math.pow(1 + drift, result.startDate === "—" ? 0 : yearFraction(result.startDate, date));

  const fxEnd = fxAt(result.endDate);
  const nominalFinalValue = result.finalValue * fxEnd;

  let nominalContributions = 0;
  let realContributions = 0;
  for (const row of result.ledger) {
    const t = result.startDate === "—" ? 0 : yearFraction(result.startDate, row.date);
    const nominal = row.contribution * fxAt(row.date);
    nominalContributions += nominal;
    // Deflate to day-one money.
    realContributions += nominal / Math.pow(1 + opts.inflationRate, t);
  }
  if (nominalContributions === 0) {
    nominalContributions = result.totalContributions * opts.fxRate;
    realContributions = nominalContributions;
  }

  const deflator = Math.pow(1 + opts.inflationRate, years);
  const realFinalValue = nominalFinalValue / deflator;

  const nominalCagr = cagrOf(nominalContributions, nominalFinalValue, years);
  const realCagr = cagrOf(realContributions, realFinalValue, years);
  const realXirr =
    result.xirr === null ? null : (1 + result.xirr) / (1 + opts.inflationRate) - 1;

  const gain = Math.max(0, nominalFinalValue - nominalContributions);
  const rate =
    years * 12 >= opts.taxRules.longTermMonths
      ? opts.taxRules.longTermRate
      : opts.taxRules.shortTermRate;
  const taxableGain = Math.max(0, gain - opts.taxRules.annualExemption);
  const taxDue = taxableGain * rate;
  const afterTaxFinalValue = nominalFinalValue - taxDue;
  const afterTaxXirr = cagrOf(nominalContributions, afterTaxFinalValue, years);

  return {
    currencyLabel: opts.currencyLabel,
    fxRate: opts.fxRate,
    nominalFinalValue,
    nominalContributions,
    nominalProfit: nominalFinalValue - nominalContributions,
    realFinalValue,
    realContributions,
    realProfit: realFinalValue - realContributions,
    inflationRate: opts.inflationRate,
    years,
    nominalCagr,
    realCagr,
    nominalXirr: result.xirr,
    realXirr,
    taxRules: opts.taxRules,
    taxableGain,
    taxDue,
    afterTaxFinalValue,
    afterTaxRealFinalValue: afterTaxFinalValue / deflator,
    afterTaxXirr,
    purchasingPowerMultiple: realContributions > 0 ? realFinalValue / realContributions : 0,
  };
}

export const CURRENCY_PRESETS = [
  { label: "USD", rate: 1, drift: 0 },
  { label: "INR", rate: 88, drift: 0.03 },
  { label: "EUR", rate: 0.92, drift: 0 },
  { label: "GBP", rate: 0.78, drift: 0 },
];
