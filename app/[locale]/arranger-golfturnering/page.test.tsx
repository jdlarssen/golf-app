import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArrangerGolfturneringPage from './page';
import noMessages from '@/messages/no.json';

/**
 * Type C: ÉN render-test for pilarsiden (#1267). Verifiserer at siden rendres
 * med hovedoverskriften fra katalogen, og — det kontraktkritiske — at FAQ-teksten
 * i FAQPage-JSON-LD-en er IDENTISK med kilde-arrayet, fordi den synlige FAQ-en og
 * markup-en mates fra samme `arrangeGuide.faq` (Googles krav om identisk tekst).
 * Speiler AnonLanding.test.tsx. Ingen re-assertering av innhold ellers.
 */
describe('ArrangerGolfturneringPage', () => {
  it('rendrer pilarsiden og speiler FAQ-en i JSON-LD-en', async () => {
    const ui = await ArrangerGolfturneringPage();
    const { container } = render(ui as React.ReactElement);

    // Skallet + hovedoverskriften står (katalog-drevet, ikke nøkkel-fallback).
    expect(screen.getByTestId('arrange-guide')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: noMessages.arrangeGuide.pageTitle,
      }),
    ).toBeInTheDocument();

    // JSON-LD: FAQPage-noden bærer nøyaktig kilde-arrayet, i samme rekkefølge.
    const sourceFaq = noMessages.arrangeGuide.faq as { q: string; a: string }[];
    expect(sourceFaq.length).toBeGreaterThan(0);

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
    ).toEqual(sourceFaq);
  });
});
