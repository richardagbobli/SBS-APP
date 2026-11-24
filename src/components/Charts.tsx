import { useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  compareValue?: number;
  subLabel?: string;
  color?: string;
}

export function BarChartCard({
  title,
  subtitle,
  data,
  maxValue = 100,
  unit = '%',
  benchmark,
  benchmarkLabel,
  primaryLabel = 'Current',
  compareLabel = 'Comparison',
  emptyMessage = 'No assessment data available for this selection.',
}: {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  maxValue?: number;
  unit?: string;
  benchmark?: number;
  benchmarkLabel?: string;
  primaryLabel?: string;
  compareLabel?: string;
  emptyMessage?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const hasCompare = data.some((d) => d.compareValue !== undefined);

  if (data.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="py-12 text-center text-sm text-slate-500">{emptyMessage}</div>
      </div>
    );
  }

  const width = Math.max(540, data.length * (hasCompare ? 78 : 64));
  const height = 238;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 22;
  const padBottom = 48;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const step = plotW / data.length;
  const singleBarW = hasCompare ? Math.min(22, step * 0.34) : Math.min(38, step * 0.56);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(maxValue * r * 10) / 10);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {hasCompare && (
            <div className="flex items-center gap-3 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-900 inline-block" />
                {primaryLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />
                {compareLabel}
              </span>
            </div>
          )}
          {hoveredIdx !== null && data[hoveredIdx] && (
            <div className="font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
              {data[hoveredIdx].label}:{' '}
              <span className="font-semibold text-emerald-900">
                {data[hoveredIdx].value.toFixed(1)}{unit}
              </span>
              {data[hoveredIdx].compareValue !== undefined && (
                <span className="text-slate-500">
                  {' '}vs {data[hoveredIdx].compareValue!.toFixed(1)}{unit} (
                  {data[hoveredIdx].value - data[hoveredIdx].compareValue! >= 0 ? '+' : ''}
                  {(data[hoveredIdx].value - data[hoveredIdx].compareValue!).toFixed(1)})
                </span>
              )}
              {data[hoveredIdx].subLabel ? ` · ${data[hoveredIdx].subLabel}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[460px] h-56 select-none">
          {ticks.map((t) => {
            const y = padTop + plotH - (t / maxValue) * plotH;
            return (
              <g key={t}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x={padLeft - 6} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                  {t}
                </text>
              </g>
            );
          })}

          {benchmark !== undefined && benchmark > 0 && benchmark <= maxValue && (
            <g>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={padTop + plotH - (benchmark / maxValue) * plotH}
                y2={padTop + plotH - (benchmark / maxValue) * plotH}
                stroke="#b45309"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              {benchmarkLabel && (
                <text
                  x={width - padRight}
                  y={padTop + plotH - (benchmark / maxValue) * plotH - 4}
                  textAnchor="end"
                  className="fill-amber-700 text-[10px] font-medium"
                >
                  {benchmarkLabel}
                </text>
              )}
            </g>
          )}

          {data.map((d, i) => {
            const clamped = Math.max(0, Math.min(d.value, maxValue));
            const barH = (clamped / maxValue) * plotH;
            const groupCenter = padLeft + i * step + step / 2;
            const xPrimary = hasCompare ? groupCenter - singleBarW - 2 : groupCenter - singleBarW / 2;
            const yPrimary = padTop + plotH - barH;
            const isHovered = hoveredIdx === i;
            const fill =
              d.color ||
              (hasCompare
                ? '#14532d'
                : clamped >= maxValue * 0.7
                ? '#14532d'
                : clamped >= maxValue * 0.5
                ? '#0f766e'
                : '#b45309');

            const hasCompVal = d.compareValue !== undefined;
            const clampedComp = hasCompVal ? Math.max(0, Math.min(d.compareValue!, maxValue)) : 0;
            const compH = hasCompVal ? (clampedComp / maxValue) * plotH : 0;
            const xComp = groupCenter + 2;
            const yComp = padTop + plotH - compH;

            return (
              <g
                key={d.label + i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => setHoveredIdx(isHovered ? null : i)}
                className="cursor-pointer"
              >
                <rect
                  x={xPrimary}
                  y={yPrimary}
                  width={singleBarW}
                  height={Math.max(2, barH)}
                  rx={3}
                  fill={fill}
                  opacity={hoveredIdx === null || isHovered ? 0.94 : 0.45}
                />
                <text
                  x={xPrimary + singleBarW / 2}
                  y={yPrimary - 5}
                  textAnchor="middle"
                  className="fill-slate-700 text-[10px] font-mono font-medium"
                >
                  {d.value.toFixed(1)}
                </text>

                {hasCompVal && (
                  <>
                    <rect
                      x={xComp}
                      y={yComp}
                      width={singleBarW}
                      height={Math.max(2, compH)}
                      rx={3}
                      fill="#94a3b8"
                      opacity={hoveredIdx === null || isHovered ? 0.85 : 0.4}
                    />
                    <text
                      x={xComp + singleBarW / 2}
                      y={yComp - 5}
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono"
                    >
                      {d.compareValue!.toFixed(1)}
                    </text>
                  </>
                )}

                <text
                  x={groupCenter}
                  y={padTop + plotH + 16}
                  textAnchor="middle"
                  className="fill-slate-600 text-[10px]"
                >
                  {d.label.length > 11 ? `${d.label.slice(0, 10)}…` : d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export interface LineSeries {
  name: string;
  color: string;
  values: Array<number | null>;
}

export function LineTrendChart({
  title,
  subtitle,
  labels,
  series,
  maxValue = 100,
  minValue = 0,
  unit = '%',
  emptyMessage = 'Not enough historical terms to display a trend yet.',
}: {
  title: string;
  subtitle?: string;
  labels: string[];
  series: LineSeries[];
  maxValue?: number;
  minValue?: number;
  unit?: string;
  emptyMessage?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (labels.length === 0 || series.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="py-12 text-center text-sm text-slate-500">{emptyMessage}</div>
      </div>
    );
  }

  const width = Math.max(560, labels.length * 110);
  const height = 228;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const span = maxValue - minValue || 1;

  const getX = (idx: number) =>
    labels.length === 1 ? padLeft + plotW / 2 : padLeft + (idx / (labels.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - minValue) / span) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round((minValue + span * r) * 10) / 10);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {hoveredIdx !== null && labels[hoveredIdx] && (
        <div className="mb-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-800">{labels[hoveredIdx]}:</span>
          {series.map((s) => {
            const val = s.values[hoveredIdx];
            return (
              <span key={s.name} className="font-mono tabular-nums text-slate-700">
                <span style={{ color: s.color }} className="font-semibold">{s.name}:</span>{' '}
                {val !== null && val !== undefined ? `${val.toFixed(1)}${unit}` : '—'}
              </span>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[440px] h-52 select-none">
          {ticks.map((t) => {
            const y = getY(t);
            return (
              <g key={t}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x={padLeft - 6} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                  {t}
                </text>
              </g>
            );
          })}

          {labels.map((lbl, idx) => {
            const x = getX(idx);
            return (
              <g
                key={lbl + idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => setHoveredIdx(hoveredIdx === idx ? null : idx)}
                className="cursor-pointer"
              >
                {hoveredIdx === idx && (
                  <line x1={x} x2={x} y1={padTop} y2={padTop + plotH} stroke="#cbd5e1" strokeDasharray="2 2" />
                )}
                <text
                  x={x}
                  y={padTop + plotH + 18}
                  textAnchor="middle"
                  className={`text-[10px] ${hoveredIdx === idx ? 'fill-slate-900 font-semibold' : 'fill-slate-600'}`}
                >
                  {lbl.length > 18 ? `${lbl.slice(0, 17)}…` : lbl}
                </text>
                <rect x={x - 24} y={padTop} width={48} height={plotH + 24} fill="transparent" />
              </g>
            );
          })}

          {series.map((s) => {
            const pts: Array<{ x: number; y: number; val: number; idx: number }> = [];
            s.values.forEach((v, idx) => {
              if (v !== null && !Number.isNaN(v)) {
                pts.push({ x: getX(idx), y: getY(v), val: v, idx });
              }
            });
            const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            return (
              <g key={s.name} className="pointer-events-none">
                {pts.length > 1 && (
                  <path d={pathD} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {pts.map((p) => (
                  <g key={p.idx}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hoveredIdx === p.idx ? 5.5 : 4}
                      fill="#ffffff"
                      stroke={s.color}
                      strokeWidth="2.2"
                    />
                    <text
                      x={p.x}
                      y={p.y - 8}
                      textAnchor="middle"
                      className="fill-slate-800 text-[10px] font-mono font-medium"
                    >
                      {p.val.toFixed(1)}{unit}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export interface DonutSlice {
  label: string;
  count: number;
  color: string;
}

export function PieDistributionChart({
  title,
  subtitle,
  slices,
  variant = 'pie',
  emptyMessage = 'No grade distribution records yet.',
}: {
  title: string;
  subtitle?: string;
  slices: DonutSlice[];
  variant?: 'pie' | 'donut';
  emptyMessage?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<'pie' | 'donut'>(variant);
  const total = slices.reduce((acc, s) => acc + s.count, 0);

  if (total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="py-12 text-center text-sm text-slate-500">{emptyMessage}</div>
      </div>
    );
  }

  // Pie / Donut geometry
  const cx = 80;
  const cy = 80;
  const outerR = 68;
  const ringR = 54;
  const circumference = 2 * Math.PI * ringR;
  let offset = 0;

  let startAngle = -Math.PI / 2;
  const piePaths = slices.map((s) => {
    const angle = (s.count / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const d =
      slices.length === 1 || angle >= Math.PI * 1.999
        ? ''
        : `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;
    return { ...s, d, isFullCircle: slices.length === 1 || angle >= Math.PI * 1.999 };
  });

  const activeSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded text-[11px]">
          <button
            type="button"
            onClick={() => setMode('pie')}
            className={`px-2 py-0.5 rounded cursor-pointer ${mode === 'pie' ? 'bg-white text-slate-900 shadow-xs font-medium' : 'text-slate-600'}`}
          >
            Pie
          </button>
          <button
            type="button"
            onClick={() => setMode('donut')}
            className={`px-2 py-0.5 rounded cursor-pointer ${mode === 'donut' ? 'bg-white text-slate-900 shadow-xs font-medium' : 'text-slate-600'}`}
          >
            Donut
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-40 h-40 shrink-0">
          {mode === 'pie' ? (
            <svg viewBox="0 0 160 160" className="w-full h-full">
              {piePaths.map((s, idx) =>
                s.isFullCircle ? (
                  <circle
                    key={s.label}
                    cx={cx}
                    cy={cy}
                    r={outerR}
                    fill={s.color}
                    opacity={hoveredIdx === null || hoveredIdx === idx ? 0.94 : 0.45}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer transition-opacity"
                  />
                ) : (
                  <path
                    key={s.label}
                    d={s.d}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    opacity={hoveredIdx === null || hoveredIdx === idx ? 0.94 : 0.45}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer transition-opacity"
                  />
                )
              )}
            </svg>
          ) : (
            <>
              <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                {slices.map((s, idx) => {
                  const frac = s.count / total;
                  const dash = frac * circumference;
                  const segOffset = offset;
                  offset += dash;
                  return (
                    <circle
                      key={s.label}
                      cx={cx}
                      cy={cy}
                      r={ringR}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="22"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-segOffset}
                      opacity={hoveredIdx === null || hoveredIdx === idx ? 0.94 : 0.45}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      className="cursor-pointer transition-opacity"
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {activeSlice ? activeSlice.count : total}
                </span>
                <span className="text-[11px] text-slate-500">
                  {activeSlice ? `${Math.round((activeSlice.count / total) * 100)}%` : 'Records'}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 w-full space-y-2">
          {activeSlice && (
            <div className="text-xs px-2.5 py-1 bg-slate-50 border border-slate-200 rounded font-medium text-slate-800">
              {activeSlice.label}: {activeSlice.count} of {total} ({Math.round((activeSlice.count / total) * 100)}%)
            </div>
          )}
          {slices.map((s, idx) => {
            const pct = Math.round((s.count / total) * 100);
            const active = hoveredIdx === idx;
            return (
              <div
                key={s.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex items-center justify-between text-xs px-1.5 py-0.5 rounded cursor-pointer ${
                  active ? 'bg-slate-100' : ''
                }`}
              >
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                  <span>{s.label}</span>
                </div>
                <span className="font-mono tabular-nums text-slate-900 font-medium">
                  {s.count} <span className="text-slate-400">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const DonutDistributionChart = PieDistributionChart;
