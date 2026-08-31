import { track } from '@vercel/analytics';

type AnalyticsValue = string | number | boolean | null;

export type AnalyticsEventName =
  | 'landing_cta_clicked'
  | 'demo_started'
  | 'demo_signup_clicked'
  | 'signup_started'
  | 'signup_completed'
  | 'activation_completed'
  | 'first_service_created';

interface AnalyticsUrlEvent {
  type: 'pageview' | 'event';
  url: string;
}

/** Remove query/hash data and suppress sensitive public lookup/recovery routes. */
export function sanitizeAnalyticsEvent<T extends AnalyticsUrlEvent>(event: T): T | null {
  const url = new URL(event.url, 'https://fixmaster.app');
  if (url.pathname === '/track' || url.pathname === '/reset-password') return null;
  if (/^\/services\/[^/]+$/.test(url.pathname)) url.pathname = '/services/[id]';
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

/**
 * Send decision-grade events to Vercel Web Analytics.
 * Properties must stay low-cardinality and must never contain PII.
 */
export function trackEvent(
  name: AnalyticsEventName,
  properties: Record<string, AnalyticsValue> = {},
): void {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return;
  try {
    track(name, properties);
  } catch {
    // Analytics must never block the product flow.
  }
}
