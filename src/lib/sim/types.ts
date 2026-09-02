import type { InstrumentId } from "@/lib/market/types";

export type FinancingModelId =
  | "none"
  | "fixed"
  | "riskfree"
  | "riskfree_spread"
  | "custom"
  | "stress";

export type Frequency = "monthly" | "weekly" | "quarterly" | "yearly" | "once" | "custom";

/** A manually recorded purchase */
export interface CustomEntry {
  id: string;
  date: string;
  amount: number;
  note?: string | undefined;
}

export type ContributionTiming = "first" | "last";

export type UnderlyingMode = "total_return" | "price_index";

/** What state variable escalates the financing spread in the stress model. */
export type StressTrigger = "underlying_drawdown" | "trailing_volatility";

export interface StressFinancingConfig {
  /** Spread over the risk-free rate in normal conditions (decimal). */
  baseSpread: number;
  /** Spread once the crisis trigger level is breached. */
  crisisSpread: number;
  /** Spread once the extreme trigger level is breached. */
  extremeSpread: number;
  trigger: StressTrigger;
  /** Underlying drawdown (positive decimal, e.g. 0.20) or annualised vol level. */
  crisisLevel: number;
  extremeLevel: number;
  /** Hard cap on the total annual financing rate (decimal). */
  maxRate: number;
}

/** Expense ratio that changes over time (fund fee cuts, synthetic-period choice). */
export interface ExpenseScheduleEntry {
  /** Applies on and after this date. */
  from: string;
  ratio: number;
}

/** How the synthetic reconstruction is calibrated to observed ETF behaviour. */
export type CalibrationMode = "theoretical" | "calibrated" | "conservative";

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
  stressFinancing: StressFinancingConfig;
  /** Parallel shift applied to the financing rate — used by the sensitivity ladder. */
  financingShift: number;
  expenseRatio: number;
  /** Optional dated schedule; when non-empty it overrides `expenseRatio`. */
  expenseSchedule: ExpenseScheduleEntry[];
  reinvestDistributions: boolean;
  useSyntheticHistory: boolean;
  useActualHistory: boolean;
  underlyingMode: UnderlyingMode;
  /** Flat cost per contribution, in currency units */
  transactionCost: number;
  /** Annualised slippage/rebalancing drag applied to synthetic periods only. */
  slippageDrag: number;
  calibrationMode: CalibrationMode;
  /** Extra annual drag applied under "conservative" calibration. */
  conservativeExtraDrag: number;
  /** Off by default: the engine must not silently clip extreme daily moves. */
  clipExtremeReturns: boolean;
  /** Absolute daily NAV return cap used only when clipping is enabled. */
  clipLimit: number;

  // --- DCA plan ---
  /** One-off capital invested on the first trading day of the window. */
  startingCapital: number;
  /** Annual growth applied to the recurring contribution (decimal). */
  contributionGrowth: number;
  /** When true, contributions are indexed to `inflationRate` instead. */
  indexContributionsToInflation: boolean;
  /** Assumed annual inflation (decimal), used for real-terms reporting. */
  inflationRate: number;
  /** Contributions start on/after this date (blank = window start). */
  contributionStartDate: string;
  /** Contributions stop after this date (blank = window end). */
  contributionEndDate: string;
  /** Manual purchase records, used when frequency === "custom" */
  customEntries: CustomEntry[];
  fxRate: number;
  fxLabel: string;
}

export type DataType = "SYNTHETIC" | "ACTUAL";

/** A day where the modelled NAV was destroyed by a single move. */
export interface WipeoutEvent {
  date: string;
  underlyingReturn: number;
  grossLeveragedReturn: number;
  navBefore: number;
  navAfter: number;
}

/** A day whose absolute leveraged move exceeded the extreme-day threshold. */
export interface ExtremeDay {
  date: string;
  underlyingReturn: number;
  leveragedReturn: number;
  nav: number;
  drawdownAfter: number;
  dataType: DataType;
  clipped: boolean;
}

/** Column-oriented daily simulation result (kept flat for performance). */
export interface DailySeries {
  dates: string[];
  underlying: Float64Array;
  underlyingReturn: Float64Array;
  /** L x r_t — the gross leveraged exposure return, before costs. */
  grossLeveragedReturn: Float64Array;
  financingCost: Float64Array;
  expenseCost: Float64Array;
  /** Slippage / calibration drag applied on synthetic days. */
  otherCost: Float64Array;
  dailyReturn: Float64Array;
  /** Annualised financing rate actually charged that day. */
  financingRate: Float64Array;
  nav: Float64Array;
  peak: Float64Array;
  drawdown: Float64Array;
  /** 0 = SYNTHETIC, 1 = ACTUAL */
  dataType: Uint8Array;
  inceptionIndex: number;
  wipeouts: WipeoutEvent[];
  extremeDays: ExtremeDay[];
  clippedDays: number;
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
  averageCost: number;
}

export interface PortfolioPoint {
  date: string;
  value: number;
  contributions: number;
  profit: number;
  /** Portfolio-value drawdown vs its own running peak. */
  drawdown: number;
  /** Fund NAV drawdown. A different concept from `drawdown`. */
  navDrawdown: number;
  /** value / cumulative contributions - 1. Not a drawdown. */
  contributionRelative: number;
  /** Real (inflation-deflated) portfolio value. */
  realValue: number;
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

/** Three separate, deliberately non-interchangeable loss measures. */
export interface DrawdownTriad {
  navMaxDrawdown: number;
  navMaxDrawdownDate: string;
  portfolioMaxDrawdown: number;
  portfolioMaxDrawdownDate: string;
  worstContributionRelative: number;
  worstContributionRelativeDate: string;
  /** Currency amount by which value fell short of contributions at the worst point. */
  worstContributionShortfall: number;
}

export interface DcaSummary {
  totalContributions: number;
  startingCapital: number;
  finalValue: number;
  realFinalValue: number;
  profit: number;
  totalReturn: number;
  units: number;
  averagePurchasePrice: number;
  /** Money-weighted return (XIRR of the actual cash flows). */
  xirr: number | null;
  /** Time-weighted return of the underlying NAV path (contribution-independent). */
  twr: number | null;
  contributionCount: number;
  monthsBelowContributions: number;
}

export interface SimulationResult {
  config: SimulationConfig;
  modelVersion: string;
  simulationId: string;
  daily: DailySeries;
  ledger: DCARow[];
  portfolio: PortfolioPoint[];
  totalContributions: number;
  finalValue: number;
  profit: number;
  totalReturn: number;
  xirr: number | null;
  dca: DcaSummary;
  drawdowns: DrawdownTriad;
  /** Full risk/return statistics of the leveraged NAV path. */
  navStats: import("./metrics").SeriesStats;
  /** Same statistics for the underlying (1x) path, for comparison. */
  underlyingStats: import("./metrics").SeriesStats;
  calendarYears: import("./metrics").CalendarYearSummary;
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
  inceptionDate: string;
  volatility: number;
  /** Correct Sharpe ratio (risk-free subtracted). Null when undefined. */
  sharpe: number | null;
  bestYear: { year: number; return: number } | null;
  worstYear: { year: number; return: number } | null;
  monthsBelowContributions: number;
  warnings: string[];
}
