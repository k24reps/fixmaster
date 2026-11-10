import { useState } from 'react';
import { Card, Input, Button, Badge, Icon, Modal, LoadState, loadPending } from '@/components/ui';
import type { LoadQuery } from '@/components/ui/loadPending';
import { repository } from '@/data';
import { voidSale } from '@/data/supabase-client';
import { isCloudMode } from '@/stores/demo';
import { logActivity } from '@/lib/activity';
import { fmtRp, EMPTY_VALUE } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { groupSalesByDay } from '@/lib/business/pos';
import { interpolate, waLink } from '@/lib/business/notify';
import { useT } from '@/i18n';
import { toast } from '@/stores/toast';
import type { InventoryItem, Organization, Sale } from '@/data/types';
import { printSaleReceipt } from './printSaleReceipt';
import { saleWaMessage } from './saleWaMessage';
import styles from './PosHistory.module.css';

interface PosHistoryProps {
  recentSales: Sale[];
  salesLoad: LoadQuery;
  walletName: (id: string | null) => string;
  org: Organization | null;
  isMgr: boolean;
  /** Awal bulan berjalan: penjualan sebelum ini tak bisa dibatalkan (0069). */
  monthStart: string;
  /** Nama cabang aktif bila pengguna bisa memilih cabang lain. */
  branchName: string | null;
}

/** Tab Transaksi Terakhir: cetak ulang, kirim ulang WA, dan pembatalan. */
export function PosHistory({ recentSales, salesLoad, walletName, org, isMgr, monthStart, branchName }: PosHistoryProps) {
  const t = useT();
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  // Void a sale (manager-only). Cloud → atomic RPC; local → mirror the
  // reversal (restore stock, reverse wallet, delete linked income, mark void).
  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (voidTarget.date < monthStart) {
      toast.error(t('pos.voidLastMonth'));
      return;
    }
    setVoidBusy(true);
    try {
      if (isCloudMode()) {
        await voidSale(voidTarget.id, voidReason.trim());
      } else {
        const inv = await repository.list('inventory');
        const restocked = voidTarget.lines
          .map((l) => {
            const item = inv.find((i) => i.id === l.itemId);
            return item ? { ...item, stock: item.stock + l.qty } : null;
          })
          .filter((x): x is InventoryItem => x !== null);
        if (restocked.length) await repository.putMany('inventory', restocked);

        const allIncomes = await repository.list('incomes');
        const allWallets = await repository.list('wallets');
        for (const inc of allIncomes.filter((i) => i.saleId === voidTarget.id)) {
          const w = allWallets.find((x) => x.id === inc.walletId);
          if (w) await repository.put('wallets', { ...w, balance: w.balance - inc.amount });
          await repository.remove('incomes', inc.id);
        }
        await repository.put('sales', {
          ...voidTarget,
          voided: true,
          voidedReason: voidReason.trim(),
        });
      }
      toast.success(interpolate(t('pos.voided'), { no: voidTarget.saleNo }));
      // Di cloud ini dilewati: database yang mencatatnya sendiri (0073, lihat
      // SERVER_LOGGED di lib/activity).
      logActivity({
        action: 'sale.void',
        entityType: 'sale',
        entityId: voidTarget.id,
        entityLabel: voidTarget.saleNo,
        meta: { total: voidTarget.total, reason: voidReason.trim() },
      });
      setVoidTarget(null);
      setVoidReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pos.voidFailed'));
    } finally {
      setVoidBusy(false);
    }
  };

  // Kirim ulang struk WA dari riwayat. Nomor diambil dari data pelanggan saat
  // diklik; jendela dibuka lebih dulu (sinkron) supaya tak diblokir peramban.
  const resendWa = async (s: Sale) => {
    const win = window.open('', '_blank');
    try {
      const c = s.customerId ? await repository.get('customers', s.customerId) : null;
      if (!c?.phone) {
        win?.close();
        toast.warning(t('pos.noPhone'));
        return;
      }
      const url = waLink(c.phone, saleWaMessage(t('pos.waMessage'), org?.name ?? '', s));
      if (win) win.location.href = url;
      else window.open(url, '_blank');
    } catch (e) {
      win?.close();
      toast.error(e instanceof Error ? e.message : t('pos.waFailed'));
    }
  };

  return (
    <>
      <Card className={styles.history} id="pos-panel" role="tabpanel" aria-labelledby="pos-tab-history">
        <div className={styles.historyHead}>
          <h2>
            <Icon name="clock-rotate-left" aria-hidden /> {t('pos.tabHistory')}
          </h2>
          {/* Riwayat mengikuti cabang aktif — dulu tanpa tanda, sehingga cabang
              tanpa penjualan tampak seperti data hilang. */}
          {branchName && (
            <span className={styles.historyScope}>{t('pos.historyBranch').replace('{name}', branchName)}</span>
          )}
        </div>
        {loadPending(salesLoad) ? (
          <LoadState queries={[salesLoad]} />
        ) : recentSales.length === 0 ? (
          <p className={styles.empty}>{t('pos.noSales')}</p>
        ) : (
          groupSalesByDay(recentSales).map((day) => (
            <section key={day.date} className={styles.historyDay} aria-label={fmtDate(day.date)}>
              <div className={styles.historyDayHead}>
                <span>{fmtDate(day.date)}</span>
                <span>
                  {interpolate(t('pos.dayCount'), { n: String(day.count) })} · {fmtRp(day.total)}
                </span>
              </div>
              <ul className={styles.historyList}>
                {day.rows.map((s) => (
                  <li key={s.id} className={[styles.historyRow, s.voided ? styles.voided : ''].join(' ')}>
                    <strong className={styles.historyNo}>
                      {s.saleNo}
                      <span className={styles.historyTime}>
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </strong>
                    <span className={styles.historyTotal}>{fmtRp(s.total)}</span>
                    <small className={styles.historyMeta}>
                      {interpolate(t('pos.itemCount'), { n: String(s.lines.length) })}
                      {s.payments.length > 0 && ` · ${s.payments.map((p) => walletName(p.walletId) || EMPTY_VALUE).join(' + ')}`}
                      {s.cashierName ? ` · ${s.cashierName}` : ''}
                      {s.customerName ? ` · ${s.customerName}` : ''}
                    </small>
                    <div className={styles.historyActions}>
                      {s.customerId && !s.voided && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => void resendWa(s)}
                          aria-label={t('pos.resendWa').replace('{no}', s.saleNo)}
                          title={t('pos.resendWa').replace('{no}', s.saleNo)}
                        >
                          <Icon name="whatsapp" aria-hidden />
                        </button>
                      )}
                      {org && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => printSaleReceipt(s, org)}
                          aria-label={interpolate(t('pos.printAria'), { no: s.saleNo })}
                          title={t('pos.printTitle')}
                        >
                          <Icon name="receipt" aria-hidden />
                        </button>
                      )}
                      {s.voided ? (
                        <Badge tone="danger">{t('pos.voidedBadge')}</Badge>
                      ) : !isMgr || s.date < monthStart ? null : (
                        <button
                          type="button"
                          className={styles.voidBtn}
                          onClick={() => {
                            setVoidTarget(s);
                            setVoidReason('');
                          }}
                          aria-label={interpolate(t('pos.voidAria'), { no: s.saleNo })}
                          title={t('pos.voidTitle')}
                        >
                          <Icon name="circle-xmark" aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>

      <Modal
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        title={interpolate(t('pos.voidModalTitle'), { no: voidTarget?.saleNo ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>
              {t('common.back')}
            </Button>
            <Button variant="danger" onClick={confirmVoid} loading={voidBusy}>
              {t('pos.voidConfirm').replace('{no}', voidTarget?.saleNo ?? '')}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-3)' }}>
          {t('pos.voidBody')} <strong>{t('pos.voidedBadge')}</strong> {t('pos.voidBodyTail')}
        </p>
        <Input placeholder={t('pos.voidReason')} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
      </Modal>
    </>
  );
}
