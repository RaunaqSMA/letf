import { supabase } from "@/integrations/supabase/client";
import type { Portfolio } from "./types";

export async function listPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Portfolio[];
}

export async function createPortfolio(input: {
  userId: string;
  name: string;
  description?: string | null;
  baseCurrency?: string;
}): Promise<Portfolio> {
  const { data, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: input.userId,
      name: input.name.trim(),
      description: input.description ?? null,
      base_currency: input.baseCurrency ?? "USD",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Portfolio;
}

export async function renamePortfolio(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("portfolios").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePortfolio(id: string): Promise<void> {
  const { error } = await supabase.from("portfolios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Every account gets one portfolio so the UI always has somewhere to write. */
export async function ensureDefaultPortfolio(userId: string): Promise<Portfolio[]> {
  const existing = await listPortfolios();
  if (existing.length > 0) return existing;
  const created = await createPortfolio({ userId, name: "My Portfolio" });
  return [created];
}
