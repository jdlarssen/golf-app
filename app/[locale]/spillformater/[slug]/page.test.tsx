import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpillformDetailPage from './page';
import noMessages from '@/messages/no.json';

// Type C: én render-test for detalj-siden. Verifiserer at seksjons-prosaen,
// eksempelet og FAQ-en rendres fra katalogen — og det kontraktkritiske: at
// FAQPage-JSON-LD-en bærer NØYAKTIG samme q/a som den synlige FAQ-en, fordi
// begge mates fra samme array (#1266, AnonLanding-mønsteret). Innhold leses fra
// formatGuide.content.<slug> (i18n Fase D, #592) — vitest-stubben resolver mot
// no.json, så testen treffer ekte katalog-innhold uten DB/cache-mock.

const source = noMessages.formatGuide.content.stableford as {
  sections: { heading: string; body: string }[];
  example: string;
  faq: { q: string; a: string }[];
};

describe('SpillformDetailPage', () => {
  it('rendrer seksjoner, eksempel og FAQ, og speiler FAQ-en i JSON-LD-en', async () => {
    const Page = await SpillformDetailPage({
      params: Promise.resolve({ slug: 'stableford', locale: 'no' }),
    });
    const { container } = render(Page as React.ReactElement);

    // Seksjons-prosa: hver mellomtittel + brødtekst fra katalogen vises, og den
    // flate «Slik fungerer det»-blokka er avløst (formatet har ikke `long`).
    expect(source.sections.length).toBeGreaterThan(0);
    for (const { heading, body } of source.sections) {
      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
    }
    expect(screen.queryByText('Slik fungerer det')).toBeNull();

    // Eksempel-boksen (feltet er urørt av #1266).
    expect(screen.getByText('Konkret eksempel')).toBeInTheDocument();
    expect(screen.getByText(source.example)).toBeInTheDocument();

    // Synlig FAQ: hvert spørsmål + svar fra kilde-arrayet vises.
    expect(source.faq.length).toBeGreaterThan(0);
    for (const { q, a } of source.faq) {
      expect(screen.getByText(q)).toBeInTheDocument();
      expect(screen.getByText(a)).toBeInTheDocument();
    }

    // Demo-CTA-en nederst, på alle formatsider.
    expect(screen.getByTestId('format-demo-cta')).toBeInTheDocument();

    // JSON-LD: FAQPage-noden bærer nøyaktig samme q/a, i samme rekkefølge.
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
