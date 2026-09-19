import { describe, expect, it } from "vitest";

import { parseTransactionCsv, transactionsToCsv } from "./csv";
import {
  computeHoldings,
  portfolioValueSeries,
  totalsByCurrency,
  validateTransaction,
  valueHoldings,
} from "./portfolioCalculations";
import { transactionsToCustomEntries } from "./simulatorBridge";
import type { Transaction, TransactionInput } from "./types";

let seq = 0;
function tx(patch: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    portfolio_id: "p1",
    user_id: "u1",
    symbol: "TQQQ",
    asset_type: "ETF",
    transaction_type: "BUY",
    transaction_date: "2026-01-10",
    quantity: 10,
    price: 50,
    fees: 0,
    currency: "USD",
    notes: null,
    created_at: "2026-01-10T00:00:00Z",
    updated_at: "2026-01-10T00:00:00Z",
    ...patch,
  };
}

const input = (patch: Partial<TransactionInput> = {}): TransactionInput => ({
  symbol: "TQQQ",
  asset_type: "ETF",
  transaction_type: "BUY",
  transaction_date: "2026-01-10",
  quantity: 1,
  price: 50,
  fees: 0,
  currency: "USD",
  notes: "",
  ...patch,
});

describe("ledger-derived holdings", () => {
  it("BUY increases units", () => {
    const h = computeHoldings([tx({ quantity: 10 }), tx({ quantity: 5, price: 60 })]);
    expect(h[0]!.units).toBeCloseTo(15);
  });

  it("SELL decreases units", () => {
    const h = computeHoldings([
      tx({ quantity: 10 }),
      tx({ quantity: 5, price: 60 }),
      tx({ transaction_type: "SELL", quantity: 3, price: 70, transaction_date: "2026-03-01" }),
    ]);
    expect(h[0]!.units).toBeCloseTo(12);
  });

  it("average cost is invested / units for buy-only holdings", () => {
    const h = computeHoldings([
      tx({ quantity: 10, price: 50 }),
      tx({ quantity: 10, price: 70, transaction_date: "2026-02-10" }),
    ]);
    expect(h[0]!.averageCost).toBeCloseTo(60);
    expect(h[0]!.invested).toBeCloseTo(1200);
  });

  it("realised P/L uses FIFO lots", () => {
    const h = computeHoldings([
      tx({ quantity: 10, price: 50 }),
      tx({ quantity: 10, price: 70, transaction_date: "2026-02-10" }),
      tx({
        transaction_type: "SELL",
        quantity: 10,
        price: 80,
        transaction_date: "2026-03-10",
      }),
    ]);
    // FIFO: the $50 lot is sold first -> (80 - 50) * 10
    expect(h[0]!.realized).toBeCloseTo(300);
    expect(h[0]!.units).toBeCloseTo(10);
    expect(h[0]!.averageCost).toBeCloseTo(70);
  });

  it("keeps currencies separate instead of converting", () => {
    const totals = totalsByCurrency(
      valueHoldings(
        computeHoldings([tx({}), tx({ currency: "INR", price: 4000, quantity: 2 })]),
        () => ({ price: 60, date: "2026-09-15" }),
      ),
    );
    expect(totals.map((t) => t.currency).sort()).toEqual(["INR", "USD"]);
  });

  it("reports price unavailable rather than fabricating a value", () => {
    const valued = valueHoldings(computeHoldings([tx({ symbol: "XYZ" })]), () => null);
    expect(valued[0]!.currentPrice).toBeNull();
    expect(valued[0]!.currentValue).toBeNull();
  });

  it("builds a portfolio value series from records and prices", () => {
    const dates = ["2026-01-09", "2026-01-10", "2026-01-11"];
    const series = portfolioValueSeries([tx({ quantity: 10, price: 50 })], dates, () => ({
      dates,
      close: [40, 50, 60],
    }));
    expect(series.at(-1)).toMatchObject({ date: "2026-01-11", value: 600, invested: 500 });
  });
});

describe("validation", () => {
  it("rejects invalid transaction data", () => {
    expect(validateTransaction(input({ quantity: 0 })).ok).toBe(false);
    expect(validateTransaction(input({ price: -1 })).ok).toBe(false);
    expect(validateTransaction(input({ symbol: "" })).ok).toBe(false);
    expect(validateTransaction(input({ transaction_date: "not-a-date" })).ok).toBe(false);
    expect(validateTransaction(input()).ok).toBe(true);
  });

  it("blocks a SELL that would create a short position by default", () => {
    const sell = input({ transaction_type: "SELL", quantity: 5 });
    expect(validateTransaction(sell, { availableUnits: 2 }).ok).toBe(false);
    expect(validateTransaction(sell, { availableUnits: 2, allowShort: true }).ok).toBe(true);
  });
});

describe("csv", () => {
  it("separates valid and invalid rows and never imports malformed data", () => {
    const csv = [
      "Date,Symbol,Type,Quantity,Price,Fees,Currency,Notes",
      "2026-01-10,TQQQ,BUY,2.5,58.43,0,USD,Monthly DCA",
      "2026-01-11,TQQQ,BUY,-1,58.43,0,USD,bad quantity",
      "nonsense,,BUY,1,10,0,USD,",
    ].join("\n");
    const rows = parseTransactionCsv(csv);
    expect(rows.filter((r) => r.input)).toHaveLength(1);
    expect(rows.filter((r) => !r.input)).toHaveLength(2);
  });

  it("round-trips an export header", () => {
    const out = transactionsToCsv([tx({})]);
    expect(out.split("\n")[0]).toContain("Symbol");
    expect(out).toContain("TQQQ");
  });
});

describe("simulator bridge (MODE A replay)", () => {
  it("maps saved BUY records into custom contribution entries", () => {
    const { entries, skipped } = transactionsToCustomEntries(
      [
        tx({ transaction_date: "2026-01-10", quantity: 4, price: 50, fees: 0 }),
        tx({ transaction_date: "2026-02-10", quantity: 5, price: 50, fees: 0 }),
        tx({ transaction_type: "SELL", quantity: 1, price: 60, transaction_date: "2026-03-10" }),
      ],
      { symbol: "TQQQ", currency: "USD" },
    );
    expect(entries.map((e) => e.amount)).toEqual([200, 250]);
    expect(entries[0]!.date).toBe("2026-01-10");
    expect(skipped.length).toBe(1);
  });
});
