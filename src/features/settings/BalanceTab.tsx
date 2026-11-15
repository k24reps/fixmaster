import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, CardHeader, EmptyState, Icon, Input } from '@/components/ui';
import { useT } from '@/i18n';
import { useCollection } from '@/hooks/useCollection';
import { useSessionStore } from '@/stores/session';
import { demoGuard, isCloudMode } from '@/stores/demo';
import { toast } from '@/stores/toast';
import {
  listUnitLedger,
  listUnitMonthUsage,
  type UnitLedgerEntry,
  type UnitMonthUsage,
} from '@/data/supabase-client';
import { FIXMASTER_WHATSAPP } from '@/config/contact';
import {
  MIN_TOPUP,
  REFUND_WINDOW_MINUTES,
  TOPUP_PRESETS,
  TOPUP_STEP,
  MONTHLY_CAP_UNITS,
  UNIT_FLOOR,
  UNIT_PRICE,
} from '@/config/pricing';
import {
  branchCapState,
  ledgerKindLabel,
  monthUsageFromServices,
  nextCapReset,
  ticketsUntilBlocked,
  topupAmountError,
  topupWhatsAppLink,
  unitBalanceState,
  unitsForTopup,
  unitsToRupiah,
  type UnitBalanceState,
  type UnitLedgerKind,
} from '@/lib/business/billing';
import { interpolate } from '@/lib/business/notify';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { fmtDate, localDateOf } from '@/lib/time';
import styles from './BalanceTab.module.css';

/** Ujung kanan tick-gauge. Saldo di atasnya tetap terbaca di readout. */
const GAUGE_MAX = 100;
const TICKS = 24;
const UNITS_PER_TICK = (GAUGE_MAX - UNIT_FLOOR) / TICKS;
const ZERO_TICK = -UNIT_FLOOR / UNITS_PER_TICK;

const STATE_LABEL = {
  ok: 'billing.state.ok',
  low: 'billing.state.low',
  minus: 'billing.state.minus',
  blocked: 'billing.state.blocked',
} as const satisfies Record<UnitBalanceState, string>;

const BANNER = {
  low: 'billing.bannerLow',
  minus: 'billing.bannerMinus',
  blocked: 'billing.bannerBlocked',
} as const;

/** Nada LED riwayat. Pemakaian tiket bukan sinyal, jadi tidak diberi warna. */
const KIND_TONE: Record<UnitLedgerKind, string> = {
  grant: 'in',
  topup: 'in',
  refund: 'in',
  usage: 'out',
  adjust: 'adjust',
  capped: 'in',
};

function signed(units: number): string {
  return units > 0 ? `+${units}` : `−${Math.abs(units)}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export function BalanceTab() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const balance = org?.unitBalance ?? 0;
  const state = unitBalanceState(balance);
  const cloud = isCloudMode();

  const [amountText, setAmountText] = useState(fmtRpInput(String(100_000)));
  const amount = parseRpInput(amountText);
  const amountError = topupAmountError(amount);
  const [entries, setEntries] = useState<UnitLedgerEntry[] | null>(null);
  const [cloudMonth, setCloudMonth] = useState<UnitMonthUsage[] | null>(null);
  // Demo tidak punya buku saldo server: perkiraan dari tiket di perangkat.
  const { data: demoServices } = useCollection('services', { enabled: !cloud });
  const { data: demoOutlets } = useCollection('outlets', { enabled: !cloud });
  const demoMonth = useMemo(
    () => (cloud ? null : monthUsageFromServices(demoServices ?? [], demoOutlets ?? [])),
    [cloud, demoServices, demoOutlets],
  );
  const month = cloud ? cloudMonth : demoMonth;

  // Saldo di sesi ikut realtime (baris organizations berubah setiap kali tiket
  // memotong unit), jadi riwayat dimuat ulang tiap kali angkanya bergeser.
  useEffect(() => {
    if (!cloud || !org?.id) return;
    let cancelled = false;
    listUnitLedger(org.id)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        toast.error(err instanceof Error ? err.message : t('billing.historyFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [cloud, org?.id, balance, t]);

  // Pemakaian bulan ini per cabang (0103). Tanpa RPC-nya di server, blok
  // bulanan disembunyikan; saldo dan riwayat tetap tampil.
  useEffect(() => {
    if (!cloud || !org?.id) return;
    let cancelled = false;
    void listUnitMonthUsage(org.id).then((rows) => {
      if (!cancelled) setCloudMonth(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [cloud, org?.id, balance]);

  const filled = Math.max(0, Math.min(TICKS, Math.round((balance - UNIT_FLOOR) / UNITS_PER_TICK)));
  const zeroPct = (ZERO_TICK / TICKS) * 100;

  const requestTopup = () => {
    if (amountError || !org) return;
    if (demoGuard('demo.whatsapp')) return;
    const link = topupWhatsAppLink({
      supportPhone: FIXMASTER_WHATSAPP,
      orgId: org.id,
      orgName: org.name,
      balance,
      amount,
    });
    window.open(link, '_blank', 'noopener,noreferrer');
    toast.success(t('billing.whatsappOpened'));
  };

  return (
    <>
      <Card>
        <CardHeader icon={<Icon name="gauge" aria-hidden />} title={t('billing.balanceTitle')} />
        <CardBody>
          <div className={styles.meter} data-state={state}>
            <div className={styles.meterTop}>
              <span className={styles.led} aria-hidden />
              <span className={styles.stateLabel}>{t(STATE_LABEL[state])}</span>
              <div className={styles.readout}>
                <span className={styles.readoutNum}>{balance < 0 ? `−${Math.abs(balance)}` : balance}</span>
                <span className={styles.readoutUnit}>{t('billing.unitShort')}</span>
              </div>
            </div>
            <p className={styles.rate}>
              {interpolate(t('billing.rate'), {
                price: fmtRp(UNIT_PRICE),
                max: fmtRp(MONTHLY_CAP_UNITS * UNIT_PRICE),
              })}
            </p>

            <div
              className={styles.gauge}
              role="meter"
              aria-valuenow={balance}
              aria-valuemin={UNIT_FLOOR}
              aria-valuemax={GAUGE_MAX}
              aria-label={interpolate(t('billing.gaugeAria'), { n: String(balance) })}
            >
              {Array.from({ length: TICKS }).map((_, i) => (
                <span
                  key={i}
                  className={styles.tick}
                  data-on={i < filled}
                  data-zone={i < ZERO_TICK ? 'minus' : undefined}
                />
              ))}
            </div>
            <div className={styles.scale} aria-hidden>
              <span>{UNIT_FLOOR}</span>
              <span className={styles.scaleZero} style={{ left: `${zeroPct}%` }}>
                0
              </span>
              <span>{GAUGE_MAX}+</span>
            </div>

            <dl className={styles.facts}>
              <div>
                <dt>{t('billing.factValue')}</dt>
                <dd>{fmtRp(unitsToRupiah(balance))}</dd>
              </div>
              <div>
                <dt>{t('billing.factTicketsLeft')}</dt>
                <dd>{ticketsUntilBlocked(balance)}</dd>
              </div>
              <div>
                <dt>{t('billing.factOverdraft')}</dt>
                <dd>
                  {-UNIT_FLOOR} {t('billing.unitShort')}
                </dd>
              </div>
            </dl>
          </div>

          {month && month.length > 0 && (
            <section className={styles.month} aria-labelledby="balance-month-title">
              <h3 id="balance-month-title" className={styles.monthTitle}>
                {t('billing.monthTitle')}
              </h3>
              <ul className={styles.monthList}>
                {month.map((branch) => {
                  const cap = branchCapState(branch);
                  return (
                    <li
                      key={branch.outletId ?? 'tanpa-cabang'}
                      className={styles.monthRow}
                      data-reached={cap.reached ? 'true' : undefined}
                    >
                      <span className={styles.monthName}>
                        {branch.outletName || t('billing.monthNoBranch')}
                      </span>
                      <span className={styles.monthReadout}>
                        {cap.paid}
                        <small> / {MONTHLY_CAP_UNITS} {t('billing.unitShort')}</small>
                      </span>
                      <span className={styles.monthBar} aria-hidden>
                        <span style={{ width: `${(cap.paid / MONTHLY_CAP_UNITS) * 100}%` }} />
                      </span>
                      <span className={styles.monthNote}>
                        {cap.reached
                          ? interpolate(t('billing.monthReached'), {
                              n: String(branch.cappedUnits),
                              date: fmtDate(nextCapReset()),
                            })
                          : interpolate(t('billing.monthRemaining'), { n: String(cap.remaining) })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {state !== 'ok' && (
            <p className={styles.banner} data-state={state} role="status">
              <Icon name="warning" aria-hidden />
              <span>{interpolate(t(BANNER[state]), { floor: String(UNIT_FLOOR) })}</span>
            </p>
          )}

          <p className={styles.note}>
            {interpolate(t('billing.refundRule'), { minutes: String(REFUND_WINDOW_MINUTES) })}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Icon name="whatsapp" aria-hidden />} title={t('billing.topupTitle')} />
        <CardBody>
          <ol className={styles.steps}>
            <li>{t('billing.stepRequest')}</li>
            <li>{t('billing.stepTransfer')}</li>
            <li>{t('billing.stepCredited')}</li>
          </ol>

          <div className={styles.presets} role="group" aria-label={t('billing.presetsAria')}>
            {TOPUP_PRESETS.map((preset) => {
              const active = amount === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={styles.preset}
                  aria-pressed={active}
                  onClick={() => setAmountText(fmtRpInput(String(preset)))}
                >
                  <span className={styles.presetAmount}>{fmtRp(preset)}</span>
                  <span className={styles.presetUnits}>
                    {unitsForTopup(preset)} {t('billing.unitShort')}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.topupRow}>
            <Input
              label={t('billing.amountLabel')}
              inputMode="numeric"
              value={amountText}
              invalid={amountError !== null}
              onChange={(e) => setAmountText(fmtRpInput(e.target.value))}
              hint={interpolate(t('billing.amountHint'), {
                min: fmtRp(MIN_TOPUP),
                step: fmtRp(TOPUP_STEP),
              })}
              error={
                amountError
                  ? interpolate(t(amountError), { min: fmtRp(MIN_TOPUP), step: fmtRp(TOPUP_STEP) })
                  : undefined
              }
            />
            <output className={styles.topupResult} aria-live="polite">
              <span className={styles.topupUnits}>
                +{amountError ? 0 : unitsForTopup(amount)} {t('billing.unitShort')}
              </span>
              <span className={styles.topupAfter}>
                {interpolate(t('billing.balanceAfterTopup'), {
                  n: String(balance + (amountError ? 0 : unitsForTopup(amount))),
                })}
              </span>
            </output>
          </div>

          <div className={styles.topupFoot}>
            <span className={styles.terms}>{t('billing.topupTerms')}</span>
            <Button
              onClick={requestTopup}
              aria-disabled={amountError !== null || undefined}
              iconLeft={<Icon name="whatsapp" aria-hidden />}
            >
              {t('billing.requestTopup')}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Icon name="receipt" aria-hidden />} title={t('billing.historyTitle')} />
        <CardBody className={entries && entries.length > 0 ? styles.flush : undefined}>
          {!cloud ? (
            <EmptyState title={t('billing.historyDemo')} />
          ) : entries === null ? (
            <p className={styles.loading} role="status">
              <Icon name="circle-notch" className="spin" aria-hidden /> {t('common.loading')}
            </p>
          ) : entries.length === 0 ? (
            <EmptyState title={t('billing.historyEmpty')} />
          ) : (
            <ol className={styles.ledger}>
              {entries.map((entry) => (
                <li key={entry.id} className={styles.ledgerRow} data-tone={KIND_TONE[entry.kind]}>
                  <span className={styles.ledgerLed} aria-hidden />
                  <span className={styles.ledgerWhat}>
                    <strong>
                      {t(ledgerKindLabel(entry.kind))}
                      {entry.serviceNo && <span className={styles.ledgerNo}>{entry.serviceNo}</span>}
                    </strong>
                    <small>
                      {fmtDate(localDateOf(entry.createdAt))} · {timeOf(entry.createdAt)}
                      {entry.amount !== null && ` · ${fmtRp(entry.amount)}`}
                      {entry.note && ` · ${entry.note}`}
                    </small>
                  </span>
                  <span className={styles.ledgerUnits}>
                    {entry.kind === 'capped' ? t('billing.free') : signed(entry.units)}
                  </span>
                  <span className={styles.ledgerAfter}>
                    {interpolate(t('billing.balanceAfter'), { n: String(entry.balanceAfter) })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </>
  );
}
