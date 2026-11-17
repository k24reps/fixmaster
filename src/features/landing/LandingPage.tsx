import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { FIXMASTER_WHATSAPP } from '@/config/contact';
import {
  FREE_UNITS,
  MONTHLY_CAP_UNITS,
  REFUND_WINDOW_MINUTES,
  UNIT_FLOOR,
  UNIT_PRICE,
} from '@/config/pricing';
import {
  billedUnitsPerBranch,
  firstMonthCost,
  monthlyBranchCost,
} from '@/lib/business/billing';
import { useT, type TranslationKey } from '@/i18n';
import { interpolate, waLink } from '@/lib/business/notify';
import { fmtRp } from '@/lib/format';
import { EMPTY_DEMO_LEAD_DRAFT, cleanShopName } from '@/lib/business/demoLead';
import { readDemoVisitorName, subscribeDemoVisitor } from '@/lib/demoVisitor';
import { useThemeStore } from '@/stores/theme';
import { useZoomStore } from '@/stores/zoom';
import { trackEvent } from '@/lib/analytics';
import { authIntentHref, type AuthIntent } from '@/features/auth/auth-intent';
import { BenchScene } from './BenchScene';
import { DemoGate } from './DemoGate';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  /** Optional so the public preview route can open the account flow. */
  onStart?: (intent: AuthIntent) => void;
}

interface Contrast {
  situation: TranslationKey;
  old: TranslationKey;
  fixmaster: TranslationKey;
  /** Baris unggulan: ditampilkan dengan contoh tautan lacak sungguhan. */
  example?: string;
}

/**
 * Pola toko yang berantakan, masing-masing dengan jawabannya di aplikasi. Lima
 * pertama paling sering terasa dan terlihat langsung; sisanya dibuka sesuai
 * minat (dulu 8 baris × 3 sel, 2.796px di ponsel).
 */
const CONTRASTS: Contrast[] = [
  // Pilihan pemilik (17 Nov 2026): unit masuk paling atas, lima baris terlihat.
  { situation: 'landing.vs.intake', old: 'landing.vs.intakeOld', fixmaster: 'landing.vs.intakeNew' },
  {
    situation: 'landing.vs.status',
    old: 'landing.vs.statusOld',
    fixmaster: 'landing.vs.statusNew',
    // Bentuk alamat lacak 0100: kode acak 10 karakter per tiket (contoh).
    example: 'fixmaster.app/t/K7Q2M9XAPD',
  },
  { situation: 'landing.vs.stock', old: 'landing.vs.stockOld', fixmaster: 'landing.vs.stockNew' },
  { situation: 'landing.vs.cash', old: 'landing.vs.cashOld', fixmaster: 'landing.vs.cashNew' },
  { situation: 'landing.vs.margin', old: 'landing.vs.marginOld', fixmaster: 'landing.vs.marginNew' },
  { situation: 'landing.vs.team', old: 'landing.vs.teamOld', fixmaster: 'landing.vs.teamNew' },
  { situation: 'landing.vs.warranty', old: 'landing.vs.warrantyOld', fixmaster: 'landing.vs.warrantyNew' },
  { situation: 'landing.vs.branch', old: 'landing.vs.branchOld', fixmaster: 'landing.vs.branchNew' },
];

const VS_VISIBLE = 5;

interface Stage {
  title: TranslationKey;
  text: TranslationKey;
  /** Menu yang mulai dipakai di tahap ini (tahap berikutnya menambah, bukan mengganti). */
  tools: TranslationKey[];
}

const STAGES: Stage[] = [
  {
    title: 'landing.stage.soloTitle',
    text: 'landing.stage.soloText',
    tools: ['nav.services', 'nav.pos', 'nav.finance'],
  },
  {
    title: 'landing.stage.teamTitle',
    text: 'landing.stage.teamText',
    tools: ['landing.stage.toolPin', 'nav.attendance', 'nav.tasks', 'nav.activity'],
  },
  {
    title: 'landing.stage.branchTitle',
    text: 'landing.stage.branchText',
    tools: ['landing.mod.outletsName', 'landing.stage.toolAllBranches', 'nav.reports'],
  },
];

const FAQ: { question: TranslationKey; answer: TranslationKey }[] = [
  { question: 'landing.faq.connection.q', answer: 'landing.faq.connection.a' },
  { question: 'landing.faq.safe.q', answer: 'landing.faq.safe.a' },
  { question: 'landing.faq.device.q', answer: 'landing.faq.device.a' },
  { question: 'landing.faq.cashier.q', answer: 'landing.faq.cashier.a' },
  { question: 'landing.faq.install.q', answer: 'landing.faq.install.a' },
  { question: 'landing.faq.move.q', answer: 'landing.faq.move.a' },
  { question: 'landing.faq.pay.q', answer: 'landing.faq.pay.a' },
  // Rincian aturan unit pindah ke sini (17 Nov 2026): bagian harga hanya
  // menonjolkan harga, batas bulanan, unit gratis, dan saldo yang tak hangus.
  { question: 'landing.faq.units.q', answer: 'landing.faq.units.a' },
];

const PRICE_RULES: { head: TranslationKey; note: TranslationKey }[] = [
  { head: 'landing.price.ruleCap', note: 'landing.price.ruleCapNote' },
  { head: 'landing.price.ruleFreeUnits', note: 'landing.price.ruleFreeUnitsNote' },
  { head: 'landing.price.ruleNoExpire', note: 'landing.price.ruleNoExpireNote' },
];

const priceVars = {
  max: fmtRp(MONTHLY_CAP_UNITS * UNIT_PRICE),
  cap: String(MONTHLY_CAP_UNITS),
  free: String(FREE_UNITS),
};

/**
 * Gauge biaya satu cabang: rentang toko sepi sampai cabang yang sangat ramai.
 * Tick sesudah titik batas (100 unit) adalah zona gratis.
 */
const GAUGE_MIN = 10;
const GAUGE_MAX = 400;
const GAUGE_STEP = 10;
const GAUGE_DEFAULT = 60;
const GAUGE_TICKS = 30;
const CAP_TICK = Math.round(((MONTHLY_CAP_UNITS - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * GAUGE_TICKS);

function defaultStart(intent: AuthIntent) {
  window.location.assign(authIntentHref(intent));
}

function CostGauge() {
  const t = useT();
  const [units, setUnits] = useState(GAUGE_DEFAULT);
  const cost = monthlyBranchCost(units);
  const freeByCap = units - billedUnitsPerBranch(units);
  const firstMonth = firstMonthCost(units);
  const lit = Math.round(((units - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * GAUGE_TICKS);

  return (
    <div className={styles.well}>
      <label className={styles.wellLabel} htmlFor="landing-units">
        {t('landing.price.slider')}
      </label>
      <div className={styles.wellReadout}>
        <output htmlFor="landing-units" className={styles.wellValue}>
          {fmtRp(cost)}
        </output>
        <span className={styles.wellPer}>{t('landing.price.perMonth')}</span>
      </div>
      <div className={styles.wellTicks} aria-hidden>
        {Array.from({ length: GAUGE_TICKS }).map((_, i) => (
          <span
            key={i}
            data-on={i < Math.max(1, lit) ? 'true' : undefined}
            data-zone={i >= CAP_TICK ? 'free' : undefined}
          />
        ))}
      </div>
      <input
        id="landing-units"
        className={styles.wellRange}
        type="range"
        min={GAUGE_MIN}
        max={GAUGE_MAX}
        step={GAUGE_STEP}
        value={units}
        onChange={(e) => setUnits(Number(e.target.value))}
        aria-valuetext={interpolate(t('landing.price.sliderValue'), {
          n: String(units),
          cost: fmtRp(cost),
        })}
      />
      <p className={styles.wellCap}>
        {interpolate(t('landing.price.capNote'), {
          cap: String(MONTHLY_CAP_UNITS),
          max: fmtRp(MONTHLY_CAP_UNITS * UNIT_PRICE),
        })}
      </p>
      <dl className={styles.wellFacts}>
        <div>
          <dt>{t('landing.price.units')}</dt>
          <dd>{units}</dd>
        </div>
        <div>
          <dt>{t('landing.price.freeByCap')}</dt>
          <dd>{freeByCap}</dd>
        </div>
        <div>
          <dt>{interpolate(t('landing.price.firstMonth'), { free: String(FREE_UNITS) })}</dt>
          <dd>{fmtRp(firstMonth)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Landing publik FixMaster: "Dua Adegan, Meja & Ponsel". Layar pertama
 * memeragakan sinkron meja → ponsel pemilik dan memasang gerbang demo (nama
 * toko + WhatsApp, migrasi 0102). Juga tersedia di /landing-preview.
 */
export function LandingPage({ onStart = defaultStart }: LandingPageProps) {
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  // Satu draf untuk kedua gerbang: nama yang diketik di hero sudah terisi saat
  // pengunjung tiba di gerbang penutup, dan sebaliknya.
  const [draft, setDraft] = useState(EMPTY_DEMO_LEAD_DRAFT);
  const returning = useSyncExternalStore(subscribeDemoVisitor, readDemoVisitorName, () => null);
  const shopName = returning ?? cleanShopName(draft.shopName);
  const [gateOffscreen, setGateOffscreen] = useState(false);
  const heroGateRef = useRef<HTMLDivElement>(null);
  const finalGateRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  // Landing selalu 100% + Lapang, sama untuk semua pengunjung. Tanpa ini
  // tampilan yang tersimpan dari app di origin yang sama bocor ke sini.
  useLayoutEffect(() => useZoomStore.getState().beginTransientView(), []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('landing.metaTitle');
    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  // Bar ponsel hanya muncul saat kedua gerbang di luar layar: ia jalan pintas
  // ke gerbang, bukan tiruan tombolnya. Ia juga mundur selama adegan layar asli
  // terlihat, karena di 320px bar menutupi bottom nav HP yang bisa diketuk.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
      setGateOffscreen(![...seen.values()].some(Boolean));
    });
    for (const node of [heroGateRef.current, finalGateRef.current, sceneRef.current]) {
      if (node) {
        seen.set(node, true);
        observer.observe(node);
      }
    }
    return () => observer.disconnect();
  }, []);

  const supportHref = waLink(FIXMASTER_WHATSAPP, t('landing.waMessage'));

  const startAuth = (intent: AuthIntent, location: string) => {
    trackEvent('landing_cta_clicked', { location, intent: intent.mode, plan: 'none' });
    onStart(intent);
  };

  const trackSupport = (location: string) =>
    trackEvent('landing_cta_clicked', { location, intent: 'support', plan: 'none' });

  // Ke gerbang yang paling dekat dari posisi gulir sekarang (dulu selalu ke
  // gerbang akhir: lompatan ±8.800px dari bagian atas halaman).
  const goToGate = () => {
    trackEvent('landing_cta_clicked', { location: 'mobile_bar', intent: 'demo', plan: 'none' });
    const gates = [heroGateRef.current, finalGateRef.current].filter(
      (node): node is HTMLDivElement => node !== null,
    );
    if (gates.length === 0) return;
    const distance = (node: HTMLElement) => Math.abs(node.getBoundingClientRect().top);
    const target = gates.reduce((best, node) => (distance(node) < distance(best) ? node : best));
    const field = target.querySelector<HTMLElement>('input, button');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      target.scrollIntoView({ behavior: 'auto', block: 'center' });
      field?.focus({ preventScroll: true });
      return;
    }
    // Fokus (dan keyboard ponsel) baru muncul setelah gulir selesai, bukan di
    // tengah animasi.
    let done = false;
    const focusField = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', focusField);
      field?.focus({ preventScroll: true });
    };
    window.addEventListener('scrollend', focusField);
    window.setTimeout(focusField, 900);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const renderVsRow = (row: Contrast) => (
    <li key={row.situation} className={styles.vsRow} data-featured={row.example ? 'true' : undefined}>
      <h3 className={styles.vsSituation}>{t(row.situation)}</h3>
      <p className={styles.vsOld}>
        <span className={styles.vsLabel}>{t('landing.vs.oldTitle')}</span>
        {t(row.old)}
      </p>
      <div className={styles.vsNew}>
        <span className={styles.vsLabel}>{t('landing.vs.newTitle')}</span>
        <p>{t(row.fixmaster)}</p>
        {row.example && (
          <p className={styles.vsTrack}>
            <Icon name="qrcode" aria-hidden />
            <span className={styles.vsTrackUrl}>{row.example}</span>
            <span className={styles.vsTrackNote}>{t('landing.vs.statusExample')}</span>
          </p>
        )}
      </div>
    </li>
  );

  return (
    <div className={styles.page}>
      <a
        className={styles.skipLink}
        href="#top"
        onClick={() => document.getElementById('top')?.focus()}
      >
        {t('landing.skipToContent')}
      </a>

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="FixMaster">
          <img src="/logo.svg" alt="" width="40" height="40" />
          <span>
            <strong>FixMaster</strong>
            <small>{t('landing.brandSub')}</small>
          </span>
        </a>

        <nav className={styles.nav} aria-label={t('landing.navLabel')}>
          <a href="#cara-kerja">{t('landing.navHow')}</a>
          <a href="#harga" className={styles.navKeep}>
            {t('landing.navPricing')}
          </a>
          <a href="#untuk-siapa">{t('landing.navWho')}</a>
        </nav>

        <div className={styles.headerActions}>
          <button
            className={styles.iconButton}
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
          </button>
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => startAuth({ mode: 'login', source: 'header' }, 'header')}
          >
            {t('landing.signIn')}
          </button>
          <button
            className={styles.outlineButton}
            type="button"
            onClick={() => startAuth({ mode: 'signup', source: 'header' }, 'header_signup')}
          >
            {t('landing.startFree')}
          </button>
        </div>
      </header>

      <main id="top" tabIndex={-1}>
        {/* ---------- Dua adegan + gerbang ---------- */}
        <section className={styles.hero} aria-labelledby="landing-hero-title">
          <div className={styles.heroCopy}>
            <h1 id="landing-hero-title">{t('landing.heroTitle')}</h1>
            <p className={styles.heroLead}>
              {interpolate(t('landing.heroLead'), {
                free: String(FREE_UNITS),
                // "Rp" tidak boleh terpisah dari angkanya di ujung baris.
                price: fmtRp(UNIT_PRICE).replace(' ', '\u00a0'),
              })}
            </p>
          </div>
          {/* Layar ≤720px: satu potongan layar HP asli sebelum formulir, supaya
              pengunjung dari tautan WA melihat aplikasinya sebelum diminta nomor. */}
          <a className={styles.heroPeek} href="#cara-kerja">
            <span className={styles.heroPeekScreen}>
              <img
                src={`/bench/${theme === 'light' ? 'light' : 'dark'}/detail-phone.webp`}
                width={585}
                height={1266}
                alt={t('landing.peek.alt')}
                decoding="async"
              />
            </span>
            <span className={styles.heroPeekText}>
              <strong>
                {shopName ? interpolate(t('landing.peek.titleShop'), { shop: shopName }) : t('landing.peek.title')}
              </strong>
              <small>{t('landing.peek.sample')}</small>
              <span className={styles.heroPeekLink}>
                {t('landing.peek.link')} <Icon name="arrow-down" aria-hidden />
              </span>
            </span>
          </a>
          <div ref={heroGateRef} id="coba" className={styles.heroGate}>
            <DemoGate source="hero" title="demoGate.title" draft={draft} onDraftChange={setDraft} />
          </div>
          <div ref={sceneRef} id="cara-kerja" className={styles.heroScene}>
            <BenchScene shopName={shopName} />
          </div>
        </section>

        {/* ---------- Konvensional vs FixMaster ---------- */}
        <section id="perbandingan" className={styles.versus} aria-labelledby="landing-vs-title">
          <div className={styles.sectionHead}>
            <h2 id="landing-vs-title">{t('landing.vsTitle')}</h2>
            <p>{t('landing.vsLead')}</p>
          </div>
          <div className={styles.vsBoard}>
            <div className={styles.vsHead} aria-hidden>
              <span />
              <span className={styles.vsHeadOld}>
                <i className={styles.vsLed} />
                <strong>{t('landing.vs.oldTitle')}</strong>
                <small>{t('landing.vs.oldSub')}</small>
              </span>
              <span className={styles.vsHeadNew}>
                <i className={styles.vsLed} />
                <strong>{t('landing.vs.newTitle')}</strong>
              </span>
            </div>
            <ul className={styles.vsList}>{CONTRASTS.slice(0, VS_VISIBLE).map(renderVsRow)}</ul>
            <details className={styles.vsMore}>
              <summary>
                <span>
                  {interpolate(t('landing.vs.more'), {
                    count: String(CONTRASTS.length - VS_VISIBLE),
                    list: CONTRASTS.slice(VS_VISIBLE)
                      .map((row) => t(row.situation))
                      .join(' · '),
                  })}
                </span>
                <Icon name="chevron-down" aria-hidden />
              </summary>
              <ul className={styles.vsList}>{CONTRASTS.slice(VS_VISIBLE).map(renderVsRow)}</ul>
            </details>
          </div>
          <p className={styles.vsFoot}>
            <strong>{t('landing.vs.foot')}</strong>
            <a href="#coba">
              {t('landing.vs.tryLink')} <Icon name="arrow-up" aria-hidden />
            </a>
          </p>
        </section>


        {/* ---------- Harga ---------- */}
        <section id="harga" className={styles.pricing} aria-labelledby="landing-price-title">
          <div className={styles.priceCopy}>
            <h2 id="landing-price-title">
              <span className={styles.priceMono}>{fmtRp(UNIT_PRICE)}</span>{' '}
              {t('landing.price.title')}
            </h2>
            <p className={styles.priceLead}>
              {interpolate(t('landing.price.lead'), {
                free: String(FREE_UNITS),
                max: fmtRp(MONTHLY_CAP_UNITS * UNIT_PRICE),
              })}
            </p>
            {/* Tiga hal yang ditonjolkan (17 Nov 2026); rincian aturan unit ada di FAQ. */}
            <ul className={styles.priceRules}>
              {PRICE_RULES.map((rule) => (
                <li key={rule.head}>
                  <strong>{interpolate(t(rule.head), priceVars)}</strong>{' '}
                  {interpolate(t(rule.note), priceVars)}
                </li>
              ))}
            </ul>
          </div>
          <CostGauge />
          <div className={styles.priceActions}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => startAuth({ mode: 'signup', source: 'pricing' }, 'pricing')}
            >
              {interpolate(t('landing.price.cta'), { free: String(FREE_UNITS) })}
            </button>
            <p>{t('landing.price.ctaNote')}</p>
          </div>
        </section>

        {/* ---------- Dari kerja sendiri sampai buka cabang ---------- */}
        <section id="untuk-siapa" className={styles.stages} aria-labelledby="landing-stages-title">
          <div className={styles.sectionHead}>
            <h2 id="landing-stages-title">{t('landing.stagesTitle')}</h2>
            <p>
              {interpolate(t('landing.stagesLead'), {
                price: fmtRp(UNIT_PRICE),
                max: fmtRp(MONTHLY_CAP_UNITS * UNIT_PRICE),
              })}
            </p>
          </div>
          <ol className={styles.stageRail}>
            {STAGES.map((stage, index) => (
              <li key={stage.title} className={styles.stage}>
                <span className={styles.stageMeter} aria-hidden>
                  {STAGES.map((other, lamp) => (
                    <i key={other.title} data-on={lamp <= index ? 'true' : undefined} />
                  ))}
                </span>
                <h3>{t(stage.title)}</h3>
                <p>{t(stage.text)}</p>
                <div className={styles.stageTools}>
                  <span className={styles.stageToolsLabel}>
                    {t(index === 0 ? 'landing.stage.toolsBase' : 'landing.stage.toolsMore')}
                  </span>
                  <ul>
                    {stage.tools.map((tool) => (
                      <li key={tool}>{t(tool)}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Jujur soal koneksi & backup ---------- */}
        <section className={styles.honest} aria-labelledby="landing-honest-title">
          <div className={styles.sectionHead}>
            <h2 id="landing-honest-title">{t('landing.honestTitle')}</h2>
            <p>{t('landing.honestLead')}</p>
          </div>
          <div className={styles.faqList}>
            {FAQ.map((item) => (
              <details key={item.question}>
                <summary>
                  {t(item.question)} <Icon name="chevron-down" aria-hidden />
                </summary>
                <p>
                  {interpolate(t(item.answer), {
                    minutes: String(REFUND_WINDOW_MINUTES),
                    floor: String(-UNIT_FLOOR),
                  })}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Gerbang penutup ---------- */}
        <section className={styles.closing} aria-labelledby="landing-closing-title">
          <div className={styles.closingCopy}>
            <h2 id="landing-closing-title">{t('landing.closingTitle')}</h2>
            <p>{t('landing.closingLead')}</p>
          </div>
          <div ref={finalGateRef} className={styles.closingGate}>
            {/* Satu judul untuk bagian ini: gerbangnya memakai judul seksi. */}
            <DemoGate
              source="final"
              labelledBy="landing-closing-title"
              draft={draft}
              onDraftChange={setDraft}
            />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src="/logo.svg" alt="" width="32" height="32" />
          <span>
            <strong>FixMaster</strong>
            <small>{t('landing.footerTagline')}</small>
          </span>
        </div>
        <div className={styles.footerLinks}>
          <Link to="/privacy">{t('landing.privacy')}</Link>
          <Link to="/terms">{t('landing.terms')}</Link>
          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackSupport('footer')}
          >
            {t('landing.whatsapp')}
          </a>
          <a href="mailto:fixmaster.cs@gmail.com">fixmaster.cs@gmail.com</a>
        </div>
        <span className={styles.location}>Cimahi</span>
      </footer>

      <div className={styles.mobileBar} data-visible={gateOffscreen ? 'true' : undefined}>
        <a className={styles.mobileBarLink} href="#harga">
          {t('landing.navPricing')}
        </a>
        <button className={styles.mobileBarDemo} type="button" onClick={goToGate}>
          {t('landing.mobileBarDemo')}
        </button>
        <a
          className={styles.mobileBarWa}
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('landing.whatsapp')}
          onClick={() => trackSupport('mobile_bar_whatsapp')}
        >
          <Icon name="whatsapp" aria-hidden />
        </a>
      </div>
    </div>
  );
}
