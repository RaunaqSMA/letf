export type SeriesKey = "ndx" | "spx" | "qqq" | "spy" | "tqqq" | "spxl" | "irx";

export interface MarketSeries {
  symbol: string;
  source: string;
  retrieved: string;
  dates: string[];
  close: number[];
  adjClose: number[];
}

export interface QualityIssue {
  series: string;
  date: string;
  type: "missing" | "invalid" | "duplicate" | "jump";
  detail: string;
}

export type MarketDataset = Record<SeriesKey, MarketSeries> & {
  issues: QualityIssue[];
};

export type InstrumentId = "TQQQ" | "SPXL";

export interface InstrumentDef {
  id: InstrumentId;
  name: string;
  sponsor: string;
  /** Total-return proxy used as the default underlying */
  underlyingTR: SeriesKey;
  underlyingTRLabel: string;
  /** Price index (no dividends) */
  underlyingIndex: SeriesKey;
  underlyingIndexLabel: string;
  actual: SeriesKey;
  inception: string;
  leverage: number;
  /** Estimated annual expense ratio assumption (decimal) */
  expenseRatio: number;
  /** Estimated annual financing spread over the risk-free rate (decimal) */
  financingSpread: number;
}

export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  TQQQ: {
    id: "TQQQ",
    name: "ProShares UltraPro QQQ",
    sponsor: "ProShares",
    underlyingTR: "qqq",
    underlyingTRLabel: "QQQ (Nasdaq-100 total-return proxy)",
    underlyingIndex: "ndx",
    underlyingIndexLabel: "NDX (Nasdaq-100 price index)",
    actual: "tqqq",
    inception: "2010-02-11",
    leverage: 3,
    expenseRatio: 0.0095,
    financingSpread: 0.006,
  },
  SPXL: {
    id: "SPXL",
    name: "Direxion Daily S&P 500 Bull 3X",
    sponsor: "Direxion",
    underlyingTR: "spy",
    underlyingTRLabel: "SPY (S&P 500 total-return proxy)",
    underlyingIndex: "spx",
    underlyingIndexLabel: "SPX (S&P 500 price index)",
    actual: "spxl",
    inception: "2008-11-05",
    leverage: 3,
    expenseRatio: 0.0091,
    financingSpread: 0.0055,
  },
};