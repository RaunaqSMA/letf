import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { validateTransaction } from "@/lib/portfolio/portfolioCalculations";
import type {
  AssetType,
  Transaction,
  TransactionInput,
  TransactionType,
} from "@/lib/portfolio/types";

const EMPTY: TransactionInput = {
  symbol: "TQQQ",
  asset_type: "ETF",
  transaction_type: "BUY",
  transaction_date: new Date().toISOString().slice(0, 10),
  quantity: 1,
  price: 0,
  fees: 0,
  currency: "USD",
  notes: "",
};

export function TransactionDialog({
  open,
  onOpenChange,
  existing,
  unitsAvailable,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Transaction | null;
  /** Units currently held for the symbol+currency being sold. */
  unitsAvailable?: (symbol: string, currency: string) => number;
  onSubmit: (input: TransactionInput) => Promise<void>;
}) {
  const [form, setForm] = useState<TransactionInput>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    setForm(
      existing
        ? {
            symbol: existing.symbol,
            asset_type: existing.asset_type,
            transaction_type: existing.transaction_type,
            transaction_date: existing.transaction_date,
            quantity: Number(existing.quantity),
            price: Number(existing.price),
            fees: Number(existing.fees),
            currency: existing.currency,
            notes: existing.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, existing]);

  const set = (patch: Partial<TransactionInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const held = unitsAvailable?.(form.symbol, form.currency);
    const available =
      existing && existing.transaction_type === "SELL"
        ? (held ?? 0) + Number(existing.quantity)
        : held;
    const check = validateTransaction(form, { availableUnits: available });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (e) {
      setErrors([(e as Error).message]);
      toast.error("Could not save the transaction");
    } finally {
      setSaving(false);
    }
  };

  const total = form.quantity * form.price + (form.transaction_type === "SELL" ? -form.fees : form.fees);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            This is a personal record of what you actually bought or sold. Nothing is sent to a
            broker and no trade is executed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="label-xs">Symbol</Label>
            <Input
              className="num"
              value={form.symbol}
              onChange={(e) => set({ symbol: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Asset type</Label>
            <Select
              value={form.asset_type}
              onValueChange={(v) => set({ asset_type: v as AssetType })}
            >
              <SelectTrigger className="num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ETF">ETF</SelectItem>
                <SelectItem value="STOCK">Stock</SelectItem>
                <SelectItem value="INDEX">Index</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Type</Label>
            <Select
              value={form.transaction_type}
              onValueChange={(v) => set({ transaction_type: v as TransactionType })}
            >
              <SelectTrigger className="num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUY">Buy</SelectItem>
                <SelectItem value="SELL">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Date</Label>
            <Input
              type="date"
              className="num"
              value={form.transaction_date}
              onChange={(e) => set({ transaction_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Quantity</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              className="num"
              value={form.quantity}
              onChange={(e) => set({ quantity: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Price</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              className="num"
              value={form.price}
              onChange={(e) => set({ price: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Fees</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              className="num"
              value={form.fees}
              onChange={(e) => set({ fees: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
              <SelectTrigger className="num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="INR">INR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="label-xs">Notes</Label>
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              placeholder="Monthly DCA"
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>

        {errors.length > 0 ? (
          <ul className="border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <span className="num text-sm text-muted-foreground">
            Total {form.currency} {isFinite(total) ? total.toFixed(2) : "—"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : existing ? "Save changes" : "Add transaction"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
