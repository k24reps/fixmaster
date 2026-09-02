import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Mascot, type IconName } from '@/components/ui';
import { FIXMASTER_WHATSAPP } from '@/config/contact';
import { PLANS, OUTLET_ADDON_PRICE, PRO_INCLUDED_OUTLETS } from '@/config/plans';
import { useT, type TranslationKey } from '@/i18n';
import { waLink } from '@/lib/business/notify';
import { fmtRp } from '@/lib/format';
import { useThemeStore } from '@/stores/theme';
import { trackEvent } from '@/lib/analytics';
import {
  authIntentHref,
  type AuthIntent,
  type SignupPlan,
} from '@/features/auth/auth-intent';
import styles from './LandingPageV2.module.css';

interface LandingPageV2Props {
  /** Optional so the public preview route can open the account flow. */
  onStart?: (intent: AuthIntent) => void;
}

interface FlowStep {
  no: string;
  icon: IconName;
  title: TranslationKey;
  text: TranslationKey;
}

const FLOW: FlowStep[] = [
  {
    no: '01',
    icon: 'receipt',
    title: 'landingV2.flow.intake.title',
    text: 'landingV2.flow.intake.text',
  },
  {
    no: '02',
    icon: 'screwdriver-wrench',
    title: 'landingV2.flow.repair.title',
    text: 'landingV2.flow.repair.text',
  },
  {
    no: '03',
    icon: 'box',
    title: 'landingV2.flow.stock.title',
    text: 'landingV2.flow.stock.text',
  },
  {
    no: '04',
    icon: 'wallet',
    title: 'landingV2.flow.money.title',
    text: 'landingV2.flow.money.text',
  },
];

const OWNER_READOUT: { icon: IconName; label: TranslationKey; value: TranslationKey }[] =
  [
    {
      icon: 'chart-line',
      label: 'landingV2.owner.margin',
      value: 'landingV2.owner.marginValue',
    },
    {
      icon: 'clock',
      label: 'landingV2.owner.turnaround',
      value: 'landingV2.owner.turnaroundValue',
    },
    { icon: 'box', label: 'landingV2.owner.stock', value: 'landingV2.owner.stockValue' },
    { icon: 'users', label: 'landingV2.owner.team', value: 'landingV2.owner.teamValue' },
  ];

const FAQ: { question: TranslationKey; answer: TranslationKey }[] = [
  { question: 'landingV2.faq.device.q', answer: 'landingV2.faq.device.a' },
  { question: 'landingV2.faq.install.q', answer: 'landingV2.faq.install.a' },
  { question: 'landingV2.faq.connection.q', answer: 'landingV2.faq.connection.a' },
  { question: 'landingV2.faq.safe.q', answer: 'landingV2.faq.safe.a' },
  { question: 'landingV2.faq.move.q', answer: 'landingV2.faq.move.a' },
];

function defaultStart(intent: AuthIntent) {
  window.location.assign(authIntentHref(intent));
}

/**
 * Public FixMaster landing page. Also available at /landing-preview for
 * stable visual review links.
 */
export function LandingPageV2({ onStart = defaultStart }: LandingPageV2Props) {
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const solo = PLANS.standard;
  const pro = PLANS.enterprise;
  const supportHref = waLink(
    FIXMASTER_WHATSAPP,
    'Halo FixMaster, saya mau tanya soal aplikasinya',
  );

  const startAuth = (intent: AuthIntent, location: string) => {
    trackEvent('landing_cta_clicked', {
      location,
      intent: intent.mode,
      plan: intent.plan ?? 'none',
    });
    onStart(intent);
  };

  const trackDemo = (location: string) => {
    trackEvent('landing_cta_clicked', { location, intent: 'demo', plan: 'none' });
  };

  const startTrial = (source: AuthIntent['source'], location: string, plan?: SignupPlan) =>
    startAuth({ mode: 'signup', source, ...(plan ? { plan } : {}) }, location);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('landingV2.metaTitle');
    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  return (
    <div className={styles.page}>
      <a
        className={styles.skipLink}
        href="#top"
        onClick={() => document.getElementById('top')?.focus()}
      >
        {t('landingV2.skipToContent')}
      </a>

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="FixMaster">
          <img src="/logo.svg" alt="" width="42" height="42" />
          <span>
            <strong>FixMaster</strong>
            <small>{t('landingV2.brandSub')}</small>
          </span>
        </a>

        <nav className={styles.nav} aria-label={t('landingV2.navLabel')}>
          <a href="#workflow">{t('landingV2.navWorkflow')}</a>
          <a href="#product">{t('landingV2.navProduct')}</a>
          <a href="#pricing">{t('landingV2.navPricing')}</a>
        </nav>

        <div className={styles.headerActions}>
          <button
            className={styles.themeButton}
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')
            }
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
          </button>
          <button
            className={styles.signInButton}
            type="button"
            onClick={() => startAuth({ mode: 'login', source: 'header' }, 'header')}
          >
            <span className={styles.liveLed} aria-hidden />
            {t('landingV2.signIn')}
          </button>
        </div>
      </header>

      <main id="top" tabIndex={-1}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.kicker}>
              <span className={styles.liveLed} aria-hidden />
              {t('landingV2.heroKicker')}
            </div>
            <h1>{t('landingV2.heroTitle')}</h1>
            <p className={styles.heroLead}>{t('landingV2.heroLead')}</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="/demo" onClick={() => trackDemo('hero')}>
                <Icon name="pulse" aria-hidden />
                {t('landingV2.openDemo')}
              </a>
              <button
                className={styles.demoButton}
                type="button"
                onClick={() => startTrial('hero', 'hero')}
              >
                {t('landingV2.startTrial')}
                <Icon name="arrow-right" aria-hidden />
              </button>
            </div>
            <p className={styles.heroFineprint}>{t('landingV2.heroFineprint')}</p>
          </div>

          <div className={styles.heroConsole} aria-label={t('landingV2.consoleLabel')}>
            <span className={styles.consoleGlow} aria-hidden />
            <div className={styles.consoleTop}>
              <span>{t('landingV2.consoleTitle')}</span>
              <span className={styles.consoleOnline}>
                <span className={styles.liveLed} aria-hidden /> {t('landingV2.online')}
              </span>
            </div>

            <div className={styles.jobCard}>
              <div className={styles.jobIdentity}>
                <span className={styles.jobNo}>FM-0241</span>
                <div>
                  <strong>iPhone 13</strong>
                  <small>{t('landingV2.jobIssue')}</small>
                </div>
                <span className={styles.jobStatus}>{t('landingV2.jobStatus')}</span>
              </div>
              <div className={styles.progressRail} aria-hidden>
                <span className={styles.progressDone} />
                <span className={styles.progressDone} />
                <span className={styles.progressLive} />
                <span />
              </div>
              <div className={styles.progressLabels}>
                <span>{t('landingV2.statusReceived')}</span>
                <span>{t('landingV2.statusDiagnosed')}</span>
                <span>{t('landingV2.statusRepair')}</span>
                <span>{t('landingV2.statusDone')}</span>
              </div>
            </div>

            <div className={styles.consoleReadouts}>
              <div>
                <small>{t('landingV2.readoutQueue')}</small>
                <strong>07</strong>
                <span>{t('landingV2.readoutUnit')}</span>
              </div>
              <div>
                <small>{t('landingV2.readoutParts')}</small>
                <strong>03</strong>
                <span>{t('landingV2.readoutWarning')}</span>
              </div>
              <div className={styles.readoutMoney}>
                <small>{t('landingV2.readoutCash')}</small>
                <strong>Rp 4,85 jt</strong>
                <span>{t('landingV2.readoutRecorded')}</span>
              </div>
            </div>

            <div className={styles.consoleMessage}>
              <span className={styles.voltConsoleDock}>
                <Mascot variant="face" size={48} animated={false} />
              </span>
              <span className={styles.consoleMessageCopy}>
                <small>VOLT // {t('landingV2.consoleCompanion')}</small>
                <strong>{t('landingV2.consoleMessage')}</strong>
              </span>
              <span className={styles.consoleSignal} aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <small>{t('landingV2.consoleSignal')}</small>
                <strong>{t('landingV2.consoleSignalValue')}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className={styles.painRail} aria-label={t('landingV2.painLabel')}>
          <span>
            <Icon name="whatsapp" aria-hidden /> {t('landingV2.painCustomer')}
          </span>
          <span>
            <Icon name="box" aria-hidden /> {t('landingV2.painStock')}
          </span>
          <span>
            <Icon name="wallet" aria-hidden /> {t('landingV2.painMargin')}
          </span>
          <span>
            <Icon name="users" aria-hidden /> {t('landingV2.painTeam')}
          </span>
        </section>

        <section id="workflow" className={styles.workflowSection}>
          <span className={styles.wellScan} aria-hidden />
          <div className={styles.workflowInner}>
            <div className={styles.sectionIntro}>
              <span className={styles.sectionLabel}>{t('landingV2.workflowKicker')}</span>
              <h2>{t('landingV2.workflowTitle')}</h2>
              <p>{t('landingV2.workflowLead')}</p>
            </div>

            <ol className={styles.flowTrack}>
              {FLOW.map((step) => (
                <li key={step.no} className={styles.flowStep}>
                  <span className={styles.flowNo}>{step.no}</span>
                  <span className={styles.flowIcon}>
                    <Icon name={step.icon} aria-hidden />
                  </span>
                  <div>
                    <h3>{t(step.title)}</h3>
                    <p>{t(step.text)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="owner-proof" className={styles.ownerSection}>
          <div className={styles.ownerPlate}>
            <h2>{t('landingV2.ownerTitle')}</h2>
            <p>{t('landingV2.ownerLead')}</p>
            <ul className={styles.ownerReadouts}>
              {OWNER_READOUT.map((item) => (
                <li key={item.label} className={styles.ownerReadout}>
                  <Icon name={item.icon} aria-hidden />
                  <span>{t(item.label)}</span>
                  <i aria-hidden />
                  <strong>{t(item.value)}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.ticketStack} aria-label={t('landingV2.ticketLabel')}>
            <article className={styles.ticketGhost} aria-hidden />
            <article className={styles.ticket}>
              <header>
                <span className={styles.ticketHeading}>
                  <span>{t('landingV2.ticketTitle')}</span>
                  <small>{t('landingV2.ticketExample')}</small>
                </span>
                <strong>FM-0241</strong>
              </header>
              <dl>
                <div>
                  <dt>{t('landingV2.ticketCustomer')}</dt>
                  <dd>Raka Pratama</dd>
                </div>
                <div>
                  <dt>{t('landingV2.ticketDevice')}</dt>
                  <dd>iPhone 13 · 128 GB</dd>
                </div>
                <div>
                  <dt>{t('landingV2.ticketProblem')}</dt>
                  <dd>{t('landingV2.jobIssue')}</dd>
                </div>
                <div>
                  <dt>{t('landingV2.ticketTechnician')}</dt>
                  <dd>Sari Dewi</dd>
                </div>
              </dl>
              <div
                className={styles.marginCalculation}
                role="group"
                aria-label={t('landingV2.ticketMarginCalculation')}
              >
                <div className={styles.marginInputs}>
                  <span className={styles.marginTerm}>
                    <small>{t('landingV2.ticketRevenue')}</small>
                    <strong>Rp 1.250.000</strong>
                  </span>
                  <span className={styles.marginOperator} aria-hidden>
                    −
                  </span>
                  <span className={styles.marginTerm}>
                    <small>{t('landingV2.ticketPartsCost')}</small>
                    <strong>Rp 830.000</strong>
                  </span>
                </div>
                <span
                  className={[
                    styles.marginTerm,
                    styles.marginResult,
                    styles.ticketPositive,
                  ].join(' ')}
                >
                  <small>{t('landingV2.ticketMargin')}</small>
                  <strong>Rp 420.000</strong>
                </span>
              </div>
              <footer>
                <span>
                  <span className={styles.liveLed} aria-hidden />{' '}
                  {t('landingV2.jobStatus')}
                </span>
                <span>{t('landingV2.ticketUpdated')}</span>
              </footer>
            </article>
          </div>
        </section>

        <section id="product" className={styles.productSection}>
          <div className={styles.productCopy}>
            <h2>{t('landingV2.productTitle')}</h2>
            <p>{t('landingV2.productLead')}</p>
            <a className={styles.textLink} href="/demo" onClick={() => trackDemo('product_copy')}>
              {t('landingV2.openDemo')} <Icon name="arrow-right" aria-hidden />
            </a>
          </div>
          <div className={styles.productVisuals}>
            <a
              className={styles.productFrame}
              href="/demo"
              aria-label={t('landingV2.openDemoDesktop')}
              onClick={() => trackDemo('product_desktop')}
            >
              <span className={styles.frameBar}>
                <i />
                <i />
                <i />
                <b>{t('landingV2.productDesktop')} // fixmaster.app/demo</b>
                <em>{t('landingV2.online')}</em>
              </span>
              <img
                className={styles.productShotDark}
                src="/screenshots/demo-dashboard-dark.png"
                alt={t('landingV2.productAlt')}
                width="2160"
                height="1440"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
              <img
                className={styles.productShotLight}
                src="/screenshots/demo-dashboard-light.png"
                alt=""
                aria-hidden
                width="2160"
                height="1440"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
              <span className={styles.frameLaunch}>
                <Icon name="arrow-square-out" aria-hidden /> {t('landingV2.tryNow')}
              </span>
            </a>

            <a
              className={styles.mobileFrame}
              href="/demo"
              aria-label={t('landingV2.openDemoMobile')}
              onClick={() => trackDemo('product_mobile')}
            >
              <span className={styles.phoneEarpiece} aria-hidden />
              <span className={styles.phoneCamera} aria-hidden />
              <span className={styles.mobileScreen}>
                <img
                  className={styles.mobileShotDark}
                  src="/screenshots/demo-mobile-dark.png"
                  alt={t('landingV2.productMobileAlt')}
                  width="390"
                  height="844"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <img
                  className={styles.mobileShotLight}
                  src="/screenshots/demo-mobile-light.png"
                  alt=""
                  aria-hidden
                  width="390"
                  height="844"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              </span>
              <span className={styles.phoneHome} aria-hidden />
            </a>
          </div>
        </section>

        <section id="pricing" className={styles.pricingSection}>
          <div className={styles.sectionIntro}>
            <h2>{t('landingV2.pricingTitle')}</h2>
            <p>{t('landingV2.pricingLead')}</p>
          </div>
          <div className={styles.priceGrid}>
            <article className={styles.pricePlate}>
              <div className={styles.priceHead}>
                <div>
                  <span>{t('landingV2.soloTag')}</span>
                  <h3>{solo.name}</h3>
                </div>
                <strong>{solo.priceLabel}</strong>
              </div>
              <p>{t('landingV2.soloText')}</p>
              <ul>
                <li>
                  <Icon name="check" aria-hidden /> {t('landingV2.soloFeature1')}
                </li>
                <li>
                  <Icon name="check" aria-hidden /> {t('landingV2.soloFeature2')}
                </li>
                <li>
                  <Icon name="check" aria-hidden /> {t('landingV2.soloFeature3')}
                </li>
              </ul>
              <button
                type="button"
                onClick={() => startTrial('pricing_solo', 'pricing_solo', 'standard')}
              >
                {t('landingV2.chooseSolo')}
              </button>
            </article>

            <article className={[styles.pricePlate, styles.priceFeatured].join(' ')}>
              <span className={styles.recommended}>
                <span className={styles.liveLed} /> {t('landingV2.recommended')}
              </span>
              <div className={styles.priceHead}>
                <div>
                  <span>{t('landingV2.proTag')}</span>
                  <h3>{pro.name}</h3>
                </div>
                <strong>{pro.priceLabel}</strong>
              </div>
              <p>{t('landingV2.proText')}</p>
              <ul>
                <li>
                  <Icon name="check" aria-hidden /> {t('landingV2.proFeature1')}
                </li>
                <li>
                  <Icon name="check" aria-hidden /> {t('landingV2.proFeature2')}
                </li>
                <li>
                  <Icon name="check" aria-hidden /> {PRO_INCLUDED_OUTLETS}{' '}
                  {t('landingV2.proFeature3')} (+{fmtRp(OUTLET_ADDON_PRICE)}/outlet)
                </li>
              </ul>
              <button
                type="button"
                onClick={() => startTrial('pricing_pro', 'pricing_pro', 'enterprise')}
              >
                {t('landingV2.choosePro')}
              </button>
            </article>
          </div>
        </section>

        <section className={styles.faqSection}>
          <div className={styles.faqHead}>
            <h2>{t('landingV2.faqTitle')}</h2>
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

        <section id="start" className={styles.finalCta}>
          <div className={styles.voltBay}>
            <span className={styles.voltBayTrace} aria-hidden />
            <Mascot variant="full" size={150} />
            <div className={styles.voltBayStatus}>
              <span className={styles.liveLed} aria-hidden />
              <span>
                <small>{t('landingV2.finalVoltLabel')}</small>
                <strong>{t('landingV2.finalVoltStatus')}</strong>
              </span>
            </div>
          </div>
          <div className={styles.finalCtaCopy}>
            <span className={styles.sectionLabel}>{t('landingV2.finalKicker')}</span>
            <h2>{t('landingV2.finalTitle')}</h2>
            <p>{t('landingV2.finalLead')}</p>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => startTrial('final_cta', 'final_cta')}
          >
            {t('landingV2.startTrial')} <Icon name="arrow-right" aria-hidden />
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src="/logo.svg" alt="" width="36" height="36" />
          <span>
            <strong>FixMaster</strong>
            <small>{t('landingV2.footerTagline')}</small>
          </span>
        </div>
        <div className={styles.footerLinks}>
          <Link to="/privacy">{t('landingV2.privacy')}</Link>
          <Link to="/terms">{t('landingV2.terms')}</Link>
          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent('landing_cta_clicked', {
                location: 'footer',
                intent: 'support',
                plan: 'none',
              })
            }
          >
            {t('landingV2.whatsapp')}
          </a>
          <a href="mailto:fixmaster.cs@gmail.com">fixmaster.cs@gmail.com</a>
        </div>
        <span className={styles.serial}>FX-{new Date().getFullYear()} // CIMAHI</span>
      </footer>

      <a
        className={styles.whatsapp}
        href={supportHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('landingV2.whatsapp')}
        onClick={() =>
          trackEvent('landing_cta_clicked', {
            location: 'floating_whatsapp',
            intent: 'support',
            plan: 'none',
          })
        }
      >
        <span className={styles.liveLed} aria-hidden />
        <Icon name="whatsapp" aria-hidden />
        <span>{t('landingV2.whatsapp')}</span>
      </a>
    </div>
  );
}
