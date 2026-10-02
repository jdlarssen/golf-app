import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AnonLanding } from './AnonLanding';
import noMessages from '@/messages/no.json';

// Discovery-seksjonen (seksjon 6) er en DB-avhengig Suspense-gren; en tom liste
// gjør at den ikke rendres i det hele tatt. Stubb den til [] så render-testen
// holder seg til det statiske salgs-skallet (ingen admin-client/env kreves).
vi.mock('@/lib/games/getPublicDiscoverableGames', () => ({
  getPublicDiscoverableGames: () => Promise.resolve([]),
}));

// jsdom har ingen matchMedia; tavlekortet (#2261) spør etter redusert bevegelse.
// Stubben står for hele fila (Vitest isolerer filene): effekten kjører først
// når Suspense-grenen løses, etter at testen selv er ferdig.
vi.stubGlobal('matchMedia', () => ({ matches: false }));

/**
 * Type C: ÉN render-test for AnonLanding. Verifiserer at skallet står
 * (data-testid) og — det kontraktkritiske — at FAQ-teksten i FAQPage-JSON-LD-en
 * er IDENTISK med den synlige FAQ-en, fordi begge mates fra samme katalog-array
 * (`landing.faq`). Ingen re-assertering av tall fra Type A. Den grønne toppen
 * (#2261): H1 med «par» i `em`, snarveiene, de to knappene, og at den gamle
 * tavletabellen er borte.
 */
describe('AnonLanding', () => {
  it('rendrer landings-skallet og speiler FAQ-en i JSON-LD-en', async () => {
    const ui = await AnonLanding({ locale: 'no' });
    const { container } = render(ui as React.ReactElement);

    // Skallet står.
    expect(screen.getByTestId('anon-landing')).toBeInTheDocument();

    // H1: samme ordlyd som før, med gull-ordet i en `em`.
    const hero = noMessages.landing.hero;
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(hero.h1Pre + hero.h1Gold + hero.h1Post, {
      normalizeWhitespace: false,
    });
    expect(h1.querySelector('em')).toHaveTextContent(hero.h1Gold);

    // Snarveiene går til de tre undersidene av «Arranger golfturnering».
    const nav = screen.getByRole('navigation', { name: hero.audienceNav });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/arranger-golfturnering/vennegjeng',
      '/arranger-golfturnering/firmagolf',
      '/arranger-golfturnering/klubbkveld',
    ]);

    // Demoknappen går til demoen, knapp nr. 2 til innloggingen.
    expect(screen.getByTestId('anon-demo-cta')).toHaveAttribute('href', '/demo');
    expect(
      screen.getByRole('link', { name: hero.secondaryCta }),
    ).toHaveAttribute('href', '/login');

    // Den gamle tavletabellen er borte; tavla står i den grønne toppen.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByTestId('landing-live-board')).toBeInTheDocument();

    // Kilde-arrayet begge FAQ-flatene skal mates fra.
    const sourceFaq = noMessages.landing.faq as { q: string; a: string }[];
    expect(sourceFaq.length).toBeGreaterThan(0);

    // Synlig FAQ: hvert spørsmål + svar fra kilde-arrayet vises.
    for (const { q, a } of sourceFaq) {
      expect(screen.getByText(q)).toBeInTheDocument();
      expect(screen.getByText(a)).toBeInTheDocument();
    }

    // JSON-LD: FAQPage-noden i @graph bærer nøyaktig samme q/a.
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();
    const graph = JSON.parse(script!.textContent ?? '{}')['@graph'] as Array<{
      '@type': string;
      mainEntity?: Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
    }>;

    // De fire forventede @type-ene er til stede.
    const types = graph.map((node) => node['@type']);
    expect(types).toEqual(
      expect.arrayContaining([
        'WebSite',
        'Organization',
        'WebApplication',
        'FAQPage',
      ]),
    );

    const faqNode = graph.find((node) => node['@type'] === 'FAQPage');
    const jsonLdFaq = (faqNode?.mainEntity ?? []).map((entry) => ({
      q: entry.name,
      a: entry.acceptedAnswer.text,
    }));

    // Identisk med kilde-arrayet, i samme rekkefølge (Googles krav).
    expect(jsonLdFaq).toEqual(sourceFaq);
  });
});
