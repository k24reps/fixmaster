import { create } from 'zustand';
import { toast } from './toast';
import { authIntentHref } from '@/features/auth/auth-intent';
import { trackEvent } from '@/lib/analytics';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { translate, type TranslationKey } from '@/i18n';
import { useSettingsStore } from './settings';

/**
 * Public-demo session flag. Set true only while the landing-page demo
 * (`/demo`, or its embedded iframe) is mounted. Feature pages read this to
 * "tame" destructive / out-of-context actions (sign-out, reset, backup,
 * WhatsApp, print) so a visitor can explore freely without breaking the demo
 * or hitting real integrations.
 */
interface DemoState {
  isDemo: boolean;
  enter: () => void;
  exit: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemo: false,
  enter: () => set({ isDemo: true }),
  exit: () => set({ isDemo: false }),
}));

/**
 * Tulis lewat RPC cloud? Hanya bila Supabase terkonfigurasi DAN bukan demo.
 * Demo memakai adapter di memori, sedangkan `isSupabaseConfigured` tetap true
 * (env) — tanpa pengecekan ini RPC menembak database sungguhan dengan org demo
 * yang tidak ada di sana, jadi aksinya gagal.
 */
export function isCloudMode(): boolean {
  return isSupabaseConfigured && !useDemoStore.getState().isDemo;
}

/**
 * Guard a real action while in demo mode. Returns `true` when the action was
 * BLOCKED (caller should bail out early), after showing a friendly nudge.
 * Returns `false` in the real app, so normal behavior proceeds.
 *
 *   function handleSignOut() {
 *     if (demoGuard('demo.logout')) return;   // blocked in demo
 *     ...real sign-out...
 *   }
 *
 * Takes a translation KEY: the helpers call it outside React where there is no
 * `t`, and a key keeps every nudge in the dictionaries. The one exception is
 * `{ text }`, for a message that is ALREADY translated (the print window gets
 * its text in the receipt language, not the UI language). It is a distinct
 * type on purpose: a bare string would be read as a key, and a missing key
 * shows up to the user as the key itself, which `tsc` can't tell from text.
 */
export function demoGuard(message: TranslationKey | { text: string } = 'demo.default'): boolean {
  if (!useDemoStore.getState().isDemo) return false;
  const text =
    typeof message === 'string'
      ? translate(useSettingsStore.getState().language, message)
      : message.text;
  toast.info(text);
  return true;
}

/** Leave the demo and open the real signup (breaks out of the iframe if embedded). */
export function exitDemoToSignup(): void {
  trackEvent('demo_signup_clicked', { location: 'demo_chrome' });
  const top = window.top ?? window;
  top.location.href = authIntentHref({ mode: 'signup', source: 'demo' });
}
