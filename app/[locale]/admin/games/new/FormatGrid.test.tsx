import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormatGrid } from './FormatGrid';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';

// Én Type C render-test per docs/test-discipline.md — verifiserer at FormatGrid
// partisjonerer på is_primary i UI-laget og at klikk på et kort caller
// onChange med slug.

function row(
  slug: string,
  display_name: string,
  is_primary: boolean,
  sort_order: number,
): FormatForIntent {
  return {
    slug,
    display_name,
    icon_key: slug,
    short_description: `${display_name} test-beskrivelse`,
    is_primary,
    sort_order,
  };
}

// Klubb-katalog speilet fra migrasjon 0047: stableford, best_ball,
// texas_scramble, solo_strokeplay alle som primary. Singles_matchplay som
// sekundær for å verifisere at sekundær-seksjonen renderer.
const KLUBB_FORMATS: FormatForIntent[] = [
  row('stableford', 'Stableford', true, 10),
  row('best_ball', 'Best ball', true, 20),
  row('texas_scramble', 'Texas scramble', true, 30),
  row('solo_strokeplay', 'Slagspill', true, 40),
  row('singles_matchplay', 'Matchplay', false, 50),
];

describe('FormatGrid', () => {
  it('partisjonerer formats på is_primary og caller onChange ved klikk', () => {
    const onChange = vi.fn();
    render(
      <FormatGrid
        formats={KLUBB_FORMATS}
        value={undefined}
        onChange={onChange}
      />,
    );

    // Hovedformater-gruppen viser 4 primary radio-knapper.
    const primaryGroup = screen.getByRole('radiogroup', {
      name: /hovedformater/i,
    });
    expect(primaryGroup).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /^stableford$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /^best ball$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /^texas scramble$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /^slagspill$/i }),
    ).toBeInTheDocument();

    // Sekundær-seksjon med ett kort: Matchplay (singles_matchplay).
    expect(
      screen.getByRole('radiogroup', { name: /sekundære formater/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^matchplay$/i })).toBeInTheDocument();

    // Klikk Best ball → onChange caller med slug.
    fireEvent.click(screen.getByRole('radio', { name: /^best ball$/i }));
    expect(onChange).toHaveBeenCalledWith('best_ball');

    // Klikk Matchplay (sekundær) → onChange caller med slug.
    fireEvent.click(screen.getByRole('radio', { name: /^matchplay$/i }));
    expect(onChange).toHaveBeenLastCalledWith('singles_matchplay');
  });
});
