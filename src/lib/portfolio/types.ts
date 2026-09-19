export type AssetType = "ETF" | "STOCK" | "INDEX" | "OTHER";
export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "SPLIT";

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  base_currency: string;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  user_id: string;
  symbol: string;
  asset_type: AssetType;
  transaction_type: TransactionType;
  transaction_date: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** What the transaction form/CSV produces before it is persisted. */
export interface TransactionInput {
  symbol: string;
  asset_type: AssetType;
  transaction_type: TransactionType;
  transaction_date: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  notes?: string | null;
}

export interface Holding {
  symbol: string;
  currency: string;
  units: number;
  /** Remaining FIFO cost basis of the open units. */
  invested: number;
  averageCost: number;
  realized: number;
}

export interface HoldingValued extends Holding {
  currentPrice: number | null;
  priceDate: string | null;
  currentValue: number | null;
  unrealized: number | null;
  returnPct: number | null;
}
