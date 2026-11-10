import type { QuoteChip, QuoteField, QuoteFieldPreset, QuoteRates } from '@/data/types';

/**
 * Kalkulator Biaya: harga yang DIAJUKAN ke pelanggan. Rumusnya persis sheet
 * price list Nuara, supaya angka di aplikasi dan di sheet tidak pernah beda:
 *
 *   subtotal  = modal + ongkir/waste
 *   cover     = cover garansi % × subtotal
 *   harga     = subtotal + cover + jasa pasang + target profit
 *   profit    = harga − subtotal
 *   markup    = profit ÷ subtotal
 *
 * Cover garansi ikut dihitung sebagai profit, seperti di sheet: uang itu milik
 * toko selama tidak ada klaim.
 */

export const QUOTE_FIELDS: readonly QuoteField[] = ['ongkir', 'jasa', 'coverPct', 'targetProfit'];

export const QUOTE_LIMITS = {
  chips: 12,
  label: 24,
} as const;

const emptyPreset = (): QuoteFieldPreset => ({ chips: [], defaultId: null });

/**
 * Tanpa angka bawaan: template adalah keputusan bisnis pemilik, dan angka
 * contoh yang tak sengaja dipakai akan diajukan ke pelanggan sungguhan.
 */
export function emptyQuoteRates(): QuoteRates {
  return { ongkir: emptyPreset(), jasa: emptyPreset(), coverPct: emptyPreset(), targetProfit: emptyPreset() };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const rupiah = (v: unknown): number => (finite(v) ? Math.min(1e10, Math.max(0, Math.round(v))) : 0);

// Satu desimal, seperti sheet (10,0%).
const percent = (v: unknown): number => (finite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 10) / 10 : 0);

/** Pembersih nilai sesuai kolomnya: persen untuk cover, rupiah untuk sisanya. */
export const quoteValue = (field: QuoteField, v: unknown): number =>
  field === 'coverPct' ? percent(v) : rupiah(v);

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sanitizePreset(field: QuoteField, raw: unknown): QuoteFieldPreset {
  if (!isRecord(raw)) return emptyPreset();
  const taken = new Set<string>();
  const chips = (Array.isArray(raw.chips) ? raw.chips : [])
    .filter(isRecord)
    .slice(0, QUOTE_LIMITS.chips)
    .map<QuoteChip>((c, i) => {
      const rawId = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `${field}-${i + 1}`;
      const id = taken.has(rawId) ? `${field}-${i + 1}-${taken.size}` : rawId;
      taken.add(id);
      return { id, label: text(c.label, QUOTE_LIMITS.label), value: quoteValue(field, c.value) };
    });
  const defaultId = chips.some((c) => c.id === raw.defaultId) ? (raw.defaultId as string) : null;
  return { chips, defaultId };
}

/**
 * Bentuk sebelum 10 Nov 2026 (tingkat pekerjaan + biaya tambahan) dipetakan ke
 * template, supaya yang sudah diisi pemilik tidak hilang saat Tarif disimpan
 * ulang: tarif jasa tiap tingkat → template Jasa Pasang, % garansinya →
 * Cover Garansi, biaya tambahan nominal → Ongkir/Waste, target laba minimum →
 * Target Profit.
 */
function fromLegacy(raw: Record<string, unknown>): QuoteRates {
  const records = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);
  const named = (list: Record<string, unknown>[], value: (r: Record<string, unknown>) => unknown) =>
    list.filter((r) => text(r.name, QUOTE_LIMITS.label)).map((r) => ({ label: r.name, value: value(r) }));
  const tiers = records(raw.tiers);
  const covers = [...new Set(tiers.map((t) => percent(t.warrantyPct)))];
  const withIds = (chips: { label?: unknown; value: unknown }[]) => ({
    chips: chips.map((c, i) => ({ ...c, id: `legacy-${i + 1}` })),
  });
  return sanitizeQuoteRates({
    ongkir: withIds(named(records(raw.extras).filter((e) => e.kind !== 'percent'), (e) => e.amount)),
    jasa: withIds(named(tiers, (t) => t.labor)),
    coverPct: withIds(covers.map((value) => ({ value }))),
    targetProfit: withIds(rupiah(raw.minPartProfit) > 0 ? [{ value: raw.minPartProfit }] : []),
  });
}

/** Nilai tersimpan (bisa kosong, usang, atau rusak) → template yang aman dipakai. */
export function sanitizeQuoteRates(raw: unknown): QuoteRates {
  if (!isRecord(raw)) return emptyQuoteRates();
  if (!QUOTE_FIELDS.some((f) => f in raw) && Array.isArray(raw.tiers)) return fromLegacy(raw);
  return {
    ongkir: sanitizePreset('ongkir', raw.ongkir),
    jasa: sanitizePreset('jasa', raw.jasa),
    coverPct: sanitizePreset('coverPct', raw.coverPct),
    targetProfit: sanitizePreset('targetProfit', raw.targetProfit),
  };
}

export interface QuoteRatesIssue {
  field: QuoteField;
  index: number;
}

/**
 * Template kembar di satu kolom: dua chip bernama sama, atau dua chip tanpa
 * nama bernilai sama. Staf tak bisa membedakannya di kalkulator.
 */
export function quoteRatesIssues(rates: QuoteRates): QuoteRatesIssue[] {
  const issues: QuoteRatesIssue[] = [];
  for (const field of QUOTE_FIELDS) {
    const seen = new Set<string>();
    rates[field].chips.forEach((chip, index) => {
      const label = chip.label.trim().toLowerCase();
      const key = label ? `l:${label}` : `v:${chip.value}`;
      if (seen.has(key)) issues.push({ field, index });
      seen.add(key);
    });
  }
  return issues;
}

/** Nilai awal tiap kolom: chip default bila ada, selain itu 0. */
export function quoteDefaults(rates: QuoteRates): Record<QuoteField, { chipId: string | null; value: number }> {
  const pick = (field: QuoteField) => {
    const { chips, defaultId } = rates[field];
    const chip = chips.find((c) => c.id === defaultId);
    return chip ? { chipId: chip.id, value: chip.value } : { chipId: null, value: 0 };
  };
  return { ongkir: pick('ongkir'), jasa: pick('jasa'), coverPct: pick('coverPct'), targetProfit: pick('targetProfit') };
}

export interface QuoteInput {
  modal: number;
  ongkir: number;
  jasa: number;
  /** Persen, mis. 10 untuk 10%. */
  coverPct: number;
  targetProfit: number;
}

/** Masukan yang sudah dibersihkan ikut dikembalikan supaya baris struk selalu berjumlah `price`. */
export interface QuoteResult {
  /** Modal + ongkir/waste. */
  subtotal: number;
  coverPct: number;
  /** Cover garansi dalam rupiah. */
  cover: number;
  jasa: number;
  targetProfit: number;
  /** Harga rekomendasi untuk pelanggan. */
  price: number;
  /** Harga − subtotal: cover + jasa + target profit. */
  profit: number;
  /** Profit ÷ subtotal; null bila subtotal 0 (pekerjaan tanpa part dan ongkir). */
  markup: number | null;
}

export function computeQuote(input: QuoteInput): QuoteResult {
  const subtotal = rupiah(input.modal) + rupiah(input.ongkir);
  const coverPct = percent(input.coverPct);
  const cover = Math.round((subtotal * coverPct) / 100);
  const jasa = rupiah(input.jasa);
  const targetProfit = rupiah(input.targetProfit);
  const price = subtotal + cover + jasa + targetProfit;
  const profit = price - subtotal;
  return {
    subtotal,
    coverPct,
    cover,
    jasa,
    targetProfit,
    price,
    profit,
    markup: subtotal > 0 ? profit / subtotal : null,
  };
}
