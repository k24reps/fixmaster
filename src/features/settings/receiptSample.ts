import { addDays, localDateStr } from '@/lib/time';
import type { Sale, Service } from '@/data/types';

/**
 * Transaksi rekaan untuk pratinjau Pengaturan › Nota & Struk. Bukan fixture tes:
 * ia dirender oleh kode cetak yang sama dengan nota sungguhan, jadi harus cukup
 * lengkap untuk memperlihatkan setiap baris yang bisa dinyalakan toko (IMEI,
 * teknisi, DP, garansi, QR) dan cukup panjang untuk memperlihatkan bagaimana
 * baris panjang tertata di 58mm.
 *
 * Nomornya FM-0000 / INV-0000: nol tak pernah dipakai transaksi sungguhan,
 * sehingga QR pada pratinjau tak menunjuk ke tiket pelanggan siapa pun.
 */

export interface SampleText {
  complaint: string;
  condition: string;
  accessories: string;
  item1: string;
  item2: string;
}

export function sampleService(text: SampleText, now: Date = new Date()): Service {
  const today = localDateStr(now);
  return {
    id: 'sample-service',
    orgId: 'sample',
    outletId: null,
    createdAt: now.toISOString(),
    serviceNo: 'FM-0000',
    customerName: 'Budi Santoso',
    device: 'Samsung Galaxy A54',
    deviceSerial: '352999112345678',
    deviceCondition: text.condition,
    complaint: text.complaint,
    accessories: text.accessories,
    status: 'selesai',
    technicianId: null,
    technicianName: 'Rudi',
    estimateCost: 450000,
    finalCost: 450000,
    downPayment: 100000,
    history: [],
    spareparts: [],
    warrantyServiceUntil: addDays(today, 30),
    warrantyPartsUntil: addDays(today, 30),
  } as unknown as Service;
}

export function sampleSale(text: SampleText, now: Date = new Date()): { sale: Sale; change: number } {
  const sale = {
    id: 'sample-sale',
    orgId: 'sample',
    outletId: null,
    createdAt: now.toISOString(),
    saleNo: 'INV-0000',
    date: localDateStr(now),
    lines: [
      { itemId: 'a', name: text.item1, qty: 2, sellPrice: 35000, costPrice: 10000 },
      { itemId: 'b', name: text.item2, qty: 1, sellPrice: 55000, costPrice: 20000 },
    ],
    subtotal: 125000,
    discount: 0,
    discountType: 'amount',
    total: 125000,
    payments: [{ walletId: 'sample-cash', amount: 125000 }],
    cashierId: 'sample',
    cashierName: 'Rudi',
    voided: false,
    voidedReason: '',
  } as unknown as Sale;
  return { sale, change: 25000 };
}
