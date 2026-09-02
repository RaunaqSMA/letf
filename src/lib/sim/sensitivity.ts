/**
 * Sensitivity Lab.
 *
 * Instead of asking "what did 3x do?", these helpers ask "under what
 * conditions does leverage help, and where is the break-even boundary?".
 * Everything here is a closed-form or short numerical experiment on the same
 * daily-reset equation the historical engine uses:
 *
 *   NAV_t = NAV_(t-1) * (1 + L*r_t - (L-1)*f*dt - e*dt)
 */

import { createRng } from "./rng";
import { TRADING_DAYS } from "./metrics";

export interface LeverageAssumptions {
  /** Expected annual arithmetic drift of the underlying. */
  drift: number;
  /** Annualised volatility of the underlying. */
  volatility: number;
  /** Annual financing rate on borrowed exposure. */
  financingRate: number;
  /** Fund expense ratio. */
  expenseRatio: number;
  /** Any extra annual drag (slippage, tracking error, calibration). */
  extraDrag: number;
}

/**
 * Expected geometric (log) growth of a daily-reset leveraged fund under
 * lognormal assumptions:
 *
 *   g(L) = L*mu - (L^2 * sigma^2)/2 - (L-1)*f - e - extra
 *
 * The -(L^2 sigma^2)/2 term is volatility decay. It is not a fudge factor:
 * it is what daily compounding of a volatile series produces.
 */
export function expectedGeometricReturn(l: number, a: LeverageAssumptions): number {
  const variance = a.volatility * a.volatility;
  const g = l * a.drift - (l * l * variance) / 2 - (l - 1) * a.financingRate - a.expenseRatio - a.extraDrag;
  return Math.exp(g) - 1;
}

/** Leverage that maximises expected geometric growth (the Kelly-style optimum). */
export function optimalLeverage(a: LeverageAssumptions): number {
  const variance = a.volatility * a.volatility;
  if (variance <= 0) return Infinity;
  // d/dL [L*mu - L^2 s^2/2 - (L-1)f] = mu - L s^2 - f = 0
  return (a.drift - a.financingRate) / variance;
}

/**
 * Break-even volatility: above this level, 3x stops beating 1x for the given
 * drift and financing assumptions.
 */
export function breakEvenVolatility(l: number, a: Omit<LeverageAssumptions, "volatility">): number | null {
  // Solve L*mu - L^2 s^2/2 - (L-1)f - e = mu - s^2/2
  //  => s^2 (L^2 - 1)/2 = (L-1)mu - (L-1)f - e
  if (l <= 1) return null;
  const rhs = (l - 1) * a.drift - (l - 1) * a.financingRate - a.expenseRatio - a.extraDrag;
  const s2 = (2 * rhs) / (l * l - 1);
  return s2 > 0 ? Math.sqrt(s2) : 0;
}

export interface SensitivityCell {
  drift: number;
  volatility: number;
  financingRate: number;
  leveraged: number;
  unlevered: number;
  advantage: number;
  favoursLeverage: boolean;
}

/** Builds the CAGR × volatility × financing cube for the chosen leverage. */
export function sensitivityCube(
  leverage: number,
  base: LeverageAssumptions,
  axes: { drifts: number[]; volatilities: number[]; financingRates: number[] },
): SensitivityCell[] {
  const cells: SensitivityCell[] = [];
  for (const financingRate of axes.financingRates) {
    for (const drift of axes.drifts) {
      for (const volatility of axes.volatilities) {
        const a = { ...base, drift, volatility, financingRate };
        const lev = expectedGeometricReturn(leverage, a);
        const un = expectedGeometricReturn(1, { ...a, financingRate: 0, expenseRatio: 0.0003, extraDrag: 0 });
        cells.push({
          drift,
          volatility,
          financingRate,
          leveraged: lev,
          unlevered: un,
          advantage: lev - un,
          favoursLeverage: lev > un,
        });
      }
    }
  }
  return cells;
}

export const DEFAULT_AXES = {
  drifts: [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15],
  volatilities: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5],
  financingRates: [0, 0.02, 0.04, 0.06],
};

export interface StressPath {
  id: string;
  label: string;
  description: string;
  /** Daily underlying returns of the scenario. */
  returns: number[];
}

/** Hand-built stress paths that history has not (yet) delivered. */
/**
 * Shifts every daily return by a constant so the path lands exactly on its
 * stated total return. Without this, sampling noise makes a "0% drift" decade
 * finish well away from flat and the label stops describing the scenario.
 */
function retarget(returns: number[], targetTotal: number): number[] {
  let total = 1;
  for (const r of returns) total *= 1 + r;
  const shift = Math.pow((1 + targetTotal) / total, 1 / returns.length);
  return returns.map((r) => (1 + r) * shift - 1);
}

export function stressPaths(seed = "stress-v2"): StressPath[] {
  const rng = createRng(seed);
  const flatChoppy: number[] = [];
  for (let i = 0; i < TRADING_DAYS * 5; i++) {
    // Zero drift, 35% annualised volatility: the pure decay scenario.
    flatChoppy.push((rng.normal() * 0.35) / Math.sqrt(TRADING_DAYS));
  }
  const slowGrind: number[] = [];
  for (let i = 0; i < TRADING_DAYS * 3; i++) {
    slowGrind.push(-0.0012 + (rng.normal() * 0.28) / Math.sqrt(TRADING_DAYS));
  }
  const singleDayShock: number[] = [];
  for (let i = 0; i < TRADING_DAYS; i++) {
    singleDayShock.push(i === 120 ? -0.3 : (rng.normal() * 0.2) / Math.sqrt(TRADING_DAYS));
  }
  const lostDecade: number[] = [];
  for (let i = 0; i < TRADING_DAYS * 10; i++) {
    lostDecade.push((rng.normal() * 0.24) / Math.sqrt(TRADING_DAYS));
  }
  const vShock: number[] = [];
  for (let i = 0; i < TRADING_DAYS * 2; i++) {
    if (i >= 100 && i < 120) vShock.push(-0.06);
    else if (i >= 120 && i < 200) vShock.push(0.012);
    else vShock.push((rng.normal() * 0.18) / Math.sqrt(TRADING_DAYS));
  }
  return [
    {
      id: "flat-choppy",
      label: "Flat but choppy (5y, 35% vol, 0% drift)",
      description:
        "The underlying ends exactly where it started after five turbulent years. This is the scenario where leverage loses the most for the least obvious reason.",
      returns: retarget(flatChoppy, 0),
    },
    {
      id: "slow-grind",
      label: "Slow grind down (3y, -25% total, 28% vol)",
      description: "A long, volatile bear market rather than a single crash.",
      returns: retarget(slowGrind, -0.25),
    },
    {
      id: "one-day-shock",
      label: "Single -30% day",
      description:
        "A one-day move of -30% wipes out a 3x fund entirely (3 x -30% = -90%, and -33.4% would be terminal). This is the tail risk that daily reset cannot diversify away.",
      returns: singleDayShock,
    },
    {
      id: "lost-decade",
      label: "Lost decade (10y, 24% vol, 0% drift)",
      description: "Japan-style stagnation with normal volatility.",
      returns: retarget(lostDecade, 0),
    },
    {
      id: "v-shock",
      label: "Sharp crash, fast recovery",
      description:
        "A -70% underlying drop over a month followed by a rapid rebound — the case where leverage recovers least, because it fell from a much lower base.",
      returns: vShock,
    },
  ];
}

export interface StressOutcome {
  path: StressPath;
  underlyingTotal: number;
  leveragedTotal: number;
  leveragedMaxDrawdown: number;
  wipedOut: boolean;
  years: number;
  underlyingCagr: number;
  leveragedCagr: number | null;
}

export function runStressPath(
  path: StressPath,
  leverage: number,
  a: Pick<LeverageAssumptions, "financingRate" | "expenseRatio" | "extraDrag">,
): StressOutcome {
  const drag = ((leverage - 1) * a.financingRate + a.expenseRatio + a.extraDrag) / TRADING_DAYS;
  let nav = 1;
  let under = 1;
  let peak = 1;
  let maxDD = 0;
  let wiped = false;
  for (const r of path.returns) {
    under *= 1 + r;
    if (!wiped) {
      nav *= 1 + leverage * r - drag;
      if (nav <= 0) {
        nav = 0;
        wiped = true;
      }
      if (nav > peak) peak = nav;
      const dd = nav / peak - 1;
      if (dd < maxDD) maxDD = dd;
    }
  }
  const years = path.returns.length / TRADING_DAYS;
  return {
    path,
    underlyingTotal: under - 1,
    leveragedTotal: nav - 1,
    leveragedMaxDrawdown: maxDD,
    wipedOut: wiped,
    years,
    underlyingCagr: Math.pow(under, 1 / years) - 1,
    leveragedCagr: nav > 0 ? Math.pow(nav, 1 / years) - 1 : null,
  };
}

export interface PathDependenceCase {
  label: string;
  description: string;
  underlyingReturns: number[];
  underlyingTotal: number;
  leveragedTotal: number;
}

/**
 * Two paths with identical start and end points for the underlying, but very
 * different leveraged outcomes. The clearest single demonstration that
 * leveraged returns are path dependent.
 */
export function pathDependenceDemo(leverage = 3): PathDependenceCase[] {
  const build = (rs: number[]) => {
    let nav = 1;
    let u = 1;
    for (const r of rs) {
      u *= 1 + r;
      nav *= 1 + leverage * r;
    }
    return { u: u - 1, nav: nav - 1 };
  };
  const smooth = new Array(20).fill(0.005);
  const choppy: number[] = [];
  for (let i = 0; i < 20; i++) choppy.push(i % 2 === 0 ? 0.105 : -0.0865);
  const a = build(smooth);
  const b = build(choppy);
  return [
    {
      label: "Smooth ascent",
      description: "Twenty consecutive +0.5% days.",
      underlyingReturns: smooth,
      underlyingTotal: a.u,
      leveragedTotal: a.nav,
    },
    {
      label: "Same destination, violent route",
      description: "Alternating large up and down days reaching a similar endpoint.",
      underlyingReturns: choppy,
      underlyingTotal: b.u,
      leveragedTotal: b.nav,
    },
  ];
}
