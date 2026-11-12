import { retainedDownPayment } from '@/lib/business/services';
import { fmtDate, localDateStr, localTimeStr } from '@/lib/time';
import type { Sale, Service, ServiceDocKind, ServicePrintMeta, ServiceStatus } from '@/data/types';

export type { ServiceDocKind };

/**
 * Isi nota & struk sebagai DATA, bukan teks: kunci + angka. Label dan format
 * dipilih perender, jadi aturan "apa yang boleh tercetak" bisa diuji tanpa
 * DOM dan tidak terseret saat teksnya diganti atau diterjemahkan.
 *
 * Prinsip yang dijaga di sini: kertas ini dibawa pulang pelanggan dan dipakai
 * sebagai bukti. Angka yang tidak diketahui TIDAK ditebak (DP batal tanpa
 * catatan refund, kembalian pada cetak ulang), dan angka nol yang menyesatkan
 * ("Sisa Rp 0" padahal biaya belum final) tidak dicetak.
 */

// ---------------------------------------------------------------------------
// Nota servis: blok uang

export type ServiceMoneyKey =
  | 'estimate'
  | 'cost'
  | 'dp'
  | 'remaining'
  | 'paidDp'
  | 'dpReceived'
  | 'dpRetained'
  | 'dpRefunded';

export interface ServiceMoneyLine {
  key: ServiceMoneyKey;
  amount: number;
  /** Angka yang paling dibutuhkan pelanggan saat memegang kertas ini. */
  emphasis?: boolean;
}

type MoneySource = Pick<Service, 'status' | 'estimateCost' | 'finalCost' | 'downPayment' | 'history'>;

/**
 * Baris uang nota servis.
 *
 * - Tiket batal: tak ada biaya yang ditagih, jadi yang dicetak hanya nasib DP.
 *   `retainedDownPayment` null (batal sebelum refund dicatat) = tahan lidah:
 *   hanya "DP diterima", tanpa klaim dikembalikan atau ditahan.
 * - Biaya akhir belum ada tetapi DP sudah masuk: cukup "Sudah dibayar (DP)".
 *   Menghitung sisa dari biaya 0 menghasilkan "Sisa Rp 0", yang terbaca lunas.
 * - Biaya akhir ada: Biaya, lalu DP dan Sisa bila ada DP. Estimasi tak ikut.
 */
export function serviceMoney(service: MoneySource): ServiceMoneyLine[] {
  const dp = service.downPayment;

  if (service.status === 'batal') {
    if (!(dp > 0)) return [];
    const lines: ServiceMoneyLine[] = [{ key: 'dpReceived', amount: dp }];
    const kept = retainedDownPayment(service);
    if (kept !== null) {
      const refunded = dp - kept;
      if (kept > 0) lines.push({ key: 'dpRetained', amount: kept });
      if (refunded > 0) lines.push({ key: 'dpRefunded', amount: refunded });
      // DP > 0 menjamin ada yang ditahan atau dikembalikan; barisnya yang terakhir.
      lines[lines.length - 1].emphasis = true;
    }
    return lines;
  }

  const lines: ServiceMoneyLine[] = [];

  // Estimasi hanya informasi selama biaya akhir belum ada. Begitu Biaya tercetak,
  // estimasi di sampingnya cuma angka kedua yang harus dibedakan pelanggan dari
  // yang benar-benar ditagih.
  if (!(service.finalCost > 0)) {
    if (service.estimateCost > 0) lines.push({ key: 'estimate', amount: service.estimateCost });
    if (dp > 0) lines.push({ key: 'paidDp', amount: dp, emphasis: true });
    return lines;
  }

  lines.push({ key: 'cost', amount: service.finalCost });
  if (dp > 0) {
    lines.push({ key: 'dp', amount: dp });
    lines.push({ key: 'remaining', amount: Math.max(0, service.finalCost - dp), emphasis: true });
  } else {
    // Tanpa DP, total itu sendirilah yang harus dibayar.
    lines[lines.length - 1].emphasis = true;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Nota servis: tahap siklus hidup
//
// Kertas yang sama dicetak saat unit diterima, selesai, dan diserahkan, lalu
// dibawa pulang. Yang berubah-ubah (status) tak boleh dicetak sebagai fakta
// tetap: "Status: Diterima" di tangan pelanggan dua minggu kemudian adalah
// kebohongan kecil. Jadi kertas mencatat TAHAP SAAT DICETAK lewat judulnya,
// dan kebenaran yang berjalan diserahkan ke QR lacak.

/**
 * Tahap yang dilihat pelanggan, lebih kasar daripada `ServiceStatus`:
 * diagnosa, konfirmasi biaya, dan tunggu sparepart semuanya "masih diproses"
 * baginya. `pickedUp` bendera sendiri di tiket (bukan status), dan menang atas
 * status mana pun kecuali batal.
 */
export type ServiceStage = 'received' | 'working' | 'ready' | 'pickedUp' | 'cancelled';

/**
 * Peta lengkap `Record<ServiceStatus, …>`: menambah status baru tanpa
 * memutuskan tahapnya adalah galat tipe, bukan nota yang diam-diam salah judul.
 * Lunas yang belum diambil tetap "siap diambil", sama dengan halaman lacak.
 */
const STAGE_OF_STATUS: Record<ServiceStatus, ServiceStage> = {
  diterima: 'received',
  diagnosa: 'working',
  konfirmasi: 'working',
  tunggu: 'working',
  pengerjaan: 'working',
  selesai: 'ready',
  lunas: 'ready',
  batal: 'cancelled',
};

type StageSource = Pick<Service, 'status' | 'pickedUp'>;

export function serviceStage(service: StageSource): ServiceStage {
  const byStatus = STAGE_OF_STATUS[service.status];
  if (byStatus === 'cancelled') return byStatus;
  return service.pickedUp ? 'pickedUp' : byStatus;
}

export interface ServiceDocPlan {
  stage: ServiceStage;
  kind: ServiceDocKind;
  /** Kotak tanda tangan hanya di nota serah: yang ditandatangani adalah penerimaan unit. */
  signature: boolean;
}

export function serviceDocPlan(service: StageSource): ServiceDocPlan {
  const stage = serviceStage(service);
  const kind: ServiceDocKind =
    stage === 'received' || stage === 'working'
      ? 'intake'
      : stage === 'pickedUp'
        ? 'handover'
        : 'service';
  return { stage, kind, signature: stage === 'pickedUp' };
}

/**
 * Cetakan ini salinan bila dokumen berjenis SAMA sudah pernah dicetak. Nota
 * serah sesudah tanda terima adalah dokumen baru, bukan salinan; tanda terima
 * kedua justru yang paling perlu ditandai, karena kertas itulah bukti untuk
 * mengambil unit. Tiket batal tidak ditandai: kotak BATAL sudah menyatakan
 * kertasnya tak berlaku. Tanpa jejak (migrasi 0100 belum ada, atau gagal
 * dimuat) = cetakan pertama.
 */
export function isServiceReprint(
  meta: Pick<ServicePrintMeta, 'lastPrintedKind'> | null | undefined,
  plan: Pick<ServiceDocPlan, 'kind' | 'stage'>,
): boolean {
  return plan.stage !== 'cancelled' && !!meta && meta.lastPrintedKind === plan.kind;
}

/** Cap "CETAK ULANG": tanggal dan jam SAAT dicetak, sama untuk struk POS dan nota servis. */
export function reprintStamp(now: Date): string {
  return `${fmtDate(localDateStr(now))} ${localTimeStr(now)}`;
}

// ---------------------------------------------------------------------------
// Struk penjualan

export interface SaleReceiptItem {
  qty: number;
  name: string;
  unitPrice: number;
  amount: number;
}

export type SalePayKey = 'paid' | 'change' | 'method';

export interface SalePayLine {
  key: SalePayKey;
  amount: number;
  /** Nama wallet pembayaran; hanya bila diketahui. */
  method?: string;
}

export interface SaleReceiptModel {
  items: SaleReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  pay: SalePayLine[];
  voided: boolean;
  voidedReason: string;
  /** Tanggal dan jam cetak bila ini cetak ulang; null untuk cetak pertama. */
  reprintAt: string | null;
}

export interface SaleReceiptOptions {
  /**
   * Kembalian hanya diketahui saat transaksi baru selesai. Pada cetak ulang
   * angkanya tidak tersimpan, jadi 0 berarti "tidak diketahui", bukan "pas".
   */
  change?: number;
  reprint?: boolean;
  walletName?: (id: string | null) => string;
  /** Hanya untuk tes; default sekarang. */
  now?: Date;
}

/**
 * Struk yang dibatalkan tidak mencetak baris bayar: uangnya sudah dikembalikan,
 * dan "Dibayar Rp X" di bawah penanda BATAL membuat struknya terbaca berlaku.
 */
export function saleReceiptModel(sale: Sale, opts: SaleReceiptOptions = {}): SaleReceiptModel {
  const change = Math.max(0, opts.change ?? 0);
  const nameOf = opts.walletName ?? (() => '');

  const methods: SalePayLine[] = (sale.payments ?? [])
    .filter((p) => p.amount > 0)
    .map((p) => {
      const name = nameOf(p.walletId).trim();
      return name ? { key: 'method', amount: p.amount, method: name } : { key: 'method', amount: p.amount };
    });

  let pay: SalePayLine[] = [];
  if (!sale.voided) {
    if (change > 0) {
      // `payments` sudah bersih dari kembalian (jumlahnya = total), jadi uang
      // yang diserahkan pelanggan = total + kembalian.
      pay =
        methods.length > 1
          ? [...methods, { key: 'change', amount: change }]
          : [
              { key: 'paid', amount: sale.total + change, ...(methods[0]?.method ? { method: methods[0].method } : {}) },
              { key: 'change', amount: change },
            ];
    } else {
      pay = methods;
    }
  }

  const now = opts.now ?? new Date();
  return {
    items: sale.lines.map((l) => ({
      qty: l.qty,
      name: l.name,
      unitPrice: l.sellPrice,
      amount: l.sellPrice * l.qty,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    pay,
    voided: sale.voided,
    voidedReason: (sale.voidedReason ?? '').trim(),
    reprintAt: opts.reprint ? reprintStamp(now) : null,
  };
}

/**
 * Tanggal dokumen, dengan jam bila toko menyalakannya. Jam diambil dari
 * `createdAt` (kapan transaksi dicatat), bukan dari saat cetak: nota yang
 * dicetak ulang besok tetap menunjuk jam transaksinya. `createdAt` yang tak
 * terbaca menjatuhkan jam, tidak mengarangnya.
 */
export function stampWithTime(date: string, createdAt: string | undefined, withTime: boolean): string {
  const day = fmtDate(date);
  if (!withTime || !createdAt) return day;
  const at = new Date(createdAt);
  return Number.isNaN(at.getTime()) ? day : `${day} ${localTimeStr(at)}`;
}

/**
 * Alamat yang tercetak di kepala kertas: alamat cabang tempat transaksi
 * terjadi bila cabang itu punya, selain itu alamat usaha. Dulu selalu alamat
 * usaha, sehingga struk dari Cabang Cimahi memuat alamat pusat.
 */
export function receiptAddress(
  orgAddress: string | undefined,
  outletId: string | null | undefined,
  outlets: ReadonlyArray<{ id: string; address?: string }>,
): string {
  const own = outletId ? outlets.find((o) => o.id === outletId)?.address?.trim() : '';
  return own || (orgAddress ?? '').trim();
}
