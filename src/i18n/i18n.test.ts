import { describe, it, expect, vi } from 'vitest';
import { translate } from './index';
import { id } from './id';
import { en } from './en';

describe('i18n', () => {
  it('translates a key to Indonesian', () => {
    expect(translate('id', 'nav.dashboard')).toBe('Dashboard');
    expect(translate('id', 'status.pengerjaan')).toBe('Pengerjaan');
  });

  it('translates a key to English', () => {
    expect(translate('en', 'nav.services')).toBe('Services');
    expect(translate('en', 'status.pengerjaan')).toBe('In Progress');
  });

  it('en dictionary has exactly the same keys as id (parity)', () => {
    const idKeys = Object.keys(id).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(idKeys);
  });

  it('has no empty translations in either dictionary', () => {
    for (const [k, v] of Object.entries(id)) {
      expect(v, `id.${k}`).not.toBe('');
    }
    for (const [k, v] of Object.entries(en)) {
      expect(v, `en.${k}`).not.toBe('');
    }
  });
});

describe('registry kamus', () => {
  it('Inggris tidak dimuat sampai diminta; Indonesia selalu ada', async () => {
    vi.resetModules();
    const registry = await import('./registry');
    expect(registry.isLanguageLoaded('id')).toBe(true);
    expect(registry.isLanguageLoaded('en')).toBe(false);
    expect(registry.dictionary('en')).toBeUndefined();

    await registry.loadLanguage('en');
    expect(registry.isLanguageLoaded('en')).toBe(true);
    expect(registry.dictionary('en')?.['nav.dashboard']).toBe(en['nav.dashboard']);
  });
});
