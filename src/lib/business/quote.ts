import type { QuoteExtra, QuoteRates, QuoteRounding, QuoteTier } from '@/data/types';

/**
 * Kalkulator Biaya: harga yang DIAJUKAN ke pelanggan, dihitung dari tarif yang
 * diatur pemilik (Pengaturan → Tarif). Tujuannya standarisasi: dua staf yang
 * menaksir pekerjaan yang sama harus sampai ke angka yang sama.
 *
 * Rumus untuk part luar stok diambil dari price list Nuara:
 *   harga = (modal + ongkir) + cover garansi + jasa + target laba
 * dengan dua tambahan: target laba adalah batas BAWAH (markup % boleh lebih
 * besar), dan cover garansi dicatat terpisah dari laba karena uang itu
 * disisihkan untuk klaim, bukan diambil.
 */

export const QUOTE_ROUNDING_STEPS: readonly QuoteRounding[] = [0, 1000, 5000, 10000];

export const QUOTE_LIMITS = {
  tiers: 30,
  extras: 20,
  name: 60,
  note: 160,
  riskNote: 280,
} as const;

/**
 * Tanpa harga bawaan: tarif jasa adalah keputusan bisnis pemilik, dan angka
 * contoh yang tak sengaja dipakai akan diajukan ke pelanggan sungguhan.
 */
export const EMPTY_QUOTE_RATES: QuoteRates = {
  tiers: [],
  partMarkupPct: 0,
  minPartProfit: 0,
  extras: [],
  rounding: 1000,
  dpPct: 50,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const rupiah = (v: unknown, fallback = 0): number =>
  finite(v) ? Math.min(1e10, Math.max(0, Math.round(v))) : fallback;

// Dua desimal cukup untuk biaya admin seperti 0,7%.
const percent = (v: unknown, max: number, fallback = 0): number =>
  finite(v) ? Math.round(Math.min(max, Math.max(0, v)) * 100) / 100 : fallback;

const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

function uniqueId(raw: unknown, prefix: string, index: number, taken: Set<string>): string {
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : `${prefix}-${index + 1}`;
  const out = taken.has(id) ? `${prefix}-${index + 1}-${taken.size}` : id;
  taken.add(out);
  return out;
}

function sanitizeTier(raw: Record<string, unknown>, index: number, taken: Set<string>): QuoteTier {
  const byCategory: Record<string, number> = {};
  if (isRecord(raw.laborByCategory)) {
    for (const [category, value] of Object.entries(raw.laborByCategory)) {
      if (category.trim() && finite(value) && value >= 0) byCategory[category.trim()] = rupiah(value);
    }
  }
  const highRisk = raw.highRisk === true;
  return {
    id: uniqueId(raw.id, 'tier', index, taken),
    name: text(raw.name, QUOTE_LIMITS.name),
    note: text(raw.note, QUOTE_LIMITS.note),
    labor: rupiah(raw.labor),
    laborByCategory: byCategory,
    warrantyPct: percent(raw.warrantyPct, 100),
    highRisk,
    riskDpPct: finite(raw.riskDpPct) ? percent(raw.riskDpPct, 100) : null,
    riskNote: text(raw.riskNote, QUOTE_LIMITS.riskNote),
  };
}

function sanitizeExtra(raw: Record<string, unknown>, index: number, taken: Set<string>): QuoteExtra {
  const kind = raw.kind === 'percent' ? 'percent' : 'fixed';
  return {
    id: uniqueId(raw.id, 'extra', index, taken),
    name: text(raw.name, QUOTE_LIMITS.name),
    kind,
    amount: kind === 'percent' ? percent(raw.amount, 100) : rupiah(raw.amount),
    defaultOn: raw.defaultOn === true,
  };
}

/**
 * Nilai tersimpan (bisa kosong, usang, atau rusak) → tarif yang aman dihitung.
 * Tingkat dan biaya tanpa nama dibuang: form Pengaturan menolak menyimpannya
 * (lihat `quoteRatesIssues`), jadi yang sampai ke sini tanpa nama memang rusak.
 */
export function sanitizeQuoteRates(raw: unknown): QuoteRates {
  if (!isRecord(raw)) return { ...EMPTY_QUOTE_RATES, tiers: [], extras: [] };
  const tierIds = new Set<string>();
  const extraIds = new Set<string>();
  const tiers = (Array.isArray(raw.tiers) ? raw.tiers : [])
    .filter(isRecord)
    .map((t, i) => sanitizeTier(t, i, tierIds))
    .filter((t) => t.name)
    .slice(0, QUOTE_LIMITS.tiers);
  const extras = (Array.isArray(raw.extras) ? raw.extras : [])
    .filter(isRecord)
    .map((e, i) => sanitizeExtra(e, i, extraIds))
    .filter((e) => e.name)
    .slice(0, QUOTE_LIMITS.extras);
  const rounding = QUOTE_ROUNDING_STEPS.includes(raw.rounding as QuoteRounding)
    ? (raw.rounding as QuoteRounding)
    : EMPTY_QUOTE_RATES.rounding;
  return {
    tiers,
    partMarkupPct: percent(raw.partMarkupPct, 1000),
    minPartProfit: rupiah(raw.minPartProfit),
    extras,
    rounding,
    dpPct: percent(raw.dpPct, 100, EMPTY_QUOTE_RATES.dpPct),
  };
}

export type QuoteRatesIssue =
  | { code: 'tierName'; index: number }
  | { code: 'tierDuplicate'; index: number }
  | { code: 'riskNote'; index: number }
  | { code: 'extraName'; index: number };

/**
 * Masalah yang membuat form Tarif tak boleh disimpan. Tingkat berisiko tanpa
 * catatan ditolak karena catatan itulah yang membuat staf menyampaikan risikonya
 * ke pelanggan; tanpa itu tandanya hanya mengubah DP.
 */
export function quoteRatesIssues(rates: QuoteRates): QuoteRatesIssue[] {
  const issues: QuoteRatesIssue[] = [];
  const seen = new Set<string>();
  rates.tiers.forEach((tier, index) => {
    const name = tier.name.trim();
    if (!name) issues.push({ code: 'tierName', index });
    else if (seen.has(name.toLowerCase())) issues.push({ code: 'tierDuplicate', index });
    seen.add(name.toLowerCase());
    if (tier.highRisk && !tier.riskNote.trim()) issues.push({ code: 'riskNote', index });
  });
  rates.extras.forEach((extra, index) => {
    if (!extra.name.trim()) issues.push({ code: 'extraName', index });
  });
  return issues;
}

/** Markup 0% dan target 0: part luar stok akan diajukan seharga modalnya. */
export function sellsPartsAtCost(rates: QuoteRates): boolean {
  return rates.partMarkupPct === 0 && rates.minPartProfit === 0;
}

/** Tarif jasa tingkat ini untuk kategori perangkat tertentu. */
export function laborFor(tier: QuoteTier, category: string): number {
  const special = tier.laborByCategory[category];
  return finite(special) ? special : tier.labor;
}

/** Bulatkan ke atas ke kelipatan `step`; 0 = tanpa pembulatan. */
export function roundUp(value: number, step: number): number {
  const v = Math.round(value);
  return step > 0 ? Math.ceil(v / step) * step : v;
}

/**
 * Bagi `amount` mengikuti bobot, dibulatkan ke rupiah, sisa pembulatan ke
 * bobot terbesar supaya jumlah bagiannya tetap sama persis dengan `amount`.
 */
function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((amount * w) / sum));
  const rest = amount - shares.reduce((a, b) => a + b, 0);
  const biggest = weights.indexOf(Math.max(...weights));
  shares[biggest] += rest;
  return shares;
}

export interface QuoteStockPart {
  itemId: string;
  name: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
}

/** Part luar stok: staf hanya mengetik modalnya (per unit). */
export interface QuoteCustomPart {
  id: string;
  name: string;
  qty: number;
  cost: number;
}

export interface QuoteInput {
  rates: QuoteRates;
  tierId: string;
  category: string;
  stockParts: QuoteStockPart[];
  customParts: QuoteCustomPart[];
  /** Biaya tambahan yang dicentang. */
  extraIds: string[];
}

export interface QuoteLine {
  kind: 'stockPart' | 'customPart' | 'labor' | 'extra';
  ref: string;
  name: string;
  qty: number;
  /** Persen biaya tambahan jenis `percent` (untuk label). */
  pct?: number;
  amount: number;
}

export interface QuoteResult {
  tier: QuoteTier;
  /** Rincian untuk pelanggan; jumlahnya selalu sama dengan `total`. */
  lines: QuoteLine[];
  /** Sebelum pembulatan. */
  rawTotal: number;
  total: number;
  /** Selisih pembulatan; sudah dimasukkan ke baris jasa. */
  roundingAdded: number;
  dpPct: number;
  dp: number;
  /** DP dinaikkan supaya menutup modal part luar stok. */
  dpRaised: boolean;
  highRisk: boolean;
  riskNote: string;
  // Hanya untuk pemilik/admin.
  /** Modal semua part + biaya titipan. */
  cost: number;
  /** Modal part luar stok: batas bawah DP. */
  customCost: number;
  warrantyReserve: number;
  partProfit: number;
  /** total − modal − cadangan garansi. */
  profit: number;
  /** Laba ÷ modal; null bila modal 0. */
  profitRatio: number | null;
}

const qtyOf = (q: number) => (finite(q) && q >= 1 ? Math.floor(q) : 1);
const money = (v: number) => (finite(v) && v > 0 ? Math.round(v) : 0);

/**
 * Urutan hitung:
 *  1. modal part luar stok + biaya titipan tetap = dasar cover garansi;
 *  2. cover garansi = % tingkat × dasar itu;
 *  3. laba part = yang lebih besar antara markup % × modal part dan target laba;
 *  4. + harga jual part stok + jasa + biaya titipan tetap;
 *  5. biaya titipan persen dihitung dari jumlah itu;
 *  6. total dibulatkan ke atas, selisihnya masuk baris jasa;
 *  7. DP = yang lebih besar antara DP % × total dan modal part luar stok.
 * Cover garansi dan target laba hanya berlaku bila ada part luar stok: part stok
 * sudah membawa marginnya sendiri di harga jual Inventori.
 */
export function computeQuote(input: QuoteInput): QuoteResult | null {
  const { rates } = input;
  const tier = rates.tiers.find((t) => t.id === input.tierId);
  if (!tier) return null;

  const stock = input.stockParts.map((p) => ({
    ...p,
    qty: qtyOf(p.qty),
    sellPrice: money(p.sellPrice),
    costPrice: money(p.costPrice),
  }));
  const custom = input.customParts.map((p) => ({ ...p, qty: qtyOf(p.qty), cost: money(p.cost) }));
  const checked = rates.extras.filter((e) => input.extraIds.includes(e.id));
  const fixed = checked.filter((e) => e.kind === 'fixed');
  const percentExtras = checked.filter((e) => e.kind === 'percent');

  const customModals = custom.map((p) => p.qty * p.cost);
  const customCost = customModals.reduce((a, b) => a + b, 0);
  const fixedTotal = fixed.reduce((a, e) => a + e.amount, 0);
  const hasCustom = customCost > 0;

  const warrantyReserve = hasCustom
    ? Math.round(((customCost + fixedTotal) * tier.warrantyPct) / 100)
    : 0;
  const partProfit = hasCustom
    ? Math.max(Math.round((customCost * rates.partMarkupPct) / 100), rates.minPartProfit)
    : 0;
  const customShares = allocate(warrantyReserve + partProfit, customModals);

  const labor = laborFor(tier, input.category);
  const lines: QuoteLine[] = [
    ...stock.map<QuoteLine>((p) => ({
      kind: 'stockPart',
      ref: p.itemId,
      name: p.name,
      qty: p.qty,
      amount: p.qty * p.sellPrice,
    })),
    ...custom.map<QuoteLine>((p, i) => ({
      kind: 'customPart',
      ref: p.id,
      name: p.name,
      qty: p.qty,
      amount: customModals[i] + customShares[i],
    })),
    ...fixed.map<QuoteLine>((e) => ({ kind: 'extra', ref: e.id, name: e.name, qty: 1, amount: e.amount })),
  ];
  const subtotal = labor + lines.reduce((a, l) => a + l.amount, 0);
  const percentLines = percentExtras.map<QuoteLine>((e) => ({
    kind: 'extra',
    ref: e.id,
    name: e.name,
    qty: 1,
    pct: e.amount,
    amount: Math.round((subtotal * e.amount) / 100),
  }));
  const percentTotal = percentLines.reduce((a, l) => a + l.amount, 0);

  const rawTotal = subtotal + percentTotal;
  const total = roundUp(rawTotal, rates.rounding);
  const roundingAdded = total - rawTotal;
  const laborLine: QuoteLine = {
    kind: 'labor',
    ref: tier.id,
    name: tier.name,
    qty: 1,
    amount: labor + roundingAdded,
  };

  const dpPct = tier.highRisk && tier.riskDpPct !== null ? tier.riskDpPct : rates.dpPct;
  const dpByPct = (total * dpPct) / 100;
  const dpRaised = customCost > dpByPct;
  const dp = Math.min(total, roundUp(Math.max(dpByPct, customCost), rates.rounding));

  const stockCost = stock.reduce((a, p) => a + p.qty * p.costPrice, 0);
  const cost = stockCost + customCost + fixedTotal + percentTotal;
  const profit = total - cost - warrantyReserve;

  return {
    tier,
    lines: [...lines.filter((l) => l.kind !== 'extra'), laborLine, ...lines.filter((l) => l.kind === 'extra'), ...percentLines],
    rawTotal,
    total,
    roundingAdded,
    dpPct,
    dp,
    dpRaised,
    highRisk: tier.highRisk,
    riskNote: tier.riskNote,
    cost,
    customCost,
    warrantyReserve,
    partProfit,
    profit,
    profitRatio: cost > 0 ? profit / cost : null,
  };
}
