import { describe, expect, it } from 'vitest';
import { authIntentFromSearch, authIntentHref } from './auth-intent';

describe('public auth intent', () => {
  it('preserves signup source and selected plan in the deep link', () => {
    const href = authIntentHref({
      mode: 'signup',
      source: 'pricing_pro',
      plan: 'enterprise',
    });

    expect(authIntentFromSearch(href.slice(1))).toEqual({
      mode: 'signup',
      source: 'pricing_pro',
      plan: 'enterprise',
    });
  });

  it('keeps the legacy auth=1 URL working as login', () => {
    expect(authIntentFromSearch('?auth=1')).toEqual({ mode: 'login', source: 'direct' });
  });

  it('drops invalid plans and sources', () => {
    expect(authIntentFromSearch('?auth=signup&plan=free&source=unknown')).toEqual({
      mode: 'signup',
      source: 'direct',
    });
  });
});
