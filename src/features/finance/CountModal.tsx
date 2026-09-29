import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormError } from '@/components/ui';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { reconcileWallet } from '@/lib/business/finance';
import { createFinanceEntry } from '@/data/financeEntry';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import { useT } from '@/i18n';
import type { ActivityAction, Wallet } from '@/data/types';
import styles from './FinancePage.module.css';

interface CountModalProps {
  open: boolean;
  onClose: () => void;
  wallets: Wallet[];
  /** Wallet yang sedang difilter di Buku Kas, bila ada. */
  initialWalletId?: string | null;
}

/**
 * Hitung laci / cek rekening: pemilik memasukkan uang yang BENAR-BENAR ada,
 * aplikasi menunjukkan selisihnya terhadap saldo, dan satu ketukan mencatat
 * penyesuaiannya sebagai pengeluaran/pemasukan "Lainnya" — sehingga saldo
 * kembali cocok tanpa menimpa angka diam-diam.
 */
export function CountModal({ open, onClose, wallets, initialWalletId }: CountModalProps) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  useSessionStore((s) => s.activeOutletId);
  const { data: outlets } = useCollection('outlets');
  const [walletId, setWalletId] = useState('');
  const [counted, setCounted] = useState('');
  const [outletId, setOutletId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [wasOpen, setWasOpen] = useState(false);
  if (!open && wasOpen) setWasOpen(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setWalletId(initialWalletId ?? wallets[0]?.id ?? '');
    setCounted('');
    setOutletId('');
    setError('');
  }

  const wallet = wallets.find((w) => w.id === walletId) ?? null;
  const hasCount = counted.trim() !== '';
  const { diff, entry } = reconcileWallet(wallet?.balance ?? 0, parseRpInput(counted));
  // Wallet khusus cabang: selisihnya milik cabang itu, tak perlu ditanya.
  const needOutlet = !!entry && !wallet?.outletId && mustPickOutlet(outlets.length);
  const outletOptions = outlets
    .filter((o) => allowedOutletIds.length === 0 || allowedOutletIds.includes(o.id))
    .map((o) => ({ value: o.id, label: o.name }));

  const apply = async () => {
    if (!wallet || !hasCount) return setError(t('finance.countRequired'));
    if (!entry) {
      toast.success(t('finance.countMatch').replace('{wallet}', wallet.name));
      onClose();
      return;
    }
    if (needOutlet && !outletId) return setError(t('finance.outletRequired'));
    setBusy(true);
    // Kurang = beban (Selisih Kas Kurang); lebih = non-operasional, bukan omzet.
    const category = entry.kind === 'expense' ? 'Selisih Kas Kurang' : 'Selisih Kas Lebih';
    const description = t(entry.kind === 'expense' ? 'finance.countShortNote' : 'finance.countOverNote')
      .replace('{wallet}', wallet.name)
      .replace('{counted}', fmtRp(parseRpInput(counted)));
    try {
      const id = await createFinanceEntry({
        orgId,
        kind: entry.kind,
        date: localDateStr(),
        category,
        amount: entry.amount,
        walletId: wallet.id,
        description,
        outletId: wallet.outletId ?? (needOutlet ? outletId : resolveCreateOutlet(outlets)),
      });
      logActivity({
        action: `${entry.kind}.create` as ActivityAction,
        entityType: entry.kind,
        entityId: id,
        entityLabel: description,
        meta: { amount: entry.amount, category },
      });
      toast.success(t('finance.countApplied').replace('{wallet}', wallet.name));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('finance.countFailed'));
    } finally {
      setBusy(false);
    }
  };

  const tone = !hasCount ? 'idle' : diff === 0 ? 'ok' : diff < 0 ? 'short' : 'over';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('finance.countTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="wallet-count" loading={busy} disabled={!hasCount}>
            {!hasCount || !entry
              ? t('finance.countConfirm')
              : t('finance.countAdjust').replace('{amount}', `${diff > 0 ? '+' : '−'}${fmtRp(Math.abs(diff))}`)}
          </Button>
        </>
      }
    >
      <form
        id="wallet-count"
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <FormFields>
          <FormError>{error}</FormError>
          <div className={styles.countWallets} role="group" aria-label={t('finance.wallet')}>
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                className={styles.countWallet}
                aria-pressed={w.id === walletId}
                onClick={() => {
                  setWalletId(w.id);
                  setError('');
                }}
              >
                <span className={styles.walletLed} aria-hidden />
                {w.name}
              </button>
            ))}
          </div>
          <Input
            label={t('finance.countLabel')}
            hint={t('finance.countHint')}
            inputMode="numeric"
            value={counted}
            onChange={(e) => {
              setCounted(fmtRpInput(e.target.value));
              setError('');
            }}
            placeholder="0"
            autoFocus
          />
          {/* Readout: saldo aplikasi / dihitung / selisih — satu persamaan, bukan tiga kartu. */}
          <div className={styles.countBox}>
          <dl className={styles.countReadout} data-tone={tone}>
            <div>
              <dt>{t('finance.countApp')}</dt>
              <dd>{wallet ? fmtRp(wallet.balance) : '—'}</dd>
            </div>
            <div>
              <dt>{t('finance.countCounted')}</dt>
              <dd>{hasCount ? fmtRp(parseRpInput(counted)) : '—'}</dd>
            </div>
            <div className={styles.countDiff}>
              <dt>
                <span className={styles.countLed} aria-hidden />
                {t('finance.countDiff')}
              </dt>
              <dd>
                {!hasCount
                  ? '—'
                  : diff === 0
                    ? t('finance.countDiffNone')
                    : `${diff > 0 ? '+' : '−'}${fmtRp(Math.abs(diff))}`}
              </dd>
            </div>
          </dl>
          </div>
          {entry && (
            <p className={styles.formHint}>
              {t(entry.kind === 'expense' ? 'finance.countShortHint' : 'finance.countOverHint')}
            </p>
          )}
          {needOutlet && (
            <Select
              label={t('finance.outlet')}
              value={outletId}
              onChange={(e) => {
                setOutletId(e.target.value);
                setError('');
              }}
              options={outletOptions}
              placeholder={t('finance.outletPlaceholder')}
            />
          )}
        </FormFields>
      </form>
    </Modal>
  );
}
