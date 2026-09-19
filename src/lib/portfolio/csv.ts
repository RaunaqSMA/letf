import { validateTransaction } from "./portfolioCalculations";
import type { AssetType, Transaction, TransactionInput, TransactionType } from "./types";

export const CSV_COLUMNS = [
  "Date",
  "Symbol",
  "Type",
  "Quantity",
  "Price",
  "Fees",
  "Currency",
  "Notes",
] as const;

export interface ParsedRow {
  line: number;
  raw: string[];
  input: TransactionInput | null;
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const TYPES: TransactionType[] = ["BUY", "SELL", "DIVIDEND", "SPLIT"];
const ASSETS: AssetType[] = ["ETF", "STOCK", "INDEX", "OTHER"];

function normalizeDate(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return v;
}

/** Parses a CSV file into validated rows. Malformed rows are reported, never imported. */
export function parseTransactionCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return [];

  let header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  let startIdx = 1;
  const known = ["date", "symbol", "type", "quantity", "price", "fees", "currency", "notes"];
  if (!header.some((h) => known.includes(h))) {
    header = known;
    startIdx = 0;
  }
  const col = (name: string) => header.indexOf(name);

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const raw = splitCsvLine(lines[i]!);
    const get = (name: string) => {
      const idx = col(name);
      return idx >= 0 ? (raw[idx] ?? "") : "";
    };
    const errors: string[] = [];
    const type = get("type").toUpperCase() as TransactionType;
    if (!TYPES.includes(type)) errors.push(`Unknown type "${get("type")}".`);
    const assetRaw = get("asset_type").toUpperCase() as AssetType;
    const asset_type: AssetType = ASSETS.includes(assetRaw) ? assetRaw : "ETF";

    const input: TransactionInput = {
      symbol: get("symbol").toUpperCase(),
      asset_type,
      transaction_type: type,
      transaction_date: normalizeDate(get("date")),
      quantity: Number(get("quantity")),
      price: Number(get("price")),
      fees: get("fees") === "" ? 0 : Number(get("fees")),
      currency: (get("currency") || "USD").toUpperCase(),
      notes: get("notes") || null,
    };
    const check = validateTransaction(input);
    errors.push(...check.errors);
    rows.push({
      line: i + 1,
      raw,
      input: errors.length === 0 ? input : null,
      errors,
    });
  }
  return rows;
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const header = [
    "Date",
    "Symbol",
    "Asset Type",
    "Type",
    "Quantity",
    "Price",
    "Fees",
    "Currency",
    "Total",
    "Notes",
  ];
  const lines = [header.join(",")];
  for (const t of transactions) {
    const total = t.quantity * t.price + (t.transaction_type === "SELL" ? -t.fees : t.fees);
    lines.push(
      [
        t.transaction_date,
        t.symbol,
        t.asset_type,
        t.transaction_type,
        t.quantity,
        t.price,
        t.fees,
        t.currency,
        total.toFixed(2),
        t.notes ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
