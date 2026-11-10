import { useMemo, useState, type RefObject } from 'react';
import {
  Card,
  Input,
  Badge,
  EmptyState,
  Icon,
  LoadState,
  loadPending,
  CategoryChips,
  countCategories,
  categoryOf,
} from '@/components/ui';
import type { LoadQuery } from '@/components/ui/loadPending';
import { fmtRp } from '@/lib/format';
import { pickOnEnter } from '@/lib/business/pos';
import { interpolate } from '@/lib/business/notify';
import { useT } from '@/i18n';
import type { InventoryItem } from '@/data/types';
import styles from './PosCatalog.module.css';

interface PosCatalogProps {
  inventory: InventoryItem[];
  inventoryLoad: LoadQuery;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Fokus otomatis hanya untuk mouse: di ponsel ia memunculkan keyboard. */
  finePointer: boolean;
  onAdd: (item: InventoryItem) => void;
  /** Enter di kolom cari yang kosong (mis. memulai transaksi baru setelah LUNAS). */
  onEmptyEnter?: () => void;
}

/** Katalog kasir: cari/pindai, chip kategori, dan kartu barang. */
export function PosCatalog({ inventory, inventoryLoad, searchRef, finePointer, onAdd, onEmptyEnter }: PosCatalogProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

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

  const onSearchEnter = () => {
    if (onEmptyEnter && !query.trim()) {
      onEmptyEnter();
      return;
    }
    const hit = pickOnEnter(inventory, available, query);
    if (!hit) return;
    onAdd(hit);
    setQuery('');
  };

  const stockBadge = (item: InventoryItem) =>
    item.stock <= 0 ? (
      <Badge tone="danger">{t('pos.outOfStock')}</Badge>
    ) : (
      <Badge tone={item.stock <= item.minStock ? 'warning' : 'neutral'}>
        {interpolate(t('pos.stockLeft'), { n: String(item.stock) })}
      </Badge>
    );

  return (
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
      </div>
      <CategoryChips
        categories={categoryCounts}
        total={inStockCount}
        value={activeCategory}
        onChange={setCategory}
        label={t('pos.categoryLabel')}
      />
      {loadPending(inventoryLoad) ? (
        <Card>
          <LoadState queries={[inventoryLoad]} />
        </Card>
      ) : available.length === 0 ? (
        <Card>
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
      ) : (
        /* Satu tampilan saja: kartu. Nama turun baris utuh, jadi nomor model
           di ujungnya (A1989, Pro Max) tetap terbaca; Daftar dan Ringkas dulu
           memotongnya, dan tombol pilihannya memakan lebar kolom cari. */
        <div className={styles.productGrid}>
          {available.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.productCard}
              onClick={() => onAdd(item)}
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
  );
}
