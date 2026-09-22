import { useState } from 'react';
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
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { applyBalance } from '@/lib/business/finance';
import { createFinanceEntry } from '@/data/financeEntry';
import { updateFinanceEntry } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import type {
  ActivityAction,
  Wallet,
  IncomeCategory,
  ExpenseCategory,
  Expense,
  Income,
} from '@/data/types';

interface EntryModalProps {
  open: boolean;
  onClose: () => void;
  kind: 'income' | 'expense';
  wallets: Wallet[];
  /** When set, the modal edits this record instead of creating a new entry. */
  editing?: Income | Expense | null;
}

const INCOME_CATEGORIES: IncomeCategory[] = ['Servis', 'Penjualan', 'Modal', 'Lainnya'];
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
const CATEGORY_HINT: Record<string, string> = {
  Modal:
    'Uang pribadi disuntik ke kas usaha. Saldo bertambah, tapi TIDAK dihitung sebagai omzet atau laba.',
  Prive:
    'Uang usaha ditarik untuk pemilik. Saldo berkurang, tapi TIDAK dihitung sebagai biaya usaha.',
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

export function EntryModal({ open, onClose, kind, wallets, editing }: EntryModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const { data: outlets } = useCollection('outlets');
  const [date, setDate] = useState(localDateStr());
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      setWalletId(wallets[0]?.id ?? '');
      setDescription('');
    }
    setError('');
  }
  if (!open && lastOpen) setLastOpen(false);

  const save = async () => {
    const value = parseRpInput(amount);
    if (value <= 0) return setError('Nominal harus lebih dari 0');
    if (!walletId) return setError('Pilih wallet');
    // OQ-C (same guard as PosPage.checkout): a user who can reach multiple
    // outlets must pick a branch first so the entry isn't silently stamped to
    // the primary outlet. Edits keep the record's original outlet, so only
    // creation needs the guard.
    if (!editing && mustPickOutlet(outlets.length)) {
      return setError('Pilih cabang dulu di selektor cabang (sidebar) sebelum mencatat');
    }

    setBusy(true);
    const note = description.trim();
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
            outletId: resolveCreateOutlet(outlets),
          });

      logActivity({
        action: `${kind}.${editing ? 'update' : 'create'}` as ActivityAction,
        entityType: kind,
        entityId: entryId,
        entityLabel: note || category,
        meta: { amount: value, category, ...(editing ? { prevAmount: editing.amount } : {}) },
      });
      toast.success(
        `${kind === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${editing ? 'diperbarui' : 'dicatat'}`,
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editing
          ? kind === 'income'
            ? 'Edit Pemasukan'
            : 'Edit Pengeluaran'
          : kind === 'income'
            ? 'Catat Pemasukan'
            : 'Catat Pengeluaran'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <FormRow>
          <Input
            label="Tanggal"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select
            label="Kategori"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </FormRow>
        {CATEGORY_HINT[category] && (
          <p
            style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
          >
            {CATEGORY_HINT[category]}
          </p>
        )}
        <FormRow>
          <Input
            label="Nominal"
            value={amount}
            onChange={(e) => setAmount(fmtRpInput(e.target.value))}
            placeholder="100.000"
            autoFocus
          />
          <Select
            label="Wallet"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            options={wallets.map((w) => ({ value: w.id, label: w.name }))}
          />
        </FormRow>
        <Input
          label="Keterangan (opsional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormFields>
    </Modal>
  );
}
