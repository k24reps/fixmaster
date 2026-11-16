import type { ReactNode, RefObject } from 'react';
import { Icon, type IconName } from '@/components/ui';
import { useT, type TranslationKey } from '@/i18n';
import styles from './BenchScene.module.css';
import type { BenchSteps, Step } from './useBenchSteps';

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

/** Semua status yang bisa dipakai tiket aktif, untuk mengukur lebar terbesar. */
const TICKET_STATUSES: TranslationKey[] = ['status.pengerjaan', 'status.selesai', 'status.lunas'];

/** Label tuts strip ponsel: versi pendek dari ACTION supaya muat satu baris di 320px. */
const STRIP_ACTION: Record<Step, TranslationKey> = {
  0: 'landing.strip.install',
  1: 'landing.strip.done',
  2: 'landing.strip.pay',
  3: 'landing.strip.replay',
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

function isKey(value: string): value is TranslationKey {
  return value.startsWith('landing.');
}

/**
 * Teks yang berganti per langkah dirender bertumpuk di satu sel grid; hanya
 * yang aktif terlihat. Lebar dan tingginya selalu milik isi terbesar, jadi
 * pergantian status tidak menggeser tata letak (dulu CLS 0,25 di 390px).
 */
function Stack({ items, current }: { items: { key: string; node: ReactNode }[]; current: string }) {
  return (
    <span className={styles.stack}>
      {items.map((item) =>
        item.key === current ? (
          <span key={item.key} data-on="true">
            {item.node}
          </span>
        ) : (
          <span key={item.key} aria-hidden="true">
            {item.node}
          </span>
        ),
      )}
    </span>
  );
}

function StatusText({ current }: { current: TranslationKey }) {
  const t = useT();
  return <Stack current={current} items={TICKET_STATUSES.map((key) => ({ key, node: t(key) }))} />;
}

interface BenchSceneProps {
  /** Nama toko dari gerbang; kosong = "Toko Anda". */
  shopName: string;
  bench: BenchSteps;
  sceneRef: RefObject<HTMLDivElement | null>;
}

export function BenchScene({ shopName, bench, sceneRef }: BenchSceneProps) {
  const t = useT();
  const { step, byUser, advance } = bench;
  const shop = shopName || t('landing.scene.shopPlaceholder');
  const ticket = TICKET_STATUS[step];
  const notice = NOTICE[step];

  return (
    <div className={styles.wrap}>
      <div ref={sceneRef} className={styles.scene} data-step={step}>
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
                  <StatusText current={ticket.status} />
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
                  <StatusText current={ticket.status} />
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
                  <li
                    key={label}
                    data-on={step > i ? 'true' : undefined}
                    aria-current={step === i + 1 ? 'step' : undefined}
                  >
                    <i aria-hidden />
                    {t(label)}
                    <span className="fm-visually-hidden">
                      {', '}
                      {step > i ? t('landing.scene.railDoneSr') : t('landing.scene.railPendingSr')}
                    </span>
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

              {/* Penakar tak terlihat menahan tinggi slot setinggi notifikasi
                  terpanjang; notifikasi aktif menimpanya di sel yang sama. */}
              <div className={styles.noticeStage}>
                {Object.values(NOTICE).map((key) => (
                  <p key={key} className={styles.notice} data-sizer="true" aria-hidden="true">
                    <span className={styles.noticeLed} />
                    {t(key)}
                  </p>
                ))}
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
              </div>

              <ul className={styles.readouts}>
                {READOUTS.map((row) => {
                  const changed = step >= row.at;
                  const tone: Tone =
                    row.key === 'margin' && step === 3 ? 'success' : changed ? row.tone : 'neutral';
                  const before = isKey(row.before) ? t(row.before) : row.before;
                  const delta = row.delta ? (isKey(row.delta) ? t(row.delta) : row.delta) : null;
                  const showBefore = row.key !== 'margin' && !isKey(row.before);
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
                      <span className={styles.readoutValue}>
                        <Stack
                          current={changed ? 'after' : 'before'}
                          items={[
                            { key: 'after', node: row.after },
                            {
                              key: 'before',
                              node: <span data-text={isKey(row.before) ? 'true' : undefined}>{before}</span>,
                            },
                          ]}
                        />
                      </span>
                      {/* Baris perubahan selalu dirender (tersembunyi sebelum
                          berubah) supaya tinggi readout tetap. */}
                      {delta && (
                        <span
                          className={styles.readoutDelta}
                          data-pending={changed ? undefined : 'true'}
                          aria-hidden={changed ? undefined : 'true'}
                        >
                          {showBefore && (
                            <>
                              <span className="fm-visually-hidden">{`, ${t('landing.scene.beforeSr')} `}</span>
                              <s>{row.before}</s>
                            </>
                          )}
                          <span className="fm-visually-hidden">{`, ${t('landing.scene.changeSr')} `}</span>
                          {delta}
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

/**
 * Strip sinkron di layar sempit: tuts meja → jejak → satu readout ponsel, di
 * antara judul dan gerbang, supaya bukti terlihat sebelum pengunjung diminta
 * nomor WA. Memakai keadaan yang sama dengan adegan penuh di bawah gerbang.
 */
const STRIP_READOUT: Record<Step, { label: TranslationKey; value: string }> = {
  0: { label: 'landing.scene.readStock', value: '3' },
  1: { label: 'landing.scene.readMargin', value: 'Rp 170.000' },
  2: { label: 'landing.scene.readReady', value: '3' },
  3: { label: 'landing.scene.readCash', value: 'Rp 1.590.000' },
};

interface BenchStripProps {
  shopName: string;
  bench: BenchSteps;
  stripRef: RefObject<HTMLDivElement | null>;
}

export function BenchStrip({ shopName, bench, stripRef }: BenchStripProps) {
  const t = useT();
  const { step, advance } = bench;
  const shop = shopName || t('landing.scene.shopPlaceholder');
  const readout = STRIP_READOUT[step];
  const tone: Tone = step === 0 ? 'neutral' : TICKET_STATUS[step].tone;

  return (
    <div
      ref={stripRef}
      className={styles.strip}
      data-tone={tone}
      role="group"
      aria-label={t('landing.strip.label')}
    >
      <span className={styles.stripTag} aria-hidden>
        {t('landing.strip.sample')}
      </span>

      <span className={styles.stripIcon} data-place="desk">
        <Icon name="shop" aria-hidden />
      </span>
      <span className={styles.stripShop}>
        <strong>{shop}</strong>
        <small>{t('landing.strip.desk')}</small>
      </span>
      <button className={styles.stripKey} type="button" onClick={advance}>
        <Icon name={step === 3 ? 'repeat' : 'lightning'} aria-hidden />
        <Stack
          current={STRIP_ACTION[step]}
          items={Object.values(STRIP_ACTION).map((key) => ({ key, node: t(key) }))}
        />
      </button>

      <span className={styles.stripTrace} aria-hidden>
        {step > 0 && <span key={step} className={styles.stripPacket} />}
      </span>

      <span className={styles.stripIcon} data-place="phone">
        <Icon name="device-mobile" aria-hidden />
      </span>
      <span className={styles.stripReadoutLabel}>
        <span className={styles.readoutLed} aria-hidden />
        <span>
          {t(readout.label)}
          <span className="fm-visually-hidden">{`, ${t('landing.strip.phone')}`}</span>
        </span>
      </span>
      <span className={styles.stripValue}>{readout.value}</span>
    </div>
  );
}
