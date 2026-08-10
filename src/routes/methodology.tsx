import { createFileRoute } from "@tanstack/react-router";

import { Callout, PageHeader, Section } from "@/components/app/primitives";
import { FINANCING_MODEL_META } from "@/lib/sim/financing";
import { INSTRUMENTS } from "@/lib/market/types";
import { percent } from "@/lib/format";
import type { FinancingModelId } from "@/lib/sim/types";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — LETF DCA Lab" },
      {
        name: "description",
        content:
          "Daily-reset leverage maths, financing models, expense drag, synthetic reconstruction rules and known limitations.",
      },
      { property: "og:title", content: "Methodology — LETF DCA Lab" },
      {
        property: "og:description",
        content: "The exact daily-reset formula, cost model and reconstruction rules used here.",
      },
    ],
  }),
  component: MethodologyPage,
});

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
      {children}
    </div>
  );
}

function Formula({ children }: { children: string }) {
  return (
    <pre className="num overflow-x-auto border border-border bg-card px-4 py-3 text-xs text-foreground">
      {children}
    </pre>
  );
}

function MethodologyPage() {
  return (
    <div>
      <PageHeader
        title="Methodology"
        subtitle="Everything the simulator does, written out so the results can be checked rather than trusted."
      />

      <Section title="Daily reset leverage">
        <Prose>
          <p>
            A geared ETF targets its multiple <strong>each day</strong>, not over your holding
            period. The fund NAV is therefore compounded one day at a time:
          </p>
          <Formula>{`NAV_t = NAV_(t-1) × (1 + L × r_t − financing_t − expense_t)

r_t         = underlying total-return for day t
L           = daily target leverage (3 for TQQQ and SPXL)
financing_t = (L − 1) × annual_financing_rate_t / 252
expense_t   = expense_ratio / 252`}</Formula>
          <p>
            This is the single most important modelling choice on this site. Multiplying a long-run
            index return by three is wrong and materially overstates outcomes: the path matters.
            Volatility drag falls out of the daily compounding automatically — no separate fudge
            term is applied.
          </p>
        </Prose>
      </Section>

      <Section title="Financing cost">
        <Prose>
          <p>
            Three times exposure means roughly two units of borrowed exposure per unit of capital,
            funded through swaps and futures. That cost is charged on the borrowed portion only,
            <strong> (L − 1)</strong> of NAV, and accrues on trading days.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            {(Object.keys(FINANCING_MODEL_META) as FinancingModelId[]).map((id) => (
              <li key={id}>
                <strong>{FINANCING_MODEL_META[id].label}</strong> — {FINANCING_MODEL_META[id].description}
              </li>
            ))}
          </ul>
          <p>
            The risk-free leg uses the 13-week US Treasury bill yield (^IRX) for the date in
            question, held flat across non-trading days. The default spread is a fund-level
            estimate, not a disclosed figure.
          </p>
        </Prose>
      </Section>

      <Section title="Fund assumptions">
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="label-xs px-3 py-2 text-left">Fund</th>
                <th className="label-xs px-3 py-2 text-left">Underlying (default)</th>
                <th className="label-xs px-3 py-2 text-left">Inception</th>
                <th className="label-xs px-3 py-2 text-right">Expense ratio</th>
                <th className="label-xs px-3 py-2 text-right">Assumed spread</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(INSTRUMENTS).map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="num px-3 py-2 font-semibold">{i.id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{i.underlyingTRLabel}</td>
                  <td className="num px-3 py-2">{i.inception}</td>
                  <td className="num px-3 py-2 text-right">{percent(i.expenseRatio, 2)}</td>
                  <td className="num px-3 py-2 text-right">{percent(i.financingSpread, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Synthetic vs actual data">
        <Prose>
          <p>
            Before a fund existed, its NAV is <strong>reconstructed</strong> by applying the daily
            formula above to the underlying total-return proxy. These values are labelled
            SYNTHETIC everywhere they appear. From inception onward the simulator can use the
            fund&apos;s <strong>actual</strong> dividend-adjusted history instead, labelled ACTUAL.
          </p>
          <p>
            The Data page quantifies how closely the reconstruction tracks the real fund over the
            overlapping period. Tracking is good but not perfect, which is exactly why the two are
            never blended silently.
          </p>
        </Prose>
      </Section>

      <Section title="DCA and XIRR">
        <Prose>
          <p>
            Contributions land on the first or last trading day of each period, buy fractional
            units at that day&apos;s NAV, and are reduced by any transaction cost first. Portfolio
            value on any day is cumulative units × NAV.
          </p>
          <p>
            Headline performance is reported as <strong>XIRR</strong> — the money-weighted
            annualised rate that discounts every contribution and the final value to zero, solved
            by bisection. A time-weighted return would flatter a DCA plan by ignoring when the
            money actually arrived.
          </p>
        </Prose>
      </Section>

      <Section title="Known limitations" className="pb-12">
        <Callout title="Read this before quoting any number here">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>No taxes, no brokerage spreads, no slippage, no currency conversion costs.</li>
            <li>
              Financing spreads are estimates. Real swap financing varies by counterparty, term and
              market stress — often widening precisely when it hurts most.
            </li>
            <li>
              Synthetic history assumes the fund could always obtain 3x exposure. In 2008 and March
              2020, exposure was genuinely difficult and expensive to source.
            </li>
            <li>
              Total-return proxies (QQQ, SPY) begin in 1999 and 1993; index start dates constrain
              how far back the simulation can run.
            </li>
            <li>
              Survivorship: TQQQ and SPXL still exist. Many geared funds were closed after severe
              drawdowns, and closures are not modelled.
            </li>
            <li>Research and education only. Nothing here is investment advice.</li>
          </ul>
        </Callout>
      </Section>
    </div>
  );
}