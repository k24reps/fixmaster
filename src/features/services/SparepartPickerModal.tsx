import { EmptyValue } from '@/components/ui/EmptyValue';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal, Input, Button, Icon, Select } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useSessionStore } from '@/stores/session';
import { isManager } from '@/config/plans';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { modalDadakanIssue, type ModalDadakanInput } from '@/lib/business/services';
import { toast } from '@/stores/toast';
import type { Service, ServiceSparepart, Wallet } from '@/data/types';
import styles from './SparepartPickerModal.module.css';
import { useT } from '@/i18n';
import { interpolate } from '@/lib/business/notify';

interface SparepartPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Item ids already on the ticket (to mark as added / avoid confusion). */
  existingItemIds: string[];
  /** Called with a fully-formed inventory cost line to append. */
  onPick: (line: ServiceSparepart) => void;
  /** Tiket tujuan, ditampilkan di atas pencarian. Dibuka dari Daftar Servis,
   * jendela ini tidak punya halaman tiket di belakangnya yang memberi tahu. */
  ticket?: Pick<Service, 'serviceNo' | 'device' | 'customerName'>;
  /** Tab Modal Dadakan untuk part yang dibeli di luar stok (owner/admin).
   * Tanpa prop ini jendela hanya berisi inventori, seperti di detail tiket
   * yang punya form Modal Dadakan sendiri di panel BOM. */
  modalDadakan?: {
    wallets: Wallet[];
    defaultWalletId: string;
    /** true bila tersimpan; form lalu dikosongkan untuk part berikutnya. */
    onSave: (input: ModalDadakanInput) => Promise<boolean>;
  };
}

type Source = 'inventory' | 'modal';

/**
 * Picks an inventory item to add to a service as a sparepart cost line.
 * Bench idiom: mono SKU readout, LED stock state, screw-plate rows. Pulls
 * costPrice (HPP) and sellPrice from the item. The qty<=stock check here is a
 * cached-state UX guard; the caller (addSparepartLine) re-reads the item and
 * deducts stock immediately on add (authoritative), so this only builds the line.
 */
export function SparepartPickerModal({
  open,
  onClose,
  existingItemIds,
  onPick,
  ticket,
  modalDadakan,
}: SparepartPickerModalProps) {
  const t = useT();
  const { data: inventory } = useCollection('inventory');
  // HPP adalah margin toko; karyawan tidak perlu — dan tidak boleh biasa —
  // melihatnya saat memasang part (audit #14).
  const me = useSessionStore((s) => s.currentEmployee);
  const isMgr = me ? isManager(me.role) : false;
  const [query, setQuery] = useState('');
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [source, setSource] = useState<Source>('inventory');
  const [modalName, setModalName] = useState('');
  const [modalAmount, setModalAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // Wallet bisa baru termuat setelah jendela terbuka; tanpa ini pilihan yang
  // tampil (opsi pertama) berbeda dari nilai yang disimpan (kosong).
  const wallet = modalDadakan?.wallets.some((w) => w.id === walletId)
    ? walletId
    : (modalDadakan?.defaultWalletId ?? '');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory
      .filter((i) => !i.deletedAt)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory, query]);

  const add = (itemId: string) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    const qty = Math.max(1, Math.round(Number(qtyById[itemId]) || 1));
    if (qty > item.stock) {
      toast.warning(interpolate(t('partPicker.stockLimit'), { name: item.name, n: String(item.stock) }));
      return;
    }
    const line: ServiceSparepart = {
      itemId: item.id,
      name: item.name,
      qty,
      costPrice: item.costPrice,
      sellPrice: item.sellPrice,
      deducted: false,
      kind: 'inventory',
      defaultWarrantyDays: item.warrantyDays ?? null,
    };
    // Tetap terbuka: satu unit sering butuh beberapa part (LCD + baterai + lem).
    // Barisnya berubah jadi "Tambah lagi" begitu tersimpan; Selesai menutup.
    onPick(line);
    setQtyById((m) => ({ ...m, [itemId]: '1' }));
  };

  // Part yang dicari tidak ada di stok: namanya dibawa ke form Modal Dadakan.
  const toModal = (name: string) => {
    setSource('modal');
    if (name) setModalName(name);
  };

  const saveModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!modalDadakan || saving) return;
    const input = { name: modalName, amount: parseRpInput(modalAmount), walletId: wallet };
    const issue = modalDadakanIssue(input);
    if (issue) {
      toast.warning(t(issue));
      return;
    }
    setSaving(true);
    try {
      if (await modalDadakan.onSave(input)) {
        // Tetap terbuka seperti tab inventori: satu unit bisa butuh dua part
        // dari toko sebelah. Wallet dibiarkan, biasanya sama.
        setModalName('');
        setModalAmount('');
        nameRef.current?.focus();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(modalDadakan ? 'partPicker.titleAny' : 'partPicker.title')}
      size="lg"
      footer={
        // Di tab Modal Dadakan aksi utamanya Simpan Modal; Selesai hanya menutup.
        <Button variant={source === 'modal' ? 'secondary' : 'primary'} onClick={onClose}>
          {t('partPicker.done')}
        </Button>
      }
    >
      <div className={styles.body}>
        {ticket && (
          <p className={styles.context}>
            <span className={styles.contextNo}>{ticket.serviceNo}</span>
            <span className={styles.dot} aria-hidden />
            <span className={styles.contextDevice}>{ticket.device}</span>
            {ticket.customerName && (
              <>
                <span className={styles.dot} aria-hidden />
                <span>{ticket.customerName}</span>
              </>
            )}
          </p>
        )}
        {modalDadakan && (
          <div className={styles.source} role="group" aria-label={t('partPicker.sourceAria')}>
            {(['inventory', 'modal'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={styles.sourceBtn}
                aria-pressed={source === id}
                onClick={() => setSource(id)}
              >
                <span className={styles.sourceLed} aria-hidden />
                <span className={styles.sourceText}>
                  <span className={styles.sourceName}>
                    {t(id === 'inventory' ? 'nav.inventory' : 'serviceDetail.extraCost')}
                  </span>
                  <span className={styles.sourceSub}>
                    {t(id === 'inventory' ? 'partPicker.sourceInventorySub' : 'partPicker.sourceModalSub')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {modalDadakan && source === 'modal' ? (
          <form className={styles.modalForm} onSubmit={saveModal}>
            <Input
              ref={nameRef}
              label={t('serviceDetail.modalName')}
              value={modalName}
              onChange={(e) => setModalName(e.target.value)}
              placeholder={t('serviceDetail.modalNamePh')}
              autoFocus
            />
            <div className={styles.modalRow}>
              <Input
                label={t('serviceDetail.modalAmount')}
                value={modalAmount}
                onChange={(e) => setModalAmount(fmtRpInput(e.target.value))}
                placeholder="250.000"
                inputMode="numeric"
              />
              <Select
                label={t('serviceDetail.fromWallet')}
                value={wallet}
                onChange={(e) => setWalletId(e.target.value)}
                options={modalDadakan.wallets.map((w) => ({ value: w.id, label: w.name }))}
              />
            </div>
            <p className={styles.modalHint}>
              <Icon name="circle-info" aria-hidden /> {t('serviceDetail.modalAddHint')}
            </p>
            <div className={styles.modalBtns}>
              <Button type="submit" loading={saving} iconLeft={<Icon name="plus" aria-hidden />}>
                {t('serviceDetail.saveModal')}
              </Button>
            </div>
          </form>
        ) : (
          <>
        <Input
          placeholder={t('partPicker.searchPh')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          iconLeft={<Icon name="magnifying-glass" aria-hidden />}
          autoFocus
        />
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <p>
              {inventory.length === 0
                ? t('partPicker.noInventory')
                : t('partPicker.noMatch')}
            </p>
            {modalDadakan && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toModal(query.trim())}
                iconLeft={<Icon name="money-bill-wave" aria-hidden />}
              >
                {query.trim()
                  ? interpolate(t('partPicker.toModalNamed'), { name: query.trim() })
                  : t('partPicker.toModal')}
              </Button>
            )}
          </div>
        ) : (
          <ul className={styles.list}>
            {rows.map((item) => {
              const out = item.stock <= 0;
              const added = existingItemIds.includes(item.id);
              return (
                <li key={item.id} className={styles.row} data-out={out}>
                  <span className={[styles.led, out ? styles.ledOut : styles.ledOk].join(' ')} />
                  <div className={styles.info}>
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.meta}>
                      <span className={styles.sku}>{item.sku || <EmptyValue />}</span>
                      <span className={styles.dot} />
                      {interpolate(t('partPicker.stock'), { n: String(item.stock) })}
                      {isMgr && (
                        <>
                          <span className={styles.dot} />
                          {interpolate(t('partPicker.cost'), { amount: fmtRp(item.costPrice) })}
                        </>
                      )}
                    </span>
                  </div>
                  <input
                    className={styles.qty}
                    type="number"
                    min={1}
                    max={item.stock}
                    value={qtyById[item.id] ?? '1'}
                    onChange={(e) =>
                      setQtyById((m) => ({ ...m, [item.id]: e.target.value }))
                    }
                    disabled={out}
                    aria-label={interpolate(t('partPicker.qtyAria'), { name: item.name })}
                  />
                  <Button
                    size="sm"
                    variant={added ? 'secondary' : 'primary'}
                    onClick={() => add(item.id)}
                    disabled={out}
                    iconLeft={<Icon name="plus" aria-hidden />}
                  >
                    {added ? t('partPicker.addAgain') : t('common.add')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
          </>
        )}
      </div>
    </Modal>
  );
}
