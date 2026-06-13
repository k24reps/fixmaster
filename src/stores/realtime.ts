import { create } from 'zustand';
import type { RealtimeStatus } from '@/data/supabase-client';

/**
 * Realtime connection status for the cloud sync channel. Driven by
 * `subscribeOrgTables` (via the SupabaseAdapter) and read by the Topbar badge
 * so cashiers can see at a glance whether live multi-device sync is active.
 *
 *   connecting → channel (re)subscribing
 *   live       → SUBSCRIBED, receiving events
 *   offline    → channel error/closed; auto-reconnect in progress
 *
 * Local/demo modes never set this (no channel), so the badge stays hidden.
 */
interface RealtimeState {
  status: RealtimeStatus;
  /** True once any status has been reported (i.e. cloud sync is in use). */
  active: boolean;
  setStatus: (status: RealtimeStatus) => void;
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: 'connecting',
  active: false,
  setStatus: (status) => set({ status, active: true }),
  reset: () => set({ status: 'connecting', active: false }),
}));
