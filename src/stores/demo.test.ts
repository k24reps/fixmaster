import { describe, it, expect, beforeEach } from 'vitest';
import { demoGuard, useDemoStore } from './demo';
import { useToastStore } from './toast';
import { useSettingsStore } from './settings';
import { translate } from '@/i18n';

/**
 * Penjaga demo menerima KUNCI kamus atau `{ text }` untuk teks yang sudah
 * diterjemahkan. Pembedanya dijaga tes karena `tsc` tak bisa: string polos yang
 * salah ketik sebagai teks akan tampil ke pengguna sebagai kuncinya sendiri.
 */

const messages = () => useToastStore.getState().toasts.map((t) => t.message);

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  useDemoStore.setState({ isDemo: true });
  useSettingsStore.setState({ language: 'id' });
});

describe('demoGuard', () => {
  it('di luar demo tidak memblokir dan tidak menampilkan apa pun', () => {
    useDemoStore.setState({ isDemo: false });
    expect(demoGuard('demo.logout')).toBe(false);
    expect(demoGuard({ text: 'apa saja' })).toBe(false);
    expect(messages()).toEqual([]);
  });

  it('tanpa argumen memakai pesan bawaan dari kamus', () => {
    expect(demoGuard()).toBe(true);
    expect(messages()).toEqual([translate('id', 'demo.default')]);
  });

  it('kunci diterjemahkan ke bahasa yang sedang aktif', () => {
    useSettingsStore.setState({ language: 'en' });
    expect(demoGuard('demo.logout')).toBe(true);
    expect(messages()).toEqual([translate('en', 'demo.logout')]);
    expect(messages()[0]).not.toBe(translate('id', 'demo.logout'));
  });

  it('{ text } ditampilkan apa adanya, tak dicari di kamus', () => {
    expect(demoGuard({ text: 'Cetak nota tersedia di versi penuh.' })).toBe(true);
    expect(messages()).toEqual(['Cetak nota tersedia di versi penuh.']);
  });
});
