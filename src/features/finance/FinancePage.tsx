import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useT, type TranslationKey } from '@/i18n';
import { EXPENSE_GROUPS, EXPENSE_GROUP_LABEL, expenseGroupOf } from '@/lib/business/overhead';
import { useSessionStore } from '@/stores/session';
import { Card, CardHeader, CardBody, Button, EmptyState, Icon, LoadState, loadPending, Term } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { useCollectionRange } from '@/hooks/useCollectionRange';
import { repository } from '@/data';
import { fmtNumber, fmtRp } from '@/lib/format';
import { fmtDate, localDateStr, monthRange } from '@/lib/time';
import {
  summarize,
  applyBalance,
  reverseExpenseDelta,
  shouldRevertServiceOnIncomeDelete,
  transferMoneyLocked,
  isCapitalFlow,
  walletMovement,
  walletsForOutlet,
} from '@/lib/business/finance';
import {
  dpIncomeDescription,
  settlementIncomeDescription,
  costCorrectionDescription,
  serviceNoFromCorrection,
} from '@/lib/business/services';
import { logActivity } from '@/lib/activity';
import { deleteFinanceEntry } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import { toast } from '@/stores/toast';
import { EntryModal } from './EntryModal';
import { TransferModal } from './TransferModal';
import { CountModal } from './CountModal';
import { voidTransfer } from './transferActions';
import type { Income, Expense, WalletTransfer } from '@/data/types';
import styles from './FinancePage.module.css';
import { interpolate } from '@/lib/business/notify';

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
  record: Income | Expense | WalletTransfer;
}

/** Tiket menurut nomornya. Cloud: cari di seluruh tabel (daftar hanya potongan terbaru). */
async function findServiceByNo(serviceNo: string) {
  const rows = repository.queryServices
    ? await repository.queryServices({ term: serviceNo, limit: 20 })
    : await repository.list('services');
  return rows.find((s) => s.serviceNo === serviceNo) ?? null;
}

/** How many ledger rows to render at once; grows via "Tampilkan lebih banyak". */
const PAGE_SIZE = 100;

/** 'YYYY-MM' dari tautan → selisih bulan mundur dari bulan ini (0 bila kosong/ke depan). */
function monthOffsetOf(month: string | null): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!m) return 0;
  const now = new Date();
  return Math.max(0, now.getFullYear() * 12 + now.getMonth() - (Number(m[1]) * 12 + Number(m[2]) - 1));
}

export function FinancePage() {
  const t = useT();
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const [modalKind, setModalKind] = useState<'income' | 'expense' | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [ledgerTab, setLedgerTab] = useState<'all' | LedgerKind>('all');
  const [transferOpen, setTransferOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<WalletTransfer | null>(null);
  const [toVoid, setToVoid] = useState<WalletTransfer | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [toDelete, setToDelete] = useState<LedgerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Bulan yang dilihat: 0 = bulan ini, 1 = bulan lalu, … Menggerakkan ringkasan
  // DAN buku kas sekaligus. Dulu "Muat bulan sebelumnya" hanya menumpuk baris
  // di buku kas, sementara ringkasan terkunci di bulan berjalan.
  // ?cat=Gaji&month=2026-08 — tautan dari kartu kategori & break-even di Laporan.
  const [params] = useSearchParams();
  const [monthOffset, setMonthOffset] = useState(() => monthOffsetOf(params.get('month')));
  const [categoryFilter, setCategoryFilter] = useState<string | null>(() => params.get('cat'));
  // Row budget for the DOM. Grows on demand so loading an older month is not
  // silently swallowed by a hard 100-row cap.
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Klik kartu wallet → tampilkan hanya transaksi wallet itu.
  const [walletFilter, setWalletFilter] = useState<string | null>(null);

  // Bulan berjalan = batas kunci (0071); bulan yang dilihat = jendela tarik.
  const { from: openFrom } = monthRange();
  const monthDate = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - monthOffset, 1);
  }, [monthOffset]);
  const { from, to } = monthRange(monthDate);
  const monthLabel = monthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const { data: wallets, ...walletsLoad } = useCollection('wallets');
  const { data: outlets } = useCollection('outlets');
  const { data: incomes, ...incomesLoad } = useCollectionRange('incomes', 'date', from, to);
  const { data: expenses, ...expensesLoad } = useCollectionRange('expenses', 'date', from, to);
  // Transfer punya tabel sendiri sejak 0086. Dulu Buku Kas menarik SELURUH log
  // aktivitas sebulan (818 baris ≈240 KB di toko pemilik) demi ±19 transfer.
  const { data: walletTransfers } = useCollectionRange('walletTransfers', 'date', from, to);

  // Ringkasan ikut filter wallet & kategori — dulu tetap angka semua wallet saat difilter.
  const summary = useMemo(() => {
    const keep = (r: { walletId: string; category: string }) =>
      (!walletFilter || r.walletId === walletFilter) && (!categoryFilter || r.category === categoryFilter);
    return summarize(incomes.filter(keep), expenses.filter(keep));
  }, [incomes, expenses, walletFilter, categoryFilter]);
  // Kategori yang ada di bulan ini (+ yang dibawa tautan), dikelompokkan seperti
  // tombol di form catat. Nama yang ada di pemasukan & pengeluaran (Lainnya)
  // cukup muncul sekali — filternya memang mencakup keduanya.
  const categoryGroups = useMemo(() => {
    const seen = new Set<string>();
    const take = (cats: string[]) =>
      [...new Set(cats)].filter((c) => !seen.has(c) && seen.add(c)).sort((a, b) => a.localeCompare(b, 'id'));
    const expenseCats = expenses.map((e) => e.category as string);
    const groups: { key: string; label: TranslationKey; cats: string[] }[] = [
      { key: 'income', label: 'finance.groupIncome', cats: take(incomes.map((i) => i.category)) },
      ...EXPENSE_GROUPS.map((g) => ({
        key: g.id,
        label: EXPENSE_GROUP_LABEL[g.id],
        cats: take(expenseCats.filter((c) => expenseGroupOf(c) === g.id)),
      })),
    ];
    if (categoryFilter && !seen.has(categoryFilter)) groups[0].cats.push(categoryFilter);
    return groups.filter((g) => g.cats.length > 0);
  }, [incomes, expenses, categoryFilter]);
  // Tampilan satu cabang: wallet bersama + wallet cabang itu (0095). Laci cabang
  // lain bukan urusan tampilan ini.
  const shownWallets = useMemo(() => walletsForOutlet(wallets, activeOutletId), [wallets, activeOutletId]);
  const totalBalance = shownWallets.reduce((n, w) => n + w.balance, 0);
  const moves = useMemo(
    () => new Map(wallets.map((w) => [w.id, walletMovement(w.id, incomes, expenses, walletTransfers)])),
    [wallets, incomes, expenses, walletTransfers],
  );

  // Arus kas pemilik bulan ini, dihitung TERPISAH dari arus kas operasional. Ditampilkan supaya
  // turunnya Pemasukan setelah re-kategorisasi ada penjelasannya — bukan angka
  // yang hilang diam-diam.
  const capital = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of [...incomes, ...expenses]) {
      if (isCapitalFlow(r)) totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount);
    }
    return [...totals.entries()].filter(([, v]) => v > 0);
  }, [incomes, expenses]);

  const transfers = useMemo<LedgerRow[]>(
    () =>
      walletTransfers.map((t) => ({
        id: t.id,
        kind: 'transfer' as const,
        date: t.date,
        category: 'Transfer',
        // Tanpa catatan: kosong (tampil "Tanpa keterangan"), bukan teks generik.
        description: t.note,
        amount: t.amount,
        walletId: t.fromWalletId,
        toWalletId: t.toWalletId,
        record: t,
      })),
    [walletTransfers],
  );

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
          (!walletFilter || r.walletId === walletFilter || r.toWalletId === walletFilter) &&
          (!categoryFilter || r.category === categoryFilter),
      ),
    [ledger, ledgerTab, walletFilter, categoryFilter],
  );
  const visibleLedger = useMemo(
    () => filteredLedger.slice(0, limit),
    [filteredLedger, limit],
  );
  // Buku kas per hari: tanggal sekali di kepala hari (dengan arus bersihnya),
  // bukan kolom 84px yang diulang di setiap baris.
  const days = useMemo(() => {
    const out: { date: string; net: number; rows: LedgerRow[] }[] = [];
    for (const r of visibleLedger) {
      let day = out[out.length - 1];
      if (!day || day.date !== r.date) out.push((day = { date: r.date, net: 0, rows: [] }));
      day.rows.push(r);
      if (r.kind === 'income' && !isCapitalFlow(r)) day.net += r.amount;
      if (r.kind === 'expense' && !isCapitalFlow(r)) day.net -= r.amount;
    }
    return out;
  }, [visibleLedger]);

  const walletName = (id: string) => wallets.find((w) => w.id === id)?.name ?? '—';
  const scopeSuffix = [walletFilter && walletName(walletFilter), categoryFilter]
    .filter(Boolean)
    .map((x) => ` · ${x}`)
    .join('');
  // Transfer menyimpan nama wallet saat itu: tetap terbaca walau wallet ada di
  // cabang lain (tak ikut daftar) atau sudah diganti nama.
  const transferWalletName = (id: string, snapshot: string) =>
    wallets.find((w) => w.id === id)?.name ?? (snapshot || '—');
  const today = localDateStr();

  const handleVoid = async () => {
    if (!toVoid || voiding) return;
    setVoiding(true);
    try {
      await voidTransfer({ wallets, transfer: toVoid });
      toast.success(interpolate(t('finance.transferVoided'), { amount: fmtRp(toVoid.amount) }));
      setToVoid(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('finance.transferVoidFailed'));
    } finally {
      setVoiding(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete || deleting) return;
    const wallet = wallets.find((w) => w.id === toDelete.walletId);
    setDeleting(true);
    try {
      if (isCloudMode() && toDelete.kind !== 'transfer') {
        // Cloud: satu transaksi server (0068) — wallet, baris terkait, dan tiket
        // servis dibalik bersama. Jalur di bawah ini untuk lokal/demo.
        const rec = toDelete.record as Income | Expense;
        await deleteFinanceEntry({ orgId: rec.orgId, kind: toDelete.kind, id: toDelete.id });
        // Penghapusan dicatat oleh database (0073) — nominal & keterangannya
        // terekam dari baris yang dihapus, bukan dari browser yang mungkin
        // sudah tertutup saat servernya selesai.
      } else if (toDelete.kind === 'income') {
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
        // Selisih Koreksi Biaya (0063): menghapusnya tidak membatalkan pelunasan,
        // tapi biaya final tiketnya kembali sebesar selisih itu.
        const correctionDesc = svc ? costCorrectionDescription(svc.serviceNo) : '';
        const isCorrection = !!svc && inc.description === correctionDesc;
        const revert = !!svc && svc.status === 'lunas' && !isDp && !isCorrection;
        const legs = [
          ...(isSettle
            ? incomes.filter(
                (i) =>
                  i.serviceId === inc.serviceId &&
                  !i.deletedAt &&
                  i.description === inc.description,
              )
            : [inc]),
          // Pelunasan dibatalkan → koreksinya ikut dibatalkan. Pelunasan ulang
          // menagih biaya final hasil koreksi, jadi selisihnya tak boleh tercatat dua kali.
          ...(revert
            ? incomes.filter(
                (i) => i.serviceId === inc.serviceId && !i.deletedAt && i.description === correctionDesc,
              )
            : []),
        ];
        const correctionRefunds = revert
          ? expenses.filter((e) => !e.deletedAt && e.description === correctionDesc)
          : [];
        // Net per wallet first — two legs on the same wallet must not both
        // apply against the same stale cached balance.
        const deltas = new Map<string, number>();
        for (const leg of legs)
          deltas.set(leg.walletId, (deltas.get(leg.walletId) ?? 0) - leg.amount);
        for (const exp of correctionRefunds)
          deltas.set(exp.walletId, (deltas.get(exp.walletId) ?? 0) + exp.amount);
        for (const [wid, d] of deltas) {
          const w = wallets.find((x) => x.id === wid);
          if (w) await repository.put('wallets', applyBalance(w, d));
        }
        for (const leg of legs) await repository.remove('incomes', leg.id);
        for (const exp of correctionRefunds) await repository.remove('expenses', exp.id);

        if (svc) {
          const nextDp = isDp
            ? Math.max(0, svc.downPayment - inc.amount)
            : svc.downPayment;
          const nextFinal = isCorrection ? Math.max(0, svc.finalCost - inc.amount) : svc.finalCost;
          if (revert || nextDp !== svc.downPayment || nextFinal !== svc.finalCost) {
            await repository.put('services', {
              ...svc,
              status: revert ? 'selesai' : svc.status,
              downPayment: nextDp,
              finalCost: nextFinal,
              history: [
                ...(svc.history ?? []),
                {
                  at: new Date().toISOString(),
                  status: revert ? 'selesai' : 'edit',
                  by: '',
                  byName: 'Sistem',
                  note: revert
                    ? 'Pelunasan dibatalkan (pemasukan dihapus)'
                    : isCorrection
                      ? `Koreksi biaya ${fmtRp(inc.amount)} dihapus dari keuangan: biaya final ${fmtRp(svc.finalCost)} → ${fmtRp(nextFinal)}`
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
        // Refund Koreksi Biaya (biaya diturunkan) dihapus → biaya final tiketnya
        // naik lagi sebesar refund itu. Pengeluaran tak punya service_id, jadi
        // tiketnya dicari dari nomor di deskripsi.
        const correctedNo = serviceNoFromCorrection(exp.description);
        const corrected = correctedNo ? await findServiceByNo(correctedNo) : null;
        if (wallet)
          await repository.put('wallets', applyBalance(wallet, reverseExpenseDelta(exp)));
        await repository.remove('expenses', toDelete.id);
        if (corrected) {
          const nextFinal = corrected.finalCost + exp.amount;
          await repository.put('services', {
            ...corrected,
            finalCost: nextFinal,
            history: [
              ...(corrected.history ?? []),
              {
                at: new Date().toISOString(),
                status: 'edit',
                by: '',
                byName: 'Sistem',
                note: `Refund koreksi biaya ${fmtRp(exp.amount)} dihapus dari keuangan: biaya final ${fmtRp(corrected.finalCost)} → ${fmtRp(nextFinal)}`,
                internal: true,
              },
            ],
          });
        }
        logActivity({
          action: 'expense.delete',
          entityType: 'expense',
          entityId: toDelete.id,
          entityLabel: exp.description || exp.category,
          meta: { amount: exp.amount, category: exp.category },
        });
      }
      toast.success(t('finance.entryDeleted'));
      setToDelete(null);
    } catch (e) {
      // Surface the failing step — the local/demo path is multi-write (wallets →
      // incomes → services); cloud is atomic via delete_finance_entry (0068).
      toast.error(e instanceof Error ? e.message : t('finance.entryDeleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const pickWallet = (id: string | null) => {
    const next = id === null || walletFilter === id ? null : id;
    setWalletFilter(next);
    setLimit(PAGE_SIZE);
    // Di ponsel buku kas ada dua layar di bawah kartu wallet; hasil filter dulu
    // jatuh di luar layar tanpa tanda apa pun.
    if (next && window.matchMedia?.('(max-width: 720px)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('buku-kas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  };

  // Dialog hapus menyebut baris yang dihapus dan akibatnya pada saldo — dulu
  // pesannya generik dan memperingatkan soal pelunasan servis untuk semua baris.
  const deleteMessage = (r: LedgerRow) => {
    const line = `${r.kind === 'income' ? '+' : '−'}${fmtRp(r.amount)} · ${walletName(r.walletId)} · ${r.description || r.category}`;
    const effect =
      r.kind === 'income' && (r.record as Income).serviceId
        ? t('finance.deleteServiceIncome')
        : t('finance.deleteEffect')
            .replace('{wallet}', walletName(r.walletId))
            .replace('{amount}', `${r.kind === 'income' ? '−' : '+'}${fmtRp(r.amount)}`);
    return `${line}. ${effect}`;
  };
  const rowLabel = (r: LedgerRow) => `${r.description || r.category} ${fmtRp(r.amount)}`;
  const orgWide = !!activeOutletId && outlets.length > 1;

  const renderRow = (r: LedgerRow) => {
    if (r.kind === 'transfer') {
      const tr = r.record as WalletTransfer;
      const voided = tr.status === 'void';
      const locked = transferMoneyLocked(tr, today);
      // Saat difilter per-wallet, transfer punya arah: keluar dari
      // wallet asal, masuk ke wallet tujuan. Yang dibatalkan tak punya arah.
      const dir = voided
        ? ''
        : walletFilter === r.toWalletId
          ? '+'
          : walletFilter
            ? '−'
            : '';
      return (
        <div
          key={`transfer-${r.id}`}
          className={[styles.tapeRow, styles.transfer, voided ? styles.voided : ''].join(' ')}
        >
          <div className={styles.tapeBody}>
            <span className={styles.tapeDesc}>
              {r.description || <span className={styles.muted}>{t('finance.noNote')}</span>}
            </span>
            <span className={styles.tapeMeta}>
              <span className={[styles.tapeCat, styles.trf].join(' ')}>
                {t(voided ? 'finance.voided' : 'finance.transfer')}
              </span>
              <span>
                {transferWalletName(tr.fromWalletId, tr.fromName)} →{' '}
                {transferWalletName(tr.toWalletId, tr.toName)}
                {voided && tr.voidedByName ? interpolate(t('finance.voidedBy'), { name: tr.voidedByName }) : ''}
              </span>
            </span>
          </div>
          <span className={[styles.tapeAmount, styles.trf].join(' ')}>
            {dir}
            {fmtRp(r.amount)}
          </span>
          <span className={styles.tapeBtns}>
            {!voided && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => {
                  setEditingTransfer(tr);
                  setTransferOpen(true);
                }}
                aria-label={interpolate(t('finance.editTransferAria'), { amount: fmtRp(r.amount) })}
                title={t(locked ? 'finance.editTransferLocked' : 'finance.editTransfer')}
              >
                <Icon name="pen" aria-hidden />
              </button>
            )}
            {!voided && !locked && (
              <button
                type="button"
                className={[styles.iconBtn, styles.danger].join(' ')}
                onClick={() => setToVoid(tr)}
                aria-label={interpolate(t('finance.voidTransferAria'), { amount: fmtRp(r.amount) })}
                title={t('finance.voidTransferHint')}
              >
                <Icon name="circle-xmark" aria-hidden />
              </button>
            )}
          </span>
        </div>
      );
    }
    const inc = r.kind === 'income';
    // Modal/prive pemilik: uangnya nyata bergerak (tanda +/− tetap),
    // tapi diwarnai netral supaya tak terbaca sebagai untung/rugi —
    // sama seperti baris transfer.
    const capitalRow = isCapitalFlow(r);
    const tone = capitalRow ? styles.trf : inc ? styles.inc : styles.exp;
    // Expense tied to a PO or a service "modal dadakan" line must be
    // removed from its owning page (PO / service detail) so the
    // linked record is reversed too — deleting here would orphan it.
    const lockedExpense =
      r.kind === 'expense' &&
      (!!(r.record as Expense).poId || r.description.startsWith('Modal servis '));
    // Pemasukan dari tiket/Kasir diubah dari halaman asalnya.
    const saleIncome = inc && !!(r.record as Income).saleId;
    const linkedIncome = inc && (!!(r.record as Income).serviceId || saleIncome);
    // Bulan lalu terkunci (0071), sama seperti pembatalan penjualan:
    // laporannya sudah berjalan, jadi koreksinya dicatat bulan ini.
    const closedMonth = r.date < openFrom;
    // Alasan kunci ditulis, bukan hanya tooltip — layar sentuh tak punya hover.
    const lockText = closedMonth
      ? t('finance.lockMonth')
      : lockedExpense
        ? t('finance.lockLinked')
        : saleIncome
          ? t('finance.lockSale')
          : linkedIncome
            ? t('finance.lockSource')
          : null;
    return (
      <div
        key={`${r.kind}-${r.id}`}
        className={[styles.tapeRow, capitalRow ? styles.transfer : styles[r.kind]].join(' ')}
      >
        <div className={styles.tapeBody}>
          <span className={styles.tapeDesc} title={r.description || undefined}>
            {r.description || <span className={styles.muted}>{t('finance.noNote')}</span>}
          </span>
          <span className={styles.tapeMeta}>
            <span className={[styles.tapeCat, tone].join(' ')}>{r.category}</span>
            <span>{walletName(r.walletId)}</span>
            {lockText && <span className={styles.lockTag}>{lockText}</span>}
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
          {!closedMonth && !lockedExpense && !linkedIncome && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => {
                if (inc) {
                  setEditingIncome(r.record as Income);
                  setEditingExpense(null);
                } else {
                  setEditingExpense(r.record as Expense);
                  setEditingIncome(null);
                }
                setModalKind(r.kind as 'income' | 'expense');
              }}
              aria-label={interpolate(t('finance.editRowAria'), { row: rowLabel(r) })}
            >
              <Icon name="pen" aria-hidden />
            </button>
          )}
          {/* Pemasukan Kasir hanya dibatalkan dari Kasir (void_sale mengembalikan
              stok & menandai penjualannya). Dulu tombol ini ada: penjualannya
              menggantung dan stok tak kembali. Server menolaknya juga (0092). */}
          {!lockedExpense && !closedMonth && !saleIncome && (
            <button
              type="button"
              className={[styles.iconBtn, styles.danger].join(' ')}
              onClick={() => setToDelete(r)}
              aria-label={interpolate(t('finance.deleteRowAria'), { row: rowLabel(r) })}
            >
              <Icon name="trash" aria-hidden />
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.monthBar}>
        <button
          type="button"
          className={styles.monthStep}
          onClick={() => {
            setMonthOffset((m) => m + 1);
            setLimit(PAGE_SIZE);
          }}
          aria-label={t('finance.prevMonth')}
        >
          <Icon name="chevron-left" aria-hidden />
        </button>
        <span className={styles.monthLabel} aria-live="polite">
          {monthLabel}
          {monthOffset === 0 && <span className={styles.monthNow}>{t('finance.thisMonth')}</span>}
        </span>
        <button
          type="button"
          className={styles.monthStep}
          onClick={() => {
            setMonthOffset((m) => Math.max(0, m - 1));
            setLimit(PAGE_SIZE);
          }}
          disabled={monthOffset === 0}
          aria-label={t('finance.nextMonth')}
        >
          <Icon name="chevron-right" aria-hidden />
        </button>
        <Link className={styles.glossaryBtn} to="/istilah">
          <Icon name="circle-question" aria-hidden /> {t('glossary.open')}
        </Link>
      </div>

      {/* Wallet = strip readout dengan sel Total, dan pergerakan bulan yang
          dilihat di tiap sel — cukup untuk mencocokkan saldo dengan laci/rekening. */}
      {loadPending(walletsLoad) ? (
        <Card glass>
          <LoadState queries={[walletsLoad]} />
        </Card>
      ) : wallets.length === 0 ? (
        <Card glass padding>
          <p className={styles.noWallet}>{t('finance.noWallet')}</p>
        </Card>
      ) : (
        <div className={styles.walletStrip}>
          <div className={[styles.walletCell, styles.walletTotal].join(' ')}>
            <span className={styles.walletName}>
              {t(monthOffset > 0 ? 'finance.balanceNow' : 'finance.totalBalance')}
            </span>
            <strong className={styles.walletBalance}>{fmtRp(totalBalance)}</strong>
            <span className={styles.totalFoot}>
            <span className={styles.walletMove}>
              {orgWide
                ? t('finance.branchPlusShared')
                : interpolate(t('finance.walletCount'), { n: String(shownWallets.length) })}
            </span>
            {/* Ponsel: Hitung saldo menempel di Total, tombol di baris aksi disembunyikan. */}
            <button type="button" className={styles.countInline} onClick={() => setCountOpen(true)}>
              {t('finance.countShort')}
            </button>
            </span>
          </div>
          {shownWallets.map((w) => {
            const m = moves.get(w.id);
            const on = walletFilter === w.id;
            return (
              <button
                key={w.id}
                type="button"
                className={styles.walletCell}
                aria-pressed={on}
                onClick={() => pickWallet(w.id)}
              >
                <span className={styles.walletName}>
                  <span className={styles.walletLed} aria-hidden />
                  {w.name}
                </span>
                <strong className={styles.walletBalance}>{fmtRp(w.balance)}</strong>
                {m && (
                  <span className={styles.walletMove}>
                    {/* Persamaan yang bisa dicocokkan dengan laci: saldo awal bulan
                        + masuk − keluar ± transfer = saldo. Hanya untuk bulan berjalan
                        dan tampilan semua cabang — wallet milik seluruh usaha,
                        pergerakan per cabang tak akan menutup persamaannya. */}
                    {monthOffset === 0 && (!orgWide || !!w.outletId) && (
                      <span className={styles.trf}>
                        {t('finance.opening')} {fmtNumber(w.balance - (m.in - m.out + m.transfer))}
                      </span>
                    )}
                    {orgWide && !w.outletId && <span className={styles.trf}>{t('finance.branchMove')}</span>}
                    {/* Tanpa "Rp": saldo di atasnya sudah bermata uang, dan gerak muat sebaris di ponsel. */}
                    <span className={styles.inc}>+{fmtNumber(m.in)}</span>{' '}
                    <span className={styles.exp}>−{fmtNumber(m.out)}</span>
                    {m.transfer !== 0 && (
                      <span className={styles.trf}>
                        {' '}
                        {m.transfer > 0 ? '⇄ +' : '⇄ −'}
                        {fmtNumber(Math.abs(m.transfer))}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.summaryStrip} role="list" aria-label={t('finance.summaryAria')}>
        <div role="listitem" className={[styles.summaryCell, styles.income].join(' ')}>
          <span>{t('finance.income')}{scopeSuffix}</span>
          <strong>{fmtRp(summary.income)}</strong>
        </div>
        <div role="listitem" className={[styles.summaryCell, styles.expense].join(' ')}>
          <span>{t('finance.expense')}{scopeSuffix}</span>
          <strong>{fmtRp(summary.expense)}</strong>
        </div>
        <div role="listitem" className={[styles.summaryCell, styles.net].join(' ')}>
          <span>
            <Term id="arus-kas-bersih">{t('finance.netCash')}</Term>
            {scopeSuffix}
          </span>
          <strong>{fmtRp(summary.net)}</strong>
        </div>
      </div>

      {capital.length > 0 && (
        <p className={styles.capitalNote}>
          <Icon name="wallet" aria-hidden /> {t('finance.capitalLead')}{' '}
          {capital.map(([cat, amount], k) => (
            <span key={cat}>
              {k > 0 && ' · '}
              {cat} <strong>{fmtRp(amount)}</strong>
            </span>
          ))}
          {t('finance.capitalTail')}
        </p>
      )}

      {/* Pengeluaran = aksi utama: pemasukan manual tinggal Modal/Lainnya, yang
          dicatat berkali-kali sehari adalah pengeluaran. Mencatat dari tampilan
          bulan lalu kembali ke bulan ini dulu — entrinya selalu bertanggal bulan
          ini, dan dulu "hilang" dari tampilan yang sedang dibuka. */}
      <div className={styles.actions}>
        <Button
          onClick={() => {
            setMonthOffset(0);
            setModalKind('expense');
          }}
          iconLeft={<Icon name="arrow-up" aria-hidden />}
        >
          {t('finance.expense')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setMonthOffset(0);
            setModalKind('income');
          }}
          iconLeft={<Icon name="arrow-down" aria-hidden />}
        >
          {t('finance.income')}
        </Button>
        {wallets.length >= 2 && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditingTransfer(null);
              setTransferOpen(true);
            }}
            iconLeft={<Icon name="arrow-right-arrow-left" aria-hidden />}
          >
            {t('finance.transfer')}
          </Button>
        )}
        {wallets.length > 0 && (
          <Button
            variant="secondary"
            className={styles.countAction}
            onClick={() => setCountOpen(true)}
            iconLeft={<Icon name="list-check" aria-hidden />}
          >
            {t('finance.countAction')}
          </Button>
        )}
      </div>

      <Card glass id="buku-kas" className={styles.ledgerCard}>
        <CardHeader
          icon={<Icon name="receipt" aria-hidden />}
          title={`${t('finance.ledger')}${scopeSuffix}`}
          action={
            walletFilter ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => pickWallet(null)}
                iconLeft={<Icon name="times" aria-hidden />}
              >
                {t('finance.allWallets')}
              </Button>
            ) : undefined
          }
        />
        <div className={styles.tabBar}>
          {(
            [
              ['all', t('finance.tabAll')],
              ['income', t('finance.income')],
              ['expense', t('finance.expense')],
              ['transfer', t('finance.transfer')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={ledgerTab === key}
              className={[styles.tab, ledgerTab === key ? styles.tabActive : ''].join(' ')}
              onClick={() => {
                setLedgerTab(key);
                setLimit(PAGE_SIZE);
              }}
            >
              {label}
            </button>
          ))}
          <select
            className={styles.catSelect}
            aria-label={t('finance.categoryFilter')}
            value={categoryFilter ?? ''}
            onChange={(e) => {
              setCategoryFilter(e.target.value || null);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="">{t('finance.allCategories')}</option>
            {categoryGroups.map((g) => (
              <optgroup key={g.key} label={t(g.label)}>
                {g.cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <CardBody className={styles.noPad}>
          {/* Footer ikut dirender saat kosong — kalau disembunyikan, filter
              wallet tanpa hasil jadi jalan buntu. */}
          <div className={styles.tape}>
            {loadPending(incomesLoad, expensesLoad) ? (
              <LoadState queries={[incomesLoad, expensesLoad]} />
            ) : visibleLedger.length === 0 ? (
              <EmptyState
                icon={<Icon name="receipt" aria-hidden />}
                title={t('finance.emptyTitle')}
                description={
                  categoryFilter
                    ? interpolate(t('finance.emptyCategory'), { category: categoryFilter, month: monthLabel })
                    : walletFilter
                    ? interpolate(t('finance.emptyWallet'), { wallet: walletName(walletFilter), month: monthLabel })
                    : monthOffset > 0
                      ? interpolate(t('finance.emptyMonth'), { month: monthLabel })
                      : t('finance.emptyFirst')
                }
              />
            ) : (
              days.map((day) => (
                <section key={day.date} className={styles.day} aria-label={fmtDate(day.date)}>
                  <div className={styles.dayHead}>
                    <span>{fmtDate(day.date)}</span>
                    <span className={day.net >= 0 ? styles.inc : styles.exp}>
                      {day.net >= 0 ? '+' : '−'}
                      {fmtRp(Math.abs(day.net))}
                    </span>
                  </div>
                  {day.rows.map(renderRow)}
                </section>
              ))
            )}
            <div className={styles.loadMore}>
              {filteredLedger.length > visibleLedger.length && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  iconLeft={<Icon name="arrow-down" aria-hidden />}
                >
                  {t('finance.showMore')}
                </Button>
              )}
              <span className={styles.loadMoreHint}>
                {interpolate(t('finance.rowsOf'), { month: monthLabel, shown: String(visibleLedger.length), total: String(filteredLedger.length) })}
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
        existing={modalKind === 'expense' ? expenses : incomes}
      />
      <CountModal
        open={countOpen}
        onClose={() => setCountOpen(false)}
        wallets={shownWallets}
        initialWalletId={
          walletFilter ?? shownWallets.find((w) => w.isCash && w.outletId)?.id ?? shownWallets.find((w) => w.isCash)?.id
        }
      />
      <TransferModal
        open={transferOpen}
        onClose={() => {
          setTransferOpen(false);
          setEditingTransfer(null);
        }}
        wallets={wallets}
        editing={editingTransfer}
      />
      <ConfirmDialog
        open={!!toVoid}
        title={t('finance.voidTransferTitle')}
        message={
          toVoid
            ? interpolate(t('finance.voidTransferMsg'), {
                amount: fmtRp(toVoid.amount),
                to: transferWalletName(toVoid.toWalletId, toVoid.toName),
                from: transferWalletName(toVoid.fromWalletId, toVoid.fromName),
              })
            : ''
        }
        confirmLabel={t(voiding ? 'finance.voiding' : 'finance.voidTransfer')}
        danger
        onConfirm={() => void handleVoid()}
        onCancel={() => setToVoid(null)}
      />
      <ConfirmDialog
        open={!!toDelete}
        title={t('finance.deleteTitle')}
        message={toDelete ? deleteMessage(toDelete) : ''}
        confirmLabel={t(deleting ? 'finance.deleting' : 'common.delete')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setToDelete(null);
        }}
      />
    </div>
  );
}
