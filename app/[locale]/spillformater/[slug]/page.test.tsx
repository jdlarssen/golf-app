import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpillformDetailPage from './page';

// Type C: én render-test for detalj-siden. Verifiserer at lang prosa + eksempel
// rendres når begge er tilstede. Innhold leses fra formatGuide.content.<slug>
// (i18n Fase D, #592) — vitest-stubben resolver mot no.json, så testen treffer
// ekte katalog-innhold uten DB/cache-mock.

describe('SpillformDetailPage', () => {
  it('rendrer lang prosa og eksempel når begge er tilstede', async () => {
    const Page = await SpillformDetailPage({
      params: Promise.resolve({ slug: 'stableford', locale: 'no' }),
    });
    render(Page as React.ReactElement);

    // Long prose section heading + content (formatGuide.content.stableford.long).
    expect(screen.getByText('Slik fungerer det')).toBeInTheDocument();
    expect(
      screen.getByText(/Du samler stableford-poeng på hvert hull/),
    ).toBeInTheDocument();

    // Example section heading + content (formatGuide.content.stableford.example).
    expect(screen.getByText('Konkret eksempel')).toBeInTheDocument();
    expect(screen.getByText(/Hull 3, par 4, SI 5/)).toBeInTheDocument();
  });
});
