import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currency, shortDate } from "@/lib/format";
import type { CustomEntry } from "@/lib/sim/types";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function CustomEntriesDialog({
  entries,
  onChange,
  minDate,
  maxDate,
  trigger,
}: {
  entries: CustomEntry[];
  onChange: (next: CustomEntry[]) => void;
  minDate?: string;
  maxDate?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(maxDate ?? "");
  const [amount, setAmount] = useState("100");
  const [note, setNote] = useState("");

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const total = entries.reduce((s, e) => s + e.amount, 0);

  const add = () => {
    const amt = Number(amount);
    if (!date || !isFinite(amt) || amt <= 0) return;
    onChange([...entries, { id: newId(), date, amount: amt, note: note.trim() || undefined }]);
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="num w-full">
            <Plus className="size-3.5" /> Manage purchases ({entries.length})
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>My purchase record</DialogTitle>
          <DialogDescription>
            Add each buy you actually made. The simulation uses these exact dates and amounts
            instead of a fixed schedule. Entries land on the first trading day on or after the date.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label className="label-xs">Date</Label>
            <Input
              type="date"
              className="num"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Amount</Label>
            <Input
              type="number"
              min={1}
              step="1"
              className="num"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-xs">Note</Label>
            <Input
              placeholder="optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
          </div>
          <Button onClick={add} className="num">
            <Plus className="size-4" /> Add
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto border border-border">
          {sorted.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No entries yet. Add your first purchase above.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="border-b border-border">
                  <th className="label-xs px-3 py-2 text-left">Date</th>
                  <th className="label-xs px-3 py-2 text-right">Amount</th>
                  <th className="label-xs px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="num px-3 py-1.5">{shortDate(e.date)}</td>
                    <td className="num px-3 py-1.5 text-right">
                      {currency(e.amount, { decimals: 2 })}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.note ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Remove entry from ${e.date}`}
                        className="text-muted-foreground hover:text-loss"
                        onClick={() => onChange(entries.filter((x) => x.id !== e.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="num text-sm text-muted-foreground">
            {entries.length} entries · {currency(total, { decimals: 2 })} invested
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onChange([])} disabled={entries.length === 0}>
              Clear all
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
