import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, shortDate } from "@/lib/format";
import type { Transaction } from "@/lib/portfolio/types";

type SortKey = "transaction_date" | "symbol" | "quantity" | "price";

export function TransactionTable({
  transactions,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [type, setType] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortKey>("transaction_date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const filtered = transactions.filter((t) => {
      if (symbol && !t.symbol.toUpperCase().includes(symbol.toUpperCase())) return false;
      if (type !== "ALL" && t.transaction_type !== type) return false;
      if (from && t.transaction_date < from) return false;
      if (to && t.transaction_date > to) return false;
      return true;
    });
    const sign = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [transactions, symbol, type, from, to, sort, dir]);

  const th = (key: SortKey, label: string, align = "text-left") => (
    <th className={`label-xs px-3 py-2 ${align}`}>
      <button
        type="button"
        className="hover:text-foreground"
        onClick={() => {
          if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
          else {
            setSort(key);
            setDir("desc");
          }
        }}
      >
        {label}
        {sort === key ? (dir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="label-xs">Symbol</Label>
          <Input
            className="num"
            placeholder="All"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="label-xs">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="num">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="BUY">Buy</SelectItem>
              <SelectItem value="SELL">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="label-xs">From</Label>
          <Input type="date" className="num" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="label-xs">To</Label>
          <Input type="date" className="num" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          No transactions match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b border-border">
                {th("transaction_date", "Date")}
                {th("symbol", "Symbol")}
                <th className="label-xs px-3 py-2 text-left">Type</th>
                {th("quantity", "Quantity", "text-right")}
                {th("price", "Price", "text-right")}
                <th className="label-xs px-3 py-2 text-right">Fees</th>
                <th className="label-xs px-3 py-2 text-right">Total</th>
                <th className="label-xs px-3 py-2 text-left">Notes</th>
                <th className="label-xs px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const total =
                  t.quantity * t.price + (t.transaction_type === "SELL" ? -t.fees : t.fees);
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="num px-3 py-1.5">{shortDate(t.transaction_date)}</td>
                    <td className="num px-3 py-1.5">{t.symbol}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`num text-[10px] uppercase tracking-wider ${
                          t.transaction_type === "SELL" ? "text-loss" : "text-gain"
                        }`}
                      >
                        {t.transaction_type}
                      </span>
                    </td>
                    <td className="num px-3 py-1.5 text-right">{t.quantity}</td>
                    <td className="num px-3 py-1.5 text-right">{money(t.price, t.currency)}</td>
                    <td className="num px-3 py-1.5 text-right">{money(t.fees, t.currency)}</td>
                    <td className="num px-3 py-1.5 text-right">{money(total, t.currency)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{t.notes ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${t.symbol} on ${t.transaction_date}`}
                          onClick={() => onEdit(t)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${t.symbol} on ${t.transaction_date}`}
                          onClick={() => onDelete(t)}
                        >
                          <Trash2 className="size-3.5 text-loss" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
