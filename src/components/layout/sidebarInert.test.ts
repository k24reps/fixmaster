import { describe, expect, it } from 'vitest';
import sidebarRaw from './Sidebar.tsx?raw';
import cssRaw from './Sidebar.module.css?raw';

// Checkout Windows (core.autocrlf) memberi CRLF pada ?raw.
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const sidebar = lf(sidebarRaw);
const css = lf(cssRaw);

/**
 * Laci sidebar di <=1024px disembunyikan dengan transform (digeser keluar layar),
 * bukan display:none, jadi belasan tautannya tetap terjangkau Tab dan terbaca
 * pembaca layar saat laci tertutup. `inert` menutupnya, tetapi HANYA saat benar-
 * benar laci tertutup: di desktop sidebar adalah rail tetap (juga saat
 * diciutkan) dan tak boleh inert. Tes ini mengunci kopling itu tanpa merender
 * Sidebar (butuh router + store + data); perilaku nyatanya diukur di browser.
 */
describe('sidebar: inert hanya saat laci ponsel tertutup', () => {
  it('aside inert = (lebar laci) DAN (laci tidak terbuka); collapsed tak ikut menentukan', () => {
    expect(sidebar).toContain('const drawerClosed = isDrawer && !mobileOpen;');
    expect(sidebar).toMatch(/<aside\s+inert=\{drawerClosed\}/);
    // Mode ciut (desktop) bukan alasan inert.
    expect(sidebar).not.toMatch(/inert=\{[^}]*collapsed/);
  });

  it('kueri laci di TSX sama persis dengan @media laci di CSS', () => {
    const q = sidebar.match(/const DRAWER_QUERY = '(\([^']+\))';/);
    expect(q, 'DRAWER_QUERY tak ditemukan').not.toBeNull();
    const query = q![1];
    // CSS yang menggeser aside keluar layar ada di blok @media dengan kueri yang sama.
    const block = css.slice(css.indexOf(`@media ${query} {`));
    expect(block.startsWith(`@media ${query} {`)).toBe(true);
    expect(block).toMatch(/\.sidebar \{\s*transform: translateX\(calc\(-100% - var\(--space-2\)\)\);/);
    expect(block).toMatch(/\.sidebar\.mobileOpen \{\s*transform: translateX\(0\);/);
  });

  it('di luar blok laci aside tak digeser keluar layar (rail desktop tak boleh tersembunyi)', () => {
    const outside = css.slice(0, css.indexOf('@media (max-width: 1024px) {'));
    expect(outside).not.toMatch(/\.sidebar \{[^}]*translateX\(calc\(-100%/);
  });
});
