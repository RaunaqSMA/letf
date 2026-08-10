import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-4 py-6 md:px-8">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-6 md:px-8", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="label-xs">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 cursor-help select-none text-muted-foreground/70">ⓘ</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type MetricTone = "neutral" | "gain" | "loss";

export function Metric({
  label,
  value,
  sub,
  tone = "neutral",
  tip,
  emphasis = false,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: MetricTone;
  tip?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <div className="label-xs flex items-center">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </div>
      <div
        className={cn(
          "num mt-1.5 font-semibold",
          emphasis ? "text-2xl md:text-3xl" : "text-lg md:text-xl",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function DataTypeBadge({ type }: { type: "SYNTHETIC" | "ACTUAL" | "MIXED" }) {
  return (
    <span
      className={cn(
        "num inline-flex items-center border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        type === "ACTUAL"
          ? "border-actual/40 bg-actual/10 text-actual"
          : type === "MIXED"
            ? "border-border bg-muted text-muted-foreground"
            : "border-synthetic/40 bg-synthetic/10 text-synthetic",
      )}
    >
      {type}
    </span>
  );
}

export function Callout({
  tone = "warn",
  title,
  children,
}: {
  tone?: "warn" | "info";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border px-4 py-3 text-sm leading-relaxed",
        tone === "warn"
          ? "border-synthetic/40 bg-synthetic/10 text-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {title ? <div className="label-xs mb-1 text-foreground">{title}</div> : null}
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading market data…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      <p className="num text-xs uppercase tracking-widest">{label}</p>
    </div>
  );
}