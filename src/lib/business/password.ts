/**
 * Pure password-strength scoring for the signup/reset strength indicator.
 * No DOM deps → unit-testable. The hard signup requirement stays "≥8 chars +
 * letter + digit" (enforced in the auth forms); this scorer additionally
 * rewards a symbol so users can see how to make a stronger password without it
 * being mandatory.
 */

export interface PasswordChecks {
  length: boolean; // ≥ 8 characters
  letter: boolean; // has a letter
  digit: boolean; // has a digit
  symbol: boolean; // has a non-alphanumeric symbol
}

export type PasswordLevel = 'empty' | 'weak' | 'medium' | 'strong';

export interface PasswordScore {
  checks: PasswordChecks;
  /** Count of satisfied checks (0–4). */
  passed: number;
  level: PasswordLevel;
  /** Indonesian label for the level. */
  label: string;
}

const LABELS: Record<PasswordLevel, string> = {
  empty: '',
  weak: 'Lemah',
  medium: 'Sedang',
  strong: 'Kuat',
};

/** Score a password against four criteria and derive a coarse strength level. */
export function scorePassword(password: string): PasswordScore {
  const checks: PasswordChecks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;

  let level: PasswordLevel;
  if (!password) level = 'empty';
  else if (passed <= 2) level = 'weak';
  else if (passed === 3) level = 'medium';
  else level = 'strong';

  return { checks, passed, level, label: LABELS[level] };
}
