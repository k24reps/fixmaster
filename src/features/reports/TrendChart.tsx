import { useMemo, useState } from 'react';
import { fmtRp, fmtRpCompact } from '@/lib/format';
import { trendGeometry, type TrendPoint } from '@/lib/business/reports';
import { useT } from '@/i18n';
import styles from './TrendChart.module.css';

interface TrendChartProps {
  points: TrendPoint[];
}

/**
 * Pure-SVG dual line chart (income vs expense) with a hover crosshair. No chart
 * library — keeps the bundle lean and matches the bench aesthetic (mono
 * readouts, tick gauge, brand spine). Responsive via viewBox.
 *
 * Geometrinya datang dari `trendGeometry`, yang juga dipakai grafik di laporan
 * PDF — supaya keduanya tidak bisa menggambar bentuk yang berbeda.
 */
export function TrendChart({ points }: TrendChartProps) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => trendGeometry(points), [points]);

  if (points.length === 0) return null;

  const { width: W, height: H, pad: PAD, plotW, plotH, x, y: yInc } = g;
  const yExp = yInc;
  // Compact gridline labels ("2,45 jt") — full "Rp 2.450.000" overflows
  // PAD.left and renders clipped.
  const gridYs = g.gridYs.map((row) => ({ y: row.y, label: fmtRpCompact(row.value) }));

  const active = hover != null ? points[hover] : null;

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={t('reports.chartAria')}
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
        {g.xLabels.map((l) => (
          <text key={l.x} x={l.x} y={H - 8} className={styles.xLabel} textAnchor="middle">
            {l.label}
          </text>
        ))}

        {/* Hari yang belum terjadi: diarsir, bukan digambar sebagai nol. */}
        {g.nowX != null && (
          <g>
            <rect
              x={g.nowX}
              y={PAD.top}
              width={W - PAD.right - g.nowX}
              height={plotH}
              className={styles.future}
            />
            <line x1={g.nowX} y1={PAD.top} x2={g.nowX} y2={PAD.top + plotH} className={styles.nowLine} />
          </g>
        )}

        {/* Area under income for depth */}
        <path d={g.incArea} className={styles.incArea} />

        {/* Lines */}
        <path d={g.expPath} className={styles.expLine} fill="none" />
        <path d={g.incPath} className={styles.incLine} fill="none" />

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
            {!active.future && (
              <>
                <circle cx={x(hover)} cy={yInc(active.income)} r={4} className={styles.incDot} />
                <circle cx={x(hover)} cy={yExp(active.expense)} r={4} className={styles.expDot} />
              </>
            )}
          </g>
        )}
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <i className={[styles.swatch, styles.incSwatch].join(' ')} /> {t('reports.pemasukan')}
        </span>
        <span className={styles.legendItem}>
          <i className={[styles.swatch, styles.expSwatch].join(' ')} /> {t('reports.pengeluaran')}
        </span>
        {g.nowX != null && (
          <span className={styles.legendItem}>
            <i className={[styles.swatch, styles.futureSwatch].join(' ')} /> {t('reports.chartFuture')}
          </span>
        )}
        {active && (
          <span className={styles.readout}>
            {active.label}:{' '}
            {active.future ? (
              t('reports.chartFuture')
            ) : (
              <>
                <strong className={styles.inc}>{fmtRp(active.income)}</strong> ·{' '}
                <strong className={styles.exp}>{fmtRp(active.expense)}</strong>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
