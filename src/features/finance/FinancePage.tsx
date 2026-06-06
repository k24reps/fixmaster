import { useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, EmptyState, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateStr } from '@/lib/time';
import {
  summarize,
  applyBalance,
  reverseIncomeDelta,
  reverseExpenseDelta,
  shouldRevertServiceOnIncomeDelete,
} from '@/lib/business/finance';
import { toast } from '@/stores/toast';
import { EntryModal } from './EntryModal';
import type { Income, Expense } from '@/data/types';
import styles from './FinancePage.module.css';

interface LedgerRow {
  id: string;
  kind: 'income' | 'expense';
  date: string;
  category: string;
  description: string;
  amount: number;
  walletId: string;
  record: Income | Expense;
}

function monthRange() {
  const now = new Date();
  return {
    from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function FinancePage() {
  const { data: wallets } = useCollection('wallets');
  const { data: incomes } = useCollection('incomes');
  const { data: expenses } = useCollection('expenses');
  const [modalKind, setModalKind] = useState<'income' | 'expense' | null>(null);
  const [toDelete, setToDelete] = useState<LedgerRow | null>(null);

  const { from, to } = monthRange();

  const summary = useMemo(
    () =>
      summarize(
        incomes.filter((r) => r.date >= from && r.date <= to),
        expenses.filter((r) => r.date >= from && r.date <= to),
      ),
    [incomes, expenses, from, to],
  );

  const ledger = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [
      ...incomes.map((i) => ({
        id: i.id, kind: 'income' as const, date: i.date, category: i.category,
        description: i.description, amount: i.amount, walletId: i.walletId, record: i,
      })),
      ...expenses.map((e) => ({
        id: e.id, kind: 'expense' as const, date: e.date, category: e.category,
        description: e.description, amount: e.amount, walletId: e.walletId, record: e,
      })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 100);
  }, [incomes, expenses]);

  const walletName = (id: string) => wallets.find((w) => w.id === id)?.name ?? '—';

  const confirmDelete = async () => {
    if (!toDelete) return;
    const wallet = wallets.find((w) => w.id === toDelete.walletId);
    try {
      if (toDelete.kind === 'income') {
        const inc = toDelete.record as Income;
        if (wallet) await repository.put('wallets', applyBalance(wallet, reverseIncomeDelta(inc)));
        // Reverse-cascade: revert linked service from lunas → selesai.
        if (shouldRevertServiceOnIncomeDelete(inc) && inc.serviceId) {
          const svc = await repository.get('services', inc.serviceId);
          if (svc && svc.status === 'lunas') {
            await repository.put('services', {
              ...svc,
              status: 'selesai',
              history: [
                ...svc.history,
                {
                  at: new Date().toISOString(),
                  status: 'selesai',
                  by: '',
                  byName: 'Sistem',
                  note: 'Pelunasan dibatalkan (pemasukan dihapus)',
                  internal: false,
                },
              ],
            });
          }
        }
        await repository.remove('incomes', toDelete.id);
      } else {
        const exp = toDelete.record as Expense;
        if (wallet) await repository.put('wallets', applyBalance(wallet, reverseExpenseDelta(exp)));
        await repository.remove('expenses', toDelete.id);
      }
      toast.success('Transaksi dihapus & saldo dikembalikan');
      setToDelete(null);
    } catch {
      toast.error('Gagal menghapus transaksi');
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.walletGrid}>
        {wallets.length === 0 ? (
          <Card glass padding>
            <p className={styles.noWallet}>Belum ada wallet. Tambahkan di Pengaturan.</p>
          </Card>
        ) : (
          wallets.map((w) => (
            <div key={w.id} className={styles.walletCard}>
              <span className={styles.walletName}>{w.name}</span>
              <strong className={styles.walletBalance}>{fmtRp(w.balance)}</strong>
            </div>
          ))
        )}
      </div>

      <div className={styles.summaryGrid}>
        <div className={[styles.summaryCard, styles.income].join(' ')}>
          <span>Pemasukan (bln ini)</span>
          <strong>{fmtRp(summary.income)}</strong>
        </div>
        <div className={[styles.summaryCard, styles.expense].join(' ')}>
          <span>Pengeluaran (bln ini)</span>
          <strong>{fmtRp(summary.expense)}</strong>
        </div>
        <div className={[styles.summaryCard, styles.net].join(' ')}>
          <span>Laba Bersih</span>
          <strong>{fmtRp(summary.net)}</strong>
        </div>
      </div>

      <div className={styles.actions}>
        <Button onClick={() => setModalKind('income')} iconLeft={<Icon name="arrow-down" aria-hidden />}>
          Pemasukan
        </Button>
        <Button variant="secondary" onClick={() => setModalKind('expense')} iconLeft={<Icon name="arrow-up" aria-hidden />}>
          Pengeluaran
        </Button>
      </div>

      <Card glass>
        <CardHeader icon={<Icon name="receipt" aria-hidden />} title="Buku Kas" />
        <CardBody className={styles.noPad}>
          {ledger.length === 0 ? (
            <EmptyState
              icon={<Icon name="receipt" aria-hidden />}
              title="Belum ada transaksi"
              description="Catat pemasukan atau pengeluaran pertama."
            />
          ) : (
            <div className={styles.tape}>
              {ledger.map((r) => {
                const inc = r.kind === 'income';
                return (
                  <div key={`${r.kind}-${r.id}`} className={[styles.tapeRow, styles[r.kind]].join(' ')}>
                    <span className={styles.tapeDate}>{fmtDate(r.date)}</span>
                    <div className={styles.tapeBody}>
                      <span className={styles.tapeDesc}>
                        {r.description || <span className={styles.muted}>Tanpa keterangan</span>}
                      </span>
                      <span className={styles.tapeMeta}>
                        <span className={[styles.tapeCat, inc ? styles.inc : styles.exp].join(' ')}>
                          {r.category}
                        </span>
                        · {walletName(r.walletId)}
                      </span>
                    </div>
                    <span className={[styles.tapeAmount, inc ? styles.inc : styles.exp].join(' ')}>
                      {inc ? '+' : '−'}{fmtRp(r.amount)}
                    </span>
                    <button
                      className={[styles.iconBtn, styles.danger].join(' ')}
                      onClick={() => setToDelete(r)}
                      aria-label="Hapus"
                    >
                      <Icon name="trash" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <EntryModal
        open={modalKind !== null}
        onClose={() => setModalKind(null)}
        kind={modalKind ?? 'income'}
        wallets={wallets}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Hapus Transaksi?"
        message="Saldo wallet akan dikembalikan. Jika ini pelunasan servis, status servis kembali ke 'Selesai'."
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
