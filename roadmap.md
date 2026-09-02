# LETF Lab — Research-Grade Refactor Roadmap

Model version target: **v2.0 — Research Grade**

## Phase 1 — Correctness
- [x] `sim/model.ts` — model version + reproducible config hash/ID
- [x] `sim/financing.ts` — add Model D (stress financing) + sensitivity ladder
- [x] `sim/leverage.ts` — wipeout events, extreme-day log, optional (off by default) clipping, explicit return decomposition
- [x] `sim/metrics.ts` — CAGR, vol, Sharpe (rf-subtracted), Sortino, Calmar, Ulcer, skew, kurtosis, VaR/CVaR, calendar-year returns on prior-December boundary, drawdown durations
- [x] `sim/dca.ts` — starting capital, contribution growth, inflation-indexed contributions, start delay / end date, average purchase price, TWR
- [x] `sim/simulate.ts` — wire metrics + three distinct drawdown concepts (NAV / portfolio / contribution-relative)

## Phase 2 — Historical research
- [x] `sim/rolling.ts` — horizons 1..50y, percentiles, probability metrics
- [x] `sim/crashes.ts` — DCA crash experience (units bought, +1y/+3y/+5y, recovery), extra regimes
- [x] `sim/dataquality.ts` — automated dataset audit
- [x] `sim/validation.ts` — CAGR/vol/drawdown diffs + calibration modes (theoretical / calibrated / conservative)

## Phase 3 — Probabilistic
- [x] `sim/rng.ts` — seeded deterministic RNG
- [x] `sim/montecarlo.ts` — block bootstrap + regime-aware, percentiles, probabilities
- [x] `workers/mc.worker.ts` — not needed: the bootstrap runs in well under a second on the main thread and is memoised per config
- [x] route `/forecast` — 50-Year Forecast Lab (3-strategy comparison)

## Phase 4 — Sensitivity Lab
- [x] `sim/sensitivity.ts` — CAGR × vol × financing cube, stress crash paths, path-dependence demo
- [x] `sim/investor.ts` — inflation, FX/INR, tax overlay
- [x] route `/sensitivity`

## Phase 5 — Integration
- [x] Research dashboard sections
- [x] `Research Conclusion` panel
- [x] Assumptions panel + config export everywhere

## Tests
- [x] vitest suite covering the 12 mandated quantitative tests
