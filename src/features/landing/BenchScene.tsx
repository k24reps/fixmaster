import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { useT, type TranslationKey } from '@/i18n';
import styles from './BenchScene.module.css';

/**
 * Dua adegan di layar pertama landing: meja penerimaan (layar desktop) dan
 * ponsel pemilik. Satu aksi di meja menggerakkan angka di ponsel, persis
 * seperti aplikasinya: part dipasang mengurangi stok dan mengisi margin tiket,
 * tiket selesai masuk rak siap ambil, pembayaran masuk kas.
 *
 * Semua angka contoh dan berlabel "Data contoh". Margin = tagihan − modal part
 * (Rp 350.000 − Rp 180.000), kas naik sebesar tagihan.
 *
 * Gerak: diputar sekali saat adegan terlihat lalu berhenti di keadaan akhir;
 * pengunjung bisa menekan tombol meja kapan saja. Dengan reduced motion tidak
 * ada putar otomatis dan adegan mulai dari keadaan akhir, yang tetap
 * memperlihatkan nilai sebelum → sesudah, jadi sinkronnya terbaca tanpa gerak.
 */

type Step = 0 | 1 | 2 | 3;
type Tone = 'neutral' | 'info' | 'warning' | 'accent' | 'success';

interface QueueRow {
  no: string;
  icon: IconName;
  device: string;
  issue: TranslationKey;
  status: TranslationKey;
  tone: Tone;
}

const OTHER_QUEUE: QueueRow[] = [
  {
    no: 'FM-0311',
    icon: 'print',
    device: 'Epson L3110',
    issue: 'landing.scene.issuePrinter',
    status: 'status.diagnosa',
    tone: 'info',
  },
  {
    no: 'FM-0310',
    icon: 'device-mobile',
    device: 'iPhone 11',
    issue: 'landing.scene.issuePhone',
    status: 'status.tunggu',
    tone: 'warning',
  },
  {
    no: 'FM-0309',
    icon: 'television',
    device: 'Polytron 32"',
    issue: 'landing.scene.issueTv',
    status: 'status.diterima',
    tone: 'neutral',
  },
];

const TICKET_STATUS: Record<Step, { status: TranslationKey; tone: Tone }> = {
  0: { status: 'status.pengerjaan', tone: 'info' },
  1: { status: 'status.pengerjaan', tone: 'info' },
  2: { status: 'status.selesai', tone: 'accent' },
  3: { status: 'status.lunas', tone: 'success' },
};

const ACTION: Record<Step, TranslationKey> = {
  0: 'landing.scene.actionInstall',
  1: 'landing.scene.actionDone',
  2: 'landing.scene.actionPay',
  3: 'landing.scene.actionReplay',
};

const NOTICE: Partial<Record<Step, TranslationKey>> = {
  1: 'landing.scene.noticeInstall',
  2: 'landing.scene.noticeDone',
  3: 'landing.scene.noticePay',
};

const RAIL: TranslationKey[] = [
  'landing.scene.railPart',
  'landing.scene.railDone',
  'landing.scene.railPaid',
];

interface Readout {
  key: string;
  label: TranslationKey;
  /** Langkah yang mengubah baris ini. */
  at: Step;
  before: string | TranslationKey;
  after: string;
  delta?: string | TranslationKey;
  tone: Tone;
}

const READOUTS: Readout[] = [
  {
    key: 'stock',
    label: 'landing.scene.readStock',
    at: 1,
    before: '3',
    after: '2',
    delta: '−1',
    tone: 'warning',
  },
  {
    key: 'margin',
    label: 'landing.scene.readMargin',
    at: 1,
    before: 'landing.scene.marginWaiting',
    after: 'Rp 170.000',
    delta: '350.000 − 180.000',
    tone: 'info',
  },
  {
    key: 'ready',
    label: 'landing.scene.readReady',
    at: 2,
    before: '2',
    after: '3',
    delta: '+1',
    tone: 'accent',
  },
  {
    key: 'cash',
    label: 'landing.scene.readCash',
    at: 3,
    before: 'Rp 1.240.000',
    after: 'Rp 1.590.000',
    delta: '+350.000',
    tone: 'success',
  },
];

const AUTO_FIRST_MS = 1400;
const AUTO_STEP_MS = 2600;

function isKey(value: string): value is TranslationKey {
  return value.startsWith('landing.');
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

interface BenchSceneProps {
  /** Nama toko dari gerbang; kosong = "Toko Anda". */
  shopName: string;
}

export function BenchScene({ shopName }: BenchSceneProps) {
  const t = useT();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>(() => (reduced ? 3 : 0));
  const [byUser, setByUser] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shop = shopName || t('landing.scene.shopPlaceholder');

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Sekali jalan sampai lunas, lalu diam di keadaan akhir (tidak berulang
  // tanpa akhir). Berhenti begitu pengunjung menekan tombol sendiri.
  useEffect(() => {
    if (reduced || byUser || !visible || step === 3) return;
    const timer = window.setTimeout(
      () => setStep((s) => (s < 3 ? ((s + 1) as Step) : s)),
      step === 0 ? AUTO_FIRST_MS : AUTO_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [reduced, byUser, visible, step]);

  const advance = () => {
    setByUser(true);
    setStep((s) => (s === 3 ? 0 : ((s + 1) as Step)));
  };

  const ticket = TICKET_STATUS[step];
  const notice = NOTICE[step];

  return (
    <div className={styles.wrap}>
      <div ref={rootRef} className={styles.scene} data-step={step}>
        <figure className={styles.desk} aria-label={t('landing.scene.deskLabel')}>
          <div className={styles.windowBar}>
            <span className={styles.barLed} aria-hidden />
            <span className={styles.barTitle}>
              <strong>{shop}</strong>
              <span>{t('landing.scene.deskTitle')}</span>
            </span>
            <span className={styles.barClock}>10:42</span>
          </div>

          <div className={styles.deskBody}>
            <ol className={styles.queue} aria-label={t('landing.scene.queueLabel')}>
              <li className={styles.queueRow} data-tone={ticket.tone} data-active="true">
                <span className={styles.queueIcon}>
                  <Icon name="laptop" aria-hidden />
                </span>
                <span className={styles.queueText}>
                  <span className={styles.queueNo}>FM-0312</span>
                  <strong>ASUS VivoBook X441</strong>
                  <small>{t('landing.scene.issueLaptop')}</small>
                </span>
                <span className={styles.queueStatus}>
                  <i aria-hidden />
                  {t(ticket.status)}
                </span>
              </li>
              {OTHER_QUEUE.map((row) => (
                <li key={row.no} className={styles.queueRow} data-tone={row.tone}>
                  <span className={styles.queueIcon}>
                    <Icon name={row.icon} aria-hidden />
                  </span>
                  <span className={styles.queueText}>
                    <span className={styles.queueNo}>{row.no}</span>
                    <strong>{row.device}</strong>
                    <small>{t(row.issue)}</small>
                  </span>
                  <span className={styles.queueStatus}>
                    <i aria-hidden />
                    {t(row.status)}
                  </span>
                </li>
              ))}
            </ol>

            <div className={styles.ticket} data-tone={ticket.tone}>
              <div className={styles.ticketHead}>
                <span className={styles.ticketNo}>FM-0312</span>
                <span className={styles.ticketDevice}>
                  <Icon name="laptop" aria-hidden />
                  ASUS VivoBook X441
                </span>
                <span className={styles.ticketStatus}>
                  <i aria-hidden />
                  {t(ticket.status)}
                </span>
              </div>

              <dl className={styles.ticketFields}>
                <div>
                  <dt>{t('landing.scene.fieldCustomer')}</dt>
                  <dd>Rina Anggraini</dd>
                </div>
                <div>
                  <dt>{t('landing.scene.fieldTech')}</dt>
                  <dd>Dimas</dd>
                </div>
              </dl>

              <div className={styles.partLine} data-installed={step >= 1 ? 'true' : undefined}>
                <span className={styles.partLed} aria-hidden />
                <span className={styles.partName}>
                  <strong>{t('landing.scene.partName')}</strong>
                  <small>
                    {step >= 1 ? t('landing.scene.partInstalled') : t('landing.scene.partInStock')}
                  </small>
                </span>
                <span className={styles.partCost}>
                  <small>{t('landing.scene.partCost')}</small>
                  Rp 180.000
                </span>
              </div>

              <div className={styles.billLine}>
                <span>{t('landing.scene.bill')}</span>
                <strong>Rp 350.000</strong>
              </div>

              <ol className={styles.rail} aria-label={t('landing.scene.railLabel')}>
                {RAIL.map((label, i) => (
                  <li key={label} data-on={step > i ? 'true' : undefined}>
                    <i aria-hidden />
                    {t(label)}
                  </li>
                ))}
              </ol>

              <button className={styles.action} type="button" onClick={advance}>
                <Icon name={step === 3 ? 'repeat' : 'lightning'} aria-hidden />
                {t(ACTION[step])}
              </button>
            </div>
          </div>
        </figure>

        <div className={styles.sync} aria-hidden>
          <span className={styles.syncLine} />
          {step > 0 && <span key={step} className={styles.syncPacket} />}
          <span className={styles.syncLabel}>{t('landing.scene.sync')}</span>
        </div>

        <figure className={styles.phone} aria-label={t('landing.scene.phoneLabel')}>
          <div className={styles.phoneBody}>
            <span className={styles.phoneSpeaker} aria-hidden />
            <div className={styles.phoneScreen}>
              <div className={styles.phoneStatus} aria-hidden>
                <span>10:42</span>
                <span className={styles.phoneSignal}>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className={styles.phoneHead}>
                <strong>{shop}</strong>
                <small>{t('landing.scene.phoneTitle')}</small>
              </div>

              <div className={styles.noticeSlot} aria-live={byUser ? 'polite' : 'off'}>
                {notice ? (
                  <p key={step} className={styles.notice}>
                    <span className={styles.noticeLed} aria-hidden />
                    {t(notice)}
                  </p>
                ) : (
                  <p className={styles.noticeIdle}>{t('landing.scene.noticeIdle')}</p>
                )}
              </div>

              <ul className={styles.readouts}>
                {READOUTS.map((row) => {
                  const changed = step >= row.at;
                  const tone: Tone =
                    row.key === 'margin' && step === 3 ? 'success' : changed ? row.tone : 'neutral';
                  const value = changed ? row.after : isKey(row.before) ? t(row.before) : row.before;
                  return (
                    <li
                      key={row.key}
                      className={styles.readout}
                      data-tone={tone}
                      data-changed={changed ? 'true' : undefined}
                      data-fresh={changed && step === row.at ? 'true' : undefined}
                    >
                      <span className={styles.readoutLed} aria-hidden />
                      <span className={styles.readoutLabel}>{t(row.label)}</span>
                      <span className={styles.readoutValue} data-text={!changed && isKey(row.before) ? 'true' : undefined}>
                        {value}
                      </span>
                      {changed && row.delta && (
                        <span className={styles.readoutDelta}>
                          {row.key !== 'margin' && !isKey(row.before) && (
                            <s>{row.before}</s>
                          )}
                          {isKey(row.delta) ? t(row.delta) : row.delta}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </figure>
      </div>

      <p className={styles.caption}>
        <span className={styles.captionTag}>{t('landing.scene.sample')}</span>
        {t('landing.scene.caption')}
      </p>
    </div>
  );
}
