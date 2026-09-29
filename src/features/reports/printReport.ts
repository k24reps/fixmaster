import { openPrintWindow, escapeHtml } from '@/lib/print';
import { fmtRp, fmtRpCompact, fmtPercent } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { trendGeometry } from '@/lib/business/reports';
import {
  overheadBreakdown,
  categoryLabel,
  EXPENSE_GROUPS,
  EXPENSE_GROUP_LABEL,
  expenseGroupOf,
  breakEvenVerdict,
  type BreakEven,
} from '@/lib/business/overhead';
import { translate, type TranslationKey } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { interpolate } from '@/lib/business/notify';
import type {
  TrendPoint,
  CategoryProfit,
  PartUsage,
  FunnelStage,
  OutletStat,
  Receivable,
  TxnRow,
  PeriodComparison,
} from '@/lib/business/reports';
import type { TechStat } from '@/lib/business/dashboard';
import type { InventoryItem, Organization } from '@/data/types';

/**
 * Laporan A4 untuk dicetak atau disimpan sebagai PDF.
 *
 * Kenapa lewat dialog cetak browser dan bukan pustaka PDF: teksnya tetap
 * vektor — bisa dicari, disalin, dan diseleksi — grafiknya tetap SVG, ukuran
 * bundle tidak bertambah sama sekali, dan hasilnya mengikuti pengaturan kertas
 * pengguna. Pustaka PDF di klien akan menukar semua itu dengan ~300KB dan
 * tipografi yang lebih buruk.
 *
 * Dokumen ini punya pembaca yang berbeda dari nota servis: bukan pelanggan di
 * konter, melainkan pemilik yang mengarsipkan bulanannya atau akuntan yang
 * memeriksanya. Karena itu ia A4 dan berkop, bukan kertas termal — tapi
 * hierarkinya sama: identitas TOKO di atas, FixMaster satu baris di kaki.
 */

/** Warna tinta. Literal, dan itu disengaja — lihat penjelasan di `@/lib/print`. */
const INK = {
  text: '#14110c',
  muted: '#6b6259',
  faint: '#9a9189',
  rule: '#ddd6cc',
  ruleSoft: '#efeae2',
  /* brand-700: amber merek dinaikkan kepekatannya supaya terbaca di atas kertas putih. */
  brand: '#c0750a',
  brandSoft: '#fdf3e0',
  income: '#0f7a52',
  expense: '#b3261e',
};

const A4_STYLE = `
  @page { size: A4 portrait; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    color: ${INK.text};
    background: #fff;
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 9.5pt;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    /* Bar, chip, dan arsiran grafik membawa makna, bukan hiasan: tanpa ini
       browser membuang seluruh latar saat mencetak dan grafiknya jadi kosong. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .num, .money, td.num, th.num {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }

  /* ---------- Kop ---------- */
  .head { display: flex; align-items: flex-start; gap: 14px; }
  .logo { width: 46px; height: 46px; object-fit: contain; flex: 0 0 auto; }
  .shop { flex: 1 1 auto; min-width: 0; }
  .shop h1 { margin: 0; font-size: 15pt; font-weight: 800; letter-spacing: -0.01em; }
  .shop p { margin: 2px 0 0; font-size: 8.5pt; color: ${INK.muted}; }
  .doctype { text-align: right; flex: 0 0 auto; }
  .doctype .kind {
    font-size: 7.5pt; letter-spacing: 0.16em; color: ${INK.brand}; font-weight: 700;
  }
  .doctype .period { font-size: 10.5pt; font-weight: 700; margin-top: 2px; }
  .doctype .scope { font-size: 8pt; color: ${INK.muted}; }
  .rule { height: 2px; background: ${INK.brand}; margin: 9px 0 0; }
  .rule-soft { height: 1px; background: ${INK.rule}; margin: 0 0 14px; }

  /* ---------- Vonis ---------- */
  .verdict {
    background: ${INK.brandSoft};
    border-left: 3px solid ${INK.brand};
    padding: 9px 12px;
    margin-bottom: 14px;
    break-inside: avoid;
  }
  .verdict .line { font-size: 12pt; font-weight: 700; letter-spacing: -0.01em; }
  .verdict .src { font-size: 8pt; color: ${INK.muted}; margin-top: 3px; }

  /* ---------- KPI ---------- */
  .kpis { display: flex; gap: 8px; margin-bottom: 14px; break-inside: avoid; }
  .kpi { flex: 1 1 0; border: 1px solid ${INK.rule}; padding: 8px 10px; }
  .kpi .label { font-size: 7pt; letter-spacing: 0.14em; color: ${INK.muted}; text-transform: uppercase; }
  .kpi .value { font-size: 13pt; font-weight: 700; margin-top: 3px; }
  .kpi .delta { font-size: 7.5pt; color: ${INK.muted}; margin-top: 1px; }
  .up { color: ${INK.income}; }
  .down { color: ${INK.expense}; }

  /* ---------- Bagian ---------- */
  section { margin-bottom: 13px; break-inside: avoid; }
  section.flow { break-inside: auto; }
  h2 {
    font-size: 8pt; letter-spacing: 0.15em; text-transform: uppercase;
    color: ${INK.brand}; font-weight: 700;
    margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid ${INK.rule};
  }
  h2 .count { color: ${INK.faint}; letter-spacing: 0; font-weight: 600; }
  .cols { display: flex; gap: 14px; align-items: flex-start; }
  .cols > * { flex: 1 1 0; min-width: 0; }
  .note { font-size: 7.5pt; color: ${INK.muted}; margin: 4px 0 0; }
  .empty { font-size: 8.5pt; color: ${INK.faint}; font-style: italic; }

  /* ---------- Tabel ---------- */
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th {
    font-size: 7pt; letter-spacing: 0.1em; text-transform: uppercase;
    color: ${INK.muted}; font-weight: 600; text-align: left;
    padding: 3px 4px; border-bottom: 1px solid ${INK.rule}; white-space: nowrap;
  }
  td { padding: 3px 4px; border-bottom: 1px solid ${INK.ruleSoft}; vertical-align: top; }
  th.r, td.r { text-align: right; }
  /* Nominal tidak boleh patah: di lebar A4 kolom uang sempit, dan "Rp" pernah
     jatuh ke baris sendiri terpisah dari angkanya. */
  td.num, th.num { white-space: nowrap; }
  tr { break-inside: avoid; }
  tfoot td { border-top: 1px solid ${INK.rule}; border-bottom: none; font-weight: 700; padding-top: 5px; }

  /* ---------- Bar ---------- */
  .bar-track { height: 4px; background: ${INK.ruleSoft}; margin-top: 2px; }
  .bar-fill { height: 4px; background: ${INK.brand}; }
  .bar-fill.inc { background: ${INK.income}; }
  .bar-fill.exp { background: ${INK.expense}; }

  /* ---------- Break-even ---------- */
  .be { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .be .pct { font-size: 13pt; font-weight: 700; }
  .be-verdict { margin: 0 0 6px; padding: 4px 8px; border-left: 2px solid ${INK.muted}; font-weight: 600; }
  .be-verdict small { display: block; font-weight: 400; color: ${INK.muted}; }
  .grp { display: flex; justify-content: space-between; margin: 6px 0 2px; font-size: 7pt;
    letter-spacing: 0.06em; text-transform: uppercase; color: ${INK.muted}; }

  /* ---------- Grafik ---------- */
  .chart svg { width: 100%; height: auto; }
  .legend { display: flex; gap: 14px; font-size: 7.5pt; color: ${INK.muted}; margin-top: 4px; }
  .swatch { display: inline-block; width: 14px; height: 2px; vertical-align: middle; margin-right: 4px; }

  /* ---------- Kaki berulang tiap halaman ---------- */
  .foot {
    position: fixed; bottom: -11mm; left: 0; right: 0;
    display: flex; justify-content: space-between;
    font-size: 7pt; color: ${INK.faint};
    border-top: 1px solid ${INK.ruleSoft}; padding-top: 3px;
  }
`;

export interface ReportDocData {
  org: Organization;
  from: string;
  to: string;
  scopeLabel: string;
  verdict: { headline: string; source: string };
  summary: { income: number; expense: number; net: number };
  comparison: PeriodComparison;
  noBaseline: boolean;
  salesTotal: number;
  breakEven: BreakEven | null;
  trend: TrendPoint[];
  incomeByCategory: [string, number][];
  expenseByCategory: [string, number][];
  catProfit: CategoryProfit[];
  partUsage: PartUsage[];
  restock: InventoryItem[];
  funnel: FunnelStage[];
  turnaround: number;
  leaderboard: TechStat[];
  outletStats: OutletStat[];
  receivables: Receivable[];
  txnRows: TxnRow[];
}

const esc = escapeHtml;

/** Satu bagian bertajuk; `empty` menggantikan isi ketika datanya kosong. */
function section(title: string, body: string, o: { count?: string; flow?: boolean } = {}): string {
  return `<section${o.flow ? ' class="flow"' : ''}>
    <h2>${esc(title)}${o.count ? ` <span class="count">${esc(o.count)}</span>` : ''}</h2>
    ${body}
  </section>`;
}

function empty(text: string): string {
  return `<p class="empty">${esc(text)}</p>`;
}

/** Baris "label + nominal + bar proporsional" — bentuk yang sama dengan di layar. */
function barRows(
  rows: { label: string; value: number; display: string }[],
  max: number,
  tone: 'inc' | 'exp' | '' = '',
): string {
  return `<table>${rows
    .map(
      (r) => `<tr>
        <td>${esc(r.label)}
          <div class="bar-track"><div class="bar-fill ${tone}" style="width:${pct(r.value, max)}%"></div></div>
        </td>
        <td class="r num" style="width:28%">${esc(r.display)}</td>
      </tr>`,
    )
    .join('')}</table>`;
}

function pct(value: number, max: number): string {
  return Math.min(100, Math.max(0, (Math.abs(value) / Math.max(1, max)) * 100)).toFixed(1);
}

/** Chip perbandingan: "+12,5% vs periode lalu", atau pengakuan kalau tak ada dasarnya. */
function delta(value: number | null, noBaseline: boolean, inverse = false): string {
  if (noBaseline) return '<span class="delta">belum ada periode pembanding</span>';
  if (value === null || !Number.isFinite(value)) return '<span class="delta">—</span>';
  const good = inverse ? value <= 0 : value >= 0;
  const sign = value >= 0 ? '+' : '−';
  return `<span class="delta ${good ? 'up' : 'down'}">${sign}${esc(
    fmtPercent(Math.abs(value)),
  )} vs periode lalu</span>`;
}

/** Grafik tren sebagai SVG statis — geometri yang sama dengan grafik di layar. */
function chartSvg(points: TrendPoint[]): string {
  if (points.length === 0) return empty('Belum ada data periode ini');
  const g = trendGeometry(points, { width: 760, height: 200 });

  const grid = g.gridYs
    .map(
      (row) =>
        `<line x1="${g.pad.left}" y1="${row.y}" x2="${g.width - g.pad.right}" y2="${row.y}" stroke="${INK.ruleSoft}" stroke-width="1"/>` +
        `<text x="${g.pad.left - 8}" y="${row.y + 3}" text-anchor="end" font-size="8" fill="${INK.faint}">${esc(fmtRpCompact(row.value))}</text>`,
    )
    .join('');

  const xLabels = g.xLabels
    .map(
      (l) =>
        `<text x="${l.x}" y="${g.height - 6}" text-anchor="middle" font-size="8" fill="${INK.faint}">${esc(l.label)}</text>`,
    )
    .join('');

  return `<div class="chart">
    <svg viewBox="0 0 ${g.width} ${g.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafik tren pemasukan dan pengeluaran">
      ${grid}${xLabels}
      <path d="${g.incArea}" fill="${INK.income}" fill-opacity="0.08"/>
      <path d="${g.expPath}" fill="none" stroke="${INK.expense}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="${g.incPath}" fill="none" stroke="${INK.income}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
    <div class="legend">
      <span><i class="swatch" style="background:${INK.income}"></i>Pemasukan</span>
      <span><i class="swatch" style="background:${INK.expense}"></i>Pengeluaran</span>
    </div>
  </div>`;
}

function periodLabel(from: string, to: string): string {
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function buildBody(d: ReportDocData): string {
  const contact = [d.org.address, d.org.phone].filter(Boolean).join(' · ');
  const printedAt = new Date().toLocaleString('id-ID');
  const period = periodLabel(d.from, d.to);

  const maxIncome = Math.max(1, ...d.incomeByCategory.map(([, v]) => v));
  const maxExpense = Math.max(1, ...d.expenseByCategory.map(([, v]) => v));
  const maxCatProfit = Math.max(1, ...d.catProfit.map((c) => c.profit));
  const maxPartQty = Math.max(1, ...d.partUsage.map((p) => p.qty));
  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.count));
  const maxLeaderRev = Math.max(1, ...d.leaderboard.map((t) => t.revenue));
  const maxOutletNet = Math.max(1, ...d.outletStats.map((o) => Math.abs(o.net)));
  const receivablesTotal = d.receivables.reduce((s, r) => s + r.outstanding, 0);

  const head = `<div class="head">
    ${d.org.logoDataUrl ? `<img class="logo" src="${esc(d.org.logoDataUrl)}" alt="" onerror="this.remove()"/>` : ''}
    <div class="shop">
      <h1>${esc(d.org.name)}</h1>
      ${contact ? `<p>${esc(contact)}</p>` : ''}
    </div>
    <div class="doctype">
      <div class="kind">LAPORAN KEUANGAN &amp; OPERASIONAL</div>
      <div class="period">${esc(period)}</div>
      <div class="scope">Cakupan: ${esc(d.scopeLabel)} · Dicetak ${esc(printedAt)}</div>
    </div>
  </div>
  <div class="rule"></div><div class="rule-soft"></div>`;

  const verdict = `<div class="verdict">
    <div class="line">${esc(d.verdict.headline)}</div>
    <div class="src num">${esc(d.verdict.source)}</div>
  </div>`;

  const kpis = `<div class="kpis">
    <div class="kpi">
      <div class="label">Pemasukan</div>
      <div class="value num up">${esc(fmtRp(d.summary.income))}</div>
      <div class="delta">${delta(d.comparison.incomeDelta, d.noBaseline)}</div>
    </div>
    <div class="kpi">
      <div class="label">Pengeluaran</div>
      <div class="value num down">${esc(fmtRp(d.summary.expense))}</div>
      <div class="delta">${delta(d.comparison.expenseDelta, d.noBaseline, true)}</div>
    </div>
    <div class="kpi">
      <div class="label">Selisih Kas</div>
      <div class="value num">${esc(fmtRp(d.summary.net))}</div>
      <div class="delta">${delta(d.comparison.netDelta, d.noBaseline)}</div>
    </div>
    <div class="kpi">
      <div class="label">Penjualan POS</div>
      <div class="value num">${esc(fmtRp(d.salesTotal))}</div>
      <div class="delta">sudah termasuk di Pemasukan</div>
    </div>
  </div>`;

  // Teks break-even memakai kamus yang sama dengan layar, supaya PDF & kartu tak bisa beda kata.
  const tr = (key: TranslationKey) => translate(useSettingsStore.getState().language, key);
  const VERDICT_KEY = {
    healthy: 'reports.verdictHealthy',
    thin: 'reports.verdictThin',
    tied: 'reports.verdictTied',
    loss: 'reports.verdictLoss',
  } as const;
  const BASIS_KEY = {
    actual: 'reports.beBasisActual',
    estimate: 'reports.beBasisEstimate',
    partial: 'reports.beBasisPartial',
  } as const;
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtRp(Math.abs(n))}`;
  const be = d.breakEven;
  const beParts = be
    ? overheadBreakdown(be.overhead.byCategory)
        .map(([c, v]) => `${categoryLabel(c)}${be.overhead.estimated.includes(c) ? ' (est.)' : ''} ${fmtRp(v)}`)
        .join(' · ')
    : '';
  const otherShare = be && be.overhead.total > 0 ? (be.overhead.byCategory.Lainnya ?? 0) / be.overhead.total : 0;
  // Tanpa catatan biaya bulanan tak ada yang dibandingkan; di layar kartu kosongnya memberi petunjuk.
  const breakEven = be && be.overhead.total > 0
    ? section(
        tr('reports.indikatorBreakEven'),
        `<p class="be-verdict">${esc(tr(VERDICT_KEY[breakEvenVerdict(d.summary.net, be.surplus)]))}
            <small class="num">${esc(interpolate(tr('reports.verdictSub'), { cash: signed(d.summary.net), be: signed(be.surplus) }))}</small>
          </p>
          <div class="be">
            <div>${esc(tr('reports.beGrossVsOverhead'))}<br/>
              <strong class="num">${esc(fmtRp(be.gross))} / ${esc(fmtRp(be.overhead.total))}</strong>
            </div>
            <div class="pct num ${be.pct >= 1 ? 'up' : ''}">${esc(fmtPercent(be.pct))}</div>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct(be.pct, 1)}%"></div></div>
          <p class="note num">${esc(beParts)}</p>
          <p class="note">${esc(tr(BASIS_KEY[be.overhead.basis]))}</p>
          ${be.overhead.prorated ? `<p class="note">${esc(tr('reports.beProrated'))}</p>` : ''}
          ${
            otherShare > 0.2
              ? `<p class="note">⚠ ${esc(interpolate(tr('reports.beOtherHigh'), { amount: fmtRp(be.overhead.byCategory.Lainnya ?? 0), pct: fmtPercent(otherShare, 0) }))}</p>`
              : ''
          }`,
      )
    : '';

  const incomeCat = section(
    'Pemasukan per Kategori',
    d.incomeByCategory.length === 0
      ? empty('Belum ada data periode ini')
      : barRows(
          d.incomeByCategory.map(([label, value]) => ({ label, value, display: fmtRp(value) })),
          maxIncome,
          'inc',
        ),
  );

  // Dikelompokkan seperti di layar: biaya bulanan / mengurangi untung / stok / uang pemilik.
  const expenseCat = section(
    'Pengeluaran per Kategori',
    d.expenseByCategory.length === 0
      ? empty('Belum ada data periode ini')
      : EXPENSE_GROUPS.map((g) => {
          const rows = d.expenseByCategory.filter(([c]) => expenseGroupOf(c) === g.id);
          if (rows.length === 0) return '';
          const total = rows.reduce((sum, [, v]) => sum + v, 0);
          return `<div class="grp"><span>${esc(tr(EXPENSE_GROUP_LABEL[g.id]))}</span><span class="num">${esc(fmtRp(total))}</span></div>
            ${barRows(
              rows.map(([label, value]) => ({ label: categoryLabel(label), value, display: fmtRp(value) })),
              maxExpense,
              ['contra', 'stock', 'asset', 'receivable', 'owner'].includes(g.id) ? '' : 'exp',
            )}`;
        }).join(''),
  );

  const catProfit = section(
    tr('reports.labaPerKategoriPerangkat'),
    d.catProfit.length === 0
      ? empty('Belum ada servis selesai')
      : `<table>
          <thead><tr><th>Kategori</th><th class="r">Unit</th><th class="r">Pendapatan</th><th class="r">Untung</th></tr></thead>
          <tbody>${d.catProfit
            .map(
              (c) => `<tr>
                <td>${esc(c.category)}
                  <div class="bar-track"><div class="bar-fill" style="width:${pct(c.profit, maxCatProfit)}%"></div></div>
                </td>
                <td class="r num">${c.count}</td>
                <td class="r num">${esc(fmtRp(c.revenue))}</td>
                <td class="r num">${esc(fmtRp(c.profit))}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>
        <p class="note">Untung = biaya servis − modal sparepart, menurut tanggal SELESAI.</p>`,
  );

  const parts = section(
    'Sparepart Terlaris',
    d.partUsage.length === 0
      ? empty('Belum ada pemakaian sparepart periode ini')
      : `<table>
          <thead><tr><th>Sparepart</th><th class="r">Qty</th><th class="r">Modal</th></tr></thead>
          <tbody>${d.partUsage
            .map(
              (p) => `<tr>
                <td>${esc(p.name)}
                  <div class="bar-track"><div class="bar-fill" style="width:${pct(p.qty, maxPartQty)}%"></div></div>
                </td>
                <td class="r num">${p.qty}</td>
                <td class="r num">${esc(fmtRp(p.cost))}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>
        <p class="note">Hanya sparepart yang stoknya benar-benar sudah dipotong.</p>`,
  );

  const funnel = section(
    'Funnel Servis',
    d.funnel.length === 0
      ? empty('Belum ada servis periode ini')
      : `${barRows(
          d.funnel.map((f) => ({ label: f.label, value: f.count, display: String(f.count) })),
          maxFunnel,
        )}
        <p class="note">Tiket yang MASUK pada periode ini · rata-rata penyelesaian ${
          d.turnaround > 0 ? `${d.turnaround.toFixed(1)} hari` : 'belum terukur'
        }</p>`,
    { count: `${d.funnel.reduce((s, f) => s + f.count, 0)} tiket` },
  );

  const leaderboard = section(
    'Performa Teknisi',
    d.leaderboard.length === 0
      ? empty('Belum ada servis selesai')
      : `<table>
          <thead><tr><th>Teknisi</th><th class="r">Selesai</th><th class="r">Nilai Lunas</th></tr></thead>
          <tbody>${d.leaderboard
            .map(
              (t) => `<tr>
                <td>${esc(t.name)}
                  <div class="bar-track"><div class="bar-fill" style="width:${pct(t.revenue, maxLeaderRev)}%"></div></div>
                </td>
                <td class="r num">${t.completed}</td>
                <td class="r num">${esc(fmtRp(t.revenue))}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>`,
  );

  const restock =
    d.restock.length === 0
      ? section('Saran Restok', empty('Stok semua aman'))
      : section(
          'Saran Restok',
          `<table>
            <thead><tr><th>Barang</th><th class="r">Stok</th><th class="r">Min</th></tr></thead>
            <tbody>${d.restock
              .map(
                (i) => `<tr>
                  <td>${esc(i.name)}</td>
                  <td class="r num ${i.stock <= 0 ? 'down' : ''}">${i.stock}</td>
                  <td class="r num">${i.minStock}</td>
                </tr>`,
              )
              .join('')}</tbody>
          </table>`,
          { count: `${d.restock.length} barang` },
        );

  // Perbandingan cabang hanya berarti kalau ada lebih dari satu. Lebar penuh:
  // empat kolom uang tidak muat di setengah halaman A4.
  const outlets =
    d.outletStats.length > 1
      ? section(
          'Perbandingan Antar-Outlet',
          `<table>
            <thead><tr><th>Cabang</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Bersih</th></tr></thead>
            <tbody>${d.outletStats
              .map(
                (o) => `<tr>
                  <td>${esc(o.name)}
                    <div class="bar-track"><div class="bar-fill ${o.net >= 0 ? 'inc' : 'exp'}" style="width:${pct(o.net, maxOutletNet)}%"></div></div>
                  </td>
                  <td class="r num">${esc(fmtRp(o.income))}</td>
                  <td class="r num">${esc(fmtRp(o.expense))}</td>
                  <td class="r num ${o.net >= 0 ? 'up' : 'down'}">${esc(fmtRp(o.net))}</td>
                </tr>`,
              )
              .join('')}</tbody>
          </table>
          ${
            d.scopeLabel === 'Semua Outlet'
              ? ''
              : `<p class="note">Laporan ini disaring ke ${esc(d.scopeLabel)}; tabel ini tetap membandingkan semua cabang.</p>`
          }`,
        )
      : '';

  const aging = (['0-7', '8-30', '31+'] as const).map((b) => ({
    bucket: b,
    total: d.receivables.filter((r) => r.bucket === b).reduce((s, r) => s + r.outstanding, 0),
    count: d.receivables.filter((r) => r.bucket === b).length,
  }));

  const receivables = section(
    'Piutang — Servis Selesai Belum Lunas',
    d.receivables.length === 0
      ? empty('Tidak ada piutang')
      : `<table>
          <thead><tr><th>No. Servis</th><th>Pelanggan</th><th class="r">Umur</th><th class="r">Sisa</th></tr></thead>
          <tbody>${d.receivables
            .map(
              (r) => `<tr>
                <td class="num">${esc(r.serviceNo)}</td>
                <td>${esc(r.customerName)}</td>
                <td class="r num ${r.bucket === '31+' ? 'down' : ''}">${r.ageDays} hari</td>
                <td class="r num">${esc(fmtRp(r.outstanding))}</td>
              </tr>`,
            )
            .join('')}</tbody>
          <tfoot><tr><td colspan="3">Total piutang</td><td class="r num">${esc(fmtRp(receivablesTotal))}</td></tr></tfoot>
        </table>
        <p class="note">Umur: ${aging
          .map((a) => `${a.bucket} hari — ${a.count} tiket, ${fmtRp(a.total)}`)
          .join(' · ')}. Seluruh periode, bukan hanya rentang laporan ini.</p>`,
    { count: `${d.receivables.length} tiket`, flow: true },
  );

  const ledger = section(
    'Rincian Transaksi',
    d.txnRows.length === 0
      ? empty('Belum ada transaksi periode ini')
      : `<table>
          <thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th class="r">Nominal</th></tr></thead>
          <tbody>${d.txnRows
            .map(
              (r) => `<tr>
                <td class="num">${esc(fmtDate(r.date))}</td>
                <td>${esc(r.type)}</td>
                <td>${esc(r.category)}</td>
                <td>${esc(r.description)}</td>
                <td class="r num ${r.amount >= 0 ? 'up' : 'down'}">${esc(fmtRp(r.amount))}</td>
              </tr>`,
            )
            .join('')}</tbody>
          <tfoot><tr>
            <td colspan="4">Selisih kas</td>
            <td class="r num">${esc(fmtRp(d.summary.net))}</td>
          </tr></tfoot>
        </table>`,
    { count: `${d.txnRows.length} baris`, flow: true },
  );

  const foot = `<div class="foot">
    <span>${esc(d.org.name)} · ${esc(period)} · ${esc(d.scopeLabel)}</span>
    <span>DICETAK DENGAN FIXMASTER</span>
  </div>`;

  return `${head}${verdict}${kpis}
    ${section('Tren Pemasukan vs Pengeluaran', chartSvg(d.trend))}
    ${breakEven}
    <div class="cols">${incomeCat}${expenseCat}</div>
    <div class="cols">${catProfit}${parts}</div>
    <div class="cols">${funnel}${leaderboard}</div>
    ${restock}
    ${outlets}
    ${receivables}
    ${ledger}
    ${foot}`;
}

/**
 * Dokumen laporan sebagai satu string HTML (gaya + isi), tanpa menyentuh
 * jendela mana pun. Dipisahkan dari `printReport` supaya dokumennya bisa
 * dirakit dan diperiksa tanpa dialog cetak.
 */
export function reportDocHtml(data: ReportDocData): string {
  return `<style>${A4_STYLE}</style>${buildBody(data)}`;
}

/**
 * Buka laporan A4 di jendela cetak. Pengguna memilih "Simpan sebagai PDF" di
 * dialog cetak untuk mendapatkan berkasnya.
 */
export function printReport(data: ReportDocData): boolean {
  return openPrintWindow({
    demoMessage: 'Ekspor PDF aktif di FixMaster versi penuh — daftar gratis.',
    title: `Laporan ${data.org.name} ${data.from} sd ${data.to}`,
    style: A4_STYLE,
    body: buildBody(data),
    width: 900,
    height: 800,
  });
}
