import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  BookOpen,
  Database,
  Info,
  LineChart,
  SlidersHorizontal,
  TrendingDown,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: Activity, exact: true },
  { to: "/simulator", label: "Simulator", icon: SlidersHorizontal },
  { to: "/compare", label: "Compare", icon: BarChart3 },
  { to: "/crashes", label: "Historical Crashes", icon: TrendingDown },
  { to: "/analysis", label: "Rolling & Start Date", icon: LineChart },
  { to: "/methodology", label: "Methodology", icon: BookOpen },
  { to: "/data", label: "Data", icon: Database },
  { to: "/about", label: "About", icon: Info },
] as const;

function NavItems({ compact = false }: { compact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors",
              compact ? "flex-col gap-1 px-2 py-1.5 text-[10px]" : "",
              active
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            <Icon className={compact ? "size-4" : "size-4 shrink-0"} />
            <span className={compact ? "leading-none" : ""}>
              {compact ? item.label.split(" ")[0] : item.label}
            </span>
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Link to="/" className="border-b border-sidebar-border px-4 py-5">
          <div className="num text-base font-semibold tracking-tight text-foreground">
            LETF <span className="text-primary">DCA</span> Lab
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Geared ETF DCA comparison — historical simulation
          </p>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          <NavItems />
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Research and education only. Not investment advice. Pre-inception results are
            reconstructed simulations, not actual ETF prices.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="num text-sm font-semibold">
            LETF <span className="text-primary">DCA</span> Lab
          </div>
        </header>
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-8 gap-0.5 border-t border-sidebar-border bg-sidebar px-1 py-1.5 lg:hidden">
        <NavItems compact />
      </nav>
    </div>
  );
}