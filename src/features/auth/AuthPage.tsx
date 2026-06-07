import { useState } from 'react';
import { Button, Input, Icon } from '@/components/ui';
import { FormError } from '@/components/ui/Form';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import styles from './AuthPage.module.css';

type Mode = 'login' | 'signup' | 'reset';

const TITLES: Record<Mode, { heading: string; hint: string; cta: string }> = {
  login: { heading: 'Masuk ke FixMaster', hint: 'Nyalakan kembali meja kerjamu', cta: 'Masuk' },
  signup: { heading: 'Daftar Akun Baru', hint: 'Mulai uji coba 14 hari gratis', cta: 'Daftar' },
  reset: { heading: 'Reset Password', hint: 'Kirim tautan ke emailmu', cta: 'Kirim Tautan' },
};

// Live readout lines on the brand rail — bench "self-test" flavor.
const RAIL = [
  { k: 'BENCH', v: 'ONLINE', led: 'ledOk' },
  { k: 'DATA', v: 'TERSINKRON', led: 'ledOk' },
  { k: 'QRIS', v: 'SIAP', led: 'ledLive' },
] as const;

/**
 * Cloud account auth screen (Supabase Auth). Shown only in cloud mode, before
 * the workspace boots. Toggles between login, signup, and password-reset.
 *
 * Signature treatment: an "access terminal" on the bench. Left panel carries
 * the FixMaster identity + a live diagnostic rail; right panel is a screwed-down
 * faceplate with a power LED, mono labels, and the auth form.
 */
export function AuthPage() {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const t = TITLES[mode];

  const validate = (): string | null => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email tidak valid';
    if (mode === 'reset') return null;
    if (password.length < 8) return 'Password minimal 8 karakter';
    if (mode === 'signup' && password !== confirm) return 'Konfirmasi password tidak cocok';
    return null;
  };

  const submit = async () => {
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
          toast.success('Tautan reset terkirim. Cek emailmu.');
          setMode('login');
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
        // Email confirmation is disabled on this project, so the account is
        // active immediately — send the user straight to login (no inbox step).
        toast.success('Akun dibuat! Silakan masuk untuk melanjutkan.');
        setMode('login');
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
              <Icon name="screwdriver-wrench" aria-hidden />
            </span>
            <span className={styles.brandWord}>FixMaster</span>
          </div>

          <div className={styles.brandBody}>
            <h2 className={styles.brandTagline}>
              Meja kerja digital untuk usaha reparasi gadget &amp; elektronik.
            </h2>
            <p className={styles.brandSub}>
              Tiket servis, kasir, stok sparepart, pelanggan, dan keuangan — satu bench.
            </p>
          </div>

          <ul className={styles.rail}>
            {RAIL.map((r) => (
              <li key={r.k} className={styles.railRow}>
                <span className={[styles.railLed, styles[r.led]].join(' ')} />
                <span className={styles.railKey}>{r.k}</span>
                <span className={styles.railDots} />
                <span className={styles.railVal}>{r.v}</span>
              </li>
            ))}
          </ul>

          <div className={styles.brandFoot}>PRECISION ELECTRONICS BENCH</div>
        </aside>

        {/* ---------- Form panel: access terminal faceplate ---------- */}
        <main className={styles.formPanel}>
          <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwBL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwBR].join(' ')} aria-hidden />

          <div className={styles.mobileBrand}>
            <span className={styles.brandLogo}>
              <Icon name="screwdriver-wrench" aria-hidden />
            </span>
            FixMaster
          </div>

          <div className={styles.terminalTop}>
            <span className={[styles.led, styles.ledLive].join(' ')} aria-hidden />
            <span className={styles.terminalLabel}>Terminal Akses</span>
            <span className={styles.modeTag}>{mode}</span>
          </div>

          <h1 className={styles.heading}>{t.heading}</h1>
          <p className={styles.hint}>{t.hint}</p>

          <div className={styles.fields} onKeyDown={onKeyDown}>
            <Input
              noAutoCap
              type="email"
              name="email"
              label="Email"
              placeholder="nama@usaha.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              iconLeft={<Icon name="envelope" aria-hidden />}
              autoComplete="email"
            />

            {mode !== 'reset' && (
              <Input
                noAutoCap
                type="password"
                name="password"
                label="Password"
                placeholder="Minimal 8 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            )}

            {mode === 'signup' && (
              <Input
                noAutoCap
                type="password"
                name="confirm"
                label="Konfirmasi Password"
                placeholder="Ulangi password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            )}

            <FormError>{error}</FormError>

            <Button fullWidth onClick={() => void submit()} disabled={busy}>
              {busy ? 'Memproses…' : t.cta}
            </Button>
          </div>

          <div className={styles.links}>
            {mode === 'login' && (
              <>
                <button type="button" className={styles.link} onClick={() => setMode('reset')}>
                  Lupa password?
                </button>
                <span className={styles.linkRow}>
                  Belum punya akun?{' '}
                  <button type="button" className={styles.linkStrong} onClick={() => setMode('signup')}>
                    Daftar
                  </button>
                </span>
              </>
            )}
            {mode === 'signup' && (
              <span className={styles.linkRow}>
                Sudah punya akun?{' '}
                <button type="button" className={styles.linkStrong} onClick={() => setMode('login')}>
                  Masuk
                </button>
              </span>
            )}
            {mode === 'reset' && (
              <button type="button" className={styles.link} onClick={() => setMode('login')}>
                Kembali ke Masuk
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
