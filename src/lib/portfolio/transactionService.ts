import { supabase } from "@/integrations/supabase/client";
import { validateTransaction } from "./portfolioCalculations";
import type { Transaction, TransactionInput } from "./types";

export async function listTransactions(portfolioId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalize);
}

function normalize(row: Record<string, unknown>): Transaction {
  return {
    ...(row as unknown as Transaction),
    quantity: Number(row["quantity"]),
    price: Number(row["price"]),
    fees: Number(row["fees"] ?? 0),
  };
}

function prepare(input: TransactionInput) {
  const result = validateTransaction(input);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return {
    symbol: input.symbol.trim().toUpperCase().slice(0, 24),
    asset_type: input.asset_type,
    transaction_type: input.transaction_type,
    transaction_date: input.transaction_date,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees ?? 0,
    currency: input.currency.trim().toUpperCase(),
    notes: input.notes?.toString().trim().slice(0, 500) || null,
  };
}

export async function createTransaction(args: {
  userId: string;
  portfolioId: string;
  input: TransactionInput;
}): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...prepare(args.input),
      user_id: args.userId,
      portfolio_id: args.portfolioId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>);
}

export async function createTransactions(args: {
  userId: string;
  portfolioId: string;
  inputs: TransactionInput[];
}): Promise<number> {
  if (!args.inputs.length) return 0;
  const rows = args.inputs.map((input) => ({
    ...prepare(input),
    user_id: args.userId,
    portfolio_id: args.portfolioId,
  }));
  const { error, count } = await supabase
    .from("transactions")
    .insert(rows, { count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? rows.length;
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const { error } = await supabase.from("transactions").update(prepare(input)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
