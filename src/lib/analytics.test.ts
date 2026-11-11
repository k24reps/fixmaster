import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsEvent } from './analytics';

describe('analytics privacy guard', () => {
  it('removes query parameters and fragments', () => {
    expect(
      sanitizeAnalyticsEvent({
        type: 'pageview',
        url: 'https://fixmaster.app/?auth=signup&plan=enterprise#pricing',
      }),
    ).toEqual({ type: 'pageview', url: 'https://fixmaster.app/' });
  });

  it('suppresses public tracking and password recovery routes', () => {
    expect(
      sanitizeAnalyticsEvent({
        type: 'pageview',
        url: 'https://fixmaster.app/track?token=secret',
      }),
    ).toBeNull();
    expect(
      sanitizeAnalyticsEvent({
        type: 'pageview',
        url: 'https://fixmaster.app/reset-password#access_token=secret',
      }),
    ).toBeNull();
    expect(
      sanitizeAnalyticsEvent({ type: 'pageview', url: 'https://fixmaster.app/t/7K3M9QXR2D' }),
    ).toBeNull();
  });

  it('keeps routes that merely start with the letter t', () => {
    expect(
      sanitizeAnalyticsEvent({ type: 'pageview', url: 'https://fixmaster.app/terms' }),
    ).toEqual({ type: 'pageview', url: 'https://fixmaster.app/terms' });
  });

  it('redacts service identifiers from dynamic URLs', () => {
    expect(
      sanitizeAnalyticsEvent({
        type: 'pageview',
        url: 'https://fixmaster.app/services/service-123',
      }),
    ).toEqual({ type: 'pageview', url: 'https://fixmaster.app/services/[id]' });
  });
});
