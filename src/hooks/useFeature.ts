import { planAllows, type Feature } from '@/config/plans';
import { useSessionStore } from '@/stores/session';

/**
 * Apakah paket organisasi aktif memberi fitur ini.
 *
 * Terpisah dari komponen gerbangnya (`ProBadge` / `ProNotice`) karena
 * react-refresh menolak berkas yang mengekspor komponen sekaligus non-komponen.
 */
export function useFeature(feature: Feature): boolean {
  return useSessionStore((s) => planAllows(s.org?.planType ?? 'trial', feature));
}
