import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { transferMoneyLocked } from '@/lib/business/finance';
import { toast } from '@/stores/toast';
import type { Wallet, WalletTransfer } from '@/data/types';
import { createTransfer, editTransfer } from './transferActions';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  wallets: Wallet[];
  /** Transfer yang diedit; null = transfer baru. */
  editing?: WalletTransfer | null;
}

/**
 * Transfer saldo antar wallet — buat baru atau edit (0086). Transfer bukan
 * pemasukan/pengeluaran (bukan untung/rugi), jadi tidak membukukan baris kas;
 * ia punya tabel sendiri, `wallet_transfers`.
 */
export function TransferModal({ open, onClose, wallets, editing = null }: TransferModalProps) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Transfer bulan lalu: uangnya terkunci (kunci bulan 0071), keterangannya tidak.
  const moneyLocked = !!editing && transferMoneyLocked(editing, localDateStr());

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    // Default both selects to real wallets so the displayed option matches
    // state. A native <select> with an unmatched value silently shows the
    // first option while state stays empty → misleading "pick wallet" error.
    const first = editing?.fromWalletId || wallets[0]?.id || '';
    const second = editing?.toWalletId || wallets.find((w) => w.id !== first)?.id || '';
    setFromId(first);
    setToId(second);
    setAmount(editing ? fmtRpInput(String(editing.amount)) : '');
    setNote(editing?.note ?? '');
    setError('');
  }
  if (!open && lastOpen) setLastOpen(false);

  // Keep the destination valid: if it collides with the new source, move it.
  const onFromChange = (id: string) => {
    setFromId(id);
    if (id === toId) setToId(wallets.find((w) => w.id !== id)?.id ?? '');
  };

  const save = async () => {
    const value = parseRpInput(amount);
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await editTransfer({ wallets, transfer: editing, fromWalletId: fromId, toWalletId: toId, amount: value, note });
        toast.success('Transfer diperbarui');
      } else {
        await createTransfer({ wallets, fromWalletId: fromId, toWalletId: toId, amount: value, note });
        const from = wallets.find((w) => w.id === fromId)?.name ?? '';
        const to = wallets.find((w) => w.id === toId)?.name ?? '';
        toast.success(`Transfer ${fmtRp(value)}: ${from} → ${to}`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer gagal');
    } finally {
      setBusy(false);
    }
  };

  // Wallet transfer lama bisa saja sudah tak ada di daftar (cabang lain /
  // dihapus); tampilkan namanya dari riwayat supaya pilihan tidak kosong.
  const options = (keep: string, name: string) => {
    const list = wallets.map((w) => ({ value: w.id, label: `${w.name} (${fmtRp(w.balance)})` }));
    return keep && !wallets.some((w) => w.id === keep) ? [{ value: keep, label: name }, ...list] : list;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Transfer' : 'Transfer Saldo Antar Wallet'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Simpan' : 'Transfer'}
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {moneyLocked
            ? 'Transfer bulan lalu: wallet & nominal terkunci karena laporan bulan itu sudah berjalan. Keterangan tetap bisa diubah.'
            : 'Memindahkan saldo antar kas. Tidak tercatat sebagai pemasukan/pengeluaran (bukan untung/rugi).'}
        </p>
        <FormRow>
          <Select
            label="Dari wallet"
            value={fromId}
            onChange={(e) => onFromChange(e.target.value)}
            options={options(fromId, editing?.fromName ?? '')}
            disabled={moneyLocked}
          />
          <Select
            label="Ke wallet"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            options={options(toId, editing?.toName ?? '')
              .filter((o) => o.value !== fromId)
              .map((o) => ({ ...o, label: o.label.replace(/ \(Rp.*\)$/, '') }))}
            disabled={moneyLocked}
          />
        </FormRow>
        <Input
          label="Nominal"
          value={amount}
          onChange={(e) => setAmount(fmtRpInput(e.target.value))}
          placeholder="100.000"
          inputMode="numeric"
          disabled={moneyLocked}
          autoFocus={!moneyLocked}
        />
        <Input
          label="Keterangan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="mis. setor ke bank, modal kasir pagi"
          maxLength={120}
          autoFocus={moneyLocked}
        />
      </FormFields>
    </Modal>
  );
}
