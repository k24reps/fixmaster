import { useMemo, useState, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  Input,
  Button,
  EmptyState,
  Icon,
  LoadState,
  loadPending,
  CategoryChips,
  countCategories,
  categoryOf,
  PageSummary,
} from '@/components/ui';
import type { LoadQuery } from '@/components/ui/loadPending';
import { fmtRp } from '@/lib/format';
import { pickOnEnter } from '@/lib/business/pos';
import {
  filterCatalog,
  parseStockFilter,
  stockState,
  stockSummary,
  type StockFilter,
} from '@/lib/business/stock';
import { interpolate } from '@/lib/business/notify';
import { isManager, roleAllows } from '@/config/plans';
import { useSessionStore } from '@/stores/session';
import { InventoryModal } from '@/features/inventory/InventoryModal';
import { useT } from '@/i18n';
import type { InventoryItem } from '@/data/types';
import styles from './PosCatalog.module.css';

/** Kartu per halaman. Dulu dipotong mati di 50 tanpa tanda ada sisanya. */
const PAGE = 60;

interface PosCatalogProps {
  inventory: InventoryItem[];
  inventoryLoad: LoadQuery;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Fokus otomatis hanya untuk mouse: di ponsel ia memunculkan keyboard. */
  finePointer: boolean;
  onAdd: (item: InventoryItem) => void;
  /** Enter di kolom cari yang kosong (mis. memulai transaksi baru setelah LUNAS). */
  onEmptyEnter?: () => void;
  /** Nama cabang pemilik stok, hanya saat katalog memuat beberapa cabang. */
  branchOf?: (item: InventoryItem) => string | null;
}

/**
 * Katalog Kasir & Stok: satu kartu per barang untuk menjual DAN mengurus
 * stoknya. Ketuk kartu = masuk keranjang; owner/admin punya tuts Ubah dan
 * + Stok di kaki kartu. Strip ringkasan di atas sekaligus saringan.
 */
export function PosCatalog({
  inventory,
  inventoryLoad,
  searchRef,
  finePointer,
  onAdd,
  onEmptyEnter,
  branchOf,
}: PosCatalogProps) {
  const t = useT();
  const me = useSessionStore((s) => s.currentEmployee);
  const canManage = me ? roleAllows(me.role, 'inventory.write') : false;
  // Nilai stok = modal toko; hanya owner/admin (audit #14).
  const isMgr = me ? isManager(me.role) : false;

  // ?stock=low|out dari peringatan Dashboard dan alamat lama /inventory.
  // Diikuti juga saat halaman sudah terbuka dan alamatnya berganti.
  const [searchParams] = useSearchParams();
  const requested = parseStockFilter(searchParams.get('stock'));
  const [stockFilter, setStockFilter] = useState<StockFilter>(requested);
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    setStockFilter(requested);
  }
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  // Barang yang terakhir dibuka tetap disimpan saat modal menutup, supaya
  // judulnya tak berubah jadi "Sparepart Baru" selama animasi keluar.
  const [modal, setModal] = useState<{ editing: InventoryItem | null; restock: boolean }>({
    editing: null,
    restock: false,
  });
  const openModal = (editing: InventoryItem | null, restock = false) => {
    setModal({ editing, restock });
    setModalOpen(true);
  };

  const summary = useMemo(() => stockSummary(inventory), [inventory]);
  const categories = useMemo(
    () => [...new Set(inventory.map((i) => i.category).filter(Boolean))].sort(),
    [inventory],
  );
  // Chip kategori menghitung barang di saringan stok yang aktif: di "Habis",
  // angkanya = berapa yang perlu dibeli per kategori.
  const categoryCounts = useMemo(
    () =>
      countCategories(
        stockFilter === 'all' ? inventory : inventory.filter((i) => stockState(i) === stockFilter),
      ),
    [inventory, stockFilter],
  );
  const categoryTotal = categoryCounts.reduce((n, [, count]) => n + count, 0);
  // Kategori yang hilang dari saringan ini tak lagi punya chip; pilihan lama
  // jangan sampai mengunci katalog di daftar kosong.
  const activeCategory = categoryCounts.some(([c]) => c === category) ? category : 'all';

  // Barang habis TETAP tampil, redup, di ujung daftar. Disembunyikan, kasir
  // membaca "tidak ada" dan mengira barangnya tak terdaftar; owner kehilangan
  // tempat untuk mengisinya lagi.
  const rows = useMemo(
    () =>
      filterCatalog(inventory, {
        stock: stockFilter,
        query,
        inCategory: activeCategory === 'all' ? undefined : (i) => categoryOf(i.category) === activeCategory,
      }),
    [inventory, stockFilter, query, activeCategory],
  );
  // Batas tampil kembali ke satu halaman tiap saringan berubah.
  const filterKey = `${stockFilter}|${activeCategory}|${query.trim()}`;
  const [shown, setShown] = useState({ key: filterKey, n: PAGE });
  const limit = shown.key === filterKey ? shown.n : PAGE;
  const visible = rows.slice(0, limit);

  const pickStock = (f: StockFilter) => () =>
    // Mengetuk saringan yang sedang aktif mengembalikannya ke Semua.
    setStockFilter((cur) => (cur === f ? 'all' : f));

  const onSearchEnter = () => {
    if (onEmptyEnter && !query.trim()) {
      onEmptyEnter();
      return;
    }
    const hit = pickOnEnter(inventory, rows, query);
    if (!hit) return;
    onAdd(hit);
    setQuery('');
  };

  const stateLabel = { out: t('inventory.statOut'), low: t('inventory.statLow'), ok: '' };

  return (
    <>
      <PageSummary
        label={t('pos.stockFilterAria')}
        items={[
          { label: t('pos.statAll'), value: summary.total, onSelect: pickStock('all'), pressed: stockFilter === 'all' },
          {
            label: t('inventory.statLow'),
            value: summary.low,
            tone: summary.low > 0 ? 'warning' : undefined,
            onSelect: pickStock('low'),
            pressed: stockFilter === 'low',
          },
          {
            label: t('inventory.statOut'),
            value: summary.out,
            tone: summary.out > 0 ? 'danger' : undefined,
            onSelect: pickStock('out'),
            pressed: stockFilter === 'out',
          },
          ...(isMgr ? [{ label: t('inventory.statValue'), value: fmtRp(summary.value), wide: true }] : []),
        ]}
      />
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
        {canManage && (
          <Button
            variant="secondary"
            iconLeft={<Icon name="plus" aria-hidden />}
            onClick={() => openModal(null)}
            aria-label={t('pos.addItemAria')}
          >
            {t('pos.addItem')}
          </Button>
        )}
      </div>
      <CategoryChips
        categories={categoryCounts}
        total={categoryTotal}
        value={activeCategory}
        onChange={setCategory}
        label={t('pos.categoryLabel')}
      />
      {loadPending(inventoryLoad) ? (
        <Card>
          <LoadState queries={[inventoryLoad]} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          {inventory.length === 0 ? (
            <EmptyState
              icon={<Icon name="boxes-stacked" aria-hidden />}
              title={t('pos.noStockTitle')}
              description={canManage ? t('inventory.emptyFirst') : t('pos.noStockBody')}
              action={
                canManage && (
                  <Button onClick={() => openModal(null)} iconLeft={<Icon name="plus" aria-hidden />}>
                    {t('pos.addItemAria')}
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState
              icon={<Icon name="magnifying-glass" aria-hidden />}
              title={t('pos.noMatchTitle')}
              description={t('pos.noMatchBody')}
            />
          )}
        </Card>
      ) : (
        <>
          {/* Satu tampilan saja: kartu. Nama turun baris utuh, jadi nomor model
              di ujungnya (A1989, Pro Max) tetap terbaca. Kartu = <article>;
              tombol tambah dan tuts kelola bersaudara, tak pernah bersarang. */}
          <div className={styles.productGrid}>
            {visible.map((item) => {
              const st = stockState(item);
              const branch = branchOf?.(item);
              return (
                <article key={item.id} className={styles.productCard} data-state={st}>
                  <button
                    type="button"
                    className={styles.addArea}
                    onClick={() => onAdd(item)}
                    disabled={st === 'out'}
                  >
                    <span className={styles.productName}>{item.name}</span>
                    {branch && <span className={styles.branch}>{branch}</span>}
                    <span className={styles.productMeta}>
                      <span className={styles.readout}>
                        <span className={styles.led} aria-hidden />
                        <span className={styles.count}>{item.stock}</span>
                        <span>· {interpolate(t('pos.minStock'), { n: String(item.minStock) })}</span>
                        {stateLabel[st] && <span className="fm-visually-hidden">{stateLabel[st]}</span>}
                      </span>
                      <strong>{fmtRp(item.sellPrice)}</strong>
                    </span>
                  </button>
                  {canManage && (
                    <div className={styles.keys}>
                      <button
                        type="button"
                        className={styles.key}
                        onClick={() => openModal(item)}
                        aria-label={interpolate(t('pos.editItemAria'), { name: item.name })}
                      >
                        <Icon name="pen" aria-hidden /> {t('inventory.edit')}
                      </button>
                      {st !== 'ok' && (
                        <button
                          type="button"
                          className={[styles.key, styles.keyStock].join(' ')}
                          onClick={() => openModal(item, true)}
                          aria-label={interpolate(t('pos.restockAria'), { name: item.name })}
                        >
                          <Icon name="plus" aria-hidden /> {t('pos.restock')}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {rows.length > limit && (
            <div className={styles.more}>
              <span className={styles.moreReadout}>
                {interpolate(t('pos.shownOf'), { shown: String(limit), total: String(rows.length) })}
              </span>
              <Button variant="secondary" onClick={() => setShown({ key: filterKey, n: limit + PAGE })}>
                {interpolate(t('pos.showMore'), { n: String(Math.min(PAGE, rows.length - limit)) })}
              </Button>
            </div>
          )}
        </>
      )}
      {canManage && (
        <InventoryModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={modal.editing}
          restock={modal.restock}
          categories={categories}
          canDelete
        />
      )}
    </>
  );
}
