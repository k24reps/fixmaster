import { useRef, useState } from 'react';
import {
  Modal,
  Input,
  Select,
  Button,
  FormFields,
  FormRow,
  FormError,
} from '@/components/ui';
import { repository } from '@/data';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { walletsForOutlet, applyBalance, entryDateError, findRecentDuplicate } from '@/lib/business/finance';
import { createFinanceEntry } from '@/data/financeEntry';
import { updateFinanceEntry } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import { useT } from '@/i18n';
import { getRent } from '@/config/orgConfig';
import { interpolate } from '@/lib/business/notify';
import { OVERHEAD_CATEGORIES } from '@/lib/business/overhead';
import type {
  ActivityAction,
  Wallet,
  IncomeCategory,
  ExpenseCategory,
  Expense,
  Income,
} from '@/data/types';
import styles from './FinancePage.module.css';
import type { TranslationKey } from '@/i18n';

interface EntryModalProps {
  open: boolean;
  onClose: () => void;
  kind: 'income' | 'expense';
  wallets: Wallet[];
  /** When set, the modal edits this record instead of creating a new entry. */
  editing?: Income | Expense | null;
  /** Baris yang sudah ada (jenis yang sama) — untuk peringatan catat ganda. */
  existing?: readonly (Income | Expense)[];
}

// Servis & Penjualan sengaja TIDAK ada: pelunasan tiket dan penjualan Kasir
// sudah mencatat pemasukannya sendiri, jadi mencatatnya di sini = dihitung dua
// kali. Server menolaknya juga (0091). Baris lama berkategori itu tetap bisa
// diedit — kategorinya ditambahkan kembali saat mengedit.
const INCOME_CATEGORIES: IncomeCategory[] = ['Modal', 'Lainnya'];
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Sparepart',
  'Operasional',
  'Gaji',
  'Sewa',
  'Garansi',
  'Refund Penjualan',
  'Prive',
  'Lainnya',
];

/** Penjelasan kategori arus kas pemilik — dua-duanya gampang disalahpahami. */
const CATEGORY_HINT: Record<string, TranslationKey> = {
  Modal: 'finance.hintModal',
  Prive: 'finance.hintPrive',
};

interface EditArgs {
  orgId: string;
  kind: 'income' | 'expense';
  date: string;
  category: string;
  value: number;
  walletId: string;
  note: string;
  wallets: Wallet[];
}

/**
 * Ubah satu baris keuangan yang sudah ada. Cloud: satu transaksi server (0071).
 * Lokal/demo: baris ditulis, lalu saldo wallet lama & baru direkonsiliasi —
 * tanda (+/−) adalah satu-satunya yang membedakan pemasukan dari pengeluaran.
 *
 * `kind` datang dari pemanggil (FinancePage) dan selalu cocok dengan baris yang
 * diedit — jangan menebaknya dari isi baris (pemasukan lama tanpa `serviceId`
 * akan tertulis ke `expenses`).
 */
async function saveEdit(editing: Income | Expense, a: EditArgs): Promise<string> {
  const { kind, walletId, value, note, wallets } = a;
  if (isCloudMode()) {
    await updateFinanceEntry({
      orgId: a.orgId,
      kind,
      id: editing.id,
      date: a.date,
      category: a.category,
      amount: value,
      walletId,
      description: note,
    });
    return editing.id;
  }

  const updatedAt = new Date().toISOString();
  const fields = { date: a.date, amount: value, walletId, description: note, updatedAt };
  if (kind === 'income') {
    const inc = editing as Income;
    await repository.put('incomes', { ...inc, ...fields, category: a.category as IncomeCategory });
  } else {
    const exp = editing as Expense;
    await repository.put('expenses', { ...exp, ...fields, category: a.category as ExpenseCategory });
  }

  const sign = kind === 'income' ? 1 : -1;
  const wallet = wallets.find((w) => w.id === walletId);
  if (editing.walletId === walletId) {
    if (wallet) {
      await repository.put('wallets', applyBalance(wallet, sign * (value - editing.amount)));
    }
  } else {
    const oldWallet = wallets.find((w) => w.id === editing.walletId);
    if (oldWallet) await repository.put('wallets', applyBalance(oldWallet, -sign * editing.amount));
    if (wallet) await repository.put('wallets', applyBalance(wallet, sign * value));
  }
  return editing.id;
}

export function EntryModal({ open, onClose, kind, wallets, editing, existing = [] }: EntryModalProps) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  // Juga membuat komponen render ulang saat cabang berganti (mustPickOutlet membaca store).
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  // Tautan ke Pengaturan hanya berguna bagi yang bisa membukanya.
  const isOwner = useSessionStore((s) => s.currentEmployee?.role === 'owner');
  const { data: outlets } = useCollection('outlets');
  const [date, setDate] = useState(localDateStr());
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [outletId, setOutletId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Peringatan catat ganda sudah ditampilkan untuk isian ini; Simpan berikutnya lanjut.
  const [dupAck, setDupAck] = useState(false);
  // Pengeluaran melebihi saldo wallet: diperingatkan sekali (Transfer menolaknya).
  const [overAck, setOverAck] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const today = localDateStr();
  const monthStart = today.slice(0, 8) + '01';
  // Cabang dipilih DI SINI, bukan ditolak setelah form terisi dengan petunjuk ke
  // sidebar yang tertutup jendela (dan tak ada di ponsel). Pola sama dengan Servis Baru.
  const needOutlet = !editing && mustPickOutlet(outlets.length);
  const outletOptions = outlets
    .filter((o) => allowedOutletIds.length === 0 || allowedOutletIds.includes(o.id))
    .map((o) => ({ value: o.id, label: o.name }));
  // Wallet cabang lain tidak ditawarkan (server menolaknya, 0095). Di "Semua
  // Outlet" sebelum cabang dipilih: semua wallet — memilih wallet cabang
  // langsung mengisi cabangnya.
  const entryOutlet = editing ? editing.outletId : needOutlet ? outletId || null : activeOutletId;
  const usableWallets = walletsForOutlet(wallets, entryOutlet);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    if (editing) {
      // Edit mode: prefill from the existing expense record.
      setDate(editing.date);
      setCategory(editing.category);
      setAmount(fmtRpInput(String(editing.amount)));
      setWalletId(editing.walletId);
      setDescription(editing.description);
    } else {
      setDate(localDateStr());
      setCategory(kind === 'income' ? 'Lainnya' : 'Operasional');
      setAmount('');
      setWalletId(walletsForOutlet(wallets, activeOutletId)[0]?.id ?? '');
      setDescription('');
    }
    setOutletId('');
    setDupAck(false);
    setOverAck(false);
    setError('');
  }
  if (!open && lastOpen) setLastOpen(false);
  if (open && !editing && walletId && usableWallets.length && !usableWallets.some((w) => w.id === walletId)) {
    setWalletId(usableWallets[0].id);
  }

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setError('');
    setDupAck(false);
    setOverAck(false);
  };

  const save = async (again = false) => {
    if (busy) return;
    const value = parseRpInput(amount);
    if (needOutlet && !outletId) return setError(t('finance.outletRequired'));
    if (value <= 0) return setError(t('finance.amountRequired'));
    if (!walletId) return setError(t('finance.walletRequired'));
    // Baris bulan lalu yang diedit tak pernah sampai di sini (tombolnya tak ada).
    const dateError = entryDateError(date, today);
    if (dateError) return setError(dateError);
    const note = description.trim();
    const target = wallets.find((w) => w.id === walletId);
    if (kind === 'expense' && !editing && target && value > target.balance && !overAck) {
      setOverAck(true);
      return setError(
        t('finance.overdrawWarn').replace('{wallet}', target.name).replace('{balance}', fmtRp(target.balance)),
      );
    }
    if (!editing && !dupAck) {
      const dup = findRecentDuplicate(existing, { amount: value, walletId, description: note, date });
      if (dup) {
        setDupAck(true);
        return setError(t('finance.duplicateWarn'));
      }
    }

    setBusy(true);
    try {
      const entryId = editing
        ? await saveEdit(editing, { orgId, kind, date, category, value, walletId, note, wallets })
        : await createFinanceEntry({
            orgId,
            kind,
            date,
            category,
            amount: value,
            walletId,
            description: note,
            outletId: needOutlet ? outletId : resolveCreateOutlet(outlets),
          });

      logActivity({
        action: `${kind}.${editing ? 'update' : 'create'}` as ActivityAction,
        entityType: kind,
        entityId: entryId,
        entityLabel: note || category,
        meta: { amount: value, category, ...(editing ? { prevAmount: editing.amount } : {}) },
      });
      const wallet = wallets.find((w) => w.id === walletId);
      toast.success(
        `${kind === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${editing ? 'diperbarui' : 'dicatat'}` +
          (wallet && !editing ? ` · ${wallet.name} ${kind === 'income' ? '+' : '−'}${fmtRp(value)}` : ''),
      );
      if (again) {
        // Catat beruntun: tanggal, kategori, wallet, dan cabang dipertahankan.
        setAmount('');
        setDescription('');
        setDupAck(false);
        setOverAck(false);
        setError('');
        amountRef.current?.focus();
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('finance.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const base = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const categories: string[] =
    editing && !(base as string[]).includes(editing.category) ? [editing.category, ...base] : base;
  const formId = `entry-${kind}`;
  // Sewa cabang tahunan diratakan di Laporan — jelaskan kenapa angkanya tak melonjak.
  const rentOutlet = entryOutlet ?? resolveCreateOutlet(outlets);
  const rent = kind === 'expense' && category === 'Sewa' && rentOutlet ? getRent()[rentOutlet] : undefined;
  const annualRent = rent?.mode === 'tahunan' && rent.yearly > 0 ? rent : null;
  const overheadCategory = kind === 'expense' && (OVERHEAD_CATEGORIES as readonly string[]).includes(category);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        t(
          editing
            ? kind === 'income'
              ? 'finance.editIncome'
              : 'finance.editExpense'
            : kind === 'income'
              ? 'finance.newIncome'
              : 'finance.newExpense',
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {!editing && (
            <Button
              variant="secondary"
              className={styles.saveAgain}
              onClick={() => void save(true)}
              disabled={busy}
              title="Ctrl+Enter"
            >
              {t('finance.saveAgain')}
            </Button>
          )}
          <Button type="submit" form={formId} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {/* <form>: Enter di field mana pun menyimpan. */}
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        // Ctrl/Shift+Enter = Simpan & tambah lagi: catat beruntun tanpa meninggalkan keyboard.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !editing && (e.ctrlKey || e.metaKey || e.shiftKey)) {
            e.preventDefault();
            void save(true);
          }
        }}
      >
        <FormFields>
          <FormError>{error}</FormError>
          {needOutlet && (
            <Select
              label={t('finance.outlet')}
              value={outletId}
              onChange={(e) => change(setOutletId)(e.target.value)}
              options={outletOptions}
              placeholder={t('finance.outletPlaceholder')}
              autoFocus
            />
          )}
          <FormRow>
            <Input
              label={t('finance.date')}
              type="date"
              value={date}
              min={editing ? undefined : monthStart}
              max={today}
              onChange={(e) => change(setDate)(e.target.value)}
              hint={editing ? undefined : t('finance.dateHint')}
            />
            <Select
              label={t('finance.category')}
              value={category}
              onChange={(e) => change(setCategory)(e.target.value)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </FormRow>
          {CATEGORY_HINT[category] && <p className={styles.formHint}>{t(CATEGORY_HINT[category])}</p>}
          {overheadCategory && (
            <p className={styles.formHint}>
              {t('finance.overheadHint')}{' '}
              {annualRent
                ? interpolate(t('finance.rentYearlyHint'), { amount: fmtRp(annualRent.yearly / 12) })
                : category === 'Sewa' && isOwner && t('finance.rentAnnualAsk')}
            </p>
          )}
          {kind === 'income' && !editing && (
            <p className={styles.formHint}>{t('finance.autoIncomeHint')}</p>
          )}
          <FormRow>
            <Input
              ref={amountRef}
              label={t('finance.amount')}
              value={amount}
              inputMode="numeric"
              onChange={(e) => change(setAmount)(fmtRpInput(e.target.value))}
              placeholder="100.000"
              autoFocus={!needOutlet}
            />
            <Select
              label={t('finance.wallet')}
              value={walletId}
              onChange={(e) => {
                change(setWalletId)(e.target.value);
                const picked = wallets.find((w) => w.id === e.target.value);
                if (needOutlet && picked?.outletId) setOutletId(picked.outletId);
              }}
              options={usableWallets.map((w) => ({ value: w.id, label: `${w.name} · ${fmtRp(w.balance)}` }))}
            />
          </FormRow>
          <Input
            label={t('finance.noteOptional')}
            value={description}
            onChange={(e) => change(setDescription)(e.target.value)}
          />
        </FormFields>
      </form>
    </Modal>
  );
}
