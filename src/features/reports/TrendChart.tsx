import { useMemo, useState } from 'react';
import { fmtRp, fmtRpCompact } from '@/lib/format';
import type { TrendPoint } from '@/lib/business/reports';
import styles from './TrendChart.module.css';

interface TrendChartProps {
  points: TrendPoint[];
}

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

/**
 * Pure-SVG dual line chart (income vs expense) with a hover crosshair. No chart
 * library — keeps the bundle lean and matches the bench aesthetic (mono
 * readouts, tick gauge, brand spine). Responsive via viewBox.
 */
export function TrendChart({ points }: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const { incPath, expPath, max, plotW, plotH, x, yInc, yExp } = useMemo(() => {
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)));
    const n = points.length;
    const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yInc = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const yExp = yInc;
    const toPath = (sel: (p: TrendPoint) => number) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${yInc(sel(p)).toFixed(1)}`).join(' ');
    return {
      incPath: toPath((p) => p.income),
      expPath: toPath((p) => p.expense),
      max,
      plotW,
      plotH,
      x,
      yInc,
      yExp,
    };
  }, [points]);

  if (points.length === 0) return null;

  // Horizontal gridlines at 0/25/50/75/100% of max. Compact labels ("2,45 jt")
  // — full "Rp 2.450.000" overflows PAD.left and rendered clipped.
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD.top + plotH - f * plotH,
    label: fmtRpCompact(Math.round(max * f)),
  }));

  // Show at most ~8 x-axis labels to avoid crowding.
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  const active = hover != null ? points[hover] : null;

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="Grafik tren pemasukan dan pengeluaran"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines + y labels */}
        {gridYs.map((g, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y} className={styles.grid} />
            <text x={PAD.left - 8} y={g.y + 3} className={styles.yLabel} textAnchor="end">
              {g.label}
            </text>
          </g>
        ))}

        {/* x labels */}
        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={x(i)} y={H - 8} className={styles.xLabel} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}

        {/* Area under income for depth */}
        <path
          d={`${incPath} L ${x(points.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`}
          className={styles.incArea}
        />

        {/* Lines */}
        <path d={expPath} className={styles.expLine} fill="none" />
        <path d={incPath} className={styles.incLine} fill="none" />

        {/* Hover hit areas + crosshair */}
        {points.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (plotW / Math.max(1, points.length)) / 2}
            y={PAD.top}
            width={plotW / Math.max(1, points.length)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {active && hover != null && (
          <g>
            <line x1={x(hover)} y1={PAD.top} x2={x(hover)} y2={PAD.top + plotH} className={styles.crosshair} />
            <circle cx={x(hover)} cy={yInc(active.income)} r={4} className={styles.incDot} />
            <circle cx={x(hover)} cy={yExp(active.expense)} r={4} className={styles.expDot} />
          </g>
        )}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <i className={[styles.swatch, styles.incSwatch].join(' ')} /> Pemasukan
        </span>
        <span className={styles.legendItem}>
          <i className={[styles.swatch, styles.expSwatch].join(' ')} /> Pengeluaran
        </span>
        {active && (
          <span className={styles.readout}>
            {active.label}: <strong className={styles.inc}>{fmtRp(active.income)}</strong> ·{' '}
            <strong className={styles.exp}>{fmtRp(active.expense)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
