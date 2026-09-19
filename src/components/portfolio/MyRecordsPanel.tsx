import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CustomEntriesDialog } from "@/components/app/CustomEntriesDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currency } from "@/lib/format";
import { useAuth } from "@/lib/account/auth";
import { usePortfolios, useTransactionMutations, useTransactions } from "@/lib/portfolio/hooks";
import { priceAt } from "@/lib/portfolio/prices";
import {
  customEntriesToTransactionInputs,
  transactionsToCustomEntries,
} from "@/lib/portfolio/simulatorBridge";
import { useSimulation } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { PortfolioSelector } from "./PortfolioSelector";

export function MyRecordsPanel() {
  const { user, loading } = useAuth();
  const { config, setConfig, latestDate, data } = useSimulation();
  const portfolios = usePortfolios();
  const saved = config.recordSource === "saved";

  const portfolioId =
    config.recordPortfolioId || portfolios.data?.[0]?.id || "";
  const transactions = useTransactions(saved ? portfolioId : undefined);
  const { createMany } = useTransactionMutations(portfolioId);
  const [importOpen, setImportOpen] = useState(false);

  const mapping = useMemo(
    () =>
      transactionsToCustomEntries(transactions.data ?? [], {
        symbol: config.instrument,
      }),
    [transactions.data, config.instrument],
  );

  // Keep the engine's saved-record contributions in sync (MODE A replay).
  useEffect(() => {
    if (!saved) return;
    setConfig({ savedEntries: mapping.entries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, mapping.entries]);

  const tempTotal = config.customEntries.reduce((s, e) => s + e.amount, 0);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Checking your account…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setConfig({ recordSource: "temporary" })}
          className={cn(
            "num border px-2 py-1.5 text-xs",
            !saved
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Temporary records
        </button>
        <button
          type="button"
          onClick={() => setConfig({ recordSource: "saved", recordPortfolioId: portfolioId })}
          className={cn(
            "num border px-2 py-1.5 text-xs",
            saved
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Use saved records
        </button>
      </div>

      {!saved ? (
        <>
          <CustomEntriesDialog
            entries={config.customEntries}
            onChange={(customEntries) => setConfig({ customEntries })}
            minDate="1999-01-04"
            maxDate={latestDate}
          />
          <p className="text-xs text-muted-foreground">
            These records are stored only in this browser and are not synced.{" "}
            {config.customEntries.length > 0
              ? `${config.customEntries.length} purchases · ${currency(tempTotal)} total.`
              : "Add entries to run the simulation."}
          </p>
          {user && config.customEntries.length > 0 ? (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setImportOpen(true)}>
              Import temporary records to my account
            </Button>
          ) : null}
        </>
      ) : !user ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p className="text-sm">Save your investment records across devices</p>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfig({ recordSource: "temporary" })}
            >
              Continue without saving
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <PortfolioSelector
            portfolios={portfolios.data ?? []}
            value={portfolioId}
            onChange={(id) => setConfig({ recordPortfolioId: id })}
          />
          {transactions.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading your records…</p>
          ) : transactions.error ? (
            <p className="text-xs text-loss">Unable to load your records. Try again.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {mapping.entries.length} saved {config.instrument} buys replayed
              {mapping.skipped.length ? ` · ${mapping.skipped.length} records not replayed` : ""}.
              Simulation value is modelled, not your real holdings.
            </p>
          )}
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/records">Manage records</Link>
          </Button>
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import temporary records</DialogTitle>
            <DialogDescription>
              {config.customEntries.length} browser-only records will be saved to your account as{" "}
              {config.instrument} buys, priced at the historical close for each date where
              available. Nothing is uploaded until you confirm.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={createMany.isPending || !portfolioId}
              onClick={async () => {
                try {
                  const inputs = customEntriesToTransactionInputs(config.customEntries, {
                    symbol: config.instrument,
                    priceAt: (d) => priceAt(data, config.instrument, d),
                  });
                  await createMany.mutateAsync(inputs);
                  toast.success(`Imported ${inputs.length} records`);
                  setImportOpen(false);
                  setConfig({ recordSource: "saved", recordPortfolioId: portfolioId });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
