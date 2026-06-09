/**
 * make-demo-backup.mjs — Generator data demo KUMULATIF untuk FixMaster.
 *
 * Menghasilkan satu file backup JSON (format FixMaster, bisa langsung di-Restore
 * lewat Pengaturan → Sistem → Backup & Restore) berisi data dari "hari pertama"
 * sampai hari ini. Data BERTUMBUH tiap hari: makin lama makin banyak transaksi,
 * pelanggan, servis — sehingga akun demo terlihat aktif & berkembang.
 *
 * Sifat deterministik: data tiap hari di-seed dari indeks hari, jadi menjalankan
 * ulang dengan --since yang sama menghasilkan hari-hari lama yang IDENTIK; file
 * besok = superset file hari ini (hanya menambah satu hari). Cocok untuk
 * di-generate ulang tiap hari lalu di-restore.
 *
 * Catatan: orgId di file DIABAIKAN saat restore (server memaksa org_id ke org
 * milik owner yang menjalankan). Tim & langganan tidak ikut diganti.
 *
 * Pemakaian:
 *   node scripts/make-demo-backup.mjs --since 2026-06-01 [--until YYYY-MM-DD] [--out file.json]
 */
import { writeFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';

// ---------- argumen ----------
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const sinceStr = arg('since', null);
if (!sinceStr || !/^\d{4}-\d{2}-\d{2}$/.test(sinceStr)) {
  console.error('Usage: node scripts/make-demo-backup.mjs --since YYYY-MM-DD [--until YYYY-MM-DD] [--out file.json]');
  process.exit(1);
}
const untilStr = arg('until', new Date().toISOString().slice(0, 10));
const outPath = arg('out', `fixmaster-demo-${untilStr}.json`);

const DAY = 86_400_000;
const since = new Date(sinceStr + 'T00:00:00.000Z');
const until = new Date(untilStr + 'T00:00:00.000Z');
const totalDays = Math.floor((until.getTime() - since.getTime()) / DAY) + 1;
if (totalDays < 1) {
  console.error('--until lebih awal dari --since.');
  process.exit(1);
}

// ---------- util ----------
const dstr = (d) => d.toISOString().slice(0, 10);
const ts = (d, hh, mm) => {
  const x = new Date(d);
  x.setUTCHours(hh, mm, 0, 0);
  return x.toISOString();
};
// RNG deterministik per-hari (mulberry32).
const rngFor = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));

const ORG_ID = uuid();
const t0 = ts(since, 8, 0);

// ---------- entitas statis (dibuat di hari pertama) ----------
const base = (outletId) => ({ orgId: ORG_ID, outletId, createdAt: t0, updatedAt: t0 });

const oPusat = uuid(), oDago = uuid(), oCimahi = uuid();
const outlets = [
  { ...base(null), id: oPusat, name: 'Pusat — Bandung', address: 'Jl. Merdeka No. 12, Bandung', isPrimary: true },
  { ...base(null), id: oDago, name: 'Cabang Dago', address: 'Jl. Ir. H. Juanda 88, Bandung', isPrimary: false },
  { ...base(null), id: oCimahi, name: 'Cabang Cimahi', address: 'Jl. Raya Cimahi 45, Cimahi', isPrimary: false },
];
const outletIds = [oPusat, oDago, oCimahi];

const wTunai = uuid(), wBca = uuid(), wQris = uuid();
const wallets = [
  { ...base(null), id: wTunai, name: 'Tunai', balance: 2_500_000, sortOrder: 0 },
  { ...base(null), id: wBca, name: 'Bank BCA', balance: 14_750_000, sortOrder: 1 },
  { ...base(null), id: wQris, name: 'QRIS', balance: 3_200_000, sortOrder: 2 },
];
const walletIds = [wTunai, wBca, wQris];

const suppliers = [
  { ...base(null), id: uuid(), name: 'PT Sumber Komponen', phone: '022-1234567', email: 'sales@sumberkomponen.co.id', address: 'Jl. Industri 8, Bandung', note: 'Langganan sparepart laptop' },
  { ...base(null), id: uuid(), name: 'CV Gadget Parts', phone: '021-7654321', email: 'order@gadgetparts.id', address: 'Mangga Dua, Jakarta', note: '' },
];

const inventory = [
  { ...base(oPusat), id: uuid(), name: 'Keyboard MacBook A1989', category: 'Sparepart', sku: 'KB-A1989', stock: 8, minStock: 2, costPrice: 850_000, sellPrice: 1_250_000, supplierId: null },
  { ...base(oPusat), id: uuid(), name: 'SSD NVMe 512GB', category: 'Sparepart', sku: 'SSD-512', stock: 15, minStock: 4, costPrice: 620_000, sellPrice: 950_000, supplierId: null },
  { ...base(oDago), id: uuid(), name: 'Baterai A1964 58Wh', category: 'Sparepart', sku: 'BT-A1964', stock: 6, minStock: 3, costPrice: 720_000, sellPrice: 1_100_000, supplierId: null },
  { ...base(oDago), id: uuid(), name: 'Thermal Paste MX-4', category: 'Consumable', sku: 'TP-MX4', stock: 40, minStock: 5, costPrice: 45_000, sellPrice: 90_000, supplierId: null },
  { ...base(oCimahi), id: uuid(), name: 'LCD iPhone 12', category: 'Sparepart', sku: 'LCD-IP12', stock: 5, minStock: 2, costPrice: 1_350_000, sellPrice: 1_950_000, supplierId: null },
  { ...base(oCimahi), id: uuid(), name: 'Adaptor 65W USB-C', category: 'Sparepart', sku: 'AD-65W', stock: 12, minStock: 4, costPrice: 180_000, sellPrice: 320_000, supplierId: null },
];

const fixedCosts = [
  { ...base(null), id: uuid(), name: 'Sewa Toko', amount: 3_500_000 },
  { ...base(null), id: uuid(), name: 'Listrik & Internet', amount: 900_000 },
];

const STAFF = [
  { name: 'Budi Santoso', role: 'owner' },
  { name: 'Sari Dewi', role: 'admin' },
  { name: 'Rizal Pratama', role: 'karyawan' },
];

const taskTmpl = { ...base(null), id: uuid(), title: 'Buka toko & cek kebersihan', description: 'Pastikan area kerja rapi sebelum buka.', recurrence: 'daily', weekdays: [], monthDays: [], onceDate: null, assigneeType: 'role', assigneeRole: 'karyawan', assigneeEmployeeId: null, assigneeOutletId: null, active: true, startDate: dstr(since), endDate: null };

// ---------- pool variasi ----------
const NAMES = ['Andi Pratama', 'Citra Lestari', 'Dewa Nugraha', 'Eka Putri', 'Fajar Ramadhan', 'Gita Maharani', 'Hadi Kusuma', 'Indah Sari', 'Joko Widodo', 'Kartika Sari', 'Lukman Hakim', 'Maya Anggraini', 'Nanda Saputra', 'Oki Setiawan', 'Putri Ayu', 'Qori Amelia', 'Rudi Hartono', 'Sinta Bella', 'Tono Suryo', 'Umi Kulsum'];
const DEVICES = [['Laptop', 'MacBook Pro 13"'], ['HP / Smartphone', 'iPhone 12'], ['Laptop', 'Asus ROG G14'], ['HP / Smartphone', 'Samsung A52'], ['Printer', 'Epson L3110'], ['PC / Komputer', 'PC Rakitan'], ['Laptop', 'Lenovo ThinkPad'], ['HP / Smartphone', 'Xiaomi Redmi 10']];
const COMPLAINTS = ['Mati total', 'Tidak mengisi daya', 'LCD pecah', 'Overheat', 'Lemot / hang', 'Terkena air', 'Baterai cepat habis', 'Hasil cetak bergaris'];

// ---------- akumulasi lintas hari ----------
const customers = [], services = [], sales = [], incomes = [], expenses = [], attendance = [], taskInstances = [], activity = [];
let svcNo = 0, saleNo = 0, custIdx = 0;

const mkLog = (d, hh, mm, who, action, entityType, label, meta = {}) => ({
  ...base(null), id: uuid(), createdAt: ts(d, hh, mm), updatedAt: ts(d, hh, mm),
  actorId: null, actorName: who.name, actorRole: who.role,
  action, entityType, entityId: uuid(), entityLabel: label, meta,
});

for (let i = 0; i < totalDays; i++) {
  const d = new Date(since.getTime() + i * DAY);
  const day = dstr(d);
  const r = rngFor(0x9e37 + i);

  // Pelanggan baru ~ tiap 2 hari (selama pool tersedia).
  if (i % 2 === 0 && custIdx < NAMES.length) {
    const outletId = pick(r, outletIds);
    customers.push({ ...base(outletId), id: uuid(), name: NAMES[custIdx], phone: `0812${String(10000000 + custIdx * 137).slice(0, 8)}`, email: '', address: 'Bandung', note: i === 0 ? 'Pelanggan tetap' : '' });
    custIdx++;
  }

  // Login harian (3 staf).
  STAFF.forEach((s, k) => activity.push(mkLog(d, 8, 30 + k, s, 'auth.login', 'session', s.name)));

  // Servis: 2-4 per hari.
  const nSvc = between(r, 2, 4);
  for (let j = 0; j < nSvc; j++) {
    svcNo++;
    const outletId = pick(r, outletIds);
    const cust = customers.length ? pick(r, customers) : null;
    const [category, device] = pick(r, DEVICES);
    const paid = r() < 0.6;
    const finalCost = paid ? between(r, 5, 20) * 100_000 : 0;
    const tech = STAFF[2];
    services.push({
      ...base(outletId), id: uuid(), serviceNo: `FM-${String(svcNo).padStart(4, '0')}`,
      customerId: cust?.id ?? null, customerName: cust?.name ?? 'Pelanggan', customerPhone: cust?.phone ?? '',
      category, device, complaint: pick(r, COMPLAINTS), accessories: 'Charger',
      status: paid ? 'lunas' : pick(r, ['diterima', 'pengerjaan', 'konfirmasi']),
      technicianId: null, technicianName: tech.name,
      estimateCost: finalCost || 500_000, finalCost, downPayment: 0, spareparts: [],
      warrantyServiceUntil: paid ? dstr(new Date(d.getTime() + 30 * DAY)) : null,
      warrantyPartsUntil: paid ? dstr(new Date(d.getTime() + 7 * DAY)) : null,
      pickedUp: false, pickedUpAt: null, warrantyClaimOf: null,
      history: [{ at: ts(d, 9, 0), status: 'diterima', by: '', byName: tech.name, note: 'Unit diterima', internal: false }],
      archived: false,
    });
    activity.push(mkLog(d, 9, j, tech, 'service.create', 'service', `FM-${String(svcNo).padStart(4, '0')}`, { device }));
    if (paid) {
      const wId = pick(r, walletIds);
      incomes.push({ ...base(outletId), id: uuid(), date: day, category: 'Servis', amount: finalCost, walletId: wId, description: `Pelunasan servis FM-${String(svcNo).padStart(4, '0')}`, serviceId: services[services.length - 1].id });
    }
  }

  // Penjualan POS: 1-3 per hari.
  const nSale = between(r, 1, 3);
  for (let j = 0; j < nSale; j++) {
    saleNo++;
    const outletId = pick(r, outletIds);
    const item = pick(r, inventory);
    const qty = between(r, 1, 2);
    const total = item.sellPrice * qty;
    const wId = pick(r, walletIds);
    sales.push({
      ...base(outletId), id: uuid(), saleNo: `INV-${String(saleNo).padStart(4, '0')}`, date: day,
      lines: [{ itemId: item.id, name: item.name, qty, sellPrice: item.sellPrice, costPrice: item.costPrice }],
      subtotal: total, discount: 0, discountType: 'amount', total,
      payments: [{ walletId: wId, amount: total }],
      cashierId: null, cashierName: pick(r, STAFF).name, voided: false, voidedReason: '',
    });
    incomes.push({ ...base(outletId), id: uuid(), date: day, category: 'Penjualan', amount: total, walletId: wId, description: `Penjualan ${item.name}`, serviceId: null });
    activity.push(mkLog(d, 10, j, STAFF[1], 'sale.create', 'sale', `INV-${String(saleNo).padStart(4, '0')}`, { total, items: qty }));
  }

  // Pengeluaran: 1-2 per hari.
  const nExp = between(r, 1, 2);
  for (let j = 0; j < nExp; j++) {
    const outletId = pick(r, outletIds);
    const amount = between(r, 1, 4) * 100_000;
    expenses.push({ ...base(outletId), id: uuid(), date: day, category: pick(r, ['Operasional', 'Sparepart']), amount, walletId: pick(r, walletIds), description: pick(r, ['Listrik harian', 'Transport antar unit', 'Alat & bahan', 'Konsumsi tim']) });
  }

  // Absensi harian (3 staf).
  STAFF.forEach((s) => attendance.push({ ...base(null), id: uuid(), employeeId: null, employeeName: s.name, date: day, status: 'hadir', checkIn: '08:30', checkOut: '17:15', totalHours: 8.75, note: '' }));

  // Instansi tugas harian.
  taskInstances.push({ ...base(null), id: uuid(), templateId: taskTmpl.id, title: taskTmpl.title, description: taskTmpl.description, dueDate: day, status: r() < 0.8 ? 'done' : 'pending', completedAt: r() < 0.8 ? ts(d, 8, 45) : null, completedById: null, completedByName: r() < 0.8 ? STAFF[2].name : '', note: '' });
}

// PO terbuka (1) supaya docket supplier tak kosong.
const purchaseOrders = [
  { ...base(oPusat), id: uuid(), poNumber: 'PO-0001', supplierId: suppliers[0].id, status: 'ordered', lines: [{ itemId: inventory[0].id, name: inventory[0].name, qty: 5, costPrice: inventory[0].costPrice, receivedQty: 0 }], orderedAt: dstr(until), receivedAt: null, note: 'Restock keyboard MacBook' },
];

// ---------- rakit file backup ----------
const backup = {
  app: 'fixmaster',
  version: 1,
  exportedAt: new Date().toISOString(),
  orgId: ORG_ID,
  collections: {
    outlets, wallets, suppliers, inventory, fixedCosts,
    customers, services, purchaseOrders, sales, incomes, expenses,
    attendance, taskTemplates: [taskTmpl], taskInstances, activity,
  },
  organization: null,
};

writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf8');
const n = Object.values(backup.collections).reduce((a, c) => a + c.length, 0);
console.log(`Generated ${totalDays} hari (${sinceStr} → ${untilStr}), ${n} record → ${outPath}`);
console.log(`  servis: ${services.length}, penjualan: ${sales.length}, pelanggan: ${customers.length}, pemasukan: ${incomes.length}`);
