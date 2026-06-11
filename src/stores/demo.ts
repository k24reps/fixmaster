import { create } from 'zustand';
import { toast } from './toast';

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
 * Guard a real action while in demo mode. Returns `true` when the action was
 * BLOCKED (caller should bail out early), after showing a friendly nudge.
 * Returns `false` in the real app, so normal behavior proceeds.
 *
 *   function handleSignOut() {
 *     if (demoGuard()) return;   // blocked in demo
 *     ...real sign-out...
 *   }
 */
export function demoGuard(message?: string): boolean {
  if (!useDemoStore.getState().isDemo) return false;
  toast.info(message ?? 'Fitur ini aktif di FixMaster versi penuh — daftar gratis untuk mencoba.');
  return true;
}

/** Leave the demo and open the real signup (breaks out of the iframe if embedded). */
export function exitDemoToSignup(): void {
  const top = window.top ?? window;
  top.location.href = '/?auth=1';
}
