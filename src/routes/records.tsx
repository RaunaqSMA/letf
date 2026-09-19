import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Callout, PageHeader, Section } from "@/components/app/primitives";
import { CsvImportDialog } from "@/components/portfolio/CsvImportDialog";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { PortfolioSelector } from "@/components/portfolio/PortfolioSelector";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";
import { TransactionDialog } from "@/components/portfolio/TransactionDialog";
import { TransactionTable } from "@/components/portfolio/TransactionTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/account/auth";
import { currency, money, monthYear } from "@/lib/format";
import { downloadTextFile, transactionsToCsv } from "@/lib/portfolio/csv";
import { usePortfolios, useTransactionMutations, useTransactions } from "@/lib/portfolio/hooks";
import {
  computeHoldings,
  holdingKey,
  portfolioValueSeries,
  totalsByCurrency,
  valueHoldings,
} from "@/lib/portfolio/portfolioCalculations";
import { latestPrice, priceSeries } from "@/lib/portfolio/prices";
import { useExternalQuotes } from "@/lib/portfolio/quotes";
import type { Transaction } from "@/lib/portfolio/types";
import { useSimulation } from "@/lib/sim/store";

export const Route = createFileRoute("/records")({
  head: () => ({
    meta: [
      { title: "My Records — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Your own investment transaction ledger: holdings, average cost, realised and unrealised P/L from the records you saved.",
      },
      { property: "og:title", content: "My Records — LETF DCA Lab" },
      {
        property: "og:description",
        content: "Your personal investment ledger with derived holdings and P/L.",
      },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const { user, loading } = useAuth();
  const { data: market } = useSimulation();
  const portfolios = usePortfolios();
  const [selected, setSelected] = useState<string>("");
  const portfolioId = selected || portfolios.data?.[0]?.id || "";
  const transactions = useTransactions(portfolioId);
  const { create, update, remove, createMany } = useTransactionMutations(portfolioId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const rows = useMemo(() => transactions.data ?? [], [transactions.data]);
  const holdings = useMemo(() => computeHoldings(rows), [rows]);
  const valued = useMemo(
    () => valueHoldings(holdings, (symbol) => latestPrice(market, symbol)),
    [holdings, market],
  );
  const totals = useMemo(() => totalsByCurrency(valued), [valued]);
  const heldMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of holdings) m.set(holdingKey(h.symbol, h.currency), h.units);
    return m;
  }, [holdings]);

  const chart = useMemo(() => {
    if (!market) return [];
    const series = portfolioValueSeries(rows, market.qqq.dates, (s) => priceSeries(market, s));
    const step = Math.max(1, Math.floor(series.length / 400));
    return series.filter((_, i) => i % step === 0 || i === series.length - 1);
  }, [rows, market]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading your records…</div>;
  }

  if (!user) {
    return (
      <div>
        <PageHeader
          title="My Records"
          subtitle="Save your investment records across devices."
        />
        <div className="px-4 py-8 md:px-8">
          <Callout title="Sign in to save records">
            <p>
              Personal records are private to your account. You can keep using the simulator with
              temporary records stored only in this browser.
            </p>
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/simulator">Continue without saving</Link>
              </Button>
            </div>
          </Callout>
        </div>
      </div>
    );
  }

  const empty = !transactions.isLoading && rows.length === 0;
  const portfolioName = portfolios.data?.find((p) => p.id === portfolioId)?.name ?? "My Portfolio";

  return (
    <div>
      <PageHeader
        title="My Records"
        subtitle="Personal record — what you actually bought and sold, valued at the last available market price. This is not the simulation."
        actions={
          <>
            <PortfolioSelector
              portfolios={portfolios.data ?? []}
              value={portfolioId}
              onChange={setSelected}
            />
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-3.5" /> Add transaction
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
              <Upload className="size-3.5" /> Import CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={() =>
                downloadTextFile("my-investment-records.csv", transactionsToCsv(rows))
              }
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
          </>
        }
      />

      {transactions.error ? (
        <div className="px-4 py-6 md:px-8">
          <Callout title="Unable to load your records">
            {(transactions.error as Error).message} — try again in a moment.
          </Callout>
        </div>
      ) : null}

      {transactions.isLoading ? (
        <div className="px-4 py-8 text-sm text-muted-foreground md:px-8">
          Loading your records…
        </div>
      ) : empty ? (
        <div className="px-4 py-8 md:px-8">
          <div className="border border-border bg-card p-6">
            <p className="text-sm">{portfolioName} is empty.</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                Add your first transaction
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
                Import CSV
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Section title="Personal record — portfolio dashboard">
            <PortfolioSummary totals={totals} transactionCount={rows.length} />
          </Section>

          <Section
            title="Holdings"
            description="Units, average cost and P/L derived from the transaction ledger. Accounting method: FIFO."
          >
            <HoldingsTable holdings={valued} />
          </Section>

          <Section
            title="Allocation by asset"
            description="Share of current value, by symbol and currency."
          >
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
              {valued
                .filter((h) => h.units > 1e-9)
                .map((h) => {
                  const total = totals.find((t) => t.currency === h.currency)?.value ?? null;
                  const share = total && h.currentValue ? h.currentValue / total : null;
                  return (
                    <div key={`${h.symbol}-${h.currency}`} className="bg-card px-4 py-3">
                      <div className="num text-sm font-semibold">{h.symbol}</div>
                      <div className="num mt-1 text-lg">
                        {h.currentValue === null
                          ? "Price unavailable"
                          : money(h.currentValue, h.currency, 0)}
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-muted">
                        <div
                          className="h-1.5 bg-primary"
                          style={{ width: `${Math.min(100, (share ?? 0) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {share === null ? "—" : `${(share * 100).toFixed(1)}% of ${h.currency}`}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Section>

          <Section
            title="Portfolio value over time"
            description="Built from your actual records and available historical market prices. Where today's price is missing, the last available market price is used."
          >
            <div className="border border-border bg-card p-3">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <defs>
                      <linearGradient id="recordsValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={monthYear}
                      tick={{ fontSize: 10 }}
                      minTickGap={40}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={70}
                      stroke="var(--muted-foreground)"
                      tickFormatter={(v: number) => currency(v, { compact: true })}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        fontSize: 12,
                      }}
                      formatter={(v: number, name: string) => [currency(v), name]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Portfolio value"
                      stroke="var(--chart-1)"
                      fill="url(#recordsValue)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="invested"
                      name="Invested"
                      stroke="var(--chart-2)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Section>

          <Section
            title="Transaction history"
            description="Your ledger is the source of truth. Units, cost and P/L are always derived from these rows."
          >
            <TransactionTable
              transactions={rows}
              onEdit={(t) => {
                setEditing(t);
                setDialogOpen(true);
              }}
              onDelete={async (t) => {
                if (!window.confirm(`Delete the ${t.transaction_type} of ${t.symbol}?`)) return;
                try {
                  await remove.mutateAsync(t.id);
                  toast.success("Transaction deleted");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          </Section>
        </>
      )}

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        unitsAvailable={(symbol, curr) => heldMap.get(holdingKey(symbol, curr)) ?? 0}
        onSubmit={async (input) => {
          if (editing) await update.mutateAsync({ id: editing.id, input });
          else await create.mutateAsync(input);
          toast.success(editing ? "Transaction updated" : "Transaction saved");
        }}
      />

      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImport={async (inputs) => {
          await createMany.mutateAsync(inputs);
        }}
      />
    </div>
  );
}
