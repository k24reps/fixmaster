import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Mascot, type IconName } from '@/components/ui';
import { PLANS, OUTLET_ADDON_PRICE, PRO_INCLUDED_OUTLETS } from '@/config/plans';
import { useT, type TranslationKey } from '@/i18n';
import { fmtRp } from '@/lib/format';
import { useThemeStore } from '@/stores/theme';
import styles from './LandingPageV2.module.css';

interface LandingPageV2Props {
  /** Optional so this page can live at /landing-preview before replacing V1. */
  onStart?: () => void;
}

interface FlowStep {
  no: string;
  icon: IconName;
  title: TranslationKey;
  text: TranslationKey;
}

const FLOW: FlowStep[] = [
  { no: '01', icon: 'receipt', title: 'landingV2.flow.intake.title', text: 'landingV2.flow.intake.text' },
  { no: '02', icon: 'screwdriver-wrench', title: 'landingV2.flow.repair.title', text: 'landingV2.flow.repair.text' },
  { no: '03', icon: 'box', title: 'landingV2.flow.stock.title', text: 'landingV2.flow.stock.text' },
  { no: '04', icon: 'wallet', title: 'landingV2.flow.money.title', text: 'landingV2.flow.money.text' },
];

const OWNER_READOUT: { icon: IconName; label: TranslationKey; value: TranslationKey }[] = [
  { icon: 'chart-line', label: 'landingV2.owner.margin', value: 'landingV2.owner.marginValue' },
  { icon: 'clock', label: 'landingV2.owner.turnaround', value: 'landingV2.owner.turnaroundValue' },
  { icon: 'box', label: 'landingV2.owner.stock', value: 'landingV2.owner.stockValue' },
  { icon: 'users', label: 'landingV2.owner.team', value: 'landingV2.owner.teamValue' },
];

const FAQ: { question: TranslationKey; answer: TranslationKey }[] = [
  { question: 'landingV2.faq.offline.q', answer: 'landingV2.faq.offline.a' },
  { question: 'landingV2.faq.device.q', answer: 'landingV2.faq.device.a' },
  { question: 'landingV2.faq.safe.q', answer: 'landingV2.faq.safe.a' },
  { question: 'landingV2.faq.move.q', answer: 'landingV2.faq.move.a' },
];

function defaultStart() {
  window.location.assign('/?auth=1');
}

/**
 * Candidate landing page. Kept separate from LandingPage V1 so it can be
 * reviewed at /landing-preview without changing the signed-out front door.
 */
export function LandingPageV2({ onStart = defaultStart }: LandingPageV2Props) {
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const solo = PLANS.standard;
  const pro = PLANS.enterprise;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t('landingV2.metaTitle');
    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  return (
    <div className={styles.page}>
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
            aria-label={theme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
          </button>
          <button className={styles.signInButton} type="button" onClick={onStart}>
            <span className={styles.liveLed} aria-hidden />
            {t('landingV2.signIn')}
          </button>
        </div>
      </header>

      <main id="top">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.kicker}>
              <span className={styles.liveLed} aria-hidden />
              {t('landingV2.heroKicker')}
            </div>
            <h1>{t('landingV2.heroTitle')}</h1>
            <p className={styles.heroLead}>{t('landingV2.heroLead')}</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} type="button" onClick={onStart}>
                {t('landingV2.startTrial')}
                <Icon name="arrow-right" aria-hidden />
              </button>
              <a className={styles.demoButton} href="/demo">
                <Icon name="pulse" aria-hidden />
                {t('landingV2.openDemo')}
              </a>
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
              <Mascot variant="face" size={42} animated={false} />
              <span>
                <small>VOLT // {t('landingV2.consoleAssistant')}</small>
                <strong>{t('landingV2.consoleMessage')}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className={styles.trustRail} aria-label={t('landingV2.trustLabel')}>
          <span><Icon name="lightning" aria-hidden /> {t('landingV2.trustOffline')}</span>
          <span><Icon name="shield-halved" aria-hidden /> {t('landingV2.trustSecure')}</span>
          <span><Icon name="download" aria-hidden /> {t('landingV2.trustBackup')}</span>
          <span><Icon name="check-circle" aria-hidden /> {t('landingV2.trustNoContract')}</span>
        </section>

        <section id="workflow" className={styles.workflowSection}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionIndex}>01 // {t('landingV2.workflowKicker')}</span>
            <h2>{t('landingV2.workflowTitle')}</h2>
            <p>{t('landingV2.workflowLead')}</p>
          </div>

          <ol className={styles.flowTrack}>
            {FLOW.map((step) => (
              <li key={step.no} className={styles.flowStep}>
                <span className={styles.flowNo}>{step.no}</span>
                <span className={styles.flowIcon}><Icon name={step.icon} aria-hidden /></span>
                <div>
                  <h3>{t(step.title)}</h3>
                  <p>{t(step.text)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.ownerSection}>
          <div className={styles.ownerPlate}>
            <span className={styles.sectionIndex}>02 // {t('landingV2.ownerKicker')}</span>
            <h2>{t('landingV2.ownerTitle')}</h2>
            <p>{t('landingV2.ownerLead')}</p>
            <div className={styles.ownerReadouts}>
              {OWNER_READOUT.map((item) => (
                <div key={item.label} className={styles.ownerReadout}>
                  <Icon name={item.icon} aria-hidden />
                  <span>{t(item.label)}</span>
                  <strong>{t(item.value)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.ticketStack} aria-label={t('landingV2.ticketLabel')}>
            <article className={styles.ticketGhost} aria-hidden />
            <article className={styles.ticket}>
              <header>
                <span>{t('landingV2.ticketTitle')}</span>
                <strong>FM-0241</strong>
              </header>
              <dl>
                <div><dt>{t('landingV2.ticketCustomer')}</dt><dd>Raka Pratama</dd></div>
                <div><dt>{t('landingV2.ticketDevice')}</dt><dd>iPhone 13 · 128 GB</dd></div>
                <div><dt>{t('landingV2.ticketProblem')}</dt><dd>{t('landingV2.jobIssue')}</dd></div>
                <div><dt>{t('landingV2.ticketTechnician')}</dt><dd>Sari Dewi</dd></div>
                <div><dt>{t('landingV2.ticketCost')}</dt><dd>Rp 1.250.000</dd></div>
                <div><dt>{t('landingV2.ticketMargin')}</dt><dd className={styles.ticketPositive}>Rp 420.000</dd></div>
              </dl>
              <footer>
                <span><span className={styles.liveLed} aria-hidden /> {t('landingV2.jobStatus')}</span>
                <span>{t('landingV2.ticketUpdated')}</span>
              </footer>
            </article>
          </div>
        </section>

        <section id="product" className={styles.productSection}>
          <div className={styles.productCopy}>
            <span className={styles.sectionIndex}>03 // {t('landingV2.productKicker')}</span>
            <h2>{t('landingV2.productTitle')}</h2>
            <p>{t('landingV2.productLead')}</p>
            <a className={styles.textLink} href="/demo">
              {t('landingV2.openDemo')} <Icon name="arrow-right" aria-hidden />
            </a>
          </div>
          <div className={styles.productVisuals}>
            <a className={styles.productFrame} href="/demo" aria-label={t('landingV2.openDemoDesktop')}>
              <span className={styles.frameBar}>
                <i /><i /><i />
                <b>{t('landingV2.productDesktop')} // fixmaster.app/demo</b>
                <em>{t('landingV2.online')}</em>
              </span>
              <img
                className={styles.productShotDark}
                src="/screenshots/demo-dashboard-dark.png"
                alt={t('landingV2.productAlt')}
                loading="lazy"
              />
              <img
                className={styles.productShotLight}
                src="/screenshots/demo-dashboard-light.png"
                alt=""
                aria-hidden
                loading="lazy"
              />
              <span className={styles.frameLaunch}>
                <Icon name="arrow-square-out" aria-hidden /> {t('landingV2.tryNow')}
              </span>
            </a>

            <a className={styles.mobileFrame} href="/demo" aria-label={t('landingV2.openDemoMobile')}>
              <span className={styles.phoneEarpiece} aria-hidden />
              <span className={styles.phoneCamera} aria-hidden />
              <span className={styles.mobileScreen}>
                <img
                  className={styles.mobileShotDark}
                  src="/screenshots/demo-mobile-dark.png"
                  alt={t('landingV2.productMobileAlt')}
                  loading="lazy"
                />
                <img
                  className={styles.mobileShotLight}
                  src="/screenshots/demo-mobile-light.png"
                  alt=""
                  aria-hidden
                  loading="lazy"
                />
              </span>
              <span className={styles.phoneHome} aria-hidden />
            </a>
          </div>
        </section>

        <section id="pricing" className={styles.pricingSection}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionIndex}>04 // {t('landingV2.pricingKicker')}</span>
            <h2>{t('landingV2.pricingTitle')}</h2>
            <p>{t('landingV2.pricingLead')}</p>
          </div>
          <div className={styles.priceGrid}>
            <article className={styles.pricePlate}>
              <div className={styles.priceHead}>
                <div><span>{t('landingV2.soloTag')}</span><h3>{solo.name}</h3></div>
                <strong>{solo.priceLabel}</strong>
              </div>
              <p>{t('landingV2.soloText')}</p>
              <ul>
                <li><Icon name="check" aria-hidden /> {t('landingV2.soloFeature1')}</li>
                <li><Icon name="check" aria-hidden /> {t('landingV2.soloFeature2')}</li>
                <li><Icon name="check" aria-hidden /> {t('landingV2.soloFeature3')}</li>
              </ul>
              <button type="button" onClick={onStart}>{t('landingV2.chooseSolo')}</button>
            </article>

            <article className={[styles.pricePlate, styles.priceFeatured].join(' ')}>
              <span className={styles.recommended}><span className={styles.liveLed} /> {t('landingV2.recommended')}</span>
              <div className={styles.priceHead}>
                <div><span>{t('landingV2.proTag')}</span><h3>{pro.name}</h3></div>
                <strong>{pro.priceLabel}</strong>
              </div>
              <p>{t('landingV2.proText')}</p>
              <ul>
                <li><Icon name="check" aria-hidden /> {t('landingV2.proFeature1')}</li>
                <li><Icon name="check" aria-hidden /> {t('landingV2.proFeature2')}</li>
                <li><Icon name="check" aria-hidden /> {PRO_INCLUDED_OUTLETS} {t('landingV2.proFeature3')} (+{fmtRp(OUTLET_ADDON_PRICE)}/outlet)</li>
              </ul>
              <button type="button" onClick={onStart}>{t('landingV2.choosePro')}</button>
            </article>
          </div>
        </section>

        <section className={styles.faqSection}>
          <div>
            <span className={styles.sectionIndex}>05 // FAQ</span>
            <h2>{t('landingV2.faqTitle')}</h2>
          </div>
          <div className={styles.faqList}>
            {FAQ.map((item) => (
              <details key={item.question}>
                <summary>{t(item.question)} <Icon name="chevron-down" aria-hidden /></summary>
                <p>{t(item.answer)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <Mascot variant="full" size={104} />
          <div>
            <span className={styles.sectionIndex}>{t('landingV2.finalKicker')}</span>
            <h2>{t('landingV2.finalTitle')}</h2>
            <p>{t('landingV2.finalLead')}</p>
          </div>
          <button className={styles.primaryButton} type="button" onClick={onStart}>
            {t('landingV2.startTrial')} <Icon name="arrow-right" aria-hidden />
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src="/logo.svg" alt="" width="36" height="36" />
          <span><strong>FixMaster</strong><small>{t('landingV2.footerTagline')}</small></span>
        </div>
        <div className={styles.footerLinks}>
          <Link to="/privacy">{t('landingV2.privacy')}</Link>
          <Link to="/terms">{t('landingV2.terms')}</Link>
          <a href="mailto:fixmaster.cs@gmail.com">fixmaster.cs@gmail.com</a>
        </div>
        <span className={styles.serial}>FX-{new Date().getFullYear()} // CIMAHI</span>
      </footer>

      <a
        className={styles.whatsapp}
        href="https://wa.me/628995318638?text=Halo%20FixMaster%2C%20saya%20mau%20tanya%20soal%20aplikasinya"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('landingV2.whatsapp')}
      >
        <span className={styles.liveLed} aria-hidden />
        <Icon name="whatsapp" aria-hidden />
        <span>{t('landingV2.whatsapp')}</span>
      </a>
    </div>
  );
}
