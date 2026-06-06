import { useMemo, useState } from 'react';
import { Card, Input, Button, Badge, EmptyState, Icon } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import {
  cartSubtotal,
  resolveDiscount,
  cartTotal,
  validateCart,
  validatePayments,
  toSaleLines,
  type CartItem,
  type DiscountType,
} from '@/lib/business/pos';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { InventoryItem, Sale, PaymentAllocation } from '@/data/types';
import styles from './PosPage.module.css';

export function PosPage() {
  const { data: inventory } = useCollection('inventory');
  const { data: wallets } = useCollection('wallets');
  const { data: sales } = useCollection('sales');
  const me = useSessionStore((s) => s.currentEmployee);
  const orgId = useSessionStore((s) => s.org?.id ?? '');

  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [payments, setPayments] = useState<PaymentAllocation[]>([]);
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter((i) => i.stock > 0)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .slice(0, 50);
  }, [inventory, query]);

  const subtotal = cartSubtotal(cart);
  const discountValue = resolveDiscount(subtotal, parseRpInput(discount), discountType);
  const total = cartTotal(cart, parseRpInput(discount), discountType);
  const paymentCheck = validatePayments(payments, total);
  const totalQty = cart.reduce((n, c) => n + c.qty, 0);
  const nextNo = useMemo(() => nextDocNumber('INV', sales.map((s) => s.saleNo)), [sales]);
  const totalText = fmtRp(total);
  const totalGhost = totalText.replace(/[0-9]/g, '8');

  const addToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        if (existing.qty >= item.stock) {
          toast.warning(`Stok "${item.name}" hanya ${item.stock}`);
          return prev;
        }
        return prev.map((c) => (c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c));
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
    setCart((prev) =>
      prev
        .map((c) => (c.itemId === itemId ? { ...c, qty: Math.max(0, Math.min(qty, c.stock)) } : c))
        .filter((c) => c.qty > 0),
    );
  };

  const setWalletPayment = (walletId: string, amount: number) => {
    setPayments((prev) => {
      const others = prev.filter((p) => p.walletId !== walletId);
      if (amount <= 0) return others;
      return [...others, { walletId, amount }];
    });
  };

  const reset = () => {
    setCart([]);
    setDiscount('');
    setPayments([]);
  };

  const autoFillSingleWallet = () => {
    if (wallets.length === 1) setPayments([{ walletId: wallets[0].id, amount: total }]);
  };

  const checkout = async () => {
    const cartCheck = validateCart(cart);
    if (!cartCheck.ok) {
      toast.error(cartCheck.errors[0]);
      return;
    }
    if (!paymentCheck.ok) {
      toast.error('Total pembayaran harus sama dengan total transaksi');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    try {
      // Re-validate stock against latest inventory (multi-device safety).
      const fresh = await repository.list('inventory');
      for (const c of cart) {
        const item = fresh.find((i) => i.id === c.itemId);
        if (!item || item.stock < c.qty) {
          toast.error(`Stok "${c.name}" berubah, periksa ulang`);
          setBusy(false);
          return;
        }
      }

      const saleNo = nextDocNumber('INV', sales.map((s) => s.saleNo));
      const sale: Sale = {
        id: newId(),
        orgId,
        outletId: null,
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
        voided: false,
        voidedReason: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await repository.put('sales', sale);

      // Deduct stock.
      const updatedInv = fresh
        .filter((i) => cart.some((c) => c.itemId === i.id))
        .map((i) => {
          const c = cart.find((x) => x.itemId === i.id)!;
          return { ...i, stock: i.stock - c.qty };
        });
      await repository.putMany('inventory', updatedInv);

      // Record income + credit wallets per allocation.
      for (const p of payments) {
        const wallet = wallets.find((w) => w.id === p.walletId);
        if (!wallet) continue;
        await repository.put('incomes', {
          id: newId(),
          orgId,
          outletId: null,
          date: localDateStr(),
          category: 'Penjualan',
          amount: p.amount,
          walletId: p.walletId,
          description: `Penjualan ${saleNo}`,
          serviceId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        await repository.put('wallets', { ...wallet, balance: wallet.balance + p.amount });
      }

      toast.success(`Transaksi ${saleNo} berhasil`);
      reset();
    } catch {
      toast.error('Gagal memproses transaksi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.products}>
        <Input
          placeholder="Cari produk untuk ditambahkan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          iconLeft={<Icon name="magnifying-glass" aria-hidden />}
        />
        {available.length === 0 ? (
          <Card glass>
            <EmptyState
              icon={<Icon name="boxes-stacked" aria-hidden />}
              title="Tidak ada produk tersedia"
              description="Tambahkan stok di menu Inventori terlebih dahulu."
            />
          </Card>
        ) : (
          <div className={styles.productGrid}>
            {available.map((item) => (
              <button key={item.id} className={styles.productCard} onClick={() => addToCart(item)}>
                <span className={styles.productName}>{item.name}</span>
                <span className={styles.productMeta}>
                  <Badge tone={item.stock <= item.minStock ? 'warning' : 'neutral'}>
                    stok {item.stock}
                  </Badge>
                  <strong>{fmtRp(item.sellPrice)}</strong>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Card glass className={styles.cartPanel}>
        <div className={styles.register}>
          <div className={styles.registerTop}>
            <span className={styles.live}>LIVE</span>
            <span>TOTAL · IDR</span>
          </div>
          <div className={styles.lcd}>
            <span className={styles.lcdGhost} aria-hidden>{totalGhost}</span>
            {totalText}
          </div>
          <div className={styles.registerMeta}>
            <span>{totalQty} unit · {cart.length} baris</span>
            <span>{nextNo}</span>
          </div>
        </div>

        <div className={styles.cartHeader}>
          <h3>
            <Icon name="cart-shopping" aria-hidden /> Keranjang
          </h3>
          {cart.length > 0 && (
            <button className={styles.clearBtn} onClick={reset}>
              Kosongkan
            </button>
          )}
        </div>

        <div className={styles.cartItems}>
          {cart.length === 0 ? (
            <p className={styles.emptyCart}>Belum ada item. Klik produk untuk menambahkan.</p>
          ) : (
            cart.map((c) => (
              <div key={c.itemId} className={styles.cartItem}>
                <div className={styles.cartItemInfo}>
                  <strong>{c.name}</strong>
                  <small>{fmtRp(c.sellPrice)} × {c.qty}</small>
                </div>
                <div className={styles.qtyControl}>
                  <button onClick={() => setQty(c.itemId, c.qty - 1)} aria-label="Kurangi">−</button>
                  <span>{c.qty}</span>
                  <button onClick={() => setQty(c.itemId, c.qty + 1)} aria-label="Tambah">+</button>
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
            <div className={styles.discountRow}>
              <Input
                placeholder="Diskon"
                value={discount}
                onChange={(e) => setDiscount(fmtRpInput(e.target.value))}
              />
              <div className={styles.discountToggle}>
                <button
                  className={discountType === 'amount' ? styles.activeToggle : ''}
                  onClick={() => setDiscountType('amount')}
                >
                  Rp
                </button>
                <button
                  className={discountType === 'percent' ? styles.activeToggle : ''}
                  onClick={() => setDiscountType('percent')}
                >
                  %
                </button>
              </div>
            </div>

            <div className={styles.summary}>
              <div><span>Subtotal</span><span>{fmtRp(subtotal)}</span></div>
              {discountValue > 0 && (
                <div className={styles.discountLine}>
                  <span>Diskon</span><span>−{fmtRp(discountValue)}</span>
                </div>
              )}
              <div className={styles.totalLine}><span>Total</span><span>{fmtRp(total)}</span></div>
            </div>

            <div className={styles.payments}>
              <div className={styles.paymentsHeader}>
                <span>Pembayaran</span>
                {wallets.length === 1 && (
                  <button className={styles.autoBtn} onClick={autoFillSingleWallet}>
                    Isi otomatis
                  </button>
                )}
              </div>
              {wallets.map((w) => {
                const current = payments.find((p) => p.walletId === w.id)?.amount ?? 0;
                return (
                  <div key={w.id} className={styles.paymentRow}>
                    <span>{w.name}</span>
                    <Input
                      value={current ? fmtRpInput(String(current)) : ''}
                      onChange={(e) => setWalletPayment(w.id, parseRpInput(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                );
              })}
              <div className={[styles.paymentStatus, paymentCheck.ok ? styles.ok : styles.bad].join(' ')}>
                {paymentCheck.ok
                  ? 'Pembayaran pas'
                  : paymentCheck.diff < 0
                    ? `Kurang ${fmtRp(-paymentCheck.diff)}`
                    : `Lebih ${fmtRp(paymentCheck.diff)}`}
              </div>
            </div>

            <Button fullWidth onClick={checkout} loading={busy} disabled={!paymentCheck.ok}>
              <Icon name="circle-check" aria-hidden /> Proses Transaksi
            </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
