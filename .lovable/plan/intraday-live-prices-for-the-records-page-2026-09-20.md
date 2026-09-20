# Intraday (live) prices for the Records page

## Goal
The Records dashboard reflects near-real-time prices during US market hours, while research charts and the simulator keep the official one-day-lagged daily close.

## Changes

1. **Quote feed includes a live price**
   - Extend `src/routes/api/public/quotes.ts`: read Yahoo's `regularMarketPrice` / `regularMarketTime` from the chart response and return `livePrice` + `liveTime` per symbol alongside the existing daily history.
   - Keep the daily series one-day-lagged exactly as today.

2. **Market data top-up adds live prices for built-in tickers**
   - Extend `src/routes/api/public/market-latest.ts` to also return `livePrice`/`liveTime` for TQQQ, SPXL, QQQ, SPY, NDX, SPX.
   - The merged daily history in `src/lib/market/loader.ts` stays unchanged (close-only, one-day lag).

3. **Records page uses the live price when available**
   - `src/lib/portfolio/quotes.ts` and `prices.ts`: expose the live price where present.
   - `src/routes/records.tsx` (+ HoldingsTable/PortfolioSummary): value holdings at the live price during market hours, falling back to last close otherwise.
   - Clear labeling: holdings valued intraday show a small "Live" marker with the quote time (e.g. "Live · 14:32 ET"); after close it reads as the official close. Never mix without labeling.
   - The value-over-time chart stays daily-close based (historical series); only the latest point may reflect the live price, marked as such.

4. **Scope guardrails**
   - Simulator, research charts, crashes, forecast: untouched — they continue to use one-day-lagged daily closes only.
   - Cache stays short (existing 5–30 min) so prices refresh without publishing.

## Verification
- Build passes; existing tests pass.
- Hit `/api/public/quotes?symbols=NVDA` and confirm `livePrice` appears.
- Browser check of /records: NVDA holding shows live value with the "Live" marker during market hours.
