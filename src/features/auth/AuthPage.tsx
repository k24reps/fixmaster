import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Icon, Mascot, PasswordStrength } from '@/components/ui';
import { FormError } from '@/components/ui/Form';
import { useT, type TranslationKey } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { toast } from '@/stores/toast';
import { trackEvent } from '@/lib/analytics';
import type { AuthSource, PublicAuthMode, SignupPlan } from './auth-intent';
import styles from './AuthPage.module.css';

type Mode = 'login' | 'signup' | 'reset';

interface AuthPageProps {
  /** Return to the marketing landing page (cloud signed-out front door). */
  onBack?: () => void;
  initialMode?: PublicAuthMode;
  signupPlan?: SignupPlan;
  source?: AuthSource;
}

const TITLES: Record<Mode, {
  heading: TranslationKey;
  hint: TranslationKey;
  cta: TranslationKey;
  tag: TranslationKey;
  voltReady: TranslationKey;
  voltDetail: TranslationKey;
}> = {
  login: {
    heading: 'authPage.login.heading',
    hint: 'authPage.login.hint',
    cta: 'authPage.login.cta',
    tag: 'authPage.mode.login',
    voltReady: 'authPage.volt.loginReady',
    voltDetail: 'authPage.volt.loginDetail',
  },
  signup: {
    heading: 'authPage.signup.heading',
    hint: 'authPage.signup.hint',
    cta: 'authPage.signup.cta',
    tag: 'authPage.mode.signup',
    voltReady: 'authPage.volt.signupReady',
    voltDetail: 'authPage.volt.signupDetail',
  },
  reset: {
    heading: 'authPage.reset.heading',
    hint: 'authPage.reset.hint',
    cta: 'authPage.reset.cta',
    tag: 'authPage.mode.reset',
    voltReady: 'authPage.volt.resetReady',
    voltDetail: 'authPage.volt.resetDetail',
  },
};

// Live readout lines on the brand rail — bench "self-test" flavor.
const RAIL = [
  { k: 'authPage.rail.service', v: 'authPage.rail.serviceValue', led: 'ledOk' },
  { k: 'authPage.rail.stock', v: 'authPage.rail.stockValue', led: 'ledOk' },
  { k: 'authPage.rail.margin', v: 'authPage.rail.marginValue', led: 'ledLive' },
] as const;

/**
 * Cloud account auth screen (Supabase Auth). Shown only in cloud mode, before
 * the workspace boots. Toggles between login, signup, and password-reset.
 *
 * Signature treatment: an "access terminal" on the bench. Left panel carries
 * the FixMaster identity + a live diagnostic rail; right panel is a screwed-down
 * faceplate with a power LED, mono labels, and the auth form.
 */
export function AuthPage({
  onBack,
  initialMode = 'login',
  signupPlan,
  source = 'direct',
}: AuthPageProps = {}) {
  const t = useT();
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signupStartTracked = useRef(false);

  useEffect(() => {
    if (mode !== 'signup' || signupStartTracked.current) return;
    signupStartTracked.current = true;
    trackEvent('signup_started', {
      source,
      plan: signupPlan ?? 'unselected',
    });
  }, [mode, signupPlan, source]);

  const title = TITLES[mode];

  // Live match readout: hanya setelah user mulai mengetik konfirmasi, supaya
  // field kosong tidak langsung tampak "salah".
  const confirmMatch = confirm ? password === confirm : null;

  const validate = (): string | null => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('authPage.error.email');
    if (mode === 'reset') return null;
    if (password.length < 8) return t('authPage.error.passwordLength');
    // F3: syarat kompleksitas hanya saat signup (jangan kunci akun lama saat login).
    if (mode === 'signup' && !(/[a-zA-Z]/.test(password) && /\d/.test(password))) {
      return t('authPage.error.passwordComplexity');
    }
    if (mode === 'signup' && password !== confirm) return t('authPage.error.passwordMismatch');
    return null;
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
  };

  const submit = async () => {
    if (busy) return; // Enter bypasses the disabled button → guard double-submit.
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (mode === 'reset') {
        const { error: e } = await resetPassword(email);
        if (e) {
          setError(e);
        } else {
          toast.success(t('authPage.toast.resetSent'));
          changeMode('login');
        }
        return;
      }
      const action = mode === 'login' ? signIn : signUp;
      const { error: e } = await action(email, password);
      if (e) {
        setError(e);
        return;
      }
      if (mode === 'signup') {
        trackEvent('signup_completed', {
          source,
          plan: signupPlan ?? 'unselected',
          method: 'email',
        });
        // Email confirmation is disabled on this project, so the account is
        // active immediately — send the user straight to login (no inbox step).
        toast.success(t('authPage.toast.accountCreated'));
        changeMode('login');
        setPassword('');
        setConfirm('');
      }
      // On login success, the auth store listener flips status → app boots.
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.shell}>
        {/* ---------- Brand panel: bench identity + diagnostic rail ---------- */}
        <aside className={styles.brandPanel} aria-hidden>
          <span className={styles.grid} />
          <div className={styles.brandTop}>
            <span className={styles.brandLogo}>
              <img src="/logo.svg" alt="" width="44" height="44" />
            </span>
            <span className={styles.brandWord}>FixMaster</span>
          </div>

          <div className={styles.voltModule}>
            <span className={styles.voltTrace} />
            <Mascot variant="full" size={112} animated={false} />
            <div className={styles.voltCopy}>
              <span>{t('authPage.voltLabel')}</span>
              <strong>{t(title.voltReady)}</strong>
              <small>{t(title.voltDetail)}</small>
            </div>
          </div>

          <div className={styles.brandBody}>
            <h2 className={styles.brandTagline}>
              {t('authPage.brandTagline')}
            </h2>
            <p className={styles.brandSub}>
              {t('authPage.brandSub')}
            </p>
          </div>

          <ul className={styles.rail}>
            {RAIL.map((r) => (
              <li key={r.k} className={styles.railRow}>
                <span className={[styles.railLed, styles[r.led]].join(' ')} />
                <span className={styles.railKey}>{t(r.k)}</span>
                <span className={styles.railDots} />
                <span className={styles.railVal}>{t(r.v)}</span>
              </li>
            ))}
          </ul>

          <div className={styles.brandFoot}>{t('authPage.brandFoot')}</div>
        </aside>

        {/* ---------- Form panel: access terminal faceplate ---------- */}
        <main className={styles.formPanel}>
          <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwBL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwBR].join(' ')} aria-hidden />

          <div className={styles.mobileBrand}>
            <span className={styles.brandLogo}>
              <img src="/logo.svg" alt="" width="44" height="44" />
            </span>
            FixMaster
          </div>

          <div className={styles.mobileVolt} aria-hidden>
            <Mascot variant="face" size={44} animated={false} />
            <span>
              <small>{t('authPage.voltLabel')}</small>
              <strong>{t(title.voltReady)}</strong>
            </span>
          </div>

          <div className={styles.terminalTop}>
            {onBack && (
              <button type="button" className={styles.backBtn} onClick={onBack} aria-label={t('authPage.backHome')}>
                <Icon name="arrow-left" aria-hidden /> {t('authPage.back')}
              </button>
            )}
            <span className={[styles.led, styles.ledLive].join(' ')} aria-hidden />
            <span className={styles.terminalLabel}>{t('authPage.terminal')}</span>
            <span className={styles.modeTag}>{t(title.tag)}</span>
            <button
              type="button"
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('authPage.themeLight') : t('authPage.themeDark')}
              title={theme === 'dark' ? t('authPage.themeLight') : t('authPage.themeDark')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
            </button>
          </div>

          <h1 className={styles.heading}>{t(title.heading)}</h1>
          <p className={styles.hint}>{t(title.hint)}</p>

          <div className={styles.fields} onKeyDown={onKeyDown}>
            <Input
              noAutoCap
              type="email"
              name="email"
              label={t('authPage.email')}
              placeholder={t('authPage.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              iconLeft={<Icon name="envelope" aria-hidden />}
              autoComplete="email"
            />

            {mode !== 'reset' && (
              <Input
                noAutoCap
                revealable
                type="password"
                name="password"
                label={t('authPage.password')}
                placeholder={t('authPage.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                revealLabels={{ show: t('authPage.showPassword'), hide: t('authPage.hidePassword') }}
              />
            )}

            {mode === 'signup' && <PasswordStrength password={password} />}

            {mode === 'signup' && (
              <Input
                noAutoCap
                revealable
                type="password"
                name="confirm"
                label={t('authPage.confirmPassword')}
                placeholder={t('authPage.confirmPlaceholder')}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                revealLabels={{ show: t('authPage.showPassword'), hide: t('authPage.hidePassword') }}
                error={confirmMatch === false ? t('authPage.confirmError') : undefined}
                hint={confirmMatch === true ? t('authPage.confirmMatch') : undefined}
              />
            )}

            <FormError>{error}</FormError>

            <Button fullWidth onClick={() => void submit()} disabled={busy}>
              {busy ? t('authPage.processing') : t(title.cta)}
            </Button>

            {mode === 'signup' && (
              <p className={styles.consent}>
                {t('authPage.consentPrefix')}{' '}
                <Link to="/terms" className={styles.consentLink}>{t('authPage.terms')}</Link>{' '}
                {t('authPage.consentAnd')}{' '}
                <Link to="/privacy" className={styles.consentLink}>{t('authPage.privacy')}</Link>.
              </p>
            )}
          </div>

          <div className={styles.links}>
            {mode === 'login' && (
              <>
                <button type="button" className={styles.link} onClick={() => changeMode('reset')}>
                  {t('authPage.forgotPassword')}
                </button>
                <span className={styles.linkRow}>
                  {t('authPage.noAccount')}{' '}
                  <button type="button" className={styles.linkStrong} onClick={() => changeMode('signup')}>
                    {t('authPage.register')}
                  </button>
                </span>
              </>
            )}
            {mode === 'signup' && (
              <span className={styles.linkRow}>
                {t('authPage.haveAccount')}{' '}
                <button type="button" className={styles.linkStrong} onClick={() => changeMode('login')}>
                  {t('authPage.signIn')}
                </button>
              </span>
            )}
            {mode === 'reset' && (
              <button type="button" className={styles.link} onClick={() => changeMode('login')}>
                {t('authPage.backToSignIn')}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
