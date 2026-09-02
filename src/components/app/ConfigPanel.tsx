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
import type { CalibrationMode, FinancingModelId, Frequency, StressTrigger } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { CustomEntriesDialog } from "./CustomEntriesDialog";
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
              <SelectItem value="custom">Custom (my records)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timing" tip="Ignored in custom mode — your recorded dates are used.">
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

      {config.frequency === "custom" ? (
        <Field
          label="My purchase record"
          tip="Manually track every buy you made. Saved in this browser."
        >
          <CustomEntriesDialog
            entries={config.customEntries}
            onChange={(customEntries) => setConfig({ customEntries })}
            minDate="1999-01-04"
            maxDate={latestDate}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {config.customEntries.length === 0
              ? "No purchases recorded yet — add entries to run the simulation."
              : `${config.customEntries.length} purchases · $${config.customEntries
                  .reduce((s, e) => s + e.amount, 0)
                  .toLocaleString("en-US")} total`}
          </p>
        </Field>
      ) : null}

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

      {config.financingModel === "stress" ? (
        <div className="space-y-3 border border-border bg-card p-3">
          <div className="label-xs">Stress financing</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Base %">
              <Input
                type="number"
                step="0.05"
                className="num"
                value={(config.stressFinancing.baseSpread * 100).toFixed(2)}
                onChange={(e) =>
                  setConfig({
                    stressFinancing: {
                      ...config.stressFinancing,
                      baseSpread: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </Field>
            <Field label="Crisis %">
              <Input
                type="number"
                step="0.05"
                className="num"
                value={(config.stressFinancing.crisisSpread * 100).toFixed(2)}
                onChange={(e) =>
                  setConfig({
                    stressFinancing: {
                      ...config.stressFinancing,
                      crisisSpread: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </Field>
            <Field label="Extreme %">
              <Input
                type="number"
                step="0.05"
                className="num"
                value={(config.stressFinancing.extremeSpread * 100).toFixed(2)}
                onChange={(e) =>
                  setConfig({
                    stressFinancing: {
                      ...config.stressFinancing,
                      extremeSpread: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </Field>
          </div>
          <Field label="Trigger" tip="What escalates the spread: how far the underlying is below its peak, or its trailing volatility.">
            <Select
              value={config.stressFinancing.trigger}
              onValueChange={(v) =>
                setConfig({
                  stressFinancing: { ...config.stressFinancing, trigger: v as StressTrigger },
                })
              }
            >
              <SelectTrigger className="num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="underlying_drawdown">Underlying drawdown</SelectItem>
                <SelectItem value="trailing_volatility">Trailing volatility</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Crisis level %">
              <Input
                type="number"
                step="1"
                className="num"
                value={(config.stressFinancing.crisisLevel * 100).toFixed(0)}
                onChange={(e) =>
                  setConfig({
                    stressFinancing: {
                      ...config.stressFinancing,
                      crisisLevel: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </Field>
            <Field label="Extreme level %">
              <Input
                type="number"
                step="1"
                className="num"
                value={(config.stressFinancing.extremeLevel * 100).toFixed(0)}
                onChange={(e) =>
                  setConfig({
                    stressFinancing: {
                      ...config.stressFinancing,
                      extremeLevel: Number(e.target.value) / 100,
                    },
                  })
                }
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Financing shift %"
          tip="Parallel shift on the financing rate — the sensitivity ladder the methodology requires."
        >
          <Input
            type="number"
            step="0.5"
            className="num"
            value={(config.financingShift * 100).toFixed(2)}
            onChange={(e) => setConfig({ financingShift: Number(e.target.value) / 100 })}
          />
        </Field>
        <Field
          label="Slippage drag %"
          tip="Annualised rebalancing and tracking drag applied to synthetic days only, where no real fund existed."
        >
          <Input
            type="number"
            step="0.05"
            min={0}
            className="num"
            value={(config.slippageDrag * 100).toFixed(2)}
            onChange={(e) => setConfig({ slippageDrag: Math.max(0, Number(e.target.value) / 100) })}
          />
        </Field>
      </div>

      <Field
        label="Synthetic calibration"
        tip="Theoretical uses the raw equation. Calibrated subtracts the drag implied by the overlap with the real fund. Conservative adds a further penalty."
      >
        <Select
          value={config.calibrationMode}
          onValueChange={(v) => setConfig({ calibrationMode: v as CalibrationMode })}
        >
          <SelectTrigger className="num">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="theoretical">Theoretical (no adjustment)</SelectItem>
            <SelectItem value="calibrated">Calibrated to actual fund</SelectItem>
            <SelectItem value="conservative">Conservative (extra drag)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starting capital" tip="A one-off lump sum invested on the first trading day of the window.">
          <Input
            type="number"
            min={0}
            step="100"
            className="num"
            value={config.startingCapital}
            onChange={(e) => setConfig({ startingCapital: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Contribution growth %" tip="Annual increase in the recurring contribution. Ignored when contributions are inflation-indexed.">
          <Input
            type="number"
            step="0.5"
            className="num"
            disabled={config.indexContributionsToInflation}
            value={(config.contributionGrowth * 100).toFixed(2)}
            onChange={(e) => setConfig({ contributionGrowth: Number(e.target.value) / 100 })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Inflation %" tip="Used for real-terms reporting and, optionally, to index contributions.">
          <Input
            type="number"
            step="0.1"
            className="num"
            value={(config.inflationRate * 100).toFixed(2)}
            onChange={(e) => setConfig({ inflationRate: Number(e.target.value) / 100 })}
          />
        </Field>
        <Field label="Contributions from" tip="Leave blank to start with the simulation window.">
          <Input
            type="date"
            className="num"
            min="1999-01-04"
            max={latestDate}
            value={config.contributionStartDate}
            onChange={(e) => setConfig({ contributionStartDate: e.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <Toggle
          label="Index contributions to inflation"
          tip="Raises each contribution with assumed inflation, keeping the real amount invested constant."
          checked={config.indexContributionsToInflation}
          onChange={(v) => setConfig({ indexContributionsToInflation: v })}
        />
        <Toggle
          label="Clip extreme daily returns"
          tip="Off by default. The engine should not silently hide the days that would have destroyed the fund."
          checked={config.clipExtremeReturns}
          onChange={(v) => setConfig({ clipExtremeReturns: v })}
        />
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