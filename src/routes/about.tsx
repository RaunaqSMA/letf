import { createFileRoute, Link } from "@tanstack/react-router";

import { Callout, PageHeader, Section } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — LETF DCA Lab" },
      {
        name: "description",
        content:
          "What this leveraged ETF DCA research tool is for, who it is for, and the disclaimers that come with it.",
      },
      { property: "og:title", content: "About — LETF DCA Lab" },
      {
        property: "og:description",
        content: "A quantitative sandbox for studying geared ETF dollar-cost averaging honestly.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div>
      <PageHeader
        title="About"
        subtitle="A research sandbox for one narrow question: what actually happened to someone who put a fixed amount into a 3x leveraged ETF every month and never stopped?"
      />

      <Section title="Why it exists">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Most leveraged-ETF backtests you find online make one of two mistakes: they multiply
            long-run index returns by three, or they quietly splice reconstructed pre-inception data
            into real fund history without saying so. Both produce numbers that are far too
            flattering.
          </p>
          <p>
            This tool does neither. Leverage compounds daily, financing and expenses are charged
            explicitly, and every value is labelled as either reconstructed or actual. The answer it
            gives is sometimes spectacular and sometimes grim — which is the point.
          </p>
        </div>
      </Section>

      <Section title="How to use it">
        <div className="grid max-w-4xl gap-3 md:grid-cols-2">
          {[
            {
              to: "/simulator" as const,
              title: "Simulator",
              body: "Set the fund, schedule, financing model and fees, then read the full contribution ledger.",
            },
            {
              to: "/crashes" as const,
              title: "Historical crashes",
              body: "See the dot-com bust, 2008, COVID and 2022 measured on your own configuration.",
            },
            {
              to: "/analysis" as const,
              title: "Rolling analysis",
              body: "Check how much of the outcome was decided by your starting month rather than skill.",
            },
            {
              to: "/data" as const,
              title: "Data & validation",
              body: "Inspect coverage and how closely the reconstruction tracks the real fund.",
            },
          ].map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="border border-border bg-card px-4 py-3 transition-colors hover:border-primary"
            >
              <div className="label-xs text-foreground">{c.title}</div>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Disclaimer" className="pb-12">
        <div className="max-w-3xl space-y-4">
          <Callout title="Not investment advice">
            This site is a quantitative simulation for research and education. Historical and
            simulated results are not predictive. Geared ETFs are designed as short-term trading
            instruments; holding one for decades exposes you to volatility decay, financing costs
            and the real possibility of near-total loss. Nothing here accounts for your taxes,
            circumstances or risk tolerance.
          </Callout>
          <Button asChild variant="outline">
            <Link to="/methodology">Read the full methodology</Link>
          </Button>
        </div>
      </Section>
    </div>
  );
}