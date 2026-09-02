# LETF Lab — Research-Grade Refactor Roadmap

Model version target: **v2.0 — Research Grade**

## Phase 1 — Correctness
- [ ] `sim/model.ts` — model version + reproducible config hash/ID
- [ ] `sim/financing.ts` — add Model D (stress financing) + sensitivity ladder
- [ ] `sim/leverage.ts` — wipeout events, extreme-day log, optional (off by default) clipping, explicit return decomposition
- [ ] `sim/metrics.ts` — CAGR, vol, Sharpe (rf-subtracted), Sortino, Calmar, Ulcer, skew, kurtosis, VaR/CVaR, calendar-year returns on prior-December boundary, drawdown durations
- [ ] `sim/dca.ts` — starting capital, contribution growth, inflation-indexed contributions, start delay / end date, average purchase price, TWR
- [ ] `sim/simulate.ts` — wire metrics + three distinct drawdown concepts (NAV / portfolio / contribution-relative)

## Phase 2 — Historical research
- [ ] `sim/rolling.ts` — horizons 1..50y, percentiles, probability metrics
- [ ] `sim/crashes.ts` — DCA crash experience (units bought, +1y/+3y/+5y, recovery), extra regimes
- [ ] `sim/dataquality.ts` — automated dataset audit
- [ ] `sim/validation.ts` — CAGR/vol/drawdown diffs + calibration modes (theoretical / calibrated / conservative)

## Phase 3 — Probabilistic
- [ ] `sim/rng.ts` — seeded deterministic RNG
- [ ] `sim/montecarlo.ts` — block bootstrap + regime-aware, percentiles, probabilities
- [ ] `workers/mc.worker.ts` — off-main-thread execution
- [ ] route `/forecast` — 50-Year Forecast Lab (3-strategy comparison)

## Phase 4 — Sensitivity Lab
- [ ] `sim/sensitivity.ts` — CAGR × vol × financing cube, stress crash paths, path-dependence demo
- [ ] `sim/investor.ts` — inflation, FX/INR, tax overlay
- [ ] route `/sensitivity`

## Phase 5 — Integration
- [ ] Research dashboard sections
- [ ] `Research Conclusion` panel
- [ ] Assumptions panel + config export everywhere

## Tests
- [ ] vitest suite covering the 12 mandated quantitative tests
