import { repository } from '@/data';
import { newId } from '@/lib/id';
import { localDateStr } from '@/lib/time';
import { applyTransferChange, type TransferMoney } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { isCloudMode } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import {
  transferWallet,
  updateWalletTransfer,
  voidWalletTransfer,
} from '@/data/supabase-client';
import type { Wallet, WalletTransfer } from '@/data/types';

/**
 * Satu pintu untuk membuat, mengedit, dan membatalkan transfer (0086) — dipakai
 * Buku Kas DAN Pengaturan, supaya dua titik masuk tidak pernah berbeda aturan.
 *
 * Cloud: RPC yang atomik & mencatat log sendiri (SERVER_LOGGED). Lokal/demo:
 * aturan yang sama lewat `applyTransferChange`, ditulis ke repository. Galat
 * validasi dilempar sebagai Error berbahasa Indonesia, siap ditampilkan.
 */

const money = (t: Pick<WalletTransfer, 'fromWalletId' | 'toWalletId' | 'amount'>): TransferMoney => ({
  fromWalletId: t.fromWalletId,
  toWalletId: t.toWalletId,
  amount: t.amount,
});

function check(wallets: Wallet[], before: TransferMoney | null, after: TransferMoney | null): Wallet[] {
  const r = applyTransferChange(wallets, before, after);
  if (!r.ok) throw new Error(r.error);
  return r.wallets;
}

async function putWallets(changed: Wallet[]) {
  const now = new Date().toISOString();
  for (const w of changed) await repository.put('wallets', { ...w, updatedAt: now });
}

const nameOf = (wallets: Wallet[], id: string) => wallets.find((w) => w.id === id)?.name ?? '';

export async function createTransfer(p: {
  wallets: Wallet[];
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  note: string;
}): Promise<void> {
  const after = { fromWalletId: p.fromWalletId, toWalletId: p.toWalletId, amount: p.amount };
  // Validasi lokal dulu (aturan kembar server) untuk umpan balik seketika.
  const changed = check(p.wallets, null, after);
  const { org, currentEmployee } = useSessionStore.getState();
  const fromName = nameOf(p.wallets, p.fromWalletId);
  const toName = nameOf(p.wallets, p.toWalletId);

  if (isCloudMode()) {
    await transferWallet({ orgId: org?.id ?? '', ...after, note: p.note });
    return;
  }
  const now = new Date().toISOString();
  await repository.put('walletTransfers', {
    id: newId(),
    orgId: org?.id ?? '',
    outletId: null,
    ...after,
    fromName,
    toName,
    note: p.note.trim(),
    date: localDateStr(),
    status: 'active',
    createdByName: currentEmployee?.name ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await putWallets(changed);
  logActivity({
    action: 'wallet.transfer',
    entityType: 'wallet',
    entityId: p.fromWalletId,
    entityLabel: `${fromName} → ${toName}`,
    meta: { amount: p.amount, toWalletId: p.toWalletId },
  });
}

export async function editTransfer(p: {
  wallets: Wallet[];
  transfer: WalletTransfer;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  note: string;
}): Promise<void> {
  const after = { fromWalletId: p.fromWalletId, toWalletId: p.toWalletId, amount: p.amount };
  const changed = check(p.wallets, money(p.transfer), after);
  const org = useSessionStore.getState().org;

  if (isCloudMode()) {
    await updateWalletTransfer({ orgId: org?.id ?? '', transferId: p.transfer.id, ...after, note: p.note });
    return;
  }
  const fromName = nameOf(p.wallets, p.fromWalletId) || p.transfer.fromName;
  const toName = nameOf(p.wallets, p.toWalletId) || p.transfer.toName;
  await repository.put('walletTransfers', {
    ...p.transfer,
    ...after,
    fromName,
    toName,
    note: p.note.trim(),
    updatedAt: new Date().toISOString(),
  });
  await putWallets(changed);
  logActivity({
    action: 'wallet.transfer.edit',
    entityType: 'wallet_transfer',
    entityId: p.transfer.id,
    entityLabel: `${fromName} → ${toName}`,
    meta: { before: money(p.transfer), after },
  });
}

export async function voidTransfer(p: {
  wallets: Wallet[];
  transfer: WalletTransfer;
  reason?: string;
}): Promise<void> {
  const changed = check(p.wallets, money(p.transfer), null);
  const { org, currentEmployee } = useSessionStore.getState();

  if (isCloudMode()) {
    await voidWalletTransfer({ orgId: org?.id ?? '', transferId: p.transfer.id, reason: p.reason });
    return;
  }
  const now = new Date().toISOString();
  await repository.put('walletTransfers', {
    ...p.transfer,
    status: 'void',
    voidedAt: now,
    voidedByName: currentEmployee?.name ?? '',
    voidReason: p.reason?.trim() || null,
    updatedAt: now,
  });
  await putWallets(changed);
  logActivity({
    action: 'wallet.transfer.void',
    entityType: 'wallet_transfer',
    entityId: p.transfer.id,
    entityLabel: `${p.transfer.fromName} → ${p.transfer.toName}`,
    meta: { amount: p.transfer.amount },
  });
}
