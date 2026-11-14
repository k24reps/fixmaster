import type { TranslationKey } from '@/i18n';
import {
  LOW_BALANCE_UNITS,
  MIN_TOPUP,
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

export type UnitLedgerKind = 'grant' | 'topup' | 'usage' | 'refund' | 'adjust';

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
