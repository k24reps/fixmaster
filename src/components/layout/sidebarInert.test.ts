import { describe, expect, it } from 'vitest';
import sidebarRaw from './Sidebar.tsx?raw';
import cssRaw from './Sidebar.module.css?raw';
import topbarRaw from './Topbar.tsx?raw';
import layoutRaw from './AppLayout.tsx?raw';

// Checkout Windows (core.autocrlf) memberi CRLF pada ?raw.
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const sidebar = lf(sidebarRaw);
const css = lf(cssRaw);
const topbar = lf(topbarRaw);
const layout = lf(layoutRaw);
const count = (s: string, needle: string) => s.split(needle).length - 1;

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

/**
 * `inert` hanya menutup laci yang TERTUTUP. Sisi terbukanya (fokus masuk, Tab
 * berputar, Esc, fokus kembali) ada di useDrawerFocus, yang perilakunya diuji
 * sungguhan di useDrawerFocus.test.tsx. Di sini hanya kabelnya yang dikunci,
 * karena merender Sidebar butuh router + store + data.
 */
describe('sidebar: pengelolaan fokus laci terpasang', () => {
  it('hook aktif tepat saat lebar laci DAN laci terbuka (lawan dari inert)', () => {
    expect(sidebar).toContain('const drawerOpen = isDrawer && mobileOpen;');
    expect(sidebar).toMatch(/useDrawerFocus\(\{\s*active: drawerOpen,/);
    // Rail desktop tak boleh punya perangkap fokus: `active` tak boleh hanya mobileOpen.
    expect(sidebar).not.toMatch(/useDrawerFocus\(\{\s*active: mobileOpen/);
  });

  it('tombol menu dan laci saling merujuk, dan ref tombolnya sampai ke laci', () => {
    expect(topbar).toContain('aria-expanded={mobileOpen}');
    expect(topbar).toContain('aria-controls={drawerId}');
    expect(topbar).toContain('ref={toggleRef}');
    expect(sidebar).toContain('id={drawerId}');
    expect(sidebar).toContain('returnRef: toggleRef');
    // AppLayout memberi Sidebar dan Topbar id dan ref yang SAMA.
    expect(count(layout, 'drawerId={drawerId}')).toBe(2);
    expect(count(layout, 'toggleRef={toggleRef}')).toBe(2);
    expect(layout).toContain('mobileOpen={mobileOpen}');
  });

  it('Esc di menu cabang menutup menunya dulu dan tak ikut menutup laci', () => {
    const handler = sidebar.slice(sidebar.indexOf('onKeyDown={(e) => {'));
    expect(handler).toMatch(/e\.key !== 'Escape' \|\| !open/);
    // preventDefault sebelum setOpen: useDrawerFocus melewati Esc yang sudah ditangani.
    expect(handler.indexOf('e.preventDefault()')).toBeLessThan(handler.indexOf('setOpen(false)'));
  });
});
