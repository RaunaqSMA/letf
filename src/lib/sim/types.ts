import type { InstrumentId } from "@/lib/market/types";

export type FinancingModelId = "none" | "fixed" | "riskfree" | "riskfree_spread" | "custom";

export type Frequency = "monthly" | "weekly" | "quarterly" | "yearly" | "once" | "custom";

/** A manually recorded purchase */
export interface CustomEntry {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

export type ContributionTiming = "first" | "last";

export type UnderlyingMode = "total_return" | "price_index";

export interface SimulationConfig {
  instrument: InstrumentId;
  startDate: string;
  endDate: string;
  contribution: number;
  frequency: Frequency;
  timing: ContributionTiming;
  leverage: number;
  financingModel: FinancingModelId;
  /** Annual rate used by the "fixed" model (decimal) */
  fixedFinancingRate: number;
  /** Annual spread over the risk-free rate (decimal) */
  financingSpread: number;
  expenseRatio: number;
  reinvestDistributions: boolean;
  useSyntheticHistory: boolean;
  useActualHistory: boolean;
  underlyingMode: UnderlyingMode;
  /** Flat cost per contribution, in currency units */
  transactionCost: number;
  /** Multiplier applied to displayed currency values */
  /** Manual purchase records, used when frequency === "custom" */
  customEntries: CustomEntry[];
  fxRate: number;
  fxLabel: string;
}

export type DataType = "SYNTHETIC" | "ACTUAL";

/** Column-oriented daily simulation result (kept flat for performance). */
export interface DailySeries {
  dates: string[];
  underlying: Float64Array;
  underlyingReturn: Float64Array;
  financingCost: Float64Array;
  expenseCost: Float64Array;
  dailyReturn: Float64Array;
  nav: Float64Array;
  peak: Float64Array;
  drawdown: Float64Array;
  /** 0 = SYNTHETIC, 1 = ACTUAL */
  dataType: Uint8Array;
  inceptionIndex: number;
}

export interface DCARow {
  date: string;
  underlyingPrice: number;
  nav: number;
  dataType: DataType;
  contribution: number;
  unitsBought: number;
  cumulativeUnits: number;
  cumulativeContributions: number;
  portfolioValue: number;
  profitLoss: number;
  portfolioReturn: number;
}

export interface PortfolioPoint {
  date: string;
  value: number;
  contributions: number;
  profit: number;
  drawdown: number;
  navDrawdown: number;
  dataType: DataType;
}

export interface DrawdownEpisode {
  peakDate: string;
  peakValue: number;
  troughDate: string;
  troughValue: number;
  maxDrawdown: number;
  recoveryDate: string | null;
  drawdownMonths: number;
  recoveryMonths: number | null;
}

export interface SimulationResult {
  config: SimulationConfig;
  daily: DailySeries;
  ledger: DCARow[];
  portfolio: PortfolioPoint[];
  totalContributions: number;
  finalValue: number;
  profit: number;
  totalReturn: number;
  xirr: number | null;
  maxDrawdown: number;
  maxDrawdownDate: string;
  navMaxDrawdown: number;
  navMaxDrawdownDate: string;
  episodes: DrawdownEpisode[];
  longestRecoveryMonths: number | null;
  longestRecoveryOngoing: boolean;
  contributionCount: number;
  startDate: string;
  endDate: string;
  syntheticShare: number;
  volatility: number;
  sharpeLike: number;
  bestYear: { year: number; return: number } | null;
  worstYear: { year: number; return: number } | null;
  monthsBelowContributions: number;
  warnings: string[];
}