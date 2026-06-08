import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { applyBalance } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { Wallet, IncomeCategory, ExpenseCategory } from '@/data/types';

interface EntryModalProps {
  open: boolean;
  onClose: () => void;
  kind: 'income' | 'expense';
  wallets: Wallet[];
}

const INCOME_CATEGORIES: IncomeCategory[] = ['Servis', 'Penjualan', 'Lainnya'];
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Sparepart',
  'Operasional',
  'Gaji',
  'Sewa',
  'Garansi',
  'Refund Penjualan',
  'Lainnya',
];

export function EntryModal({ open, onClose, kind, wallets }: EntryModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
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
    setDate(localDateStr());
    setCategory(kind === 'income' ? 'Lainnya' : 'Operasional');
    setAmount('');
    setWalletId(wallets[0]?.id ?? '');
    setDescription('');
    setError('');
  }
  if (!open && lastOpen) setLastOpen(false);

  const save = async () => {
    const value = parseRpInput(amount);
    if (value <= 0) return setError('Nominal harus lebih dari 0');
    if (!walletId) return setError('Pilih wallet');

    setBusy(true);
    const now = new Date().toISOString();
    const wallet = wallets.find((w) => w.id === walletId);
    try {
      if (kind === 'income') {
        const id = newId();
        await repository.put('incomes', {
          id,
          orgId,
          outletId: null,
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
          outletId: null,
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
    } catch {
      toast.error('Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'income' ? 'Catat Pemasukan' : 'Catat Pengeluaran'}
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
          <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select
            label="Kategori"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </FormRow>
        <FormRow>
          <Input label="Nominal" value={amount} onChange={(e) => setAmount(fmtRpInput(e.target.value))} placeholder="100.000" autoFocus />
          <Select
            label="Wallet"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            options={wallets.map((w) => ({ value: w.id, label: w.name }))}
          />
        </FormRow>
        <Input label="Keterangan (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormFields>
    </Modal>
  );
}
