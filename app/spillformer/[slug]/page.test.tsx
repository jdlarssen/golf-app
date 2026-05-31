import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpillformDetailPage from './page';

// Type C: én render-test for detalj-siden. Verifiserer at lang prosa + eksempel
// rendres når begge er tilstede i merged content. Mocker getModeContentMap så
// testen ikke avhenger av DB/cache.

vi.mock('@/lib/formats/getModeContent', () => ({
  getModeContentMap: vi.fn().mockResolvedValue({
    stableford: {
      rules_summary: null,
      rules_points: null,
      rules_long:
        'Stableford er et poengsystem der du samler stableford-poeng hull for hull. Par gir 2 poeng, birdie 3, bogey 1 og double bogey 0.',
      rules_example:
        'Hull 5 par 4: du gjør birdie (3 slag) med 1 ekstraslag → netto 2 slag = eagle → 4 poeng.',
    },
  }),
  mergeModeContent: vi.fn().mockReturnValue({
    summary:
      'Du spiller for deg selv og samler poeng på hvert hull.',
    points: [
      'Par gir 2 poeng, ett over gir 1, ett under gir 3.',
      'Slagene du får på handikap regnes med.',
      'Høyest poengsum vinner.',
    ],
    long: 'Stableford er et poengsystem der du samler stableford-poeng hull for hull. Par gir 2 poeng, birdie 3, bogey 1 og double bogey 0.',
    example:
      'Hull 5 par 4: du gjør birdie (3 slag) med 1 ekstraslag → netto 2 slag = eagle → 4 poeng.',
  }),
}));

describe('SpillformDetailPage', () => {
  it('rendrer lang prosa og eksempel når begge er tilstede', async () => {
    const Page = await SpillformDetailPage({
      params: Promise.resolve({ slug: 'stableford' }),
    });
    render(Page as React.ReactElement);

    // Long prose section heading
    expect(screen.getByText('Slik fungerer det')).toBeInTheDocument();
    // Long prose content
    expect(
      screen.getByText(/Stableford er et poengsystem/),
    ).toBeInTheDocument();

    // Example section heading
    expect(screen.getByText('Konkret eksempel')).toBeInTheDocument();
    // Example content
    expect(
      screen.getByText(/Hull 5 par 4/),
    ).toBeInTheDocument();
  });
});
