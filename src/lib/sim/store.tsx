import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { marketDataQuery } from "@/lib/market/loader";
import { INSTRUMENTS, type InstrumentId, type MarketDataset } from "@/lib/market/types";
import { runSimulation } from "./simulate";
import type { CustomEntry, SimulationConfig, SimulationResult } from "./types";

const ENTRIES_KEY = "letf-dca-custom-entries";

export const DEFAULT_CONFIG: SimulationConfig = {
  instrument: "TQQQ",
  startDate: "1999-03-01",
  endDate: "2099-12-31",
  contribution: 100,
  frequency: "monthly",
  timing: "first",
  leverage: 3,
  financingModel: "riskfree_spread",
  fixedFinancingRate: 0.03,
  financingSpread: INSTRUMENTS.TQQQ.financingSpread,
  expenseRatio: INSTRUMENTS.TQQQ.expenseRatio,
  reinvestDistributions: true,
  useSyntheticHistory: true,
  useActualHistory: true,
  underlyingMode: "total_return",
  transactionCost: 0,
  customEntries: [],
  fxRate: 1,
  fxLabel: "USD",
};

interface SimContextValue {
  data: MarketDataset | undefined;
  isLoading: boolean;
  error: Error | null;
  config: SimulationConfig;
  setConfig: (patch: Partial<SimulationConfig>) => void;
  resetConfig: () => void;
  result: SimulationResult | null;
  /** Same config, other instrument — used by the comparison page */
  resultFor: (instrument: InstrumentId) => SimulationResult | null;
  latestDate: string;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery(marketDataQuery);
  const [config, setConfigState] = useState<SimulationConfig>(DEFAULT_CONFIG);

  // Manual purchase records persist locally so the user keeps their tracking.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ENTRIES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CustomEntry[];
      if (Array.isArray(parsed) && parsed.length) {
        setConfigState((c) => ({ ...c, customEntries: parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify(config.customEntries));
    } catch {
      /* ignore */
    }
  }, [config.customEntries]);

  const latestDate = data ? data.qqq.dates[data.qqq.dates.length - 1]! : "";

  const effectiveConfig = useMemo<SimulationConfig>(() => {
    if (!data) return config;
    const end = config.endDate > latestDate ? latestDate : config.endDate;
    return { ...config, endDate: end };
  }, [config, data, latestDate]);

  const result = useMemo(() => {
    if (!data) return null;
    return runSimulation(data, effectiveConfig);
  }, [data, effectiveConfig]);

  const cache = useMemo(() => new Map<InstrumentId, SimulationResult>(), [data, effectiveConfig]);

  const value = useMemo<SimContextValue>(
    () => ({
      data,
      isLoading,
      error: (error as Error) ?? null,
      config: effectiveConfig,
      setConfig: (patch) => setConfigState((c) => ({ ...c, ...patch })),
      resetConfig: () =>
        setConfigState((c) => ({ ...DEFAULT_CONFIG, customEntries: c.customEntries })),
      result,
      resultFor: (instrument) => {
        if (!data) return null;
        if (instrument === effectiveConfig.instrument) return result;
        const hit = cache.get(instrument);
        if (hit) return hit;
        const inst = INSTRUMENTS[instrument];
        const r = runSimulation(data, {
          ...effectiveConfig,
          instrument,
          expenseRatio: inst.expenseRatio,
          financingSpread: inst.financingSpread,
        });
        cache.set(instrument, r);
        return r;
      },
      latestDate,
    }),
    [data, isLoading, error, effectiveConfig, result, cache, latestDate],
  );

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSimulation(): SimContextValue {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSimulation must be used inside <SimulationProvider>");
  return ctx;
}