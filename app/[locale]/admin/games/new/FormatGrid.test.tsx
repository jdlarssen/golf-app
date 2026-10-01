import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { useState } from 'react';
import { FormatGrid } from './FormatGrid';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';

// Type C render-test per docs/test-discipline.md. Navn og tekst rendres fra
// modes.* / wizard.formatCards.* — vitest-stubben resolver dem mot no.json,
// så assertene under treffer ekte norske tekster.

function row(slug: string, is_primary: boolean, sort_order: number): FormatForIntent {
  return { slug, icon_key: slug, is_primary, sort_order };
}

// Klubb-katalog speilet fra migrasjon 0047, pluss matchplay som sekundær.
const KLUBB_FORMATS: FormatForIntent[] = [
  row('stableford', true, 10),
  row('best_ball', true, 20),
  row('texas_scramble', true, 30),
  row('solo_strokeplay', true, 40),
  row('singles_matchplay', false, 50),
];

// Starten av Kompis-katalogen på staging etter 0198 (#2260). For 4 spillere
// passer alle unntatt nines: anbefalt best ball, så stableford, wolf og skins,
// og bingo bango bongo og texas bak «Se alle 6 som passer».
const KOMPIS_FORMATS: FormatForIntent[] = [
  row('best_ball', true, 1),
  row('stableford', true, 2),
  row('wolf', true, 3),
  row('skins', true, 4),
  row('bingo_bango_bongo', true, 90),
  row('texas_scramble', false, 30),
  row('nines', false, 71),
];

describe('FormatGrid — uten antall (Klubb, Solo)', () => {
  it('viser alle formatene som rader under «Vanligst» og «Flere muligheter», i én radiogruppe', () => {
    const onChange = vi.fn();
    render(<FormatGrid formats={KLUBB_FORMATS} value={undefined} onChange={onChange} />);

    const group = screen.getByRole('radiogroup', { name: /velg spillform/i });
    expect(within(group).getAllByRole('radio')).toHaveLength(5);
    expect(within(group).getByText('Vanligst')).toBeInTheDocument();
    expect(within(group).getByText('Flere muligheter')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^stableford$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^slagspill$/i })).toBeInTheDocument();
    // Ingen anbefaling og ingen figur uten antall.
    expect(screen.queryByTestId('format-recommended')).toBeNull();
    expect(screen.queryByTestId('format-lineup')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /^matchplay$/i }));
    expect(onChange).toHaveBeenCalledWith('singles_matchplay');
  });

  it('piltastene går tvers over begge gruppene og tar fokus med (#2240)', () => {
    function Wrapper() {
      const [value, setValue] = useState<string | undefined>('solo_strokeplay');
      return <FormatGrid formats={KLUBB_FORMATS} value={value} onChange={setValue} />;
    }
    render(<Wrapper />);
    const radios = () => screen.getAllByRole('radio');

    act(() => {
      radios()[3].focus();
    });
    fireEvent.keyDown(radios()[3], { key: 'ArrowDown' });

    expect(radios()[4]).toHaveAttribute('aria-checked', 'true');
    expect(radios()[4]).toHaveAccessibleName('Matchplay');
    expect(document.activeElement).toBe(radios()[4]);
  });
});

describe('FormatGrid — med antall (Kompis)', () => {
  it('anbefalt kort, tre andre, og «Se alle» folder ut resten', () => {
    const onShowGuide = vi.fn();
    render(
      <FormatGrid
        formats={KOMPIS_FORMATS}
        value={undefined}
        onChange={vi.fn()}
        onShowGuide={onShowGuide}
        playerCount={4}
      />,
    );

    expect(screen.getByText('Anbefalt for 4 spillere')).toBeInTheDocument();
    const card = screen.getByTestId('format-recommended');
    expect(within(card).getByText('Lag · 2 mot 2')).toBeInTheDocument();
    expect(within(card).getByRole('radio', { name: 'Velg best ball' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    fireEvent.click(within(card).getByRole('button', { name: 'Reglene for Best ball' }));
    expect(onShowGuide).toHaveBeenCalledWith('best_ball');

    expect(screen.getByText('Andre som passer')).toBeInTheDocument();
    const others = screen.getAllByTestId('format-row').map((r) => within(r).getByRole('radio'));
    expect(others.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    expect(others[0]).toHaveAccessibleName('Stableford');
    expect(others[0]).toHaveAccessibleDescription('Alle mot alle · poeng per hull');
    expect(others[1]).toHaveAccessibleName('Wolf');
    expect(others[1]).toHaveAccessibleDescription('Ulven velger partner på hvert hull');
    expect(others[2]).toHaveAccessibleName('Skins');
    expect(others[2]).toHaveAccessibleDescription('Hvert hull er en pott å vinne');
    expect(screen.queryByRole('radio', { name: /^nines/i })).toBeNull();

    const link = screen.getByRole('button', { name: 'Se alle 6 som passer' });
    fireEvent.click(link);

    expect(screen.queryByRole('button', { name: /se alle/i })).toBeNull();
    expect(screen.getAllByTestId('format-row')).toHaveLength(5);
    const bbb = screen.getByRole('radio', { name: 'Bingo Bango Bongo' });
    expect(document.activeElement).toBe(bbb);
    // Formater som ikke passer antallet, vises aldri.
    expect(screen.queryByRole('radio', { name: /^nines/i })).toBeNull();
  });

  it('valgt kort sier «Valgt», og en valgt rad får «Reglene» i stedet for pila', () => {
    const onShowGuide = vi.fn();
    const { rerender } = render(
      <FormatGrid
        formats={KOMPIS_FORMATS}
        value="best_ball"
        onChange={vi.fn()}
        onShowGuide={onShowGuide}
        playerCount={4}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Valgt: Best ball' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    rerender(
      <FormatGrid
        formats={KOMPIS_FORMATS}
        value="wolf"
        onChange={vi.fn()}
        onShowGuide={onShowGuide}
        playerCount={4}
      />,
    );
    const wolf = screen.getByRole('radio', { name: 'Wolf' });
    expect(wolf).toHaveAttribute('aria-checked', 'true');
    expect(wolf).not.toHaveTextContent('→');
    fireEvent.click(screen.getByRole('button', { name: 'Reglene for Wolf' }));
    expect(onShowGuide).toHaveBeenCalledWith('wolf');
  });

  it('et valgt format fra resten står som ekstra rad i «Andre»', () => {
    render(
      <FormatGrid
        formats={KOMPIS_FORMATS}
        value="texas_scramble"
        onChange={vi.fn()}
        playerCount={4}
      />,
    );
    const rows = screen.getAllByTestId('format-row');
    expect(rows).toHaveLength(4);
    expect(within(rows[3]).getByRole('radio', { name: 'Texas scramble' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Se alle 6 som passer' })).toBeInTheDocument();
  });
});
