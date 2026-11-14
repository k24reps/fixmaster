import { describe, expect, it } from 'vitest';
import { id } from '@/i18n/id';
import { FREE_UNITS, UNIT_PRICE } from './pricing';
import html from '../../index.html?raw';
import pricingMarkdown from '../../public/pricing.md?raw';

interface GraphNode {
  '@type': string;
  name?: string;
  price?: string;
  offers?: GraphNode | GraphNode[];
  mainEntity?: Array<{
    name: string;
    acceptedAnswer: { text: string };
  }>;
}

const jsonLdSource = html.match(
  /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
)?.[1];

if (!jsonLdSource) throw new Error('Landing JSON-LD was not found');

const graph = (JSON.parse(jsonLdSource) as { '@graph': GraphNode[] })['@graph'];

describe('landing metadata', () => {
  it('keeps schema price aligned with the unit pricing configuration', () => {
    const software = graph.find((node) => node['@type'] === 'SoftwareApplication');
    const offer = Array.isArray(software?.offers) ? undefined : software?.offers;

    expect(offer?.price).toBe(String(UNIT_PRICE));
    expect(pricingMarkdown).toContain('Rp 1.000 per unit masuk');
    expect(pricingMarkdown).toContain(`${FREE_UNITS} unit pertama gratis`);
    expect(pricingMarkdown).not.toContain('Solo');
  });

  it('keeps every FAQ schema answer aligned with visible Indonesian copy', () => {
    const faq = graph.find((node) => node['@type'] === 'FAQPage');
    const pairs = ['device', 'install', 'connection', 'safe', 'move'] as const;

    for (const key of pairs) {
      const question = id[`landingV2.faq.${key}.q`];
      const answer = faq?.mainEntity?.find((entity) => entity.name === question);
      expect(answer?.acceptedAnswer.text).toBe(id[`landingV2.faq.${key}.a`]);
    }
  });

  it('uses absolute social image URLs', () => {
    expect(html).toContain('property="og:image" content="https://fixmaster.app/og-image.png"');
    expect(html).toContain('name="twitter:image" content="https://fixmaster.app/og-image.png"');
  });
});
