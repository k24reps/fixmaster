import { create } from 'zustand';
import type { BackupFrequency } from '@/lib/business/backup';

/**
 * Backup reminder preferences (local-only).
 *
 * Stored in localStorage so they persist per device/browser. The reminder is
 * a best-effort prompt shown when the app is opened and a backup is due — a
 * web app can't run scheduled jobs while closed, so this is honest "nudge on
 * open" behaviour, not a true background scheduler. See the vault note.
 */
const FREQ_KEY = 'fixmaster-backup-frequency';
const LAST_KEY = 'fixmaster-backup-last';

function getInitialFrequency(): BackupFrequency {
  if (typeof window === 'undefined') return 'off';
  const v = window.localStorage.getItem(FREQ_KEY);
  return v === 'daily' || v === 'weekly' || v === 'monthly' || v === 'off' ? v : 'off';
}

function getInitialLast(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_KEY);
}

interface BackupState {
  frequency: BackupFrequency;
  lastBackupAt: string | null;
  setFrequency: (f: BackupFrequency) => void;
  /** Record that a backup just happened (resets the reminder clock). */
  markBackedUp: (at?: string) => void;
}

export const useBackupStore = create<BackupState>((set) => ({
  frequency: getInitialFrequency(),
  lastBackupAt: getInitialLast(),
  setFrequency: (frequency) => {
    window.localStorage.setItem(FREQ_KEY, frequency);
    set({ frequency });
  },
  markBackedUp: (at = new Date().toISOString()) => {
    window.localStorage.setItem(LAST_KEY, at);
    set({ lastBackupAt: at });
  },
}));
