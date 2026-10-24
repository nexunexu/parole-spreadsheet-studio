import { CHART_COLORS, type SheetResult } from "@/lib/sheet-types";

const fmt = (n: number) =>
  Math.abs(n) >= 1e6
    ? (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M"
    : Math.abs(n) >= 1e3
      ? (n / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " k"
      : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function Donut({ data }: { data: NonNullable<SheetResult["donut"]> }) {
  const total = data.items.reduce((s, i) => s + (Number(i.value) || 0), 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--muted)" strokeWidth="22" />
        {data.items.map((it, i) => {
          const len = ((Number(it.value) || 0) / total) * c;
          const el = (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth="22"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              className="transition-all duration-700"
            />
          );
          acc += len;
          return el;
        })}
        <g className="rotate-90" style={{ transformOrigin: "70px 70px" }}>
          <text x="70" y="70" textAnchor="middle" className="fill-foreground text-[15px] font-semibold">
            {data.totalLabel}
          </text>
          <text x="70" y="86" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            Total
          </text>
        </g>
      </svg>
      <ul className="w-full min-w-0 space-y-3 text-xs">
        {data.items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate">{it.label}</span>
            </span>
            <span className="shrink-0 text-muted-foreground">
              {(((Number(it.value) || 0) / total) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineChart({ data }: { data: NonNullable<SheetResult["line"]> }) {
  const W = 300, H = 150, P = 34;
  const all = data.series.flatMap((s) => s.values.map(Number)).filter((v) => !isNaN(v));
  const max = Math.max(...all, 1), min = Math.min(...all, 0);
  const span = max - min || 1;
  const n = Math.max(data.xLabels.length, 2);
  const x = (i: number) => P + (i * (W - P - 6)) / (n - 1);
  const y = (v: number) => H - 18 - ((v - min) / span) * (H - 30);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * span);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-0">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={P - 4} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[7px]">{fmt(t)}</text>
          </g>
        ))}
        {data.xLabels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[7px]">{l}</text>
        ))}
        {data.series.map((s, si) => (
          <polyline
            key={si}
            fill="none"
            stroke={CHART_COLORS[si % CHART_COLORS.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            className="animate-draw"
            points={s.values.map((v, i) => `${x(i)},${y(Number(v) || 0)}`).join(" ")}
          />
        ))}
      </svg>
      <ul className="shrink-0 space-y-3 text-xs sm:w-36">
        {data.series.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="truncate">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
