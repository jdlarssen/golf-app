import { describe, it, expect } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import ArrangeAudiencePage from './page';
import noMessages from '@/messages/no.json';

/**
 * Type C: ÉN render-test for målgruppe-undersiden (#1267), på firmagolf som
 * representant for de tre. Verifiserer at siden rendres med undersidens egen
 * overskrift fra katalogen, og — det kontraktkritiske — at FAQPage-JSON-LD-en
 * bærer NØYAKTIG den målgruppens `faq`-array (ikke hub-ens), fordi den synlige
 * FAQ-en og markup-en mates fra samme kilde. Speiler hub-testen ved siden av.
 *
 * #2331: én test til, per målgruppe, for oppsett-kortet under tittelen:
 * knappen går til riktig oppsett i veiviseren, H1 står før kortet, kortet har
 * tre grunner, og hver brikke peker på en seksjon som finnes.
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

describe('ArrangeAudiencePage — oppsett-kortet (#2331)', () => {
  it.each([
    ['firmagolf', 'Texas scramble, lag på 4, netto'],
    ['vennegjeng', 'Skins, netto'],
    ['klubbkveld', 'Stableford, netto'],
  ] as const)(
    '%s: kortet etter H1 med «%s», knapp til oppsettet, tre grunner og brikker til seksjonene',
    async (audience, line) => {
      cleanup();
      const content = noMessages.arrangeGuide.audiences[audience];
      const ui = await ArrangeAudiencePage({
        params: Promise.resolve({ audience, locale: 'no' }),
      });
      const { container } = render(ui as React.ReactElement);

      const card = screen.getByTestId('arrange-preset');
      expect(within(card).getByText(line)).toBeInTheDocument();
      expect(within(card).getByTestId('arrange-preset-cta')).toHaveAttribute(
        'href',
        `/opprett-spill?oppsett=${audience}&step=2`,
      );

      // H1 kommer før kortet i DOM-en, så H1 står fortsatt øverst på mobil.
      const h1 = screen.getByRole('heading', { level: 1, name: content.pageTitle });
      expect(h1.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const reasons = within(card).getAllByRole('listitem');
      expect(reasons).toHaveLength(3);
      expect(reasons.map((li) => li.textContent?.replace('✓', ''))).toEqual(
        content.preset.reasons,
      );

      const chips = within(screen.getByRole('navigation', { name: 'Hopp til' })).getAllByRole(
        'link',
      );
      expect(chips.map((a) => a.textContent)).toEqual(content.sections.map((x) => x.chip));
      for (const chip of chips) {
        const id = chip.getAttribute('href')!.replace(/^#/, '');
        expect(container.querySelector(`section[id="${id}"]`), id).not.toBeNull();
      }
    },
  );
});
