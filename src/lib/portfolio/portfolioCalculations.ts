import type { Holding, HoldingValued, Transaction, TransactionInput } from "./types";

/**
 * Accounting method: FIFO.
 *
 * BUY  — opens a lot at (quantity * price + fees) / quantity.
 * SELL — consumes the oldest open lots first; realised P/L is
 *        (quantity * price - fees) minus the FIFO cost basis consumed.
 * DIVIDEND / SPLIT — recorded in the ledger but not yet applied to holdings.
 *
 * Holdings are keyed by symbol AND currency: amounts in different currencies
 * are never silently combined.
 */
interface Lot {
  qty: number;
  unitCost: number;
}

export function holdingKey(symbol: string, currency: string): string {
  return `${symbol.toUpperCase()}|${currency.toUpperCase()}`;
}

export function computeHoldings(transactions: Transaction[]): Holding[] {
  const lots = new Map<string, Lot[]>();
  const realized = new Map<string, number>();
  const sorted = [...transactions].sort(
    (a, b) =>
      a.transaction_date.localeCompare(b.transaction_date) ||
      a.created_at.localeCompare(b.created_at),
  );

  for (const t of sorted) {
    const key = holdingKey(t.symbol, t.currency);
    const open = lots.get(key) ?? [];
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const fees = Number(t.fees ?? 0);

    if (t.transaction_type === "BUY") {
      if (qty > 0) open.push({ qty, unitCost: (qty * price + fees) / qty });
    } else if (t.transaction_type === "SELL") {
      let remaining = qty;
      let basis = 0;
      while (remaining > 1e-12 && open.length > 0) {
        const lot = open[0]!;
        const take = Math.min(lot.qty, remaining);
        basis += take * lot.unitCost;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-12) open.shift();
      }
      const proceeds = qty * price - fees;
      realized.set(key, (realized.get(key) ?? 0) + (proceeds - basis));
    }
    lots.set(key, open);
  }

  const keys = new Set([...lots.keys(), ...realized.keys()]);
  const out: Holding[] = [];
  for (const key of keys) {
    const [symbol = "", currency = "USD"] = key.split("|");
    const open = lots.get(key) ?? [];
    const units = open.reduce((s, l) => s + l.qty, 0);
    const invested = open.reduce((s, l) => s + l.qty * l.unitCost, 0);
    out.push({
      symbol,
      currency,
      units,
      invested,
      averageCost: units > 1e-12 ? invested / units : 0,
      realized: realized.get(key) ?? 0,
    });
  }
  return out.sort((a, b) => b.invested - a.invested || a.symbol.localeCompare(b.symbol));
}

export function valueHoldings(
  holdings: Holding[],
  priceOf: (symbol: string) => { price: number; date: string } | null,
): HoldingValued[] {
  return holdings.map((h) => {
    const quote = priceOf(h.symbol);
    if (!quote) {
      return {
        ...h,
        currentPrice: null,
        priceDate: null,
        currentValue: null,
        unrealized: null,
        returnPct: null,
      };
    }
    const currentValue = h.units * quote.price;
    const unrealized = currentValue - h.invested;
    return {
      ...h,
      currentPrice: quote.price,
      priceDate: quote.date,
      currentValue,
      unrealized,
      returnPct: h.invested > 0 ? unrealized / h.invested : null,
    };
  });
}

export interface CurrencyTotals {
  currency: string;
  invested: number;
  value: number | null;
  unrealized: number | null;
  realized: number;
  returnPct: number | null;
  holdings: number;
}

export function totalsByCurrency(holdings: HoldingValued[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>();
  for (const h of holdings) {
    const t =
      map.get(h.currency) ??
      ({
        currency: h.currency,
        invested: 0,
        value: 0,
        unrealized: 0,
        realized: 0,
        returnPct: null,
        holdings: 0,
      } satisfies CurrencyTotals);
    t.invested += h.invested;
    t.realized += h.realized;
    if (h.units > 1e-9) t.holdings += 1;
    if (h.currentValue === null) {
      t.value = null;
      t.unrealized = null;
    } else if (t.value !== null) {
      t.value += h.currentValue;
      t.unrealized = (t.unrealized ?? 0) + (h.unrealized ?? 0);
    }
    map.set(h.currency, t);
  }
  for (const t of map.values()) {
    t.returnPct = t.invested > 0 && t.unrealized !== null ? t.unrealized / t.invested : null;
  }
  return [...map.values()].sort((a, b) => b.invested - a.invested);
}

/** Portfolio value over time from real records and available historical prices. */
export function portfolioValueSeries(
  transactions: Transaction[],
  dates: string[],
  priceSeriesOf: (symbol: string) => { dates: string[]; close: number[] } | null,
): { date: string; value: number; invested: number }[] {
  if (!transactions.length || !dates.length) return [];
  const sorted = [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date),
  );
  const first = sorted[0]!.transaction_date;
  const window = dates.filter((d) => d >= first);
  const symbols = [...new Set(sorted.map((t) => t.symbol.toUpperCase()))];
  const cursors = new Map<string, number>();
  const series = new Map<string, { dates: string[]; close: number[] }>();
  for (const s of symbols) {
    const ps = priceSeriesOf(s);
    if (ps) {
      series.set(s, ps);
      cursors.set(s, 0);
    }
  }

  const units = new Map<string, number>();
  let invested = 0;
  let ti = 0;
  const out: { date: string; value: number; invested: number }[] = [];

  for (const d of window) {
    while (ti < sorted.length && sorted[ti]!.transaction_date <= d) {
      const t = sorted[ti]!;
      const sym = t.symbol.toUpperCase();
      const qty = Number(t.quantity);
      if (t.transaction_type === "BUY") {
        units.set(sym, (units.get(sym) ?? 0) + qty);
        invested += qty * Number(t.price) + Number(t.fees ?? 0);
      } else if (t.transaction_type === "SELL") {
        units.set(sym, (units.get(sym) ?? 0) - qty);
        invested -= qty * Number(t.price);
      }
      ti++;
    }
    let value = 0;
    for (const [sym, u] of units) {
      const ps = series.get(sym);
      if (!ps) continue;
      let i = cursors.get(sym) ?? 0;
      while (i + 1 < ps.dates.length && ps.dates[i + 1]! <= d) i++;
      cursors.set(sym, i);
      if (ps.dates[i]! <= d) value += u * ps.close[i]!;
    }
    out.push({ date: d, value, invested: Math.max(0, invested) });
  }
  return out;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Client-side mirror of the database CHECK constraints. */
export function validateTransaction(
  input: Partial<TransactionInput>,
  opts: { availableUnits?: number; allowShort?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];
  const symbol = (input.symbol ?? "").trim();
  if (!symbol) errors.push("Symbol is required.");
  if (symbol.length > 24) errors.push("Symbol is too long.");
  if (!input.transaction_type) errors.push("Transaction type is required.");
  const date = input.transaction_date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    errors.push("A valid date is required.");
  }
  const qty = Number(input.quantity);
  if (!isFinite(qty) || qty <= 0) errors.push("Quantity must be greater than 0.");
  const price = Number(input.price);
  if (!isFinite(price) || price < 0) errors.push("Price must be 0 or more.");
  const fees = Number(input.fees ?? 0);
  if (!isFinite(fees) || fees < 0) errors.push("Fees must be 0 or more.");
  const currency = (input.currency ?? "").trim();
  if (currency.length !== 3) errors.push("Currency must be a 3-letter code.");
  if (
    input.transaction_type === "SELL" &&
    !opts.allowShort &&
    opts.availableUnits !== undefined &&
    qty > opts.availableUnits + 1e-9
  ) {
    errors.push(
      `Selling ${qty} exceeds the ${opts.availableUnits.toFixed(4)} units held. Short positions are off.`,
    );
  }
  return { ok: errors.length === 0, errors };
}
