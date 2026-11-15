import type { TranslationKey } from '@/i18n';
import {
  FREE_UNITS,
  LOW_BALANCE_UNITS,
  MIN_TOPUP,
  MONTHLY_CAP_UNITS,
  REFUND_WINDOW_MINUTES,
  TOPUP_STEP,
  UNIT_FLOOR,
  UNIT_PRICE,
} from '@/config/pricing';
import { waLink } from './notify';

/**
 * Saldo unit (migrasi 0101). Logika murni yang mencerminkan aturan server:
 * satu tiket servis memotong satu unit, saldo boleh minus sampai UNIT_FLOOR,
 * dan di bawahnya hanya tiket BARU yang ditolak. Server tetap penegaknya;
 * fungsi di sini menjaga layar agar tidak menawarkan aksi yang pasti gagal.
 */

export type UnitBalanceState = 'ok' | 'low' | 'minus' | 'blocked';

/** Keadaan saldo untuk LED dan pesan. */
export function unitBalanceState(balance: number): UnitBalanceState {
  if (balance <= UNIT_FLOOR) return 'blocked';
  if (balance <= 0) return 'minus';
  if (balance <= LOW_BALANCE_UNITS) return 'low';
  return 'ok';
}

/** Apakah tiket baru masih bisa dibuat dengan saldo ini. */
export function canCreateTicket(balance: number): boolean {
  return balance > UNIT_FLOOR;
}

/** Sisa tiket baru yang bisa dibuat sebelum ditolak (termasuk jatah minus). */
export function ticketsUntilBlocked(balance: number): number {
  return Math.max(0, balance - UNIT_FLOOR);
}

/** Nilai rupiah dari sejumlah unit. */
export function unitsToRupiah(units: number): number {
  return units * UNIT_PRICE;
}

/** Unit yang didapat dari isi saldo sebesar `amount` rupiah. */
export function unitsForTopup(amount: number): number {
  return Math.floor(amount / UNIT_PRICE);
}

/**
 * Kunci pesan galat untuk nominal isi saldo, atau null bila sah. Server
 * menolak hal yang sama (admin_topup_units); di sini supaya pemilik tahu
 * sebelum mengirim permintaan.
 */
export function topupAmountError(amount: number): TranslationKey | null {
  if (!Number.isFinite(amount) || amount < MIN_TOPUP) return 'billing.topupMin';
  if (!Number.isInteger(amount) || amount % TOPUP_STEP !== 0) return 'billing.topupStep';
  return null;
}

/** Apakah unit tiket yang dipotong pada `chargedAt` masih bisa kembali. */
export function refundWindowOpen(chargedAt: string, now: Date = new Date()): boolean {
  const elapsed = now.getTime() - new Date(chargedAt).getTime();
  return elapsed >= 0 && elapsed <= REFUND_WINDOW_MINUTES * 60_000;
}

export type UnitLedgerKind = 'grant' | 'topup' | 'usage' | 'refund' | 'adjust' | 'capped';

/**
 * Unit yang dibayar sebulan di satu cabang untuk `units` tiket (batas 0103):
 * tiket lewat MONTHLY_CAP_UNITS gratis.
 */
export function billedUnitsPerBranch(units: number): number {
  return Math.min(Math.max(0, units), MONTHLY_CAP_UNITS);
}

/** Biaya sebulan satu cabang dalam rupiah. */
export function monthlyBranchCost(units: number): number {
  return billedUnitsPerBranch(units) * UNIT_PRICE;
}

/**
 * Biaya bulan pertama toko baru satu cabang: unit yang dipotong dikurangi
 * kuota gratis (kuota gratis adalah saldo awal, jadi ikut dipotong lebih dulu).
 */
export function firstMonthCost(units: number): number {
  return Math.max(0, billedUnitsPerBranch(units) - FREE_UNITS) * UNIT_PRICE;
}

export interface BranchMonthUsage {
  paidUnits: number;
  cappedUnits: number;
}

/** Satu baris "bulan ini per cabang" di tab Saldo (RPC unit_month_usage, 0103). */
export interface BranchMonthRow extends BranchMonthUsage {
  outletId: string | null;
  outletName: string;
}

/** Awal bulan berjalan menurut WIB, sebagai instan UTC. */
export function wibMonthStart(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + 7 * 60 * 60_000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - 7 * 60 * 60_000);
}

interface MonthServiceLike {
  outletId: string | null;
  createdAt: string;
  warrantyClaimOf?: string | null;
  deletedAt?: string | null;
}

/**
 * Perkiraan "bulan ini per cabang" dari tiket di perangkat, untuk demo yang
 * tidak punya buku saldo server. Klaim garansi tidak dihitung (sama dengan
 * server); pembatalan 10 menit diabaikan karena demo tidak mencatatnya.
 */
export function monthUsageFromServices(
  services: readonly MonthServiceLike[],
  outlets: readonly { id: string; name: string }[],
  now: Date = new Date(),
): BranchMonthRow[] {
  const start = wibMonthStart(now).getTime();
  const counts = new Map<string | null, number>();
  for (const service of services) {
    if (service.deletedAt || service.warrantyClaimOf) continue;
    if (new Date(service.createdAt).getTime() < start) continue;
    counts.set(service.outletId, (counts.get(service.outletId) ?? 0) + 1);
  }
  const rows: BranchMonthRow[] = outlets.map((outlet) => {
    const count = counts.get(outlet.id) ?? 0;
    counts.delete(outlet.id);
    return {
      outletId: outlet.id,
      outletName: outlet.name,
      paidUnits: billedUnitsPerBranch(count),
      cappedUnits: count - billedUnitsPerBranch(count),
    };
  });
  for (const [outletId, count] of counts) {
    rows.push({
      outletId,
      outletName: '',
      paidUnits: billedUnitsPerBranch(count),
      cappedUnits: count - billedUnitsPerBranch(count),
    });
  }
  return rows.sort((a, b) => a.outletName.localeCompare(b.outletName, 'id'));
}

/** Posisi satu cabang terhadap batas bulan ini. */
export function branchCapState(usage: BranchMonthUsage): {
  paid: number;
  remaining: number;
  reached: boolean;
} {
  const paid = Math.max(0, usage.paidUnits);
  return {
    paid,
    remaining: Math.max(0, MONTHLY_CAP_UNITS - paid),
    reached: paid >= MONTHLY_CAP_UNITS,
  };
}

/** Tanggal 1 bulan depan (WIB) sebagai `YYYY-MM-DD`: batas bulanan dimulai lagi. */
export function nextCapReset(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60_000);
  const year = wib.getUTCFullYear();
  const month = wib.getUTCMonth();
  const next = new Date(Date.UTC(month === 11 ? year + 1 : year, (month + 1) % 12, 1));
  return next.toISOString().slice(0, 10);
}

/** Label baris riwayat saldo. */
export function ledgerKindLabel(kind: UnitLedgerKind): TranslationKey {
  switch (kind) {
    case 'grant':
      return 'billing.kind.grant';
    case 'topup':
      return 'billing.kind.topup';
    case 'usage':
      return 'billing.kind.usage';
    case 'refund':
      return 'billing.kind.refund';
    case 'adjust':
      return 'billing.kind.adjust';
    case 'capped':
      return 'billing.kind.capped';
  }
}

export interface TopupRequest {
  supportPhone: string;
  orgId: string;
  orgName: string;
  balance: number;
  amount: number;
}

/**
 * Pesan WhatsApp pemilik → FixMaster untuk isi saldo. Hanya membuat pesan;
 * saldo bertambah setelah operator memverifikasi transfer (admin_topup_units).
 * Id organisasi ikut supaya toko bernama mirip tidak tertukar.
 */
export function topupWhatsAppLink(request: TopupRequest): string {
  const rupiah = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);
  return waLink(
    request.supportPhone,
    [
      'Halo FixMaster, saya ingin mengisi saldo unit.',
      '',
      `Usaha: ${request.orgName}`,
      `ID organisasi: ${request.orgId}`,
      `Saldo sekarang: ${request.balance} unit`,
      `Isi saldo: ${rupiah(request.amount)} (${unitsForTopup(request.amount)} unit)`,
      '',
      'Mohon kirim instruksi pembayaran. Setelah transfer, saya akan mengirim bukti bayar di chat ini.',
    ].join('\n'),
  );
}
