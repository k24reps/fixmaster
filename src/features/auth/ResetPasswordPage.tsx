import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Icon, PasswordStrength } from '@/components/ui';
import { FormError } from '@/components/ui/Form';
import { getSupabase, authUpdatePassword } from '@/data/supabase-client';
import { useThemeStore } from '@/stores/theme';
import { toast } from '@/stores/toast';
import styles from './AuthPage.module.css';

type Phase = 'checking' | 'ready' | 'no-session' | 'done';

/**
 * Password recovery screen — the landing target of the reset email link
 * (redirectTo=/reset-password). supabase-js parses the recovery token from the
 * URL on load (detectSessionInUrl) and establishes a temporary session, which
 * authorizes updateUser({ password }). This is a PUBLIC route (outside AuthGate)
 * so it renders regardless of the normal signed-in/out flow.
 *
 * Reuses the AuthPage "access terminal faceplate" styling for visual continuity.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // No Supabase client → no recovery possible; start in the invalid-link state
  // (computed lazily so the effect below never setStates synchronously).
  const [phase, setPhase] = useState<Phase>(() => (getSupabase() ? 'checking' : 'no-session'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Resolve whether we have a valid recovery session. supabase-js emits
  // PASSWORD_RECOVERY (or SIGNED_IN) once it parses the token from the URL;
  // we also probe getSession in case the event fired before mount.
  useEffect(() => {
    const c = getSupabase();
    if (!c) return;
    let settled = false;
    const markReady = () => {
      settled = true;
      setPhase('ready');
    };

    const { data: sub } = c.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) markReady();
    });

    void c.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    // If no recovery session materializes shortly, the link is invalid/expired.
    const timer = window.setTimeout(() => {
      if (!settled) setPhase((p) => (p === 'checking' ? 'no-session' : p));
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const validate = (): string | null => {
    if (password.length < 8) return 'Password minimal 8 karakter';
    if (!(/[a-zA-Z]/.test(password) && /\d/.test(password))) {
      return 'Password harus mengandung huruf dan angka';
    }
    if (password !== confirm) return 'Konfirmasi password tidak cocok';
    return null;
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
      const { error: e } = await authUpdatePassword(password);
      if (e) {
        setError(e);
        return;
      }
      setPhase('done');
      toast.success('Password berhasil diperbarui.');
      // The recovery session is now a normal signed-in session → enter the app.
      window.setTimeout(() => navigate('/', { replace: true }), 1200);
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
        {/* ---------- Brand panel ---------- */}
        <aside className={styles.brandPanel} aria-hidden>
          <span className={styles.grid} />
          <div className={styles.brandTop}>
            <span className={styles.brandLogo}>
              <Icon name="screwdriver-wrench" aria-hidden />
            </span>
            <span className={styles.brandWord}>FixMaster</span>
          </div>
          <div className={styles.brandBody}>
            <h2 className={styles.brandTagline}>Setel ulang kunci akses meja kerjamu.</h2>
            <p className={styles.brandSub}>
              Buat password baru untuk akun FixMaster-mu, lalu lanjut bekerja.
            </p>
          </div>
          <div className={styles.brandFoot}>PRECISION ELECTRONICS BENCH</div>
        </aside>

        {/* ---------- Form panel: faceplate ---------- */}
        <main className={styles.formPanel}>
          <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwBL].join(' ')} aria-hidden />
          <span className={[styles.screw, styles.screwBR].join(' ')} aria-hidden />

          <div className={styles.terminalTop}>
            <span className={[styles.led, styles.ledLive].join(' ')} aria-hidden />
            <span className={styles.terminalLabel}>Terminal Akses</span>
            <span className={styles.modeTag}>reset</span>
            <button
              type="button"
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
            </button>
          </div>

          <h1 className={styles.heading}>Password Baru</h1>

          {phase === 'checking' && (
            <p className={styles.hint}>Memeriksa tautan reset…</p>
          )}

          {phase === 'no-session' && (
            <>
              <p className={styles.hint}>
                Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.
              </p>
              <div className={styles.fields}>
                <Button
                  fullWidth
                  onClick={() =>
                    navigate('/?auth=login&source=reset_password', { replace: true })
                  }
                >
                  Kembali ke Masuk
                </Button>
              </div>
            </>
          )}

          {phase === 'done' && (
            <p className={styles.hint}>Password diperbarui. Mengarahkan ke aplikasi…</p>
          )}

          {phase === 'ready' && (
            <>
              <p className={styles.hint}>Masukkan password baru untuk akunmu.</p>
              <div className={styles.fields} onKeyDown={onKeyDown}>
                <Input
                  noAutoCap
                  revealable
                  type="password"
                  name="password"
                  label="Password Baru"
                  placeholder="Minimal 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
                <PasswordStrength password={password} />
                <Input
                  noAutoCap
                  revealable
                  type="password"
                  name="confirm"
                  label="Konfirmasi Password"
                  placeholder="Ulangi password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  error={confirm && password !== confirm ? 'Belum cocok dengan password di atas' : undefined}
                  hint={confirm && password === confirm ? '✓ Password cocok' : undefined}
                />
                <FormError>{error}</FormError>
                <Button fullWidth onClick={() => void submit()} disabled={busy}>
                  {busy ? 'Menyimpan…' : 'Simpan Password'}
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
