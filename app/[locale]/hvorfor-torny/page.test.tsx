import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HvorforTornyPage from './page';
import noMessages from '@/messages/no.json';

/**
 * Type C: ÉN render-test for sammenligningssida (#1419). Verifiserer at skallet
 * står (data-testid) og — det kontraktkritiske — at FAQ-teksten i
 * FAQPage-JSON-LD-en er IDENTISK med kilde-arrayet, fordi den synlige FAQ-en og
 * markup-en mates fra samme `whyTorny.faq` (Googles krav om identisk tekst).
 * Speiler AnonLanding.test.tsx og arranger-golfturnering/page.test.tsx. Ingen
 * assertering på copy ellers — mockup-teksten eies av katalogen, ikke av testen.
 */
describe('HvorforTornyPage', () => {
  it('rendrer sida og speiler FAQ-en i FAQPage-JSON-LD-en', async () => {
    const ui = await HvorforTornyPage({
      params: Promise.resolve({ locale: 'no' }),
    });
    const { container } = render(ui as React.ReactElement);

    // Skallet står.
    expect(screen.getByTestId('why-torny')).toBeInTheDocument();

    // JSON-LD: WebPage + FAQPage, og FAQPage-noden bærer nøyaktig kilde-arrayet
    // i samme rekkefølge. WebSite/Organization skal IKKE dupliseres hit — de
    // defineres på forsiden.
    const sourceFaq = noMessages.whyTorny.faq as { q: string; a: string }[];
    expect(sourceFaq.length).toBeGreaterThan(0);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const graph = JSON.parse(script!.textContent ?? '{}')['@graph'] as Array<{
      '@type': string;
      mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }>;
    }>;

    expect(graph.map((node) => node['@type'])).toEqual(['WebPage', 'FAQPage']);

    const faqNode = graph.find((node) => node['@type'] === 'FAQPage');
    expect(
      (faqNode?.mainEntity ?? []).map((entry) => ({
        q: entry.name,
        a: entry.acceptedAnswer.text,
      })),
    ).toEqual(sourceFaq);
  });
});
