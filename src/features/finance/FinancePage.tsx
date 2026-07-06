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
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { EntryModal } from './EntryModal';
import { TransferModal } from './TransferModal';
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
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [ledgerTab, setLedgerTab] = useState<'all' | 'income' | 'expense'>('all');
  const [transferOpen, setTransferOpen] = useState(false);
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
    // Sort by ledger date desc, then by actual creation time desc. Using the
    // record's createdAt (not the random UUID id) ensures the newest entry on a
    // given day — e.g. a just-recorded DP — surfaces at the top of that day.
    return rows
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.record.createdAt ?? '').localeCompare(a.record.createdAt ?? ''),
      )
      .slice(0, 100);
  }, [incomes, expenses]);

  // Filter ledger by the active tab so the user can focus on income or
  // expense history independently.
  const visibleLedger = useMemo(
    () => (ledgerTab === 'all' ? ledger : ledger.filter((r) => r.kind === ledgerTab)),
    [ledger, ledgerTab],
  );

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
        logActivity({
          action: 'income.delete',
          entityType: 'income',
          entityId: toDelete.id,
          entityLabel: inc.description || inc.category,
          meta: { amount: inc.amount, category: inc.category },
        });
      } else {
        const exp = toDelete.record as Expense;
        if (wallet) await repository.put('wallets', applyBalance(wallet, reverseExpenseDelta(exp)));
        await repository.remove('expenses', toDelete.id);
        logActivity({
          action: 'expense.delete',
          entityType: 'expense',
          entityId: toDelete.id,
          entityLabel: exp.description || exp.category,
          meta: { amount: exp.amount, category: exp.category },
        });
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
        {wallets.length >= 2 && (
          <Button
            variant="secondary"
            onClick={() => setTransferOpen(true)}
            iconLeft={<Icon name="arrow-right-arrow-left" aria-hidden />}
          >
            Transfer
          </Button>
        )}
      </div>

      <Card glass>
        <CardHeader icon={<Icon name="receipt" aria-hidden />} title="Buku Kas" />
        <div className={styles.tabBar}>
          <button
            className={[styles.tab, ledgerTab === 'all' ? styles.tabActive : ''].join(' ')}
            onClick={() => setLedgerTab('all')}
          >
            Semua
          </button>
          <button
            className={[styles.tab, ledgerTab === 'income' ? styles.tabActive : ''].join(' ')}
            onClick={() => setLedgerTab('income')}
          >
            Pemasukan
          </button>
          <button
            className={[styles.tab, ledgerTab === 'expense' ? styles.tabActive : ''].join(' ')}
            onClick={() => setLedgerTab('expense')}
          >
            Pengeluaran
          </button>
        </div>
        <CardBody className={styles.noPad}>
          {visibleLedger.length === 0 ? (
            <EmptyState
              icon={<Icon name="receipt" aria-hidden />}
              title="Belum ada transaksi"
              description="Catat pemasukan atau pengeluaran pertama."
            />
          ) : (
            <div className={styles.tape}>
              {visibleLedger.map((r) => {
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
                    {r.kind === 'expense' && (
                      <button
                        className={styles.iconBtn}
                        onClick={() => {
                          setEditingExpense(r.record as Expense);
                          setEditingIncome(null);
                          setModalKind('expense');
                        }}
                        aria-label="Edit"
                      >
                        <Icon name="pen" aria-hidden />
                      </button>
                    )}
                    {/* Manual income (not from service settlement) can be edited.
                        Income linked to a service (serviceId != null) is locked. */}
                    {r.kind === 'income' && !(r.record as Income).serviceId && (
                      <button
                        className={styles.iconBtn}
                        onClick={() => {
                          setEditingIncome(r.record as Income);
                          setEditingExpense(null);
                          setModalKind('income');
                        }}
                        aria-label="Edit"
                      >
                        <Icon name="pen" aria-hidden />
                      </button>
                    )}
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
        onClose={() => {
          setModalKind(null);
          setEditingExpense(null);
          setEditingIncome(null);
        }}
        kind={modalKind ?? 'income'}
        wallets={wallets}
        editing={editingExpense ?? editingIncome}
      />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} wallets={wallets} />
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
