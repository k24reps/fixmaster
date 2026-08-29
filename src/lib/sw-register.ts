/**
 * Service Worker registration (production only).
 *
 * Guarded so dev/HMR is never intercepted by a cached shell. Registration is
 * best-effort and silent on failure — a missing/blocked SW must never break
 * the app. The SW itself (public/sw-volt.js) caches only the app shell, not data.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-volt.js').catch((e) => {
      console.warn('[FixMaster] Service worker registration failed:', e);
    });
  });
}
