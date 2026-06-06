import { create } from 'zustand';
import {
  getSupabase,
  isSupabaseConfigured,
  authSignIn,
  authSignUp,
  authSignOut,
  authResetPassword,
  type AuthResult,
} from '@/data/supabase-client';

/**
 * Cloud account session (Supabase Auth). This is SEPARATE from the
 * employee/workspace session (see stores/session.ts):
 *   - auth store   → "who is logged into the cloud account" (email/password)
 *   - session store → "which org + which employee is active"
 *
 * In local mode (Supabase unconfigured) there is no account auth — the app
 * boots straight into the workspace. `status` settles to 'local' so the
 * AuthGate knows to skip the login screen.
 */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'local';

interface AuthState {
  status: AuthStatus;
  /** Supabase auth user id, or null. */
  userId: string | null;
  email: string | null;

  /** Wire up the auth listener; resolves the initial status. */
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  userId: null,
  email: null,

  init: async () => {
    // Local mode: no cloud auth at all.
    if (!isSupabaseConfigured) {
      set({ status: 'local', userId: null, email: null });
      return;
    }
    const client = getSupabase();
    if (!client) {
      set({ status: 'local' });
      return;
    }

    // Keep store in sync with Supabase's auth lifecycle.
    client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        set({ status: 'signed-in', userId: session.user.id, email: session.user.email ?? null });
      } else {
        set({ status: 'signed-out', userId: null, email: null });
      }
    });

    const { data } = await client.auth.getSession();
    if (data.session?.user) {
      set({
        status: 'signed-in',
        userId: data.session.user.id,
        email: data.session.user.email ?? null,
      });
    } else {
      set({ status: 'signed-out', userId: null, email: null });
    }
  },

  signIn: (email, password) => authSignIn(email, password),
  signUp: (email, password) => authSignUp(email, password),
  signOut: async () => {
    await authSignOut();
    set({ status: 'signed-out', userId: null, email: null });
  },
  resetPassword: (email) => authResetPassword(email),
}));
