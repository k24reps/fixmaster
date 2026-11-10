import { fmtRp } from '@/lib/format';
import type { QuoteLine, QuoteResult } from '@/lib/business/quote';

export interface QuoteTextOptions {
  title: string;
  /** Kategori · tingkat; kosong = baris dilewati. */
  subtitle: string;
  lineLabel: (line: QuoteLine) => string;
  totalLabel: string;
  dpLabel: string;
  riskLabel: string;
}

/**
 * Rincian siap tempel ke WhatsApp. Tanda bintang = tebal di WhatsApp; hanya
 * dua angka yang ditanyakan pelanggan (total dan DP) yang ditebalkan.
 */
export function quoteText(result: QuoteResult, o: QuoteTextOptions): string {
  const rows = [`*${o.title}*`];
  if (o.subtitle) rows.push(o.subtitle);
  rows.push('');
  for (const line of result.lines) rows.push(`- ${o.lineLabel(line)}: ${fmtRp(line.amount)}`);
  rows.push('');
  rows.push(`*${o.totalLabel}: ${fmtRp(result.total)}*`);
  rows.push(`*${o.dpLabel}: ${fmtRp(result.dp)}*`);
  if (result.highRisk && result.riskNote) {
    rows.push('');
    rows.push(`${o.riskLabel}: ${result.riskNote}`);
  }
  return rows.join('\n');
}
