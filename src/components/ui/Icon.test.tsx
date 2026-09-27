import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './Icon';

// Nama ikon yang salah tidak pernah error: Icon diam-diam menampilkan tanda
// tanya. 14 nama seperti itu sempat lolos ke landing, Servis, Pengaturan, dan
// halaman lacak pelanggan (27 Sep 2026).
const sources = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const markup = (name: string) => renderToStaticMarkup(<Icon name={name} />);
const FALLBACK = markup('__tidak-terdaftar__');

describe('Icon', () => {
  it('setiap <Icon name="..."> di kode memakai nama yang terdaftar', () => {
    const unknown: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/<Icon\b[^>]*?\bname="([^"]+)"/g)) {
        // circle-question memang dipetakan ke glyph yang sama dengan cadangan.
        if (m[1] !== 'circle-question' && markup(m[1]) === FALLBACK) unknown.push(`${m[1]} (${file})`);
      }
    }
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(unknown).toEqual([]);
  });
});
