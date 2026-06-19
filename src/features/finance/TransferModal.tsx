import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { transfer } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { isSupabaseConfigured, transferWallet } from '@/data/supabase-client';
import type { Wallet } from '@/data/types';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  wallets: Wallet[];
}

/**
 * Wallet-to-wallet transfer from the Finance menu. A transfer is neither
 * income nor expense (no profit/loss), so it books NO ledger entry — it only
 * moves balance. Mirrors the tested helper `transfer` + cloud RPC used in
 * Settings, surfaced here where managers actually manage cash.
 */
export function TransferModal({ open, onClose, wallets }: TransferModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    // Default both selects to real wallets so the displayed option matches
    // state. A native <select> with an unmatched value silently shows the
    // first option while state stays empty → misleading "pick wallet" error.
    const first = wallets[0]?.id ?? '';
    const second = wallets.find((w) => w.id !== first)?.id ?? '';
    setFromId(first);
    setToId(second);
    setAmount('');
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
    const from = wallets.find((w) => w.id === fromId);
    const to = wallets.find((w) => w.id === toId);
    if (!from || !to) return setError('Pilih wallet asal & tujuan');
    // Validate locally first (same guards the server enforces) for instant feedback.
    const result = transfer(from, to, value);
    if (!result.ok) return setError(result.error ?? 'Transfer gagal');

    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        await transferWallet({ orgId, fromWalletId: fromId, toWalletId: toId, amount: value });
      } else {
        const now = new Date().toISOString();
        await repository.put('wallets', { ...result.fromWallet!, updatedAt: now });
        await repository.put('wallets', { ...result.toWallet!, updatedAt: now });
      }
      logActivity({
        action: 'wallet.transfer',
        entityType: 'wallet',
        entityId: fromId,
        entityLabel: `${from.name} → ${to.name}`,
        meta: { amount: value, toWalletId: toId },
      });
      toast.success(`Transfer ${fmtRp(value)}: ${from.name} → ${to.name}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer Saldo Antar Wallet"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Transfer
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Memindahkan saldo antar kas. Tidak tercatat sebagai pemasukan/pengeluaran (bukan untung/rugi).
        </p>
        <FormRow>
          <Select
            label="Dari wallet"
            value={fromId}
            onChange={(e) => onFromChange(e.target.value)}
            options={wallets.map((w) => ({ value: w.id, label: `${w.name} (${fmtRp(w.balance)})` }))}
          />
          <Select
            label="Ke wallet"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            options={wallets
              .filter((w) => w.id !== fromId)
              .map((w) => ({ value: w.id, label: w.name }))}
          />
        </FormRow>
        <Input
          label="Nominal"
          value={amount}
          onChange={(e) => setAmount(fmtRpInput(e.target.value))}
          placeholder="100.000"
          autoFocus
        />
      </FormFields>
    </Modal>
  );
}
