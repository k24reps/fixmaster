/**
 * DEV-ONLY demo seed. Exposed as window.__fixmasterSeed() in dev builds so
 * Playwright (and manual testing) can populate a realistic workspace and
 * land on the authenticated app without clicking through the wizard.
 *
 * NOT bundled in production (guarded by import.meta.env.DEV in main.tsx).
 *
 * Scope of this dataset (per request): a SMALL but complete snapshot for a
 * SINGLE day — 4 June 2026 (= "today") — spread across one main store plus
 * two branches, and balanced so the month is clearly profitable.
 */
import { repository } from '@/data';
import { commitWizard, emptyWizardData } from '@/features/onboarding/wizard-logic';
import { useSessionStore } from '@/stores/session';
import { newId } from '@/lib/id';
import { localDateStr, addDays, calcHours } from '@/lib/time';
import type {
  Customer,
  InventoryItem,
  Service,
  ServiceStatus,
  Supplier,
  PurchaseOrder,
  Income,
  Expense,
  Sale,
  Attendance,
  TaskTemplate,
  TaskInstance,
  Outlet,
  ActivityLog,
} from '@/data/types';

export async function seedDemoWorkspace(): Promise<void> {
  await repository.clearAll();

  // 1) Base workspace via the real wizard commit path.
  const data = emptyWizardData();
  data.shopName = 'TechFix Service Center';
  data.address = 'Jl. Merdeka No. 12, Bandung';
  data.phone = '0812-3456-7890';
  data.servicePrefix = 'FM';
  data.wallets = [
    { name: 'Tunai', balance: 2_500_000 },
    { name: 'Bank BCA', balance: 14_750_000 },
    { name: 'QRIS', balance: 3_200_000 },
  ];
  data.employees = [
    { name: 'Budi Santoso', role: 'owner', pin: '1234' },
    { name: 'Sari Dewi', role: 'admin', pin: '2345' },
    { name: 'Rizal Pratama', role: 'karyawan', pin: '3456' },
  ];
  data.fixedCosts = [
    { name: 'Sewa Toko', amount: 3_500_000 },
    { name: 'Listrik & Internet', amount: 900_000 },
  ];
  data.targetRevenue = 50_000_000;
  data.targetServiceCount = 60;
  data.overheadBudget = 5_000_000;
  // Opt out of wizard outlet creation — the seed defines its own 3 outlets below.
  data.outlets = [];

  const { org, owner } = await commitWizard(data, { forceLocal: true });
  repository.setScope(org.id, null);

  // Default service templates (quick-picks in the service form, editable in
  // Settings). Written by org-scoped key, matching the wizard's category store.
  localStorage.setItem(
    `fixmaster-complaints-${org.id}`,
    JSON.stringify(['Mati total', 'Tidak mengisi daya', 'LCD pecah', 'Overheat', 'Lemot / hang', 'Terkena air']),
  );
  localStorage.setItem(
    `fixmaster-accessories-${org.id}`,
    JSON.stringify(['Charger', 'Tas', 'Kartu SIM', 'Memory card', 'Box']),
  );

  const now = new Date().toISOString();
  const today = localDateStr(); // 4 June 2026

  // Bases: org-wide (outletId null, e.g. wallets/employees) vs outlet-scoped.
  const orgBase = { orgId: org.id, outletId: null, createdAt: now, updatedAt: now, deletedAt: null };
  const at = (outletId: string) => ({
    orgId: org.id,
    outletId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  // 2) Outlets — 1 main store + 2 branches.
  const oPusat = newId();
  const oDago = newId();
  const oCimahi = newId();
  const outlets: Outlet[] = [
    { ...orgBase, id: oPusat, name: 'Pusat — Bandung', address: 'Jl. Merdeka No. 12, Bandung', isPrimary: true },
    { ...orgBase, id: oDago, name: 'Cabang Dago', address: 'Jl. Ir. H. Juanda 88, Bandung', isPrimary: false },
    { ...orgBase, id: oCimahi, name: 'Cabang Cimahi', address: 'Jl. Raya Cimahi 45, Cimahi', isPrimary: false },
  ];
  await repository.putMany('outlets', outlets);

  // 3) Customers — one per outlet.
  const customers: Customer[] = [
    { ...at(oPusat), id: newId(), name: 'Andi Pratama', phone: '081234567890', email: 'andi@mail.com', address: 'Jl. Asia Afrika 5', note: 'Pelanggan tetap' },
    { ...at(oDago), id: newId(), name: 'Citra Lestari', phone: '081298765432', email: '', address: 'Jl. Braga 21', note: '' },
    { ...at(oCimahi), id: newId(), name: 'Dewa Nugraha', phone: '081377788899', email: 'dewa@mail.com', address: 'Jl. Gatot Subroto 9', note: '' },
  ];
  await repository.putMany('customers', customers);

  // 4) Inventory — distributed; a couple low/critical for alerts.
  const inventory: InventoryItem[] = [
    { ...at(oPusat), id: newId(), name: 'Keyboard MacBook A1989', category: 'Sparepart', sku: 'KB-A1989', stock: 4, minStock: 2, costPrice: 850_000, sellPrice: 1_250_000, supplierId: null },
    { ...at(oPusat), id: newId(), name: 'SSD NVMe 512GB', category: 'Sparepart', sku: 'SSD-512', stock: 10, minStock: 4, costPrice: 620_000, sellPrice: 950_000, supplierId: null },
    { ...at(oDago), id: newId(), name: 'Baterai A1964 58Wh', category: 'Sparepart', sku: 'BT-A1964', stock: 1, minStock: 3, costPrice: 720_000, sellPrice: 1_100_000, supplierId: null },
    { ...at(oDago), id: newId(), name: 'Thermal Paste MX-4', category: 'Consumable', sku: 'TP-MX4', stock: 25, minStock: 5, costPrice: 45_000, sellPrice: 90_000, supplierId: null },
    { ...at(oCimahi), id: newId(), name: 'LCD iPhone 12', category: 'Sparepart', sku: 'LCD-IP12', stock: 2, minStock: 2, costPrice: 1_350_000, sellPrice: 1_950_000, supplierId: null },
  ];
  await repository.putMany('inventory', inventory);

  // 5) Services on 4 June — mix of paid (lunas) + still-active, per outlet.
  const tech = 'Rizal Pratama';
  const mkService = (
    outletId: string,
    n: number,
    cust: Customer,
    category: string,
    device: string,
    complaint: string,
    status: ServiceStatus,
    finalCost: number,
    downPayment: number,
  ): Service => ({
    ...at(outletId),
    id: newId(),
    serviceNo: `FM-${String(n).padStart(4, '0')}`,
    customerId: cust.id,
    customerName: cust.name,
    customerPhone: cust.phone,
    category,
    device,
    complaint,
    accessories: 'Charger',
    status,
    technicianId: null,
    technicianName: tech,
    estimateCost: finalCost || 500_000,
    finalCost,
    downPayment,
    spareparts: [],
    warrantyServiceUntil: status === 'lunas' || status === 'selesai' ? addDays(today, 30) : null,
    warrantyPartsUntil: status === 'lunas' || status === 'selesai' ? addDays(today, 7) : null,
    pickedUp: false,
    pickedUpAt: null,
    warrantyClaimOf: null,
    history: [
      { at: now, status: 'diterima', by: owner.id, byName: owner.name, note: 'Unit diterima', internal: false },
    ],
    archived: false,
  });
  const services: Service[] = [
    mkService(oPusat, 1, customers[0], 'Laptop', 'MacBook Pro 13" 2019', 'Keyboard mati total', 'lunas', 1_500_000, 0),
    mkService(oPusat, 2, customers[0], 'HP / Smartphone', 'iPhone 12', 'LCD retak', 'pengerjaan', 0, 200_000),
    mkService(oDago, 3, customers[1], 'Laptop', 'Asus ROG G14', 'Overheat & mati sendiri', 'lunas', 1_200_000, 0),
    mkService(oDago, 4, customers[1], 'HP / Smartphone', 'Samsung A52', 'Baterai cepat habis', 'konfirmasi', 0, 0),
    mkService(oCimahi, 5, customers[2], 'Printer', 'Epson L3110', 'Hasil cetak bergaris', 'lunas', 850_000, 0),
    mkService(oCimahi, 6, customers[2], 'PC / Komputer', 'PC Rakitan', 'Tidak mau menyala', 'diterima', 0, 0),
  ];
  await repository.putMany('services', services);

  // 6) Suppliers + one open PO (so the suppliers docket isn't empty).
  const supSumber = newId();
  const suppliers: Supplier[] = [
    { ...orgBase, id: supSumber, name: 'PT Sumber Komponen', phone: '022-1234567', email: 'sales@sumberkomponen.co.id', address: 'Jl. Industri 8, Bandung', note: 'Langganan sparepart laptop' },
    { ...orgBase, id: newId(), name: 'CV Gadget Parts', phone: '021-7654321', email: 'order@gadgetparts.id', address: 'Mangga Dua, Jakarta', note: '' },
  ];
  await repository.putMany('suppliers', suppliers);

  const purchaseOrders: PurchaseOrder[] = [
    {
      ...at(oPusat),
      id: newId(),
      poNumber: 'PO-0001',
      supplierId: supSumber,
      status: 'ordered',
      lines: [{ itemId: inventory[0].id, name: inventory[0].name, qty: 5, costPrice: inventory[0].costPrice, receivedQty: 0 }],
      orderedAt: today,
      receivedAt: null,
      note: 'Restock keyboard MacBook',
    },
  ];
  await repository.putMany('purchaseOrders', purchaseOrders);

  // 7) Finance on 4 June — kept clearly profitable.
  const wallets = await repository.list('wallets');
  const wId = (name: string) => wallets.find((w) => w.name === name)?.id ?? wallets[0]?.id ?? '';
  const cash = wId('Tunai');
  const bca = wId('Bank BCA');
  const qris = wId('QRIS');

  // Income total = 6.450.000. Service incomes link back to their tickets via
  // serviceId (mirrors the real "lunas" flow), so deleting the income reverts
  // the service lunas → selesai.
  const incomes: Income[] = [
    { ...at(oPusat), id: newId(), date: today, category: 'Servis', amount: 1_500_000, walletId: cash, description: 'Pelunasan servis FM-0001 (MacBook)', serviceId: services[0].id },
    { ...at(oPusat), id: newId(), date: today, category: 'Penjualan', amount: 950_000, walletId: qris, description: 'Penjualan SSD NVMe 512GB', serviceId: null },
    { ...at(oDago), id: newId(), date: today, category: 'Servis', amount: 1_200_000, walletId: bca, description: 'Pelunasan servis FM-0003 (Asus ROG)', serviceId: services[2].id },
    { ...at(oCimahi), id: newId(), date: today, category: 'Servis', amount: 850_000, walletId: cash, description: 'Pelunasan servis FM-0005 (Epson)', serviceId: services[4].id },
    { ...at(oCimahi), id: newId(), date: today, category: 'Penjualan', amount: 1_950_000, walletId: qris, description: 'Penjualan LCD iPhone 12', serviceId: null },
  ];
  await repository.putMany('incomes', incomes);

  // Expense total = 1.350.000 → net profit +5.100.000
  const expenses: Expense[] = [
    { ...at(oPusat), id: newId(), date: today, category: 'Sparepart', amount: 800_000, walletId: bca, description: 'Restock keyboard MacBook' },
    { ...at(oPusat), id: newId(), date: today, category: 'Operasional', amount: 250_000, walletId: cash, description: 'Alat solder & timah' },
    { ...at(oDago), id: newId(), date: today, category: 'Operasional', amount: 150_000, walletId: cash, description: 'Listrik harian cabang' },
    { ...at(oCimahi), id: newId(), date: today, category: 'Operasional', amount: 150_000, walletId: cash, description: 'Transport antar unit' },
  ];
  await repository.putMany('expenses', expenses);

  // 8) POS sales on 4 June (mirrors the "Penjualan" incomes for reports).
  const sales: Sale[] = [
    {
      ...at(oPusat), id: newId(), saleNo: 'INV-0001', date: today,
      lines: [{ itemId: inventory[1].id, name: inventory[1].name, qty: 1, sellPrice: inventory[1].sellPrice, costPrice: inventory[1].costPrice }],
      subtotal: 950_000, discount: 0, discountType: 'amount', total: 950_000,
      payments: [{ walletId: qris, amount: 950_000 }],
      cashierId: owner.id, cashierName: owner.name, voided: false, voidedReason: '',
    },
    {
      ...at(oCimahi), id: newId(), saleNo: 'INV-0002', date: today,
      lines: [{ itemId: inventory[4].id, name: inventory[4].name, qty: 1, sellPrice: inventory[4].sellPrice, costPrice: inventory[4].costPrice }],
      subtotal: 1_950_000, discount: 0, discountType: 'amount', total: 1_950_000,
      payments: [{ walletId: qris, amount: 1_950_000 }],
      cashierId: owner.id, cashierName: owner.name, voided: false, voidedReason: '',
    },
  ];
  await repository.putMany('sales', sales);

  // 9) Attendance for today (org-wide). Owner still working → dashboard shows
  // "Teknisi Hadir". totalHours is derived from check-in/out (minutes → decimal)
  // via calcHours, not a hardcoded value.
  const employees = await repository.list('employees');
  const CHECK_IN = '08:30';
  const CHECK_OUT = '17:15';
  const attendance: Attendance[] = employees.map((e) => {
    const isOwner = e.id === owner.id;
    return {
      ...orgBase,
      id: newId(),
      employeeId: e.id,
      employeeName: e.name,
      date: today,
      status: 'hadir',
      checkIn: CHECK_IN,
      checkOut: isOwner ? null : CHECK_OUT,
      totalHours: isOwner ? 0 : calcHours(CHECK_IN, CHECK_OUT),
      note: '',
    };
  });
  await repository.putMany('attendance', attendance);

  // 10) One task template + instances (pending + done) for the job board.
  const tmplDaily: TaskTemplate = {
    ...orgBase,
    id: newId(),
    title: 'Buka toko & cek kebersihan',
    description: 'Pastikan area kerja rapi sebelum buka.',
    recurrence: 'daily',
    weekdays: [],
    monthDays: [],
    onceDate: null,
    assigneeType: 'role',
    assigneeRole: 'karyawan',
    assigneeEmployeeId: null,
    assigneeOutletId: null,
    active: true,
    startDate: today,
    endDate: null,
  };
  await repository.putMany('taskTemplates', [tmplDaily]);

  const taskInstances: TaskInstance[] = [
    { ...orgBase, id: newId(), templateId: tmplDaily.id, title: tmplDaily.title, description: tmplDaily.description, dueDate: today, status: 'pending', completedAt: null, completedById: null, completedByName: '', note: '' },
    { ...at(oDago), id: newId(), templateId: tmplDaily.id, title: 'Cek antrian unit Cabang Dago', description: '', dueDate: today, status: 'done', completedAt: now, completedById: owner.id, completedByName: owner.name, note: '' },
  ];
  await repository.putMany('taskInstances', taskInstances);

  // 10b) Activity log — owner-only audit trail (migration 0019). A realistic
  // spread across all three roles and two days so the Event Recorder page has
  // signal to show. Actors are looked up from the seeded employees.
  const admin = employees.find((e) => e.role === 'admin') ?? owner;
  const staff = employees.find((e) => e.role === 'karyawan') ?? owner;
  const yesterday = addDays(today, -1);
  const ts = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;
  const actor = (e: { id: string; name: string; role: 'owner' | 'admin' | 'karyawan' }) => ({
    actorId: e.id,
    actorName: e.name,
    actorRole: e.role,
  });
  const mkLog = (
    who: typeof owner,
    createdAt: string,
    action: ActivityLog['action'],
    entityType: string,
    entityLabel: string,
    meta: Record<string, unknown> = {},
  ): ActivityLog => ({
    ...orgBase,
    id: newId(),
    createdAt,
    updatedAt: createdAt,
    ...actor(who as { id: string; name: string; role: 'owner' | 'admin' | 'karyawan' }),
    action,
    entityType,
    entityId: newId(),
    entityLabel,
    meta,
  });
  const activity: ActivityLog[] = [
    // Yesterday
    mkLog(owner, ts(yesterday, '08:31'), 'auth.login', 'session', owner.name),
    mkLog(staff, ts(yesterday, '08:35'), 'auth.login', 'session', staff.name),
    mkLog(staff, ts(yesterday, '09:12'), 'service.create', 'service', 'FM-0003', { device: 'Asus ROG G14' }),
    mkLog(admin, ts(yesterday, '10:48'), 'customer.create', 'customer', 'Citra Lestari'),
    mkLog(staff, ts(yesterday, '13:20'), 'service.status', 'service', 'FM-0003', { from: 'diterima', to: 'pengerjaan' }),
    mkLog(admin, ts(yesterday, '15:02'), 'expense.create', 'expense', 'Listrik harian cabang', { amount: 150_000 }),
    mkLog(owner, ts(yesterday, '16:40'), 'inventory.update', 'inventory', 'SSD NVMe 512GB', { stock: 10 }),
    // Today
    mkLog(owner, ts(today, '08:30'), 'auth.login', 'session', owner.name),
    mkLog(admin, ts(today, '08:33'), 'auth.login', 'session', admin.name),
    mkLog(staff, ts(today, '08:34'), 'auth.login', 'session', staff.name),
    mkLog(staff, ts(today, '09:05'), 'sale.create', 'sale', 'INV-0001', { total: 950_000, items: 1 }),
    mkLog(admin, ts(today, '09:40'), 'income.create', 'income', 'Penjualan SSD NVMe 512GB', { amount: 950_000 }),
    mkLog(staff, ts(today, '10:15'), 'service.create', 'service', 'FM-0006', { device: 'PC Rakitan' }),
    mkLog(admin, ts(today, '11:22'), 'customer.update', 'customer', 'Andi Pratama'),
    mkLog(owner, ts(today, '11:50'), 'sale.void', 'sale', 'INV-0002', { total: 1_950_000, reason: 'Salah input qty' }),
    mkLog(staff, ts(today, '13:08'), 'inventory.create', 'inventory', 'Thermal Paste MX-4', { stock: 25 }),
    mkLog(admin, ts(today, '14:30'), 'attendance.update', 'attendance', staff.name, { date: today }),
    mkLog(owner, ts(today, '15:12'), 'expense.delete', 'expense', 'Alat solder & timah', { amount: 250_000 }),
    mkLog(staff, ts(today, '16:00'), 'service.status', 'service', 'FM-0001', { from: 'selesai', to: 'lunas' }),
  ];
  await repository.putMany('activity', activity);

  // 11) Land on the authenticated app as the owner, scoped to all outlets
  // (reset any branch scope persisted by a previous seed).
  const store = useSessionStore.getState();
  store.setOrg(org);
  store.setActiveOutlet(null);
  await store.loadEmployees();
  store.signInEmployee(owner);
}
