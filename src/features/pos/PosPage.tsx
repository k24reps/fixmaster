import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card,
  Input,
  Button,
  Badge,
  EmptyState,
  Icon,
  Modal,
  LoadState,
  loadPending,
  ViewToggle,
  CategoryChips,
  usePersistedView,
  countCategories,
  categoryOf,
} from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { voidSale, processSale } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import { isManager } from '@/config/plans';
import { logActivity } from '@/lib/activity';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr, fmtDate, monthRange } from '@/lib/time';
import {
  cartSubtotal,
  resolveDiscount,
  discountLimit,
  STAFF_MAX_DISCOUNT_PCT,
  cartTotal,
  validateCart,
  settleTender,
  changeRowIndex,
  cashSuggestions,
  pickOnEnter,
  groupSalesByDay,
  toSaleLines,
  type CartItem,
  type DiscountType,
} from '@/lib/business/pos';
import { searchCustomers } from '@/lib/business/customers';
import { interpolate, waLink } from '@/lib/business/notify';
import { useT } from '@/i18n';
import { walletsForOutlet } from '@/lib/business/finance';
import { useCustomerSearch } from '@/hooks/useCustomerSearch';
import { printSaleReceipt } from './printSaleReceipt';
import { CustomerModal } from '@/features/customers/CustomerModal';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import type { Customer, InventoryItem, Sale, PaymentAllocation } from '@/data/types';
import styles from './PosPage.module.css';

export function PosPage() {
  const { data: inventory, ...inventoryLoad } = useCollection('inventory');
  const { data: allWallets } = useCollection('wallets');
  const { data: sales, ...salesLoad } = useCollection('sales');
  const { data: outlets } = useCollection('outlets');
  // Pelanggan dicari di server; daftar lokal hanya untuk adapter lokal/demo.
  const serverSearch = !!repository.queryCustomers;
  const { data: customers } = useCollection('customers', { enabled: !serverSearch });
  const t = useT();
  const me = useSessionStore((s) => s.currentEmployee);
  const org = useSessionStore((s) => s.org);
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  // Cara bayar = wallet bersama + wallet cabang ini (0095). "Tunai Pusat" tidak
  // ditawarkan di meja Dago; server menolaknya juga.
  const wallets = walletsForOutlet(allWallets, activeOutletId);
  const cashIds = new Set(wallets.filter((w) => w.isCash).map((w) => w.id));
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  const setActiveOutlet = useSessionStore((s) => s.setActiveOutlet);
  const reachableOutlets = allowedOutletIds.length
    ? outlets.filter((o) => allowedOutletIds.includes(o.id))
    : outlets;
  // Mesin kasir milik satu meja: di "Semua Outlet" katalognya campuran stok
  // beberapa cabang, jadi cabang dipilih SEBELUM katalog tampil — bukan
  // ditolak setelah keranjang dan pembayaran terisi (critique 27 Sep 2026).
  // activeOutletId dibaca di atas supaya komponen ini ikut render ulang.
  const needOutlet = mustPickOutlet(outlets.length);
  const activeOutlet = outlets.find((o) => o.id === activeOutletId) ?? null;
  const orgId = org?.id ?? '';
  const isMgr = me ? isManager(me.role) : false;
  // Penjualan bulan lalu tidak bisa dibatalkan (0069): laporan bulan itu sudah berjalan.
  const monthStart = monthRange().from;

  const [query, setQuery] = useState('');
  const [view, chooseView] = usePersistedView('fixmaster-pos-view');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  // Uang yang DITERIMA per wallet, urut sesuai ketukan; kembalian dipotong dari
  // baris terakhir (settleTender).
  const [tender, setTender] = useState<PaymentAllocation[]>([]);
  const [busy, setBusy] = useState(false);
  // Keadaan LUNAS setelah transaksi: register menahan total & kembalian, dan
  // struk tersedia tepat saat pelanggan masih di depan meja.
  const [done, setDone] = useState<{ sale: Sale; change: number; phone: string } | null>(null);
  const [outletModal, setOutletModal] = useState(false);
  // Isi keranjang terakhir yang dikosongkan — "Kosongkan" dulu tanpa jalan kembali.
  const [cleared, setCleared] = useState<{
    cart: CartItem[];
    discount: string;
    discountType: DiscountType;
    tender: PaymentAllocation[];
    customer: Customer | null;
  } | null>(null);
  const [outletNotice, setOutletNotice] = useState(false);
  const [cartOutlet, setCartOutlet] = useState(activeOutletId);
  const [cartInView, setCartInView] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Fokus otomatis hanya untuk mouse: di ponsel ia memunculkan keyboard.
  const [finePointer] = useState(() => !!window.matchMedia?.('(pointer: fine)').matches);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);
  const [tab, setTab] = useState<'pos' | 'history'>('pos');
  // Pelanggan transaksi (opsional): belanja sparepart pun jadi bagian riwayat
  // orangnya, bukan penjualan anonim yang tak bisa ditelusuri lagi.
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState('');

  // Transaksi terbaru (terbaru dulu): untuk cetak ulang struk & pembatalan.
  // Delapan baris tidak cukup bahkan untuk satu hari kasir yang ramai.
  const recentSales = useMemo(
    () => [...sales].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 30),
    [sales],
  );

  const { results: remoteCustomers, pending: custPending } = useCustomerSearch({ enabled: true, term: custQuery });
  const [custModal, setCustModal] = useState(false);
  // `searchCustomers` tetap yang memutuskan — server hanya mempersempit kandidat.
  const custMatches = useMemo(
    () => searchCustomers(serverSearch ? remoteCustomers : customers, custQuery),
    [serverSearch, remoteCustomers, customers, custQuery],
  );

  // Void a sale (manager-only). Cloud → atomic RPC; local → mirror the
  // reversal (restore stock, reverse wallet, delete linked income, mark void).
  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (voidTarget.date < monthStart) {
      toast.error(t('pos.voidLastMonth'));
      return;
    }
    setVoidBusy(true);
    try {
      if (isCloudMode()) {
        await voidSale(voidTarget.id, voidReason.trim());
      } else {
        const inv = await repository.list('inventory');
        const restocked = voidTarget.lines
          .map((l) => {
            const item = inv.find((i) => i.id === l.itemId);
            return item ? { ...item, stock: item.stock + l.qty } : null;
          })
          .filter((x): x is InventoryItem => x !== null);
        if (restocked.length) await repository.putMany('inventory', restocked);

        const allIncomes = await repository.list('incomes');
        const allWallets = await repository.list('wallets');
        for (const inc of allIncomes.filter((i) => i.saleId === voidTarget.id)) {
          const w = allWallets.find((x) => x.id === inc.walletId);
          if (w) await repository.put('wallets', { ...w, balance: w.balance - inc.amount });
          await repository.remove('incomes', inc.id);
        }
        await repository.put('sales', {
          ...voidTarget,
          voided: true,
          voidedReason: voidReason.trim(),
        });
      }
      toast.success(interpolate(t('pos.voided'), { no: voidTarget.saleNo }));
      // Di cloud ini dilewati: database yang mencatatnya sendiri (0073, lihat
      // SERVER_LOGGED di lib/activity).
      logActivity({
        action: 'sale.void',
        entityType: 'sale',
        entityId: voidTarget.id,
        entityLabel: voidTarget.saleNo,
        meta: { total: voidTarget.total, reason: voidReason.trim() },
      });
      setVoidTarget(null);
      setVoidReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pos.voidFailed'));
    } finally {
      setVoidBusy(false);
    }
  };

  // Kategori dari barang yang BISA dijual (stok > 0), dengan jumlahnya.
  const categoryCounts = useMemo(
    () => countCategories(inventory.filter((i) => i.stock > 0)),
    [inventory],
  );
  const inStockCount = categoryCounts.reduce((n, [, count]) => n + count, 0);
  // Kategori yang stoknya habis semua tak lagi punya chip; pilihan lama jangan
  // sampai mengunci katalog di daftar kosong.
  const activeCategory = categoryCounts.some(([c]) => c === category) ? category : 'all';

  // Barang habis tetap muncul saat DICARI (redup, "Habis") — kalau disembunyikan,
  // kasir membaca "tidak ada yang cocok" dan mengira barangnya tak terdaftar.
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter((i) => i.stock > 0 || !!q)
      .filter((i) => activeCategory === 'all' || categoryOf(i.category) === activeCategory)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.sku ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0))
      .slice(0, 50);
  }, [inventory, query, activeCategory]);

  const subtotal = cartSubtotal(cart);
  const discountValue = resolveDiscount(subtotal, parseRpInput(discount), discountType);
  const total = cartTotal(cart, parseRpInput(discount), discountType);
  const settle = settleTender(tender, total, cashIds);
  // Riwayat bisa memuat wallet cabang lain / yang sudah dipindah — cari di semua.
  const walletName = (id: string | null) => allWallets.find((w) => w.id === id)?.name ?? '';
  // Baris yang menyerahkan kembalian: tunai terakhir, atau baris terakhir.
  const changeTender = tender[changeRowIndex(tender, cashIds)];
  const quickCash = changeTender
    ? cashSuggestions(total - (settle.paid - Math.max(0, changeTender.amount)))
    : [];
  // Diskon besar = uang toko keluar tanpa persetujuan. Karyawan dibatasi;
  // server menolaknya juga (0070), ini hanya supaya batasnya terbaca lebih awal.
  const maxDiscount = discountLimit(subtotal, isMgr);
  const discountOver = discountValue > maxDiscount;
  const totalQty = cart.reduce((n, c) => n + c.qty, 0);
  const nextNo = useMemo(() => nextDocNumber('INV', sales.map((s) => s.saleNo)), [sales]);
  const totalText = fmtRp(done ? done.sale.total : total);
  const totalGhost = totalText.replace(/[0-9]/g, '8');

  // Cabang berganti dari mana pun (register, sidebar, menu ponsel): stok di
  // keranjang milik cabang lama, jadi keranjang dikosongkan dan diberi tahu —
  // dulu keranjang tetap, lalu checkout gagal dengan "Stok … berubah" palsu.
  if (cartOutlet !== activeOutletId) {
    setCartOutlet(activeOutletId);
    if (cart.length) {
      setCart([]);
      setTender([]);
      setDiscount('');
      setOutletNotice(true);
    }
  }

  // Dock ponsel hanya berguna selama register belum terlihat.
  useEffect(() => {
    const el = document.getElementById('pos-cart');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCartInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [tab, needOutlet]);

  // "/" memfokuskan pencarian dari mana saja di halaman (kecuali saat mengetik).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addToCart = (item: InventoryItem) => {
    if (item.stock <= 0) {
      toast.warning(t('pos.outOfStockToast').replace('{name}', item.name));
      return;
    }
    // Dicek di luar updater: updater setState dijalankan dua kali di StrictMode,
    // dan toast di dalamnya dulu muncul kembar.
    const inCart = cart.find((c) => c.itemId === item.id);
    if (inCart && inCart.qty >= item.stock) {
      toast.warning(interpolate(t('pos.stockLimit'), { name: item.name, n: String(item.stock) }));
      return;
    }
    setDone(null);
    setOutletNotice(false);
    setCleared(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.itemId === item.id ? { ...c, qty: Math.min(c.qty + 1, item.stock) } : c,
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          qty: 1,
          sellPrice: item.sellPrice,
          costPrice: item.costPrice,
          stock: item.stock,
        },
      ];
    });
  };

  const setQty = (itemId: string, qty: number) => {
    const item = cart.find((c) => c.itemId === itemId);
    if (item && qty > item.stock) {
      toast.warning(interpolate(t('pos.stockLimit'), { name: item.name, n: String(item.stock) }));
    }
    setCart((prev) =>
      prev
        .map((c) => (c.itemId === itemId ? { ...c, qty: Math.max(0, Math.min(qty, c.stock)) } : c))
        .filter((c) => c.qty > 0),
    );
  };

  // Tombol wallet: yang belum dipakai ditambahkan dengan SISA tagihan, jadi
  // pembayaran pas cukup satu ketukan; yang sudah dipakai difokuskan saja.
  const pickWallet = (walletId: string) => {
    if (tender.some((p) => p.walletId === walletId)) {
      document.getElementById(`tender-${walletId}`)?.focus();
      return;
    }
    setTender((prev) => [...prev, { walletId, amount: Math.max(0, settle.due) }]);
  };
  // Nominal diubah DI TEMPAT — urutan baris tetap, karena baris terakhir yang
  // menyerahkan kembalian.
  const setTenderAmount = (walletId: string, amount: number) =>
    setTender((prev) => prev.map((p) => (p.walletId === walletId ? { ...p, amount } : p)));
  const removeTender = (walletId: string) =>
    setTender((prev) => prev.filter((p) => p.walletId !== walletId));

  const reset = () => {
    setCart([]);
    setDiscount('');
    setTender([]);
    setCustomer(null);
    setCustQuery('');
  };

  const clearCart = () => {
    setCleared({ cart, discount, discountType, tender, customer });
    reset();
    searchRef.current?.focus();
  };
  const restoreCart = () => {
    if (!cleared) return;
    setCart(cleared.cart);
    setDiscount(cleared.discount);
    setDiscountType(cleared.discountType);
    setTender(cleared.tender);
    setCustomer(cleared.customer);
    setCleared(null);
  };

  // Kirim ulang struk WA dari riwayat. Nomor diambil dari data pelanggan saat
  // diklik; jendela dibuka lebih dulu (sinkron) supaya tak diblokir peramban.
  const resendWa = async (s: Sale) => {
    const win = window.open('', '_blank');
    try {
      const c = s.customerId ? await repository.get('customers', s.customerId) : null;
      if (!c?.phone) {
        win?.close();
        toast.warning(t('pos.noPhone'));
        return;
      }
      const url = waLink(c.phone, waMessage(s));
      if (win) win.location.href = url;
      else window.open(url, '_blank');
    } catch (e) {
      win?.close();
      toast.error(e instanceof Error ? e.message : t('pos.waFailed'));
    }
  };

  const newSale = () => {
    setDone(null);
    searchRef.current?.focus();
  };

  const chooseOutlet = (id: string) => {
    setOutletModal(false);
    setOutletNotice(false);
    setDone(null);
    setActiveOutlet(id);
  };

  const onSearchEnter = () => {
    if (done && !query.trim()) {
      newSale();
      return;
    }
    const hit = pickOnEnter(inventory, available, query);
    if (!hit) return;
    addToCart(hit);
    setQuery('');
  };

  const statusText = settle.ok
    ? settle.change > 0
      ? interpolate(t('pos.statusChange'), {
          amount: fmtRp(settle.change),
          wallet: walletName(settle.changeWalletId),
        })
      : t('pos.statusExact')
    : settle.excess
      ? interpolate(t('pos.statusExcess'), { wallet: walletName(changeTender?.walletId ?? null) })
      : settle.paid === 0
        ? interpolate(t('pos.statusEmpty'), { amount: fmtRp(total) })
        : interpolate(t('pos.statusDue'), { amount: fmtRp(settle.due) });

  const checkout = async () => {
    const cartCheck = validateCart(cart);
    if (!cartCheck.ok) {
      toast.error(cartCheck.errors[0]);
      return;
    }
    if (!settle.ok) {
      toast.error(statusText);
      return;
    }
    const payments = settle.allocations;
    if (discountOver) {
      toast.error(
        interpolate(t('pos.staffDiscountToast'), { pct: String(STAFF_MAX_DISCOUNT_PCT), amount: fmtRp(maxDiscount) }),
      );
      return;
    }
    // OQ-C: a user who can reach multiple outlets must pick a specific branch
    // first, so the sale is tagged to the right outlet (not guessed).
    if (needOutlet) {
      setOutletModal(true);
      return;
    }
    const txOutletId = resolveCreateOutlet(outlets);
    setBusy(true);
    const now = new Date().toISOString();
    try {
      const saleNo = nextDocNumber('INV', sales.map((s) => s.saleNo));
      const draft: Sale = {
        id: newId(),
        orgId,
        outletId: txOutletId,
        saleNo,
        date: localDateStr(),
        lines: toSaleLines(cart),
        subtotal,
        discount: discountValue,
        discountType,
        total,
        payments,
        cashierId: me?.id ?? '',
        cashierName: me?.name ?? '',
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? '',
        voided: false,
        voidedReason: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      let saleId = draft.id;
      let savedNo = saleNo;

      if (isCloudMode()) {
        // Cloud: atomic, server-side RPC. This is the ONLY path that lets a
        // staff cashier complete a sale, since wallet/inventory writes are
        // manager-only under RLS. Stock re-validation + deduction, wallet
        // credit, and income insert all happen in one transaction.
        // Harga, HPP, total & pembayaran divalidasi ulang di server (0069);
        // nomornya juga ditetapkan server — tampilkan yang tersimpan.
        ({ id: saleId, saleNo: savedNo } = await processSale({
          orgId,
          saleNo,
          lines: toSaleLines(cart),
          payments,
          subtotal,
          discount: discountValue,
          discountType,
          total,
          outletId: txOutletId,
          customerId: customer?.id ?? null,
        }));
      } else {
        // Local: re-validate stock against latest inventory (multi-device safety).
        const fresh = await repository.list('inventory');
        for (const c of cart) {
          const item = fresh.find((i) => i.id === c.itemId);
          if (!item || item.stock < c.qty) {
            toast.error(
              item
                ? interpolate(t('pos.stockChanged'), { name: c.name })
                : t('pos.notInOutlet').replace('{name}', c.name),
            );
            setBusy(false);
            return;
          }
        }
        await repository.put('sales', draft);

        // Deduct stock.
        const updatedInv = fresh
          .filter((i) => cart.some((c) => c.itemId === i.id))
          .map((i) => {
            const c = cart.find((x) => x.itemId === i.id)!;
            return { ...i, stock: i.stock - c.qty };
          });
        await repository.putMany('inventory', updatedInv);

        // Record income + credit wallets per allocation. Description must stay
        // 'Penjualan <no>' so void_sale's fallback match still works.
        for (const p of payments) {
          const wallet = wallets.find((w) => w.id === p.walletId);
          if (!wallet) continue;
          await repository.put('incomes', {
            id: newId(),
            orgId,
            outletId: txOutletId,
            date: localDateStr(),
            category: 'Penjualan',
            amount: p.amount,
            walletId: p.walletId,
            description: `Penjualan ${saleNo}`,
            serviceId: null,
            saleId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          await repository.put('wallets', { ...wallet, balance: wallet.balance + p.amount });
        }
      }

      // Salinan untuk struk segera — server sudah menyimpan yang asli, tapi
      // pelanggan menunggu sekarang, bukan setelah realtime tiba.
      setDone({
        sale: { ...draft, id: saleId, saleNo: savedNo },
        change: settle.change,
        phone: customer?.phone ?? '',
      });
      if (finePointer) searchRef.current?.focus();
      logActivity({
        action: 'sale.create',
        entityType: 'sale',
        entityId: saleId,
        entityLabel: savedNo,
        meta: { total, items: cart.length },
        outletId: txOutletId,
      });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pos.processFailed'));
    } finally {
      setBusy(false);
    }
  };

  const outletButtons = (
    <div className={styles.outletList}>
      {reachableOutlets.map((o) => (
        <button
          key={o.id}
          type="button"
          className={styles.outletOpt}
          aria-pressed={o.id === activeOutletId}
          onClick={() => chooseOutlet(o.id)}
        >
          <span className={styles.outletLed} aria-hidden />
          <span className={styles.outletOptName}>{o.name}</span>
          {o.isPrimary && <span className={styles.outletOptTag}>PUSAT</span>}
        </button>
      ))}
    </div>
  );

  const stockBadge = (item: InventoryItem) =>
    item.stock <= 0 ? (
      <Badge tone="danger">{t('pos.outOfStock')}</Badge>
    ) : (
      <Badge tone={item.stock <= item.minStock ? 'warning' : 'neutral'}>stok {item.stock}</Badge>
    );

  // Baris kedua LCD: yang harus dilihat kasir berikutnya — sisa, kembalian, pas.
  const lcdSub: { label: string; value: string; tone: 'due' | 'change' | 'exact' } | null = done
    ? done.change > 0
      ? { label: t('pos.lcdChange'), value: fmtRp(done.change), tone: 'change' }
      : { label: t('pos.lcdExact'), value: done.sale.saleNo, tone: 'exact' }
    : cart.length === 0 || settle.paid === 0
      ? null
      : settle.excess
        ? { label: t('pos.lcdExcess'), value: fmtRp(settle.change), tone: 'due' }
        : settle.change > 0
          ? { label: t('pos.lcdChange'), value: fmtRp(settle.change), tone: 'change' }
        : settle.due > 0
          ? { label: t('pos.lcdDue'), value: fmtRp(settle.due), tone: 'due' }
          : { label: t('pos.lcdExact'), value: '', tone: 'exact' };

  const waMessage = (sale: Sale) =>
    interpolate(t('pos.waMessage'), {
      shop: org?.name ?? '',
      no: sale.saleNo,
      items: sale.lines.map((l) => `${l.qty}× ${l.name}`).join('\n'),
      total: fmtRp(sale.total),
    });

  return (
    <div className={styles.page}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pos'}
          className={[styles.tab, tab === 'pos' ? styles.tabActive : ''].join(' ')}
          onClick={() => setTab('pos')}
        >
          <Icon name="cart-shopping" aria-hidden /> {t('pos.tabRegister')}
        </button>
        {/* Kasir juga perlu tab ini — di situlah struk dicetak ulang. Pembatalan
            tetap milik manager (tombolnya di bawah). */}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={[styles.tab, tab === 'history' ? styles.tabActive : ''].join(' ')}
          onClick={() => setTab('history')}
        >
          <Icon name="clock-rotate-left" aria-hidden /> {t('pos.tabHistory')}
          {recentSales.length > 0 && <span className={styles.tabCount}>{recentSales.length}</span>}
        </button>
      </div>

      {tab === 'pos' && (
      <div className={styles.layout}>
        <div className={styles.products}>
        {needOutlet ? (
          <Card glass className={styles.outletPick}>
            <h3 className={styles.outletPickTitle}>
              <span className={styles.outletLed} aria-hidden /> {t('pos.outletPickTitle')}
            </h3>
            <p className={styles.outletPickBody}>{t('pos.outletPickBody')}</p>
            {outletButtons}
          </Card>
        ) : (
        <>
        <div className={styles.toolbar}>
          <Input
            ref={searchRef}
            placeholder={t('pos.searchPlaceholder')}
            aria-label={t('pos.searchPlaceholder')}
            value={query}
            autoFocus={finePointer}
            noAutoCap
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // Enter yang ditahan tidak boleh ikut menutup LUNAS.
                if (!e.repeat) onSearchEnter();
              }
            }}
            iconLeft={<Icon name="magnifying-glass" aria-hidden />}
          />
          {finePointer && <kbd className={styles.kbd} aria-hidden>/</kbd>}
          <ViewToggle value={view} onChange={chooseView} label={t('pos.viewLabel')} />
        </div>
        <CategoryChips
          categories={categoryCounts}
          total={inStockCount}
          value={activeCategory}
          onChange={setCategory}
          label={t('pos.categoryLabel')}
        />
        {loadPending(inventoryLoad) ? (
          <Card glass>
            <LoadState queries={[inventoryLoad]} />
          </Card>
        ) : available.length === 0 ? (
          <Card glass>
            {inStockCount > 0 || query.trim() ? (
              <EmptyState
                icon={<Icon name="magnifying-glass" aria-hidden />}
                title={t('pos.noMatchTitle')}
                description={t('pos.noMatchBody')}
              />
            ) : (
              <EmptyState
                icon={<Icon name="boxes-stacked" aria-hidden />}
                title={t('pos.noStockTitle')}
                description={t('pos.noStockBody')}
              />
            )}
          </Card>
        ) : view === 'list' ? (
          <div className={styles.productList}>
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.productRow}
                onClick={() => addToCart(item)}
                disabled={item.stock <= 0}
              >
                <span className={styles.productRowMain}>
                  <strong>{item.name}</strong>
                  <small>{categoryOf(item.category)}</small>
                </span>
                {stockBadge(item)}
                <span className={styles.productRowPrice}>{fmtRp(item.sellPrice)}</span>
              </button>
            ))}
          </div>
        ) : view === 'tiles' ? (
          <div className={styles.tileGrid}>
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.productTile}
                onClick={() => addToCart(item)}
                disabled={item.stock <= 0}
                title={item.name}
              >
                <span className={styles.tileName}>{item.name}</span>
                <span className={styles.tileMeta}>
                  <strong>{fmtRp(item.sellPrice)}</strong>
                  {item.stock <= 0 ? (
                    <span className={styles.soldOut}>{t('pos.outOfStock')}</span>
                  ) : (
                    <span className={item.stock <= item.minStock ? styles.tileLow : undefined}>
                      stok {item.stock}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.productGrid}>
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.productCard}
                onClick={() => addToCart(item)}
                disabled={item.stock <= 0}
              >
                <span className={styles.productName}>{item.name}</span>
                <span className={styles.productMeta}>
                  {stockBadge(item)}
                  <strong>{fmtRp(item.sellPrice)}</strong>
                </span>
              </button>
            ))}
          </div>
        )}
        </>
        )}
      </div>

      <Card id="pos-cart" glass className={styles.cartPanel}>
        <div className={styles.register} aria-live="polite">
          <div className={styles.registerTop}>
            {done ? (
              <span className={styles.paidTag}>{t('pos.lcdPaid')}</span>
            ) : (
              <span className={styles.live}>LIVE</span>
            )}
            <span>TOTAL · IDR</span>
          </div>
          <div className={styles.lcd}>
            <span className={styles.lcdGhost} aria-hidden>{totalGhost}</span>
            {totalText}
          </div>
          {lcdSub && (
            <div className={[styles.lcdSub, styles[lcdSub.tone]].join(' ')}>
              <span>{lcdSub.label}</span>
              <span>{lcdSub.value}</span>
            </div>
          )}
          <div className={styles.registerMeta}>
            {reachableOutlets.length > 1 ? (
              <button
                type="button"
                className={styles.outletChip}
                onClick={() => setOutletModal(true)}
                aria-label={t('pos.outletChip').replace('{name}', activeOutlet?.name ?? t('pos.pickBranch'))}
              >
                <span className={activeOutlet ? styles.outletLedOn : styles.outletLed} aria-hidden />
                {activeOutlet?.name ?? t('pos.pickBranch')}
                <Icon name="chevron-down" aria-hidden />
              </button>
            ) : (
              <span>{done ? done.sale.saleNo : nextNo}</span>
            )}
            <span>
              {done
                ? interpolate(t('pos.lcdLinesDone'), { n: String(done.sale.lines.length) })
                : interpolate(t('pos.lcdLines'), { qty: String(totalQty), n: String(cart.length) })}
            </span>
          </div>
        </div>

        {done ? (
          <div className={styles.donePanel}>
            <p className={styles.doneTitle}>
              <span className={styles.doneLed} aria-hidden /> {t('pos.doneTitle')}
              <span className={styles.doneNo}>{done.sale.saleNo}</span>
            </p>
            <p className={styles.doneChange}>
              {done.change > 0
                ? t('pos.doneChange').replace('{amount}', fmtRp(done.change))
                : t('pos.doneExact')}
            </p>
            <div className={styles.doneActions}>
              {org && (
                <Button
                  variant="secondary"
                  iconLeft={<Icon name="receipt" aria-hidden />}
                  onClick={() => printSaleReceipt(done.sale, org, done.change)}
                >
                  {t('pos.printReceipt')}
                </Button>
              )}
              {done.phone && (
                <a
                  className={styles.waBtn}
                  href={waLink(done.phone, waMessage(done.sale))}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="whatsapp" aria-hidden /> {t('pos.sendWa')}
                </a>
              )}
            </div>
            {/* Tanpa autoFocus: Enter yang menyelesaikan transaksi dulu ikut
                "menekan" tombol ini, sehingga LUNAS & kembalian hilang sebelum
                terbaca. Fokus pindah ke kolom cari; Enter kosong di sana (atau
                pindaian berikutnya) memulai transaksi baru. */}
            <Button
              fullWidth
              iconRight={<Icon name="arrow-right" aria-hidden />}
              onClick={newSale}
            >
              {t('pos.newSale')}
            </Button>
          </div>
        ) : (
        <>
        <div className={styles.cartHeader}>
          <h3>
            <Icon name="cart-shopping" aria-hidden /> {t('pos.cart')}
          </h3>
          {cart.length > 0 && (
            <button type="button" className={styles.clearBtn} onClick={clearCart}>
              {t('pos.clearCart')}
            </button>
          )}
        </div>

        <div className={styles.cartItems}>
          {cart.length === 0 ? (
            <>
            <p className={styles.emptyCart}>
              {outletNotice ? t('pos.outletChanged') : cleared ? t('pos.cleared') : 'Belum ada item. Klik produk untuk menambahkan.'}
            </p>
            {cleared && !outletNotice && (
              <button type="button" className={styles.restoreBtn} onClick={restoreCart}>
                <Icon name="repeat" aria-hidden />{' '}
                {t('pos.restoreCart').replace('{n}', String(cleared.cart.reduce((n, c) => n + c.qty, 0)))}
              </button>
            )}
            </>
          ) : (
            cart.map((c) => (
              <div key={c.itemId} className={styles.cartItem}>
                <strong className={styles.cartItemName}>{c.name}</strong>
                <small className={styles.cartItemUnit}>{fmtRp(c.sellPrice)} × {c.qty}</small>
                <div className={styles.qtyControl}>
                  <button type="button" onClick={() => setQty(c.itemId, c.qty - 1)} aria-label={interpolate(t('pos.qtyMinus'), { name: c.name })}>
                    <Icon name="minus" aria-hidden />
                  </button>
                  {/* Qty bisa diketik — 12 kabel data bukan 11 ketukan "+". */}
                  <input
                    className={styles.qtyInput}
                    inputMode="numeric"
                    aria-label={t('pos.qtyLabel').replace('{name}', c.name)}
                    value={c.qty}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      if (!Number.isNaN(n) && n > 0) setQty(c.itemId, n);
                    }}
                  />
                  <button type="button" onClick={() => setQty(c.itemId, c.qty + 1)} aria-label={interpolate(t('pos.qtyPlus'), { name: c.name })}>
                    <Icon name="plus" aria-hidden />
                  </button>
                </div>
                <span className={styles.lineTotal}>{fmtRp(c.sellPrice * c.qty)}</span>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <>
            <div className={styles.tearLine} aria-hidden />
            <div className={styles.checkout}>
            <div className={styles.customerBox}>
              {customer ? (
                <div className={styles.customerChip}>
                  <Icon name="users" aria-hidden />
                  <span>{customer.name}</span>
                  <button type="button" onClick={() => setCustomer(null)} aria-label={t('pos.custRemove')}>
                    <Icon name="xmark" aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder={t('pos.custOptional')}
                    aria-label={t('pos.custOptional')}
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    iconLeft={<Icon name="magnifying-glass" aria-hidden />}
                  />
                  {/* Saran selalu menjelaskan dirinya: kurang huruf, masih mencari,
                      tidak ditemukan — dan selalu menawarkan pelanggan baru. Dulu
                      kolom ini diam saja bila tak ada yang cocok, dan Kasir tak bisa
                      membuat pelanggan. */}
                  {custQuery.trim() && (
                    <ul className={styles.custSuggest}>
                      {serverSearch && custQuery.trim().length < 3 ? (
                        <li className={styles.custHint}>{t('pos.custMinChars')}</li>
                      ) : custMatches.length === 0 ? (
                        <li className={styles.custHint}>
                          {serverSearch && custPending
                            ? t('pos.custSearching')
                            : t('pos.custNotFound').replace('{q}', custQuery.trim())}
                        </li>
                      ) : (
                        custMatches.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomer(c);
                                setCustQuery('');
                              }}
                            >
                              <strong>{c.name}</strong>
                              <small>{c.phone || 'tanpa nomor'}</small>
                            </button>
                          </li>
                        ))
                      )}
                      <li>
                        <button type="button" className={styles.custAdd} onClick={() => setCustModal(true)}>
                          <Icon name="plus" aria-hidden /> {t('pos.custAdd')}
                        </button>
                      </li>
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className={styles.discountRow}>
              <Input
                placeholder={t('pos.discount')}
                aria-label={t('pos.discount')}
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(fmtRpInput(e.target.value))}
              />
              <div className={styles.discountToggle}>
                <button
                  type="button"
                  aria-pressed={discountType === 'amount'}
                  aria-label={t('pos.discountAmount')}
                  className={discountType === 'amount' ? styles.activeToggle : ''}
                  onClick={() => setDiscountType('amount')}
                >
                  Rp
                </button>
                <button
                  type="button"
                  aria-pressed={discountType === 'percent'}
                  aria-label={t('pos.discountPercent')}
                  className={discountType === 'percent' ? styles.activeToggle : ''}
                  onClick={() => setDiscountType('percent')}
                >
                  %
                </button>
              </div>
            </div>

            {discountOver && (
              <p className={styles.discountWarn}>
                {interpolate(t('pos.staffDiscountNote'), { pct: String(STAFF_MAX_DISCOUNT_PCT), amount: fmtRp(maxDiscount) })}
              </p>
            )}

            <div className={styles.summary}>
              <div><span>{t('pos.subtotal')}</span><span>{fmtRp(subtotal)}</span></div>
              {discountValue > 0 && (
                <div className={styles.discountLine}>
                  <span>{t('pos.discount')}</span><span>−{fmtRp(discountValue)}</span>
                </div>
              )}
              <div className={styles.totalLine}><span>{t('common.total')}</span><span>{fmtRp(total)}</span></div>
            </div>

            <div className={styles.payments}>
              <div className={styles.paymentsHeader}>
                <span>{t('pos.tender')}</span>
                {tender.length === 0 && <span className={styles.tenderHint}>{t('pos.tenderHint')}</span>}
              </div>
              <div className={styles.tenderKeys} role="group" aria-label={t('pos.tenderKeys')}>
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={styles.tenderKey}
                    aria-pressed={tender.some((p) => p.walletId === w.id)}
                    onClick={() => pickWallet(w.id)}
                  >
                    <span className={styles.tenderLed} aria-hidden />
                    {w.name}
                  </button>
                ))}
              </div>
              {tender.map((p) => {
                const name = walletName(p.walletId);
                return (
                  <div key={p.walletId} className={styles.paymentRow}>
                    <label htmlFor={`tender-${p.walletId}`}>{name}</label>
                    <Input
                      id={`tender-${p.walletId}`}
                      aria-label={t('pos.tenderAmount').replace('{wallet}', name)}
                      inputMode="numeric"
                      autoFocus={finePointer}
                      onFocus={(e) => e.currentTarget.select()}
                      value={p.amount ? fmtRpInput(String(p.amount)) : ''}
                      onChange={(e) => setTenderAmount(p.walletId, parseRpInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        if (!e.repeat && settle.ok && !discountOver) void checkout();
                      }}
                      placeholder="0"
                    />
                    <button
                      type="button"
                      className={styles.tenderRemove}
                      onClick={() => removeTender(p.walletId)}
                      aria-label={t('pos.tenderRemove').replace('{wallet}', name)}
                    >
                      <Icon name="xmark" aria-hidden />
                    </button>
                  </div>
                );
              })}
              {tender.length > 1 && changeTender && (
                <p className={styles.tenderRule}>
                  {t(cashIds.has(changeTender.walletId) ? 'pos.changeRuleCash' : 'pos.changeRule').replace(
                    '{wallet}',
                    walletName(changeTender.walletId),
                  )}
                </p>
              )}
              {quickCash.length > 1 && changeTender && (
                <div className={styles.quickCash} role="group" aria-label={t('pos.cashQuick')}>
                  {quickCash.map((v, i) => (
                    <button key={v} type="button" onClick={() => setTenderAmount(changeTender.walletId, v)}>
                      {i === 0 ? t('pos.exact') : fmtRp(v)}
                    </button>
                  ))}
                </div>
              )}
              <div
                className={[
                  styles.paymentStatus,
                  settle.ok ? styles.ok : settle.paid === 0 ? styles.idle : styles.bad,
                ].join(' ')}
              >
                <span className={styles.statusLed} aria-hidden />
                {statusText}
              </div>
            </div>

            <Button
              fullWidth
              className={styles.processBtn}
              onClick={checkout}
              loading={busy}
              disabled={!settle.ok || discountOver}
              iconLeft={busy ? undefined : <Icon name="circle-check" aria-hidden />}
            >
              {t('pos.process').replace('{amount}', fmtRp(total))}
            </Button>
            </div>
          </>
        )}
        </>
        )}
      </Card>
      </div>
      )}

      {tab === 'pos' && cart.length > 0 && !done && !cartInView && (
        <button
          type="button"
          className={styles.mobileCartDock}
          onClick={() => document.getElementById('pos-cart')?.scrollIntoView({ behavior: 'smooth' })}
          aria-label={interpolate(t('pos.dockAria'), { qty: String(totalQty), total: totalText })}
        >
          <span>
            <Icon name="cart-shopping" aria-hidden /> {interpolate(t('pos.units'), { n: String(totalQty) })}
          </span>
          <strong>{totalText}</strong>
          <Icon name="arrow-right" aria-hidden />
        </button>
      )}

      {tab === 'history' && (
        <Card glass className={styles.history}>
          <div className={styles.historyHead}>
            <h3>
              <Icon name="clock-rotate-left" aria-hidden /> {t('pos.tabHistory')}
            </h3>
            {/* Riwayat mengikuti cabang aktif — dulu tanpa tanda, sehingga cabang
                tanpa penjualan tampak seperti data hilang. */}
            {activeOutlet && reachableOutlets.length > 1 && (
              <span className={styles.historyScope}>
                {t('pos.historyBranch').replace('{name}', activeOutlet.name)}
              </span>
            )}
          </div>
          {loadPending(salesLoad) ? (
            <LoadState queries={[salesLoad]} />
          ) : recentSales.length === 0 ? (
            <p className={styles.emptyCart}>{t('pos.noSales')}</p>
          ) : (
            groupSalesByDay(recentSales).map((day) => (
              <section key={day.date} className={styles.historyDay} aria-label={fmtDate(day.date)}>
                <div className={styles.historyDayHead}>
                  <span>{fmtDate(day.date)}</span>
                  <span>
                    {interpolate(t('pos.dayCount'), { n: String(day.count) })} · {fmtRp(day.total)}
                  </span>
                </div>
                <ul className={styles.historyList}>
                  {day.rows.map((s) => (
                    <li key={s.id} className={[styles.historyRow, s.voided ? styles.voided : ''].join(' ')}>
                      <div className={styles.historyInfo}>
                        <strong>
                          {s.saleNo}
                          <span className={styles.historyTime}>
                            {s.createdAt
                              ? new Date(s.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                              : ''}
                          </span>
                        </strong>
                        <small>
                          {interpolate(t('pos.itemCount'), { n: String(s.lines.length) })}
                          {s.payments.length > 0 && ` · ${s.payments.map((p) => walletName(p.walletId) || '—').join(' + ')}`}
                          {s.cashierName ? ` · ${s.cashierName}` : ''}
                          {s.customerName ? ` · ${s.customerName}` : ''}
                        </small>
                      </div>
                      <span className={styles.historyTotal}>{fmtRp(s.total)}</span>
                      {s.customerId && !s.voided && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => void resendWa(s)}
                          aria-label={t('pos.resendWa').replace('{no}', s.saleNo)}
                          title={t('pos.resendWa').replace('{no}', s.saleNo)}
                        >
                          <Icon name="whatsapp" aria-hidden />
                        </button>
                      )}
                      {org && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => printSaleReceipt(s, org)}
                          aria-label={interpolate(t('pos.printAria'), { no: s.saleNo })}
                          title={t('pos.printTitle')}
                        >
                          <Icon name="receipt" aria-hidden />
                        </button>
                      )}
                      {s.voided ? (
                        <Badge tone="danger">{t('pos.voidedBadge')}</Badge>
                      ) : !isMgr || s.date < monthStart ? null : (
                        <button
                          type="button"
                          className={styles.voidBtn}
                          onClick={() => { setVoidTarget(s); setVoidReason(''); }}
                          aria-label={interpolate(t('pos.voidAria'), { no: s.saleNo })}
                          title={t('pos.voidTitle')}
                        >
                          <Icon name="circle-xmark" aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </Card>
      )}

      <Modal
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        title={interpolate(t('pos.voidModalTitle'), { no: voidTarget?.saleNo ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>
              {t('common.back')}
            </Button>
            <Button variant="danger" onClick={confirmVoid} loading={voidBusy}>
              {t('pos.voidConfirm').replace('{no}', voidTarget?.saleNo ?? '')}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-3)' }}>
          {t('pos.voidBody')} <strong>{t('pos.voidedBadge')}</strong> {t('pos.voidBodyTail')}
        </p>
        <Input
          placeholder={t('pos.voidReason')}
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
        />
      </Modal>

      <CustomerModal
        open={custModal}
        onClose={() => setCustModal(false)}
        editing={null}
        customers={serverSearch ? remoteCustomers : customers}
        initialQuery={custQuery}
        onSaved={(c) => {
          setCustomer(c);
          setCustQuery('');
        }}
      />

      <Modal
        open={outletModal}
        onClose={() => setOutletModal(false)}
        title={t('pos.outletSwitchTitle')}
        size="sm"
      >
        {cart.length > 0 && <p className={styles.outletPickBody}>{t('pos.outletSwitchCartNote')}</p>}
        {outletButtons}
      </Modal>
    </div>
  );
}
