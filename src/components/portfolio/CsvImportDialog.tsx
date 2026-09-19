import { Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import { parseTransactionCsv, type ParsedRow } from "@/lib/portfolio/csv";
import type { TransactionInput } from "@/lib/portfolio/types";

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (inputs: TransactionInput[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const valid = rows.filter((r) => r.input);
  const invalid = rows.filter((r) => !r.input);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setRows([]);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Columns: Date, Symbol, Type, Quantity, Price, Fees, Currency, Notes. Every row is
            checked before anything is saved — malformed rows are never imported.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setRows(parseTransactionCsv(await file.text()));
          }}
        />

        {rows.length > 0 ? (
          <>
            <div className="num flex gap-4 text-sm">
              <span className="text-gain">{valid.length} valid</span>
              <span className={invalid.length ? "text-loss" : "text-muted-foreground"}>
                {invalid.length} invalid
              </span>
            </div>
            <div className="max-h-72 overflow-auto border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="border-b border-border">
                    <th className="label-xs px-2 py-1.5 text-left">Line</th>
                    <th className="label-xs px-2 py-1.5 text-left">Date</th>
                    <th className="label-xs px-2 py-1.5 text-left">Symbol</th>
                    <th className="label-xs px-2 py-1.5 text-left">Type</th>
                    <th className="label-xs px-2 py-1.5 text-right">Qty</th>
                    <th className="label-xs px-2 py-1.5 text-right">Price</th>
                    <th className="label-xs px-2 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-border last:border-0">
                      <td className="num px-2 py-1">{r.line}</td>
                      <td className="num px-2 py-1">{r.input?.transaction_date ?? "—"}</td>
                      <td className="num px-2 py-1">{r.input?.symbol ?? "—"}</td>
                      <td className="num px-2 py-1">{r.input?.transaction_type ?? "—"}</td>
                      <td className="num px-2 py-1 text-right">{r.input?.quantity ?? "—"}</td>
                      <td className="num px-2 py-1 text-right">{r.input?.price ?? "—"}</td>
                      <td className="px-2 py-1">
                        {r.input ? (
                          <span className="text-gain">Valid</span>
                        ) : (
                          <span className="text-loss">{r.errors.join(" ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={valid.length === 0 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onImport(valid.map((r) => r.input!));
                toast.success(`Imported ${valid.length} transactions`);
                setRows([]);
                onOpenChange(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Upload className="size-3.5" /> Import {valid.length} valid rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
