import { repository } from '@/data';
import { localDateOf } from '@/lib/time';
import { buildCsv, csvFilename, type CsvColumn } from '@/lib/business/export';
import { downloadCsvFile } from '@/lib/csv';
import type {
  Service,
  Sale,
  Customer,
  InventoryItem,
  Income,
  Expense,
} from '@/data/types';

/**
 * Exportable datasets. Each maps a collection to a flat, human-readable set of
 * CSV columns (Indonesian headers, no internal IDs/tombstones). Used by the
 * Settings → System "Export Data" card. Kept UI-free so the column shapes can
 * be reasoned about (and later tested) independently of React.
 */
export interface DatasetDef {
  key: string;
  /** Filename slug + button label. */
  label: string;
  icon: string;
  /** Fetch + shape rows into a CSV string (with BOM). */
  toCsv: () => Promise<string>;
}

const serviceCols: CsvColumn<Service>[] = [
  { label: 'No. Servis', value: (s) => s.serviceNo },
  { label: 'Tanggal Masuk', value: (s) => localDateOf(s.createdAt) },
  { label: 'Pelanggan', value: (s) => s.customerName },
  { label: 'Telepon', value: (s) => s.customerPhone },
  { label: 'Perangkat', value: (s) => `${s.category} ${s.device}`.trim() },
  { label: 'Keluhan', value: (s) => s.complaint },
  { label: 'Status', value: (s) => s.status },
  { label: 'Teknisi', value: (s) => s.technicianName },
  { label: 'Estimasi', value: (s) => s.estimateCost },
  { label: 'Biaya Akhir', value: (s) => s.finalCost },
  { label: 'DP', value: (s) => s.downPayment },
];

const saleCols: CsvColumn<Sale>[] = [
  { label: 'No. Nota', value: (s) => s.saleNo },
  { label: 'Tanggal', value: (s) => s.date },
  { label: 'Jumlah Item', value: (s) => s.lines.reduce((n, l) => n + l.qty, 0) },
  { label: 'Subtotal', value: (s) => s.subtotal },
  { label: 'Diskon', value: (s) => s.discount },
  { label: 'Total', value: (s) => s.total },
  { label: 'Kasir', value: (s) => s.cashierName },
  { label: 'Dibatalkan', value: (s) => (s.voided ? 'Ya' : 'Tidak') },
];

const customerCols: CsvColumn<Customer>[] = [
  { label: 'Nama', value: (c) => c.name },
  { label: 'Telepon', value: (c) => c.phone },
  { label: 'Email', value: (c) => c.email },
  { label: 'Alamat', value: (c) => c.address },
  { label: 'Catatan', value: (c) => c.note },
];

const inventoryCols: CsvColumn<InventoryItem>[] = [
  { label: 'Nama', value: (i) => i.name },
  { label: 'Kategori', value: (i) => i.category },
  { label: 'SKU', value: (i) => i.sku },
  { label: 'Stok', value: (i) => i.stock },
  { label: 'Stok Min', value: (i) => i.minStock },
  { label: 'Harga Modal', value: (i) => i.costPrice },
  { label: 'Harga Jual', value: (i) => i.sellPrice },
];

interface FinanceRow {
  date: string;
  type: string;
  category: string;
  description: string;
  amount: number;
}
const financeCols: CsvColumn<FinanceRow>[] = [
  { label: 'Tanggal', value: (r) => r.date },
  { label: 'Jenis', value: (r) => r.type },
  { label: 'Kategori', value: (r) => r.category },
  { label: 'Keterangan', value: (r) => r.description },
  { label: 'Nominal', value: (r) => r.amount },
];

/** Active, non-deleted rows only (skip soft-delete tombstones). */
function live<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

export const DATASETS: DatasetDef[] = [
  {
    key: 'servis',
    label: 'Servis',
    icon: 'screwdriver-wrench',
    toCsv: async () => buildCsv(live(await repository.list('services')), serviceCols),
  },
  {
    key: 'penjualan',
    label: 'Penjualan',
    icon: 'cash-register',
    toCsv: async () => buildCsv(live(await repository.list('sales')), saleCols),
  },
  {
    key: 'pelanggan',
    label: 'Pelanggan',
    icon: 'users',
    toCsv: async () => buildCsv(live(await repository.list('customers')), customerCols),
  },
  {
    key: 'inventori',
    label: 'Inventori',
    icon: 'boxes-stacked',
    toCsv: async () => buildCsv(live(await repository.list('inventory')), inventoryCols),
  },
  {
    key: 'keuangan',
    label: 'Keuangan',
    icon: 'wallet',
    toCsv: async () => {
      const [incomes, expenses] = await Promise.all([
        repository.list('incomes'),
        repository.list('expenses'),
      ]);
      const rows: FinanceRow[] = [
        ...live(incomes).map((i: Income) => ({
          date: i.date,
          type: 'Pemasukan',
          category: i.category,
          description: i.description,
          amount: i.amount,
        })),
        ...live(expenses).map((e: Expense) => ({
          date: e.date,
          type: 'Pengeluaran',
          category: e.category,
          description: e.description,
          amount: e.amount,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return buildCsv(rows, financeCols);
    },
  },
];

/**
 * Unduh satu dataset sebagai CSV bertanggal.
 * Mekanisme unduhannya kini di `@/lib/csv`, dipakai bersama halaman Laporan —
 * sebelumnya tiap permukaan punya salinannya sendiri.
 */
export function downloadCsv(dataset: string, csv: string): void {
  downloadCsvFile(csvFilename(dataset), csv);
}
