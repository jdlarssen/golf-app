import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArrangeAudiencePage from './page';
import noMessages from '@/messages/no.json';

/**
 * Type C: ÉN render-test for målgruppe-undersiden (#1267), på firmagolf som
 * representant for de tre. Verifiserer at siden rendres med undersidens egen
 * overskrift fra katalogen, og — det kontraktkritiske — at FAQPage-JSON-LD-en
 * bærer NØYAKTIG den målgruppens `faq`-array (ikke hub-ens), fordi den synlige
 * FAQ-en og markup-en mates fra samme kilde. Speiler hub-testen ved siden av.
 */
const source = noMessages.arrangeGuide.audiences.firmagolf;

describe('ArrangeAudiencePage', () => {
  it('rendrer undersiden og speiler målgruppens FAQ i JSON-LD-en', async () => {
    const ui = await ArrangeAudiencePage({
      params: Promise.resolve({ audience: 'firmagolf', locale: 'no' }),
    });
    const { container } = render(ui as React.ReactElement);

    // Skallet + undersidens egen hovedoverskrift (ikke hub-ens).
    expect(screen.getByTestId('arrange-guide-audience')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: source.pageTitle }),
    ).toBeInTheDocument();

    // JSON-LD: FAQPage-noden bærer nøyaktig kilde-arrayet, i samme rekkefølge.
    expect(source.faq.length).toBeGreaterThan(0);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const jsonLd = JSON.parse(script!.textContent ?? '{}') as {
      '@type': string;
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(jsonLd['@type']).toBe('FAQPage');
    expect(
      jsonLd.mainEntity.map((entry) => ({
        q: entry.name,
        a: entry.acceptedAnswer.text,
      })),
    ).toEqual(source.faq);
  });
});
