import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui';
import { FIXMASTER_WHATSAPP } from '@/config/contact';
import {
  FREE_UNITS,
  MIN_TOPUP,
  REFUND_WINDOW_MINUTES,
  UNIT_FLOOR,
  UNIT_PRICE,
} from '@/config/pricing';
import { useT, type TranslationKey } from '@/i18n';
import { interpolate, waLink } from '@/lib/business/notify';
import { fmtRp } from '@/lib/format';
import { readDemoVisitor } from '@/lib/demoVisitor';
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

interface Trail {
  icon: IconName;
  place: TranslationKey;
  text: TranslationKey;
  value: string;
}

const TRAILS: Trail[] = [
  { icon: 'box', place: 'landing.trail.stock', text: 'landing.trail.stockText', value: '−1' },
  { icon: 'receipt', place: 'landing.trail.ticket', text: 'landing.trail.ticketText', value: 'Rp 170.000' },
  { icon: 'users', place: 'landing.trail.customer', text: 'landing.trail.customerText', value: '+1' },
  { icon: 'wallet', place: 'landing.trail.cash', text: 'landing.trail.cashText', value: '+Rp 350.000' },
];

interface Drawer {
  icon: IconName;
  label: TranslationKey;
}

const DRAWERS: Drawer[] = [
  { icon: 'device-mobile', label: 'landing.bench.phone' },
  { icon: 'laptop', label: 'landing.bench.laptop' },
  { icon: 'device-tablet', label: 'landing.bench.tablet' },
  { icon: 'print', label: 'landing.bench.printer' },
  { icon: 'television', label: 'landing.bench.tv' },
  { icon: 'speaker', label: 'landing.bench.audio' },
  { icon: 'game-controller', label: 'landing.bench.console' },
  { icon: 'cooking-pot', label: 'landing.bench.home' },
];

interface Module {
  icon: IconName;
  name: TranslationKey;
  text: TranslationKey;
}

const MODULES: Module[] = [
  { icon: 'screwdriver-wrench', name: 'nav.services', text: 'landing.mod.services' },
  { icon: 'calculator', name: 'nav.calculator', text: 'landing.mod.calculator' },
  { icon: 'cash-register', name: 'nav.pos', text: 'landing.mod.pos' },
  { icon: 'users', name: 'nav.customers', text: 'landing.mod.customers' },
  { icon: 'truck-field', name: 'nav.suppliers', text: 'landing.mod.suppliers' },
  { icon: 'wallet', name: 'nav.finance', text: 'landing.mod.finance' },
  { icon: 'list-check', name: 'nav.tasks', text: 'landing.mod.tasks' },
  { icon: 'map-pin', name: 'nav.attendance', text: 'landing.mod.attendance' },
  { icon: 'chart-line', name: 'nav.reports', text: 'landing.mod.reports' },
  { icon: 'clock-rotate-left', name: 'nav.activity', text: 'landing.mod.activity' },
  { icon: 'buildings', name: 'landing.mod.outletsName', text: 'landing.mod.outlets' },
  { icon: 'whatsapp', name: 'landing.mod.waName', text: 'landing.mod.wa' },
];

const FAQ: { question: TranslationKey; answer: TranslationKey }[] = [
  { question: 'landing.faq.connection.q', answer: 'landing.faq.connection.a' },
  { question: 'landing.faq.safe.q', answer: 'landing.faq.safe.a' },
  { question: 'landing.faq.device.q', answer: 'landing.faq.device.a' },
  { question: 'landing.faq.install.q', answer: 'landing.faq.install.a' },
  { question: 'landing.faq.move.q', answer: 'landing.faq.move.a' },
  { question: 'landing.faq.pay.q', answer: 'landing.faq.pay.a' },
];

/** Gauge biaya: rentang wajar toko kecil sampai toko dua cabang yang ramai. */
const GAUGE_MIN = 10;
const GAUGE_MAX = 600;
const GAUGE_STEP = 10;
const GAUGE_DEFAULT = 150;
const GAUGE_TICKS = 30;

function defaultStart(intent: AuthIntent) {
  window.location.assign(authIntentHref(intent));
}

function CostGauge() {
  const t = useT();
  const [units, setUnits] = useState(GAUGE_DEFAULT);
  const cost = units * UNIT_PRICE;
  const firstMonth = Math.max(0, units - FREE_UNITS) * UNIT_PRICE;
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
          <span key={i} data-on={i < Math.max(1, lit) ? 'true' : undefined} />
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
      <dl className={styles.wellFacts}>
        <div>
          <dt>{t('landing.price.units')}</dt>
          <dd>{units}</dd>
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
  const [shopName, setShopName] = useState(() => readDemoVisitor()?.shopName ?? '');
  const [gateOffscreen, setGateOffscreen] = useState(false);
  const heroGateRef = useRef<HTMLDivElement>(null);
  const finalGateRef = useRef<HTMLDivElement>(null);

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
  // ke gerbang, bukan tiruan tombolnya.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
      setGateOffscreen(![...seen.values()].some(Boolean));
    });
    for (const node of [heroGateRef.current, finalGateRef.current]) {
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

  const goToGate = () => {
    trackEvent('landing_cta_clicked', { location: 'mobile_bar', intent: 'demo', plan: 'none' });
    const target = finalGateRef.current;
    if (!target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    target.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
  };

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
          <a href="#harga">{t('landing.navPricing')}</a>
          <a href="#cerita">{t('landing.navStory')}</a>
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
        {/* ---------- 1. Dua adegan + gerbang ---------- */}
        <section className={styles.hero} aria-labelledby="landing-hero-title">
          <div className={styles.heroCopy}>
            <h1 id="landing-hero-title">{t('landing.heroTitle')}</h1>
            <p className={styles.heroLead}>{t('landing.heroLead')}</p>
          </div>
          <div ref={heroGateRef} className={styles.heroGate}>
            <DemoGate source="hero" title="demoGate.title" onShopNameChange={setShopName} />
          </div>
          <div className={styles.heroScene}>
            <BenchScene shopName={shopName} />
          </div>
        </section>

        {/* ---------- 2. Satu aksi, empat jejak ---------- */}
        <section id="cara-kerja" className={styles.trails} aria-labelledby="landing-trails-title">
          <div className={styles.sectionHead}>
            <h2 id="landing-trails-title">{t('landing.trailsTitle')}</h2>
            <p>{t('landing.trailsLead')}</p>
          </div>
          <div className={styles.trailBoard}>
            <div className={styles.trailSource}>
              <span className={styles.trailSourceLed} aria-hidden />
              <span>
                <small>FM-0312</small>
                <strong>{t('landing.trailSource')}</strong>
              </span>
            </div>
            <ul className={styles.trailList}>
              {TRAILS.map((trail) => (
                <li key={trail.place} className={styles.trail}>
                  <span className={styles.trailIcon}>
                    <Icon name={trail.icon} aria-hidden />
                  </span>
                  <span className={styles.trailBody}>
                    <strong>{t(trail.place)}</strong>
                    <span>{t(trail.text)}</span>
                  </span>
                  <span className={styles.trailValue}>{trail.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- 3. Untuk semua meja reparasi ---------- */}
        <section className={styles.benches} aria-labelledby="landing-benches-title">
          <div className={styles.sectionHead}>
            <h2 id="landing-benches-title">{t('landing.benchesTitle')}</h2>
            <p>{t('landing.benchesLead')}</p>
          </div>
          <ul className={styles.cabinet} aria-label={t('landing.cabinetLabel')}>
            {DRAWERS.map((drawer) => (
              <li key={drawer.label} className={styles.drawer}>
                <span className={styles.drawerPull} aria-hidden />
                <Icon name={drawer.icon} aria-hidden />
                <span>{t(drawer.label)}</span>
              </li>
            ))}
            <li className={[styles.drawer, styles.drawerAdd].join(' ')}>
              <span className={styles.drawerPull} aria-hidden />
              <Icon name="plus" aria-hidden />
              <span>{t('landing.bench.yours')}</span>
            </li>
          </ul>
        </section>

        {/* ---------- 4. Modul ---------- */}
        <section className={styles.modules} aria-labelledby="landing-modules-title">
          <div className={styles.sectionHead}>
            <h2 id="landing-modules-title">{t('landing.modulesTitle')}</h2>
            <p>{t('landing.modulesLead')}</p>
          </div>
          <ul className={styles.channelList}>
            {MODULES.map((mod) => (
              <li key={mod.text} className={styles.channel}>
                <span className={styles.channelIcon}>
                  <Icon name={mod.icon} aria-hidden />
                </span>
                <span className={styles.channelBody}>
                  <strong>{t(mod.name)}</strong>
                  <span>{t(mod.text)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- 5. Founder ---------- */}
        <section id="cerita" className={styles.founder} aria-labelledby="landing-founder-title">
          <div className={styles.nameplate} aria-hidden>
            <span className={styles.nameplateScrew} />
            <span className={styles.nameplateMark}>RIF</span>
            <span className={styles.nameplateScrew} />
          </div>
          <div className={styles.founderCopy}>
            <h2 id="landing-founder-title">{t('landing.founderTitle')}</h2>
            <p>{t('landing.founderStory1')}</p>
            <p>{t('landing.founderStory2')}</p>
            <p className={styles.founderSign}>
              <strong>Rif</strong>
              <span>{t('landing.founderRole')}</span>
            </p>
            <dl className={styles.founderFacts}>
              <div>
                <dt>{t('landing.founderSince')}</dt>
                <dd>2019</dd>
              </div>
              <div>
                <dt>{t('landing.founderShops')}</dt>
                <dd>2</dd>
              </div>
              <div>
                <dt>{t('landing.founderStaff')}</dt>
                <dd>3</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ---------- 6. Harga ---------- */}
        <section id="harga" className={styles.pricing} aria-labelledby="landing-price-title">
          <div className={styles.priceCopy}>
            <h2 id="landing-price-title">
              <span className={styles.priceMono}>{fmtRp(UNIT_PRICE)}</span>{' '}
              {t('landing.price.title')}
            </h2>
            <p className={styles.priceLead}>
              {interpolate(t('landing.price.lead'), { free: String(FREE_UNITS) })}
            </p>
            <ul className={styles.priceRules}>
              <li>{t('landing.price.ruleFree')}</li>
              <li>
                {interpolate(t('landing.price.ruleRefund'), {
                  minutes: String(REFUND_WINDOW_MINUTES),
                })}
              </li>
              <li>{interpolate(t('landing.price.ruleTopup'), { min: fmtRp(MIN_TOPUP) })}</li>
              <li>{interpolate(t('landing.price.ruleFloor'), { floor: String(-UNIT_FLOOR) })}</li>
            </ul>
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
          </div>
          <CostGauge />
        </section>

        {/* ---------- 7. Jujur soal koneksi & backup ---------- */}
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
                <p>{t(item.answer)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- 8. Gerbang penutup ---------- */}
        <section className={styles.closing} aria-labelledby="landing-closing-title">
          <div className={styles.closingCopy}>
            <h2 id="landing-closing-title">{t('landing.closingTitle')}</h2>
            <p>{t('landing.closingLead')}</p>
          </div>
          <div ref={finalGateRef} className={styles.closingGate}>
            <DemoGate source="final" title="demoGate.titleFinal" onShopNameChange={setShopName} />
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
        <span className={styles.location}>CIMAHI</span>
      </footer>

      <div className={styles.mobileBar} data-visible={gateOffscreen ? 'true' : undefined}>
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
