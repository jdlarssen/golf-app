import { afterEach, describe, it, expect, vi } from 'vitest';
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

// #2562, Type B: med appen ute byttes svaret om installering (punkt 1) i både
// den synlige FAQ-en og JSON-LD-en, og demoknappen heter «Hent appen».
describe('HvorforTornyPage med appen ute (#2562)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('on: FAQ-svaret og JSON-LD-en nevner butikkene, demoknappen heter «Hent appen»', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', 'on');
    const ui = await HvorforTornyPage({
      params: Promise.resolve({ locale: 'no' }),
    });
    const { container } = render(ui as React.ReactElement);
    const why = noMessages.whyTorny;

    const answer =
      'Nei, ingen må. Alle kan bli med rett fra nettleseren. Vil du ha appen, henter du den gratis i App Store og Google Play.';
    expect(screen.getByText(answer)).toBeInTheDocument();
    const graph = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!
        .textContent ?? '{}',
    )['@graph'] as Array<{
      '@type': string;
      mainEntity?: Array<{ acceptedAnswer: { text: string } }>;
    }>;
    const faqNode = graph.find((node) => node['@type'] === 'FAQPage')!;
    expect(faqNode.mainEntity![1].acceptedAnswer.text).toBe(answer);

    expect(screen.getByTestId('why-torny-demo-cta')).toHaveTextContent(
      why.endCta.primaryCtaLaunched,
    );
    expect(screen.getByText(why.endCta.bodyLaunched)).toBeInTheDocument();
    expect(container.textContent).not.toContain(why.faq[1].a);
  });
});
