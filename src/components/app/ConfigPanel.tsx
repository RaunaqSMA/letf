import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { INSTRUMENTS, type InstrumentId } from "@/lib/market/types";
import { FINANCING_MODEL_META } from "@/lib/sim/financing";
import { useSimulation } from "@/lib/sim/store";
import type { FinancingModelId, Frequency } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { InfoTip } from "./primitives";

const PRESET_AMOUNTS = [10, 50, 100, 500, 1000];

function Field({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="label-xs flex items-center">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  tip,
  checked,
  onChange,
}: {
  label: string;
  tip?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-border bg-card px-3 py-2.5">
      <span className="flex items-center text-sm">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function ConfigPanel({ onRun }: { onRun?: () => void }) {
  const { config, setConfig, resetConfig, latestDate } = useSimulation();
  const inst = INSTRUMENTS[config.instrument];

  const setInstrument = (id: InstrumentId) => {
    const next = INSTRUMENTS[id];
    setConfig({
      instrument: id,
      expenseRatio: next.expenseRatio,
      financingSpread: next.financingSpread,
    });
  };

  return (
    <div className="space-y-5">
      <Field label="Instrument">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(INSTRUMENTS) as InstrumentId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setInstrument(id)}
              className={cn(
                "num border px-3 py-2.5 text-left text-sm transition-colors",
                config.instrument === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="font-semibold">{id}</div>
              <div className="mt-0.5 text-[10px] leading-tight">
                inception {INSTRUMENTS[id].inception}
              </div>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Underlying" tip="Determined by the instrument. A total-return proxy includes dividends; the price index does not.">
        <Select
          value={config.underlyingMode}
          onValueChange={(v) => setConfig({ underlyingMode: v as "total_return" | "price_index" })}
        >
          <SelectTrigger className="num">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total_return">{inst.underlyingTRLabel}</SelectItem>
            <SelectItem value="price_index">{inst.underlyingIndexLabel}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Contribution">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setConfig({ contribution: a })}
              className={cn(
                "num border px-2.5 py-1 text-xs",
                config.contribution === a
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              ${a}
            </button>
          ))}
        </div>
        <Input
          type="number"
          min={1}
          className="num mt-2"
          value={config.contribution}
          onChange={(e) => setConfig({ contribution: Math.max(1, Number(e.target.value) || 0) })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <Select value={config.frequency} onValueChange={(v) => setConfig({ frequency: v as Frequency })}>
            <SelectTrigger className="num">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="once">One-time</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timing">
          <Select value={config.timing} onValueChange={(v) => setConfig({ timing: v as "first" | "last" })}>
            <SelectTrigger className="num">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">First trading day</SelectItem>
              <SelectItem value="last">Last trading day</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <Input
            type="date"
            className="num"
            value={config.startDate}
            min="1999-01-04"
            max={latestDate}
            onChange={(e) => setConfig({ startDate: e.target.value })}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            className="num"
            value={config.endDate}
            min="1999-01-04"
            max={latestDate}
            onChange={(e) => setConfig({ endDate: e.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <Toggle
          label="Use synthetic pre-inception history"
          tip="Reconstructs the fund before it existed by applying daily 3x leverage to the underlying. Modelled, not actual."
          checked={config.useSyntheticHistory}
          onChange={(v) => setConfig({ useSyntheticHistory: v })}
        />
        <Toggle
          label="Use actual ETF data after inception"
          tip="Switches to the fund's real total-return history from its inception date onward."
          checked={config.useActualHistory}
          onChange={(v) => setConfig({ useActualHistory: v })}
        />
        <Toggle
          label="Reinvest distributions"
          tip="Total-return basis. Underlying and ETF series use dividend-adjusted closes."
          checked={config.reinvestDistributions}
          onChange={(v) => setConfig({ reinvestDistributions: v })}
        />
      </div>

      <Field label="Financing model" tip="3x exposure means roughly 2x of your capital is borrowed. That borrowing is not free.">
        <Select
          value={config.financingModel}
          onValueChange={(v) => setConfig({ financingModel: v as FinancingModelId })}
        >
          <SelectTrigger className="num">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FINANCING_MODEL_META) as FinancingModelId[]).map((id) => (
              <SelectItem key={id} value={id}>
                {FINANCING_MODEL_META[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          {FINANCING_MODEL_META[config.financingModel].description}
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {config.financingModel === "fixed" ? (
          <Field label="Fixed rate %">
            <Input
              type="number"
              step="0.05"
              className="num"
              value={(config.fixedFinancingRate * 100).toFixed(2)}
              onChange={(e) => setConfig({ fixedFinancingRate: Number(e.target.value) / 100 })}
            />
          </Field>
        ) : (
          <Field label="Financing spread %">
            <Input
              type="number"
              step="0.05"
              className="num"
              disabled={config.financingModel === "none" || config.financingModel === "riskfree"}
              value={(config.financingSpread * 100).toFixed(2)}
              onChange={(e) => setConfig({ financingSpread: Number(e.target.value) / 100 })}
            />
          </Field>
        )}
        <Field label="Expense ratio %" tip="Annual fund expenses, charged on the whole NAV and separate from financing.">
          <Input
            type="number"
            step="0.01"
            className="num"
            value={(config.expenseRatio * 100).toFixed(2)}
            onChange={(e) => setConfig({ expenseRatio: Number(e.target.value) / 100 })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Transaction cost" tip="Flat cost deducted from each contribution before units are bought.">
          <Input
            type="number"
            step="0.5"
            min={0}
            className="num"
            value={config.transactionCost}
            onChange={(e) => setConfig({ transactionCost: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Leverage" tip="Daily target multiple. 3x for both funds studied here.">
          <Input
            type="number"
            step="0.5"
            min={1}
            max={5}
            className="num"
            value={config.leverage}
            onChange={(e) => setConfig({ leverage: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </Field>
      </div>

      <div className="flex gap-2 pt-1">
        <Button className="num flex-1 font-semibold" onClick={onRun}>
          RUN SIMULATION
        </Button>
        <Button variant="outline" size="icon" onClick={resetConfig} aria-label="Reset to defaults">
          <RotateCcw className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Results update as you change inputs; the button re-runs and scrolls to the output.
      </p>
    </div>
  );
}