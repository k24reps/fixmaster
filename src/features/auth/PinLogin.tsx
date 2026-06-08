import { useState, useRef, useEffect } from 'react';
import { Button, Icon } from '@/components/ui';
import { verifyPin } from '@/lib/pin';
import {
  initialAttemptState,
  registerFailure,
  registerSuccess,
  isLocked,
  lockSecondsLeft,
  attemptsLeft,
  type AttemptState,
} from '@/lib/rate-limit';
import { useSessionStore } from '@/stores/session';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import type { Employee } from '@/data/types';
import styles from './PinLogin.module.css';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  karyawan: 'Karyawan',
};

export function PinLogin() {
  const org = useSessionStore((s) => s.org);
  const employees = useSessionStore((s) => s.employees);
  const signInEmployee = useSessionStore((s) => s.signInEmployee);

  const [selectedId, setSelectedId] = useState<string>(employees[0]?.id ?? '');
  const [pin, setPin] = useState(['', '', '', '']);
  const [attempts, setAttempts] = useState<AttemptState>(initialAttemptState());
  const [lockLeft, setLockLeft] = useState(0);
  const [error, setError] = useState('');
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Tick down the lockout countdown.
  useEffect(() => {
    if (!isLocked(attempts)) return;
    const timer = setInterval(() => {
      const left = lockSecondsLeft(attempts);
      setLockLeft(left);
      if (left <= 0) setError('');
    }, 500);
    return () => clearInterval(timer);
  }, [attempts]);

  const selected = employees.find((e) => e.id === selectedId);
  const locked = isLocked(attempts);

  const handleDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextPin = [...pin];
    nextPin[index] = digit;
    setPin(nextPin);
    if (digit && index < 3) inputsRef.current[index + 1]?.focus();
    if (digit && index === 3) void submit(nextPin.join(''));
  };

  const handleKey = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const reset = () => {
    setPin(['', '', '', '']);
    inputsRef.current[0]?.focus();
  };

  const submit = async (code: string) => {
    if (!selected) {
      setError('Pilih pengguna terlebih dahulu');
      return;
    }
    if (locked) return;
    const ok = await verifyPin(code, selected.id, selected.pinHash);
    if (ok) {
      setAttempts(registerSuccess());
      toast.success(`Selamat datang, ${selected.name}!`);
      signInEmployee(selected as Employee);
      logActivity({ action: 'auth.login', entityType: 'session', entityLabel: selected.name });
      return;
    }
    const nextAttempts = registerFailure(attempts);
    setAttempts(nextAttempts);
    reset();
    if (isLocked(nextAttempts)) {
      setLockLeft(lockSecondsLeft(nextAttempts));
      setError(`Terlalu banyak percobaan. Terkunci sementara.`);
    } else {
      setError(`PIN salah. Sisa ${attemptsLeft(nextAttempts)} percobaan.`);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
        </div>
        <h2 className={styles.shopName}>{org?.name ?? 'FixMaster'}</h2>
        <p className={styles.hint}>Pilih pengguna & masukkan PIN</p>

        <div className={styles.userGrid}>
          {employees.map((e) => (
            <button
              key={e.id}
              className={[styles.userChip, selectedId === e.id ? styles.userActive : ''].join(' ')}
              onClick={() => {
                setSelectedId(e.id);
                setError('');
                reset();
              }}
            >
              <span className={styles.userAvatar}>{e.name.charAt(0).toUpperCase()}</span>
              <span className={styles.userMeta}>
                <strong>{e.name}</strong>
                <small>{ROLE_LABEL[e.role]}</small>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.pinGroup}>
          {pin.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              className={[styles.pinInput, error ? styles.pinError : ''].join(' ')}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              disabled={locked}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              aria-label={`Digit PIN ${i + 1}`}
            />
          ))}
        </div>

        {error && (
          <p className={styles.error}>
            {error}
            {locked && lockLeft > 0 && <strong> ({lockLeft}s)</strong>}
          </p>
        )}

        <Button fullWidth onClick={() => void submit(pin.join(''))} disabled={locked}>
          Masuk
        </Button>
      </div>
    </div>
  );
}
