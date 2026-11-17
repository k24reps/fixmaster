// HTML statis per halaman publik selain landing. Semua rute memakai satu
// index.html, jadi tanpa ini /privacy dan /terms mengirim title, description,
// dan canonical milik landing ke crawler (Google menganggapnya duplikat `/`).
// Plugin build di vite.config.ts menulis hasilnya ke dist/<file>, dan
// vercel.json me-rewrite rutenya ke berkas itu.
//
// Sengaja tanpa impor i18n atau alias `@/`: modul ini juga dimuat saat
// vite.config.ts dibaca. Tes menjaga title tetap sama dengan `legal.*DocTitle`.

export const SITE_ORIGIN = 'https://fixmaster.app';

export interface StaticPage {
  /** Rute aplikasi, mis. `/privacy`. */
  path: string;
  /** Nama berkas di dist/, tujuan rewrite di vercel.json. */
  file: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
}

export const STATIC_PAGES: StaticPage[] = [
  {
    path: '/privacy',
    file: 'privacy.html',
    title: 'Kebijakan Privasi | FixMaster',
    description:
      'Data apa yang FixMaster kumpulkan dari pemilik toko, staf, dan pelanggan servis, untuk apa dipakai, berapa lama disimpan, dan hak Anda menurut UU PDP.',
    heading: 'Kebijakan Privasi',
    intro:
      'Bagaimana FixMaster mengumpulkan, menggunakan, dan melindungi data Anda serta data pelanggan usaha reparasi Anda.',
  },
  {
    path: '/terms',
    file: 'terms.html',
    title: 'Syarat & Ketentuan | FixMaster',
    description:
      'Ketentuan memakai FixMaster: akun, harga Rp 1.000 per unit masuk, pengisian saldo, ketersediaan layanan, data Anda, dan batas tanggung jawab.',
    heading: 'Syarat & Ketentuan',
    intro:
      'Ketentuan penggunaan layanan FixMaster: akun, harga per unit, pengisian saldo, dan tanggung jawab masing-masing pihak.',
  },
];

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Gagal keras bila pola tidak ditemukan tepat sekali: index.html yang berubah
// bentuk harus menghentikan build, bukan diam-diam mengirim head landing.
function replaceOnce(html: string, pattern: RegExp, replacement: string, label: string) {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const count = html.match(global)?.length ?? 0;
  if (count !== 1) {
    throw new Error(`staticPages: pola "${label}" ditemukan ${count} kali di index.html, harus tepat 1`);
  }
  return html.replace(pattern, () => replacement);
}

const metaPattern = (attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/>`);

export function renderStaticPage(html: string, page: StaticPage): string {
  const url = `${SITE_ORIGIN}${page.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);

  let out = html;
  out = replaceOnce(out, /<title>[^<]*<\/title>/, `<title>${title}</title>`, 'title');
  out = replaceOnce(out, metaPattern('name', 'description'), `<meta name="description" content="${description}" />`, 'description');
  out = replaceOnce(out, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical');
  out = replaceOnce(out, metaPattern('property', 'og:url'), `<meta property="og:url" content="${url}" />`, 'og:url');
  out = replaceOnce(out, metaPattern('property', 'og:title'), `<meta property="og:title" content="${title}" />`, 'og:title');
  out = replaceOnce(out, metaPattern('property', 'og:description'), `<meta property="og:description" content="${description}" />`, 'og:description');
  out = replaceOnce(out, metaPattern('name', 'twitter:title'), `<meta name="twitter:title" content="${title}" />`, 'twitter:title');
  out = replaceOnce(out, metaPattern('name', 'twitter:description'), `<meta name="twitter:description" content="${description}" />`, 'twitter:description');
  // Versi Markdown dan JSON-LD (FAQ, harga) milik landing, bukan halaman legal.
  out = replaceOnce(out, /\s*<link rel="alternate" type="text\/markdown"[^>]*\/>/, '', 'markdown alternate');
  out = replaceOnce(out, /\s*<!--[^>]*JSON-LD[^>]*-->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '', 'JSON-LD');
  out = replaceOnce(
    out,
    /<noscript>[\s\S]*?<\/noscript>/,
    [
      '<noscript>',
      '      <section style="max-width: 720px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.6">',
      `        <h1>${escapeHtml(page.heading)}</h1>`,
      `        <p>${escapeHtml(page.intro)}</p>`,
      '        <p>Aktifkan JavaScript untuk membaca dokumen lengkap. <a href="/">Kembali ke FixMaster</a></p>',
      '      </section>',
      '    </noscript>',
    ].join('\n'),
    'noscript',
  );
  return out;
}
