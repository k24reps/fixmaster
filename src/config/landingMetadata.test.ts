import { describe, expect, it } from 'vitest';
import { id } from '@/i18n/id';
import { PLANS } from './plans';
import html from '../../index.html?raw';
import pricingMarkdown from '../../public/pricing.md?raw';

interface GraphNode {
  '@type': string;
  name?: string;
  price?: string;
  offers?: GraphNode[];
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
const priceDigits = (label: string) => label.replace(/\D/g, '');

describe('landing metadata', () => {
  it('keeps schema prices aligned with the plan configuration', () => {
    const software = graph.find((node) => node['@type'] === 'SoftwareApplication');
    const solo = software?.offers?.find((offer) => offer.name === PLANS.standard.name);
    const pro = software?.offers?.find((offer) => offer.name === PLANS.enterprise.name);

    expect(solo?.price).toBe(priceDigits(PLANS.standard.priceLabel));
    expect(pro?.price).toBe(priceDigits(PLANS.enterprise.priceLabel));
    expect(pricingMarkdown).toContain(PLANS.standard.priceLabel.replace('/bln', '/bulan'));
    expect(pricingMarkdown).toContain(PLANS.enterprise.priceLabel.replace('/bln', '/bulan'));
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
