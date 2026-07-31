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
import { newId } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { applyBalance } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import type {
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
    const now = new Date().toISOString();
    const wallet = wallets.find((w) => w.id === walletId);
    const txOutletId = resolveCreateOutlet(outlets);
    try {
      if (editing) {
        // ----- Edit existing record (income or expense) + reconcile wallet. -----
        // The caller (FinancePage) always sets `kind` to match the record being
        // edited — don't sniff fields like serviceId to tell them apart (a
        // legacy income without that field would be written into `expenses`).
        if (kind === 'income') {
          const inc = editing as Income;
          await repository.put('incomes', {
            ...inc,
            date,
            category: category as IncomeCategory,
            amount: value,
            walletId,
            description: description.trim(),
            updatedAt: now,
          });
          // Reconcile wallets.
          if (inc.walletId === walletId) {
            if (wallet)
              await repository.put('wallets', applyBalance(wallet, value - inc.amount));
          } else {
            const oldWallet = wallets.find((w) => w.id === inc.walletId);
            if (oldWallet)
              await repository.put('wallets', applyBalance(oldWallet, -inc.amount));
            if (wallet) await repository.put('wallets', applyBalance(wallet, value));
          }
          logActivity({
            action: 'income.update',
            entityType: 'income',
            entityId: inc.id,
            entityLabel: description.trim() || (category as string),
            meta: { amount: value, prevAmount: inc.amount, category },
          });
          toast.success('Pemasukan diperbarui');
        } else {
          const exp = editing as Expense;
          await repository.put('expenses', {
            ...exp,
            date,
            category: category as ExpenseCategory,
            amount: value,
            walletId,
            description: description.trim(),
            updatedAt: now,
          });
          if (exp.walletId === walletId) {
            if (wallet)
              await repository.put('wallets', applyBalance(wallet, exp.amount - value));
          } else {
            const oldWallet = wallets.find((w) => w.id === exp.walletId);
            if (oldWallet)
              await repository.put('wallets', applyBalance(oldWallet, exp.amount));
            if (wallet) await repository.put('wallets', applyBalance(wallet, -value));
          }
          logActivity({
            action: 'expense.update',
            entityType: 'expense',
            entityId: exp.id,
            entityLabel: description.trim() || (category as string),
            meta: { amount: value, prevAmount: exp.amount, category },
          });
          toast.success('Pengeluaran diperbarui');
        }
        onClose();
        return;
      }
      if (kind === 'income') {
        const id = newId();
        await repository.put('incomes', {
          id,
          orgId,
          outletId: txOutletId,
          date,
          category: category as IncomeCategory,
          amount: value,
          walletId,
          description: description.trim(),
          serviceId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        if (wallet) await repository.put('wallets', applyBalance(wallet, value));
        logActivity({
          action: 'income.create',
          entityType: 'income',
          entityId: id,
          entityLabel: description.trim() || (category as string),
          meta: { amount: value, category },
        });
      } else {
        const id = newId();
        await repository.put('expenses', {
          id,
          orgId,
          outletId: txOutletId,
          date,
          category: category as ExpenseCategory,
          amount: value,
          walletId,
          description: description.trim(),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        if (wallet) await repository.put('wallets', applyBalance(wallet, -value));
        logActivity({
          action: 'expense.create',
          entityType: 'expense',
          entityId: id,
          entityLabel: description.trim() || (category as string),
          meta: { amount: value, category },
        });
      }
      toast.success(kind === 'income' ? 'Pemasukan dicatat' : 'Pengeluaran dicatat');
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
