import { useState } from 'react';
import { Button, Input, Icon } from '@/components/ui';
import { FormError } from '@/components/ui/Form';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import styles from './AuthPage.module.css';

type Mode = 'login' | 'signup' | 'reset';

const TITLES: Record<Mode, { heading: string; hint: string; cta: string }> = {
  login: { heading: 'Masuk ke FixMaster', hint: 'Kelola usaha reparasimu', cta: 'Masuk' },
  signup: { heading: 'Daftar Akun Baru', hint: 'Mulai uji coba 14 hari gratis', cta: 'Daftar' },
  reset: { heading: 'Reset Password', hint: 'Kirim tautan ke emailmu', cta: 'Kirim Tautan' },
};

/**
 * Cloud account auth screen (Supabase Auth). Shown only in cloud mode, before
 * the workspace boots. Toggles between login, signup, and password-reset.
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
        toast.success('Akun dibuat! Cek email untuk verifikasi, lalu masuk.');
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
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
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
      </div>
    </div>
  );
}
