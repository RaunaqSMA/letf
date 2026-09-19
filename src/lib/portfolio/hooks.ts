import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/account/auth";
import {
  createPortfolio,
  deletePortfolio,
  ensureDefaultPortfolio,
  renamePortfolio,
} from "./portfolioService";
import {
  createTransaction,
  createTransactions,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "./transactionService";
import type { TransactionInput } from "./types";

export const portfolioKeys = {
  portfolios: (userId: string) => ["portfolios", userId] as const,
  transactions: (portfolioId: string) => ["transactions", portfolioId] as const,
};

export function usePortfolios() {
  const { user } = useAuth();
  return useQuery({
    queryKey: portfolioKeys.portfolios(user?.id ?? "anon"),
    queryFn: () => ensureDefaultPortfolio(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
}

export function useTransactions(portfolioId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: portfolioKeys.transactions(portfolioId ?? "none"),
    queryFn: () => listTransactions(portfolioId!),
    enabled: Boolean(user?.id && portfolioId),
    staleTime: 30_000,
  });
}

export function usePortfolioMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: portfolioKeys.portfolios(user?.id ?? "anon") });

  return {
    create: useMutation({
      mutationFn: (input: { name: string; description?: string }) =>
        createPortfolio({ userId: user!.id, name: input.name, description: input.description ?? null }),
      onSuccess: invalidate,
    }),
    rename: useMutation({
      mutationFn: (input: { id: string; name: string }) => renamePortfolio(input.id, input.name),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deletePortfolio(id),
      onSuccess: invalidate,
    }),
  };
}

export function useTransactionMutations(portfolioId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: portfolioKeys.transactions(portfolioId ?? "none") });

  return {
    create: useMutation({
      mutationFn: (input: TransactionInput) =>
        createTransaction({ userId: user!.id, portfolioId: portfolioId!, input }),
      onSuccess: invalidate,
    }),
    createMany: useMutation({
      mutationFn: (inputs: TransactionInput[]) =>
        createTransactions({ userId: user!.id, portfolioId: portfolioId!, inputs }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (args: { id: string; input: TransactionInput }) =>
        updateTransaction(args.id, args.input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteTransaction(id),
      onSuccess: invalidate,
    }),
  };
}
