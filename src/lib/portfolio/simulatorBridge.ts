import type { CustomEntry } from "@/lib/sim/types";
import type { Transaction } from "./types";

export interface RecordMapping {
  entries: CustomEntry[];
  /** Records excluded from the historical replay, with the reason. */
  skipped: { id: string; reason: string }[];
}

/**
 * MODE A — historical replay.
 *
 * Saved BUY records for the selected symbol become contribution events at the
 * cash amount actually spent (quantity * price + fees). The simulator then
 * re-prices those cash flows on the modelled NAV path, which is deliberately
 * NOT the same as the user's real holdings (MODE B, shown on /records).
 */
export function transactionsToCustomEntries(
  transactions: Transaction[],
  opts: { symbol: string; currency?: string },
): RecordMapping {
  const symbol = opts.symbol.toUpperCase();
  const entries: CustomEntry[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const t of transactions) {
    if (t.symbol.toUpperCase() !== symbol) {
      skipped.push({ id: t.id, reason: `Different symbol (${t.symbol})` });
      continue;
    }
    if (opts.currency && t.currency.toUpperCase() !== opts.currency.toUpperCase()) {
      skipped.push({ id: t.id, reason: `Different currency (${t.currency})` });
      continue;
    }
    if (t.transaction_type !== "BUY") {
      skipped.push({ id: t.id, reason: `${t.transaction_type} not replayed` });
      continue;
    }
    const amount = Number(t.quantity) * Number(t.price) + Number(t.fees ?? 0);
    if (!isFinite(amount) || amount <= 0) {
      skipped.push({ id: t.id, reason: "Zero amount" });
      continue;
    }
    entries.push({
      id: t.id,
      date: t.transaction_date,
      amount,
      note: t.notes ?? undefined,
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { entries, skipped };
}

/** Temporary browser records → database inputs, for the post-login import. */
export function customEntriesToTransactionInputs(
  entries: CustomEntry[],
  opts: { symbol: string; currency?: string },
) {
  return entries
    .filter((e) => e.amount > 0 && e.date)
    .map((e) => ({
      symbol: opts.symbol.toUpperCase(),
      asset_type: "ETF" as const,
      transaction_type: "BUY" as const,
      transaction_date: e.date,
      // A temporary record only stores the cash amount, so one "unit" of cash
      // is imported at price 1 unless the user edits it later.
      quantity: e.amount,
      price: 1,
      fees: 0,
      currency: (opts.currency ?? "USD").toUpperCase(),
      notes: e.note ?? "Imported temporary record",
    }));
}
