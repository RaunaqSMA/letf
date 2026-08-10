export interface CashFlow {
  date: string;
  amount: number;
}

const MS_PER_YEAR = 365 * 24 * 3600 * 1000;

function npv(flows: CashFlow[], rate: number, t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const years = (Date.parse(f.date) - t0) / MS_PER_YEAR;
    sum += f.amount / Math.pow(1 + rate, years);
  }
  return sum;
}

/**
 * Money-weighted annualised return over irregular cash-flow dates.
 * Uses bisection on a bracketed root, which is more robust than Newton for
 * the extreme return profiles a 3x fund produces. Returns null when no root
 * exists in a sane range.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = Date.parse(flows[0]!.date);

  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(flows, lo, t0);
  let fHi = npv(flows, hi, t0);
  if (!isFinite(fLo) || !isFinite(fHi)) return null;
  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(flows, mid, t0);
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-10) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}