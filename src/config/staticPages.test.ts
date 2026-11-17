import { describe, expect, it } from 'vitest';
import { id } from '@/i18n/id';
import html from '../../index.html?raw';
import sitemap from '../../public/sitemap.xml?raw';
import { SITE_ORIGIN, STATIC_PAGES, renderStaticPage } from './staticPages';

const i18nKeys = {
  '/privacy': { title: 'legal.privacyDocTitle', heading: 'legal.privacyTitle', intro: 'legal.privacyIntro' },
  '/terms': { title: 'legal.termsDocTitle', heading: 'legal.termsTitle', intro: 'legal.termsIntro' },
} as const;

const decode = (text: string) =>
  text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const attr = (out: string, pattern: RegExp) => {
  const match = out.match(pattern);
  return match ? decode(match[1]) : undefined;
};

describe('static page heads', () => {
  it('covers exactly the indexable non-landing routes in the sitemap', () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.filter((loc) => loc !== `${SITE_ORIGIN}/`).sort()).toEqual(
      STATIC_PAGES.map((page) => `${SITE_ORIGIN}${page.path}`).sort(),
    );
  });

  for (const page of STATIC_PAGES) {
    describe(page.path, () => {
      const out = renderStaticPage(html, page);
      const keys = i18nKeys[page.path as keyof typeof i18nKeys];

      it('stays in sync with the visible page copy', () => {
        expect(page.title).toBe(id[keys.title]);
        expect(page.heading).toBe(id[keys.heading]);
        expect(page.intro).toBe(id[keys.intro]);
      });

      it('sends its own title, description, canonical, and social tags', () => {
        const url = `${SITE_ORIGIN}${page.path}`;
        expect(attr(out, /<title>([^<]*)<\/title>/)).toBe(page.title);
        expect(attr(out, /<meta name="description" content="([^"]*)"/)).toBe(page.description);
        expect(out.match(/rel="canonical"/g)).toHaveLength(1);
        expect(attr(out, /<link rel="canonical" href="([^"]*)"/)).toBe(url);
        expect(attr(out, /property="og:url" content="([^"]*)"/)).toBe(url);
        expect(attr(out, /property="og:title" content="([^"]*)"/)).toBe(page.title);
        expect(attr(out, /name="twitter:description" content="([^"]*)"/)).toBe(page.description);
        expect(page.description.length).toBeLessThanOrEqual(160);
      });

      it('drops landing-only structured data and the Markdown alternate', () => {
        expect(out).not.toContain('application/ld+json');
        expect(out).not.toContain('text/markdown');
        expect(out).not.toContain('FAQPage');
      });

      it('replaces the landing noscript with the document heading', () => {
        const noscript = out.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
        expect(decode(noscript)).toContain(`<h1>${page.heading}</h1>`);
        expect(noscript).not.toContain('Fitur utama');
      });

      it('keeps the app entry, fonts, and social image', () => {
        expect(out).toContain('<div id="root"></div>');
        expect(out).toContain('src="/src/main.tsx"');
        expect(out).toContain('/fonts/inter-v20-latin.woff2');
        expect(out).toContain('property="og:image" content="https://fixmaster.app/og-image.png"');
      });
    });
  }

  it('fails loudly when index.html no longer has an expected tag', () => {
    const broken = html.replace(/<link rel="canonical"[^>]*\/>/, '');
    expect(() => renderStaticPage(broken, STATIC_PAGES[0])).toThrow(/canonical/);
  });
});
