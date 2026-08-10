import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { currency, percent, shortDate } from "@/lib/format";

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--app-font-mono)" };

export interface ChartPoint {
  date: string;
}

/** Downsamples a long series to keep charts responsive. */
export function downsample<T>(rows: T[], max = 900): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]!);
  const last = rows[rows.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function TooltipBox({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  formatter: (key: string, value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="num mb-1 text-muted-foreground">{shortDate(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num">{formatter(String(p.dataKey), Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function PortfolioChart({
  data,
  inceptionDate,
  logScale = false,
  series = [
    { key: "value", name: "Portfolio value", color: "var(--actual)" },
    { key: "contributions", name: "Cumulative contributions", color: "var(--muted-foreground)" },
  ],
}: {
  data: ChartPoint[];
  inceptionDate?: string | null;
  logScale?: boolean;
  series?: { key: string; name: string; color: string }[];
}) {
  const rows = useMemo(() => downsample(data), [data]);
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={48} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={64}
          scale={logScale ? "log" : "auto"}
          domain={logScale ? [1, "auto"] : ["auto", "auto"]}
          allowDataOverflow={logScale}
          tickFormatter={(v: number) => currency(v, { compact: true })}
        />
        <Tooltip content={<TooltipBox formatter={(_k, v) => currency(v)} />} />
        <Legend
          wrapperStyle={{ fontSize: 11, fontFamily: "var(--app-font-mono)", paddingTop: 8 }}
        />
        {inceptionDate ? (
          <ReferenceLine
            x={inceptionDate}
            stroke="var(--synthetic)"
            strokeDasharray="4 4"
            label={{
              value: "Actual ETF inception",
              position: "insideTopLeft",
              fill: "var(--synthetic)",
              fontSize: 10,
              fontFamily: "var(--app-font-mono)",
            }}
          />
        ) : null}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            dot={false}
            strokeWidth={1.6}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({
  data,
  inceptionDate,
  series = [
    { key: "drawdown", name: "DCA portfolio drawdown", color: "var(--loss)" },
    { key: "navDrawdown", name: "ETF NAV drawdown", color: "var(--synthetic)" },
  ],
  height = 260,
}: {
  data: ChartPoint[];
  inceptionDate?: string | null;
  series?: { key: string; name: string; color: string }[];
  height?: number;
}) {
  const rows = useMemo(() => downsample(data), [data]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={48} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[-1, 0]}
          ticks={[0, -0.2, -0.4, -0.6, -0.8, -1]}
          tickFormatter={(v: number) => percent(v, 0)}
        />
        <Tooltip content={<TooltipBox formatter={(_k, v) => percent(v, 2)} />} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--app-font-mono)", paddingTop: 8 }} />
        {inceptionDate ? (
          <ReferenceLine x={inceptionDate} stroke="var(--synthetic)" strokeDasharray="4 4" />
        ) : null}
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.12}
            strokeWidth={1.4}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}