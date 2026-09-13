import { useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, EmptyState, Icon, LoadState, loadPending } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange, rangeForTimestamp } from '@/hooks/useCollectionRange';
import { repository } from '@/data';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateStr } from '@/lib/time';
import {
  summarize,
  applyBalance,
  reverseExpenseDelta,
  shouldRevertServiceOnIncomeDelete,
  transferEntries,
  isCapitalFlow,
  CAPITAL_INCOME_CATEGORY,
  CAPITAL_EXPENSE_CATEGORY,
} from '@/lib/business/finance';
import {
  dpIncomeDescription,
  settlementIncomeDescription,
} from '@/lib/business/services';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { EntryModal } from './EntryModal';
import { TransferModal } from './TransferModal';
import type { Income, Expense, ActivityLog } from '@/data/types';
import styles from './FinancePage.module.css';

type LedgerKind = 'income' | 'expense' | 'transfer';

interface LedgerRow {
  id: string;
  kind: LedgerKind;
  date: string;
  category: string;
  description: string;
  amount: number;
  walletId: string;
  /** Transfers only: the receiving wallet (walletId holds the sender). */
  toWalletId?: string;
  record: Income | Expense | ActivityLog;
}

/** How many ledger rows to render at once; grows via "Tampilkan lebih banyak". */
const PAGE_SIZE = 100;

function monthRange() {
  const now = new Date();
  return {
    from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function FinancePage() {
  const [modalKind, setModalKind] = useState<'income' | 'expense' | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [ledgerTab, setLedgerTab] = useState<'all' | LedgerKind>('all');
  const [transferOpen, setTransferOpen] = useState(false);
  const [toDelete, setToDelete] = useState<LedgerRow | null>(null);
  // How many past months of ledger to also load. 0 = current month only.
  const [monthsBack, setMonthsBack] = useState(0);
  // Row budget for the DOM. Grows on demand so loading an older month is not
  // silently swallowed by a hard 100-row cap.
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Klik kartu wallet → tampilkan hanya transaksi wallet itu.
  const [walletFilter, setWalletFilter] = useState<string | null>(null);

  const { from, to } = monthRange();
  // Fetch window: from the start of (current month − monthsBack) up to the end
  // of this month. Only this slice is pulled — never the whole history (plan B).
  const fetchFrom = useMemo(() => {
    const d = new Date();
    return localDateStr(new Date(d.getFullYear(), d.getMonth() - monthsBack, 1));
  }, [monthsBack]);
  const { data: wallets, ...walletsLoad } = useCollection('wallets');
  const { data: incomes, ...incomesLoad } = useCollectionRange('incomes', 'date', fetchFrom, to);
  const { data: expenses, ...expensesLoad } = useCollectionRange('expenses', 'date', fetchFrom, to);
  // Transfer antar wallet tidak punya tabel sendiri — jejaknya cuma di activity
  // log (owner-only lewat RLS, jadi admin melihat daftar transfer kosong).
  // ponytail: kalau admin perlu lihat transfer, baru bikin tabel wallet_transfers.
  const [actFrom, actTo] = useMemo(
    () => rangeForTimestamp(fetchFrom, to),
    [fetchFrom, to],
  );
  const { data: activity } = useCollectionRange('activity', 'createdAt', actFrom, actTo);

  const summary = useMemo(
    () =>
      summarize(
        incomes.filter((r) => r.date >= from && r.date <= to),
        expenses.filter((r) => r.date >= from && r.date <= to),
      ),
    [incomes, expenses, from, to],
  );

  // Arus kas pemilik bulan ini, dihitung TERPISAH dari laba. Ditampilkan supaya
  // turunnya Pemasukan setelah re-kategorisasi ada penjelasannya — bukan angka
  // yang hilang diam-diam.
  const capital = useMemo(() => {
    const inRange = (d: string) => d >= from && d <= to;
    const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
    return {
      modal: sum(
        incomes.filter((i) => inRange(i.date) && i.category === CAPITAL_INCOME_CATEGORY),
      ),
      prive: sum(
        expenses.filter(
          (e) => inRange(e.date) && e.category === CAPITAL_EXPENSE_CATEGORY,
        ),
      ),
    };
  }, [incomes, expenses, from, to]);

  const transfers = useMemo<LedgerRow[]>(() => {
    const byId = new Map(activity.map((a) => [a.id, a]));
    return transferEntries(activity, fetchFrom, to).map((t) => ({
      id: t.id,
      kind: 'transfer' as const,
      date: t.date,
      category: 'Transfer',
      description: t.label,
      amount: t.amount,
      walletId: t.fromWalletId,
      toWalletId: t.toWalletId,
      record: byId.get(t.id)!,
    }));
  }, [activity, fetchFrom, to]);

  const ledger = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [
      ...incomes.map((i) => ({
        id: i.id,
        kind: 'income' as const,
        date: i.date,
        category: i.category,
        description: i.description,
        amount: i.amount,
        walletId: i.walletId,
        record: i,
      })),
      ...expenses.map((e) => ({
        id: e.id,
        kind: 'expense' as const,
        date: e.date,
        category: e.category,
        description: e.description,
        amount: e.amount,
        walletId: e.walletId,
        record: e,
      })),
      ...transfers,
    ];
    // Sort by ledger date desc, then by actual creation time desc. Using the
    // record's createdAt (not the random UUID id) ensures the newest entry on a
    // given day — e.g. a just-recorded DP — surfaces at the top of that day.
    return rows.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.record.createdAt ?? '').localeCompare(a.record.createdAt ?? ''),
    );
  }, [incomes, expenses, transfers]);

  // Filter by tab + wallet FIRST, then cap — slicing first starved the income/
  // expense tabs whenever the newest rows were dominated by one kind.
  const filteredLedger = useMemo(
    () =>
      ledger.filter(
        (r) =>
          (ledgerTab === 'all' || r.kind === ledgerTab) &&
          (!walletFilter || r.walletId === walletFilter || r.toWalletId === walletFilter),
      ),
    [ledger, ledgerTab, walletFilter],
  );
  const visibleLedger = useMemo(
    () => filteredLedger.slice(0, limit),
    [filteredLedger, limit],
  );

  const walletName = (id: string) => wallets.find((w) => w.id === id)?.name ?? '—';

  const confirmDelete = async () => {
    if (!toDelete) return;
    const wallet = wallets.find((w) => w.id === toDelete.walletId);
    try {
      if (toDelete.kind === 'income') {
        const inc = toDelete.record as Income;
        // Service-linked income needs type-aware reversal: a DP delete must
        // also shrink the ticket's downPayment (else the next settlement
        // under-collects), and a settlement delete must reverse EVERY split
        // leg at once (else re-settling double-books the remaining legs).
        const svc =
          shouldRevertServiceOnIncomeDelete(inc) && inc.serviceId
            ? await repository.get('services', inc.serviceId)
            : null;
        const isDp = svc ? inc.description === dpIncomeDescription(svc.serviceNo) : false;
        const isSettle = svc
          ? inc.description === settlementIncomeDescription(svc.serviceNo)
          : false;
        const legs = isSettle
          ? incomes.filter(
              (i) =>
                i.serviceId === inc.serviceId &&
                !i.deletedAt &&
                i.description === inc.description,
            )
          : [inc];
        // Net per wallet first — two legs on the same wallet must not both
        // apply against the same stale cached balance.
        const deltas = new Map<string, number>();
        for (const leg of legs)
          deltas.set(leg.walletId, (deltas.get(leg.walletId) ?? 0) - leg.amount);
        for (const [wid, d] of deltas) {
          const w = wallets.find((x) => x.id === wid);
          if (w) await repository.put('wallets', applyBalance(w, d));
        }
        for (const leg of legs) await repository.remove('incomes', leg.id);

        if (svc) {
          const nextDp = isDp
            ? Math.max(0, svc.downPayment - inc.amount)
            : svc.downPayment;
          const revert = svc.status === 'lunas' && !isDp;
          if (revert || nextDp !== svc.downPayment) {
            await repository.put('services', {
              ...svc,
              status: revert ? 'selesai' : svc.status,
              downPayment: nextDp,
              history: [
                ...(svc.history ?? []),
                {
                  at: new Date().toISOString(),
                  status: revert ? 'selesai' : 'edit',
                  by: '',
                  byName: 'Sistem',
                  note: revert
                    ? 'Pelunasan dibatalkan (pemasukan dihapus)'
                    : `DP ${fmtRp(inc.amount)} dihapus dari keuangan`,
                  internal: !revert,
                },
              ],
            });
          }
        }
        logActivity({
          action: 'income.delete',
          entityType: 'income',
          entityId: toDelete.id,
          entityLabel: inc.description || inc.category,
          meta: { amount: inc.amount, category: inc.category },
        });
      } else {
        const exp = toDelete.record as Expense;
        if (wallet)
          await repository.put('wallets', applyBalance(wallet, reverseExpenseDelta(exp)));
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
    } catch (e) {
      // Surface the failing step — this flow is multi-write (wallets → incomes
      // → services) and a generic message hides which one needs manual fixing.
      // ponytail: true atomicity needs a server RPC (delete_finance_entry);
      // add one if partial failures show up in the field.
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus transaksi');
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.walletGrid}>
        {loadPending(walletsLoad) ? (
          <Card glass>
            <LoadState queries={[walletsLoad]} />
          </Card>
        ) : wallets.length === 0 ? (
          <Card glass padding>
            <p className={styles.noWallet}>Belum ada wallet. Tambahkan di Pengaturan.</p>
          </Card>
        ) : (
          wallets.map((w) => (
            <button
              key={w.id}
              type="button"
              className={[
                styles.walletCard,
                walletFilter === w.id ? styles.walletCardActive : '',
              ].join(' ')}
              aria-pressed={walletFilter === w.id}
              onClick={() => {
                setWalletFilter((cur) => (cur === w.id ? null : w.id));
                setLimit(PAGE_SIZE);
              }}
            >
              <span className={styles.walletName}>{w.name}</span>
              <strong className={styles.walletBalance}>{fmtRp(w.balance)}</strong>
              <span className={styles.walletHint}>
                {walletFilter === w.id ? 'Klik lagi untuk semua' : 'Lihat transaksi'}
              </span>
            </button>
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

      {(capital.modal > 0 || capital.prive > 0) && (
        <p className={styles.capitalNote}>
          <Icon name="wallet" aria-hidden /> Arus kas pemilik bulan ini —
          {capital.modal > 0 && (
            <>
              {' '}
              setoran modal <strong>{fmtRp(capital.modal)}</strong>
            </>
          )}
          {capital.modal > 0 && capital.prive > 0 && ' ·'}
          {capital.prive > 0 && (
            <>
              {' '}
              prive <strong>{fmtRp(capital.prive)}</strong>
            </>
          )}
          . Saldo wallet sudah termasuk ini, tapi tidak dihitung sebagai omzet maupun
          laba.
        </p>
      )}

      <div className={styles.actions}>
        <Button
          onClick={() => setModalKind('income')}
          iconLeft={<Icon name="arrow-down" aria-hidden />}
        >
          Pemasukan
        </Button>
        <Button
          variant="secondary"
          onClick={() => setModalKind('expense')}
          iconLeft={<Icon name="arrow-up" aria-hidden />}
        >
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
        <CardHeader
          icon={<Icon name="receipt" aria-hidden />}
          title={walletFilter ? `Buku Kas · ${walletName(walletFilter)}` : 'Buku Kas'}
          action={
            walletFilter ? (
              <Button variant="secondary" size="sm" onClick={() => setWalletFilter(null)}>
                <Icon name="times" aria-hidden /> Semua wallet
              </Button>
            ) : undefined
          }
        />
        <div className={styles.tabBar}>
          {(
            [
              ['all', 'Semua'],
              ['income', 'Pemasukan'],
              ['expense', 'Pengeluaran'],
              ['transfer', 'Transfer'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={[styles.tab, ledgerTab === key ? styles.tabActive : ''].join(
                ' ',
              )}
              onClick={() => {
                setLedgerTab(key);
                setLimit(PAGE_SIZE);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <CardBody className={styles.noPad}>
          {/* Footer "muat bulan sebelumnya" ikut dirender saat kosong — kalau
              disembunyikan, filter wallet tanpa hasil jadi jalan buntu. */}
          <div className={styles.tape}>
            {loadPending(incomesLoad, expensesLoad) ? (
              <LoadState queries={[incomesLoad, expensesLoad]} />
            ) : visibleLedger.length === 0 ? (
              <EmptyState
                icon={<Icon name="receipt" aria-hidden />}
                title="Belum ada transaksi"
                description={
                  walletFilter
                    ? `Belum ada transaksi untuk ${walletName(walletFilter)} di rentang ini. Muat bulan sebelumnya atau pilih wallet lain.`
                    : 'Catat pemasukan atau pengeluaran pertama.'
                }
              />
            ) : (
              visibleLedger.map((r) => {
                if (r.kind === 'transfer') {
                  // Saat difilter per-wallet, transfer punya arah: keluar dari
                  // wallet asal, masuk ke wallet tujuan.
                  const dir =
                    walletFilter === r.toWalletId ? '+' : walletFilter ? '−' : '';
                  return (
                    <div
                      key={`transfer-${r.id}`}
                      className={[styles.tapeRow, styles.transfer].join(' ')}
                    >
                      <span className={styles.tapeDate}>{fmtDate(r.date)}</span>
                      <div className={styles.tapeBody}>
                        <span className={styles.tapeDesc}>{r.description}</span>
                        <span className={styles.tapeMeta}>
                          <span className={[styles.tapeCat, styles.trf].join(' ')}>
                            Transfer
                          </span>
                          · {walletName(r.walletId)} → {walletName(r.toWalletId ?? '')}
                        </span>
                      </div>
                      <span className={[styles.tapeAmount, styles.trf].join(' ')}>
                        {dir}
                        {fmtRp(r.amount)}
                      </span>
                      <span className={styles.tapeBtns} />
                    </div>
                  );
                }
                const inc = r.kind === 'income';
                // Modal/prive pemilik: uangnya nyata bergerak (tanda +/− tetap),
                // tapi diwarnai netral supaya tak terbaca sebagai untung/rugi —
                // sama seperti baris transfer.
                const capital = isCapitalFlow(r);
                const tone = capital ? styles.trf : inc ? styles.inc : styles.exp;
                // Expense tied to a PO or a service "modal dadakan" line must be
                // removed from its owning page (PO / service detail) so the
                // linked record is reversed too — deleting here would orphan it.
                const lockedExpense =
                  r.kind === 'expense' &&
                  (!!(r.record as Expense).poId ||
                    r.description.startsWith('Modal servis '));
                return (
                  <div
                    key={`${r.kind}-${r.id}`}
                    className={[
                      styles.tapeRow,
                      capital ? styles.transfer : styles[r.kind],
                    ].join(' ')}
                  >
                    <span className={styles.tapeDate}>{fmtDate(r.date)}</span>
                    <div className={styles.tapeBody}>
                      <span className={styles.tapeDesc}>
                        {r.description || (
                          <span className={styles.muted}>Tanpa keterangan</span>
                        )}
                      </span>
                      <span className={styles.tapeMeta}>
                        <span className={[styles.tapeCat, tone].join(' ')}>
                          {r.category}
                        </span>
                        · {walletName(r.walletId)}
                      </span>
                    </div>
                    <span className={[styles.tapeAmount, tone].join(' ')}>
                      {inc ? '+' : '−'}
                      {fmtRp(r.amount)}
                    </span>
                    {/* One grid cell for ALL action buttons — loose siblings
                        overflowed the single `auto` column and wrapped to a new
                        implicit grid row (trash icon stranded bottom-left). */}
                    <span className={styles.tapeBtns}>
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
                      {/* Manual income can be edited. Income linked to a service
                          OR a POS sale is locked — editing it would desync the
                          source record (settlement legs / sale total). */}
                      {r.kind === 'income' &&
                        !(r.record as Income).serviceId &&
                        !(r.record as Income).saleId && (
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
                      {!lockedExpense && (
                        <button
                          className={[styles.iconBtn, styles.danger].join(' ')}
                          onClick={() => setToDelete(r)}
                          aria-label="Hapus"
                        >
                          <Icon name="trash" aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })
            )}
            <div className={styles.loadMore}>
              {filteredLedger.length > visibleLedger.length && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  iconLeft={<Icon name="arrow-down" aria-hidden />}
                >
                  Tampilkan lebih banyak
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMonthsBack((m) => m + 1)}
                iconLeft={<Icon name="clock-rotate-left" aria-hidden />}
              >
                Muat bulan sebelumnya
              </Button>
              <span className={styles.loadMoreHint}>
                {monthsBack === 0 ? 'Bulan ini' : `${monthsBack + 1} bulan terakhir`} ·{' '}
                {visibleLedger.length} dari {filteredLedger.length} baris
              </span>
            </div>
          </div>
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
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
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
