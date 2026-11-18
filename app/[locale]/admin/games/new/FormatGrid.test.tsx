import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { useState } from 'react';
import { FormatGrid } from './FormatGrid';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import {
  GOALS,
  LEVELS,
  recommendFormat,
  type CountBucket,
  type Goal,
  type Level,
} from '@/lib/formats/recommendFormat';
import no from '@/messages/no.json';

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
    // #2454: a format chosen on mount is the folded line.
    fireEvent.click(screen.getByRole('button', { name: /^bytt spillform/i }));
    const radios = () => screen.getAllByRole('radio');

    act(() => {
      radios()[3].focus();
    });
    fireEvent.keyDown(radios()[3], { key: 'ArrowDown' });

    expect(radios()[4]).toHaveAttribute('aria-checked', 'true');
    expect(radios()[4]).toHaveAccessibleName('Matchplay');
    expect(document.activeElement).toBe(radios()[4]);
    // Arrow keys select but leave the list open.
    expect(screen.queryByTestId('format-chosen')).toBeNull();
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

  it('valgt kort sier «Valgt», og en valgt rad får «Reglene» i stedet for chevronen', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /^bytt spillform/i }));
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
    expect(wolf.querySelector('svg')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /^bytt spillform/i }));
    const rows = screen.getAllByTestId('format-row');
    expect(rows).toHaveLength(4);
    expect(within(rows[3]).getByRole('radio', { name: 'Texas scramble' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Se alle 6 som passer' })).toBeInTheDocument();
  });
});

// #2454: a chosen format folds the list to one line with «Bytt».
describe('FormatGrid — valgt format som én linje (#2454)', () => {
  function Wrapper({ initial }: { initial: string | undefined }) {
    const [value, setValue] = useState<string | undefined>(initial);
    return (
      <>
        <button type="button" onClick={() => setValue(undefined)}>
          nullstill
        </button>
        <FormatGrid
          formats={KOMPIS_FORMATS}
          value={value}
          onChange={setValue}
          onShowGuide={vi.fn()}
          playerCount={4}
        />
      </>
    );
  }

  it('klikk på en rad folder lista til navn, regel-linje og «Bytt», med fokus på «Bytt»', () => {
    render(<Wrapper initial={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Se alle 6 som passer' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Wolf' }));

    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    const line = screen.getByTestId('format-chosen');
    expect(within(line).getByText('Wolf')).toBeInTheDocument();
    expect(within(line).getByText('Ulven velger partner på hvert hull')).toBeInTheDocument();
    const change = within(line).getByRole('button', { name: 'Bytt spillform. Valgt: Wolf' });
    expect(change).toHaveTextContent('Bytt');
    expect(change).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(change);
  });

  it('klikk på kortets knapp folder lista på samme måte', () => {
    render(<Wrapper initial={undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Velg best ball' }));

    const line = screen.getByTestId('format-chosen');
    expect(within(line).getByText('Best ball')).toBeInTheDocument();
    expect(document.activeElement).toBe(
      within(line).getByRole('button', { name: 'Bytt spillform. Valgt: Best ball' }),
    );
  });

  it('piltast i åpen liste velger uten å folde lista', () => {
    const onChange = vi.fn();
    render(
      <FormatGrid
        formats={KOMPIS_FORMATS}
        value={undefined}
        onChange={onChange}
        playerCount={4}
      />,
    );
    const card = screen.getByRole('radio', { name: 'Velg best ball' });
    act(() => card.focus());
    fireEvent.keyDown(card, { key: 'ArrowDown' });

    expect(onChange).toHaveBeenCalledWith('stableford');
    expect(screen.getByRole('radiogroup', { name: /velg spillform/i })).toBeInTheDocument();
    expect(screen.queryByTestId('format-chosen')).toBeNull();
  });

  it('«Bytt» åpner lista med valget markert og fokus på det valgte formatet', () => {
    render(<Wrapper initial="wolf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Bytt spillform. Valgt: Wolf' }));

    expect(screen.queryByTestId('format-chosen')).toBeNull();
    const wolf = screen.getByRole('radio', { name: 'Wolf' });
    expect(wolf).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(wolf);
  });

  it('mount med valgt format starter foldet', () => {
    render(<Wrapper initial="wolf" />);
    expect(screen.getByTestId('format-chosen')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('uten valgt format er lista åpen, og den åpner seg igjen når valget forsvinner', () => {
    render(<Wrapper initial={undefined} />);
    expect(screen.getByRole('radiogroup', { name: /velg spillform/i })).toBeInTheDocument();
    expect(screen.queryByTestId('format-chosen')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Velg best ball' }));
    expect(screen.getByTestId('format-chosen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'nullstill' }));
    expect(screen.queryByTestId('format-chosen')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: /velg spillform/i })).toBeInTheDocument();
  });

  it('disabled: «Bytt» er av', () => {
    render(
      <FormatGrid formats={KOMPIS_FORMATS} value="wolf" onChange={vi.fn()} playerCount={4} disabled />,
    );
    expect(screen.getByRole('button', { name: /^bytt spillform/i })).toBeDisabled();
  });
});

// #2462: «Usikker? To spørsmål» over the list, with the answer in the card.
describe('FormatGrid — formatspørsmålene (#2462)', () => {
  // Every format the helper can suggest, in the catalogue's order.
  const SUGGESTABLE: FormatForIntent[] = [
    row('best_ball', true, 1),
    row('stableford', true, 2),
    row('wolf', true, 3),
    row('bingo_bango_bongo', true, 90),
    row('texas_scramble', false, 30),
    row('singles_matchplay', false, 40),
    row('nassau', false, 60),
    row('fourball_matchplay', false, 100),
    row('solo_strokeplay', false, 100),
  ];
  const LEVEL_LABEL: Record<Level, string> = { even: 'Ganske like', uneven: 'Veldig ulike' };
  const GOAL_LABEL: Record<Goal, string> = {
    compete: 'Konkurranse',
    team: 'Lagfølelse',
    stakes: 'Litt på spill',
  };
  const modeName = (slug: string) => (no.modes as unknown as Record<string, string>)[slug];

  function Wrapper({ count, formats = SUGGESTABLE }: { count: number; formats?: FormatForIntent[] }) {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <FormatGrid formats={formats} value={value} onChange={setValue} playerCount={count} />
    );
  }
  const answer = (level: Level, goal: Goal) => {
    fireEvent.click(screen.getByRole('radio', { name: LEVEL_LABEL[level] }));
    fireEvent.click(screen.getByRole('radio', { name: GOAL_LABEL[goal] }));
  };
  const cardName = () =>
    within(screen.getByTestId('format-recommended')).getByText(
      (_, el) => el?.parentElement?.getAttribute('aria-live') === 'polite',
    ).textContent;

  it('two radiogroups over the card, outside the format radiogroup; none without a count', () => {
    const { rerender } = render(<Wrapper count={4} />);
    expect(screen.getByText('Usikker? To spørsmål')).toBeInTheDocument();
    const level = screen.getByRole('radiogroup', { name: 'Hvor jevne er dere?' });
    const goal = screen.getByRole('radiogroup', { name: 'Hva vil dere ha ut av dagen?' });
    expect(within(level).getAllByRole('radio')).toHaveLength(2);
    expect(within(goal).getAllByRole('radio')).toHaveLength(3);
    const formatGroup = screen.getByRole('radiogroup', { name: /velg spillform/i });
    expect(formatGroup.contains(level)).toBe(false);
    expect(formatGroup.contains(goal)).toBe(false);
    // Nothing chosen and nothing suggested until both are answered.
    expect(within(level).getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
    ]);
    expect(screen.getByText('Anbefalt for 4 spillere')).toBeInTheDocument();
    expect(screen.queryByText('Dere bør prøve')).toBeNull();

    rerender(<FormatGrid formats={SUGGESTABLE} value={undefined} onChange={vi.fn()} />);
    expect(screen.queryByTestId('format-questions')).toBeNull();
    rerender(
      <FormatGrid formats={SUGGESTABLE} value={undefined} onChange={vi.fn()} playerCount={4} disabled />,
    );
    expect(screen.queryByTestId('format-questions')).toBeNull();
  });

  it('one answer is not enough', () => {
    render(<Wrapper count={4} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Lagfølelse' }));
    expect(screen.getByText('Anbefalt for 4 spillere')).toBeInTheDocument();
    expect(screen.queryByText('Dere bør prøve')).toBeNull();
  });

  it('4 · Veldig ulike · Lagfølelse: «Dere bør prøve» Texas scramble, and «Velg» folds the list', () => {
    const onChange = vi.fn();
    function Spy() {
      const [value, setValue] = useState<string | undefined>(undefined);
      return (
        <FormatGrid
          formats={SUGGESTABLE}
          value={value}
          onChange={(slug) => {
            onChange(slug);
            setValue(slug);
          }}
          playerCount={4}
        />
      );
    }
    render(<Spy />);
    answer('uneven', 'team');

    expect(screen.getByText('Dere bør prøve')).toBeInTheDocument();
    expect(cardName()).toBe('Texas scramble');
    expect(screen.getByTestId('format-recommended')).toHaveTextContent(
      no.formatGuide.helper.why.texas_scramble,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Velg Texas scramble' }));
    expect(onChange).toHaveBeenCalledWith('texas_scramble');
    expect(screen.getByTestId('format-chosen')).toHaveTextContent('Texas scramble');
    expect(screen.queryByTestId('format-questions')).toBeNull();
  });

  it.each([2, 3, 4])(
    '%i players: the same format as /spillformater for all six answers',
    (count) => {
      for (const level of LEVELS) {
        for (const goal of GOALS) {
          const { unmount } = render(<Wrapper count={count} />);
          answer(level, goal);
          expect(cardName()).toBe(
            modeName(recommendFormat({ bucket: String(count) as CountBucket, level, goal }).mode),
          );
          unmount();
        }
      }
    },
  );

  it('6 · Ganske like · Lagfølelse: best ball as on /spillformater, no note', () => {
    render(<Wrapper count={6} />);
    answer('even', 'team');
    expect(cardName()).toBe('Best ball');
    expect(screen.getByTestId('format-recommended')).not.toHaveTextContent('går ikke opp');
  });

  it('7 · Ganske like · Lagfølelse: Texas scramble, with a note on the format the count ruled out', () => {
    render(<Wrapper count={7} />);
    answer('even', 'team');
    expect(cardName()).toBe('Texas scramble');
    expect(screen.getByTestId('format-recommended')).toHaveTextContent(
      'Best ball går ikke opp med 7 spillere.',
    );
    // Best ball does not fit 7, so it is not on the list either.
    expect(screen.queryByRole('radio', { name: /best ball/i })).toBeNull();
  });

  it('5 · Ganske like · Litt på spill: Nassau, no note', () => {
    render(<Wrapper count={5} />);
    answer('even', 'stakes');
    expect(cardName()).toBe('Nassau');
    expect(screen.getByTestId('format-recommended')).not.toHaveTextContent('går ikke opp');
  });

  it('3 · Lagfølelse: Stableford with the message; 17 · Litt på spill: Stableford with its own', () => {
    const three = render(<Wrapper count={3} />);
    answer('even', 'team');
    expect(cardName()).toBe('Stableford');
    expect(screen.getByTestId('format-recommended')).toHaveTextContent(
      'Ingen lagformat går opp med 3 spillere.',
    );
    three.unmount();

    render(<Wrapper count={17} />);
    answer('even', 'stakes');
    expect(cardName()).toBe('Stableford');
    expect(screen.getByTestId('format-recommended')).toHaveTextContent(
      'Ingen av spillene med litt på spill går opp med 17 spillere.',
    );
  });

  it('a new count recomputes the card from the same answers, and the new name is in the live region', () => {
    const { rerender } = render(<Wrapper count={4} />);
    answer('even', 'team');
    expect(cardName()).toBe('Fourball');
    const live = within(screen.getByTestId('format-recommended')).getByText('Fourball')
      .parentElement!;

    rerender(<Wrapper count={3} />);
    expect(cardName()).toBe('Stableford');
    // The same element, so the screen reader reads the new text out.
    expect(live.isConnected).toBe(true);
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Stableford');
  });

  it('the suggestion is not in the list twice, and «Se alle» counts the same', () => {
    render(<Wrapper count={4} />);
    const seeAll = () => screen.getByRole('button', { name: /^se alle \d+ som passer$/i }).textContent;
    const before = seeAll();
    answer('uneven', 'team');
    expect(cardName()).toBe('Texas scramble');
    expect(seeAll()).toBe(before);
    const names = [
      screen.getByTestId('format-recommended'),
      ...screen.getAllByTestId('format-row'),
    ].map((el) => el.textContent);
    expect(names.filter((n) => n?.includes('Texas scramble'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^se alle/i }));
    expect(
      screen.getAllByRole('radio').filter((r) => /texas scramble/i.test(r.getAttribute('aria-label') ?? r.textContent ?? '')),
    ).toHaveLength(1);
  });

  it('a suggestion the catalogue hides leaves the plain recommendation', () => {
    render(<Wrapper count={4} formats={SUGGESTABLE.filter((f) => f.slug !== 'texas_scramble')} />);
    answer('uneven', 'team');
    expect(screen.queryByText('Dere bør prøve')).toBeNull();
    expect(screen.getByText('Anbefalt for 4 spillere')).toBeInTheDocument();
  });

  it('no gold kicker on step 2', () => {
    const { container } = render(<Wrapper count={4} />);
    expect(container.querySelector('.text-accent-text')).toBeNull();
    answer('uneven', 'team');
    expect(container.querySelector('.text-accent-text')).toBeNull();
  });

  it('the three answers wrap to two rows under 360 px, one row from 360 px (#2462)', () => {
    render(<Wrapper count={4} />);
    const goal = screen.getByRole('radiogroup', { name: 'Hva vil dere ha ut av dagen?' });
    expect(goal.className).toContain('grid-cols-2');
    expect(goal.className).toContain('min-[360px]:grid-cols-3');
    const [, , third] = within(goal).getAllByRole('radio');
    expect(third.className).toContain('max-[359px]:col-span-2');
    expect(third).toHaveClass('whitespace-nowrap');
  });

  it('the arrow keys move the choice inside one question', () => {
    render(<Wrapper count={4} />);
    const level = screen.getByRole('radiogroup', { name: 'Hvor jevne er dere?' });
    const [even, uneven] = within(level).getAllByRole('radio');
    act(() => even.focus());
    fireEvent.keyDown(even, { key: 'ArrowRight' });
    expect(uneven).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(uneven);
    const goal = screen.getByRole('radiogroup', { name: 'Hva vil dere ha ut av dagen?' });
    for (const radio of within(goal).getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    }
  });
});
