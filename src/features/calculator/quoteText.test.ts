import { describe, expect, it } from 'vitest';
import { computeQuote, sanitizeQuoteRates } from '@/lib/business/quote';
import { fmtRp } from '@/lib/format';
import { quoteText, type QuoteTextOptions } from './quoteText';

const rates = sanitizeQuoteRates({
  tiers: [
    { id: 'lcd', name: 'Ganti LCD', note: '', labor: 150000, byCategory: {}, warrantyPct: 0, highRisk: false, riskDpPct: null, riskNote: '' },
    {
      id: 'ic',
      name: 'Reballing IC',
      note: '',
      labor: 350000,
      byCategory: {},
      warrantyPct: 0,
      highRisk: true,
      riskDpPct: 60,
      riskNote: 'Perangkat bisa mati total.',
    },
  ],
  partMarkupPct: 0,
  minPartProfit: 0,
  extras: [],
  rounding: 0,
  dpPct: 50,
});

const options: QuoteTextOptions = {
  title: 'Rincian biaya servis',
  subtitle: 'HP · Ganti LCD',
  lineLabel: (line) => line.name,
  totalLabel: 'Total',
  dpLabel: 'DP',
  riskLabel: 'Catatan risiko',
};

const base = { category: '', stockParts: [], customParts: [], extraIds: [] };

describe('quoteText', () => {
  it('menebalkan judul, total, dan DP saja', () => {
    const result = computeQuote({ ...base, rates, tierId: 'lcd' })!;
    const rows = quoteText(result, options).split('\n');
    expect(rows[0]).toBe('*Rincian biaya servis*');
    expect(rows[1]).toBe('HP · Ganti LCD');
    expect(rows).toContain(`- Ganti LCD: ${fmtRp(150000)}`);
    expect(rows).toContain(`*Total: ${fmtRp(150000)}*`);
    expect(rows).toContain(`*DP: ${fmtRp(75000)}*`);
    expect(rows.filter((r) => r.startsWith('*'))).toHaveLength(3);
  });

  it('melewati baris subjudul kosong dan menambah catatan risiko', () => {
    const result = computeQuote({ ...base, rates, tierId: 'ic' })!;
    const text = quoteText(result, { ...options, subtitle: '' });
    expect(text.split('\n')[1]).toBe('');
    expect(text.endsWith('Catatan risiko: Perangkat bisa mati total.')).toBe(true);
  });

  it('tanpa catatan risiko bila tingkatnya tidak berisiko', () => {
    const result = computeQuote({ ...base, rates, tierId: 'lcd' })!;
    expect(quoteText(result, options)).not.toContain('Catatan risiko');
  });
});
