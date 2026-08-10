export function currency(value: number, opts: { decimals?: number; compact?: boolean } = {}): string {
  if (!isFinite(value)) return "—";
  const { decimals = 0, compact = false } = opts;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function percent(value: number | null, decimals = 1): string {
  if (value === null || !isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

export function signedPercent(value: number | null, decimals = 1): string {
  if (value === null || !isFinite(value)) return "—";
  const s = (value * 100).toFixed(decimals);
  return `${value > 0 ? "+" : ""}${s}%`;
}

export function multiple(value: number, decimals = 2): string {
  if (!isFinite(value)) return "—";
  return `${value.toFixed(decimals)}x`;
}

export function number(value: number, decimals = 2): string {
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function monthsLabel(months: number | null, ongoing = false): string {
  if (months === null) return "Not recovered";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const base = y > 0 ? `${months} mo (${y}y ${m}m)` : `${months} mo`;
  return ongoing ? `${base} · ongoing` : base;
}

export function shortDate(date: string): string {
  if (!date || date === "—") return "—";
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function monthYear(date: string): string {
  if (!date || date === "—") return "—";
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}