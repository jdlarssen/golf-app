// #2755 (Type C): Nassau-tavla i appen. Resultatene kommer fra den ekte
// motoren (`nassauResult`), og forventningene fra `summarizeNassau`, den delte
// oppsummeringen nettets tavle også leser. Ingen tall her er skrevet inn fra
// motoren; testen sjekker at skjermen sier det oppsummeringen sier.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { summarizeNassau } from '../../../../../lib/leaderboard/nassauBoard';
import { AFTER_13, fours, nassauResult } from '../../../../../lib/leaderboard/__fixtures__/nassauResult';
import { NASSAU_BOARD_TEXT } from '../../lib/nassauBoardCopy';
import { ReactionsContext, type ReactionsContextValue } from './ReactionsProvider';
import { NassauBoard } from './NassauBoard';

const NAMES: Record<string, string> = {
  meg: 'Meg Meg',
  marte: 'Marte Lie',
  jonas: 'Jonas Berg',
  kari: 'Kari Dahl',
  a: 'Anna Aas',
  b: 'Bjørn Berg',
  c: 'Cato Collin',
};
const nameOf = (id: string) => NAMES[id] ?? 'Ukjent';
const shortNameOf = (id: string) => nameOf(id).split(' ')[0]!;

async function show(
  strokes: Record<string, readonly number[]>,
  opts: { status?: string; viewer?: string | null; ranking?: 'net_to_par' } = {},
) {
  const result = nassauResult(strokes, opts.ranking);
  const status = opts.status ?? 'active';
  const viewer = opts.viewer === undefined ? 'meg' : opts.viewer;
  await render(
    <NassauBoard
      result={result}
      status={status}
      viewerUserId={viewer}
      nameOf={nameOf}
      shortNameOf={shortNameOf}
    />,
  );
  return { result, board: summarizeNassau(result, { finished: status === 'finished', viewerUserId: viewer }) };
}

const textOf = (testID: string) => {
  const node = screen.getByTestId(testID);
  const texts: string[] = [];
  const walk = (n: unknown) => {
    const x = n as { children?: unknown[]; props?: { children?: unknown } };
    for (const child of x.children ?? []) {
      if (typeof child === 'string') texts.push(child);
      else walk(child);
    }
  };
  walk(node);
  return texts.join('');
};

describe('NassauBoard', () => {
  it('tegner tre kort med riktig kort valgt fra start', async () => {
    const { board } = await show(AFTER_13);
    for (const key of ['front9', 'back9', 'total18'] as const) {
      expect(screen.getByTestId(`nassau-card-${key}`)).toBeTruthy();
    }
    expect(board.defaultSection).toBe('back9');
    expect(screen.getByTestId('nassau-card-back9').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('nassau-card-front9').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('nassau-section-back9')).toBeTruthy();
    expect(screen.getByTestId('nassau-card-back9').props.accessibilityRole).toBe('tab');
  });

  it.each([
    ['hull 5 → front9', { a: fours(5), b: fours(5) }, 'front9', 'active'],
    ['hull 13 → back9', AFTER_13, 'back9', 'active'],
    ['ferdig → total18', { a: fours(18), b: fours(18) }, 'total18', 'finished'],
  ] as const)('åpner på %s', async (_label, strokes, key, status) => {
    await show(strokes, { status, viewer: null });
    expect(screen.getByTestId('nassau-card-' + key).props.accessibilityState).toEqual({ selected: true });
  });

  it('et trykk på et annet kort bytter valgt kort og lista', async () => {
    await show(AFTER_13);
    expect(screen.queryByTestId('nassau-section-front9')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('nassau-card-front9'));
    });
    expect(screen.getByTestId('nassau-card-front9').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('nassau-card-back9').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('nassau-section-front9')).toBeTruthy();
    expect(screen.queryByTestId('nassau-section-back9')).toBeNull();
  });

  it('en kamp som pågår har ingen gull og ingen medaljong, og ikke «Avgjort» før alle er ferdige', async () => {
    const { board } = await show(AFTER_13);
    expect(board.sections.back9.state).toBe('live');
    // Back 9 er åpen: vanlige plasser, ingen skive og ingen medalje.
    expect(screen.queryByTestId('nassau-row-gold')).toBeNull();
    expect(screen.queryByTestId('board-medal-2', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('nassau-mark-decided')).toBeNull();
    expect(screen.getAllByTestId('nassau-mark-live', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('nassau-section-back9-push')).toBeNull();
    // Front 9 er avgjort for alle, og kortet sier det.
    expect(board.sections.front9.state).toBe('decided');
    expect(screen.getByTestId('nassau-card-front9').props.accessibilityLabel).toContain('Avgjort');
    expect(screen.getByTestId('nassau-card-back9').props.accessibilityLabel).not.toContain('Avgjort');
  });

  it('en avgjort kamp har gull og medaljer i lista', async () => {
    await show(AFTER_13);
    await act(async () => {
      fireEvent.press(screen.getByTestId('nassau-card-front9'));
    });
    expect(screen.getByTestId('nassau-mark-decided', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('nassau-row-gold')).toBeTruthy();
    expect(screen.getByTestId('board-medal-2')).toBeTruthy();
    expect(screen.getByTestId('board-medal-3')).toBeTruthy();
  });

  it('venteboksen står i en kamp ingen har startet', async () => {
    const { board } = await show({ a: fours(3), b: fours(3) }, { viewer: null });
    expect(board.sections.back9.state).toBe('waiting');
    await act(async () => {
      fireEvent.press(screen.getByTestId('nassau-card-back9'));
    });
    expect(screen.getByTestId('nassau-section-back9-pending')).toBeTruthy();
    expect(screen.queryByTestId('nassau-section-back9-list')).toBeNull();
    expect(screen.getByTestId('nassau-card-back9').props.accessibilityLabel).toContain(
      NASSAU_BOARD_TEXT.stateWaiting,
    );
  });

  it('«Delt 1.-plass» bare når kampen er avgjort og delt', async () => {
    // a og b likt over front 9, c ett slag bak: avgjort og delt.
    await show({ a: fours(9), b: fours(9), c: [5, ...fours(8)] }, { viewer: null });
    await act(async () => {
      fireEvent.press(screen.getByTestId('nassau-card-front9'));
    });
    expect(screen.getByTestId('nassau-section-front9-push')).toBeTruthy();
    // Avgjort og delt: ingen medaljer.
    expect(screen.queryByTestId('nassau-row-gold')).toBeNull();
  });

  it('ingen «Delt 1.-plass» mens delt ledelse pågår', async () => {
    await show({ a: fours(4), b: fours(4), c: [5, ...fours(3)] }, { viewer: null });
    expect(screen.queryByTestId('nassau-section-front9-push')).toBeNull();
    expect(screen.getByTestId('nassau-card-front9').props.accessibilityLabel).toContain(
      NASSAU_BOARD_TEXT.tiedLead,
    );
  });

  describe('sweep-linja', () => {
    it('vises for den som kan ta alle tre, med begge setninger for en som spiller', async () => {
      const { board } = await show(AFTER_13);
      expect(board.sweep).toEqual({ userId: 'marte', openSection: 'back9' });
      expect(textOf('nassau-sweep-line')).toBe('Marte kan ta alle tre. Du kan stoppe det på back 9.');
    });

    it('har bare første setning for en som ikke spiller', async () => {
      await show(AFTER_13, { viewer: null });
      expect(textOf('nassau-sweep-line')).toBe('Marte kan ta alle tre.');
    });

    it('sier «Du kan ta alle tre.» til seeren selv', async () => {
      // marte er seeren; hun har vunnet front 9 alene og back 9 pågår.
      await show(AFTER_13, { viewer: 'marte' });
      expect(textOf('nassau-sweep-line')).toBe('Du kan ta alle tre.');
    });

    it('står ikke der uten en som kan ta alle tre', async () => {
      const { board } = await show({ a: fours(5), b: fours(5) });
      expect(board.sweep).toBeNull();
      expect(screen.queryByTestId('nassau-sweep-line')).toBeNull();
    });
  });

  describe('seeren', () => {
    it('har sin egen linje på kortene, og «Deg» i lista', async () => {
      const { board } = await show(AFTER_13);
      expect(board.sections.back9.viewer).toEqual({ rank: 1, tied: false, gap: null, lead: 1 });
      expect(textOf('nassau-card-back9-you')).toBe('Du leder med 1');
      expect(textOf('nassau-card-front9-you')).toBe('Du: 3. · 2 bak');
      expect(textOf('nassau-card-total18-you')).toBe('Du: 2. · 1 bak');
      const row = within(screen.getByTestId('nassau-row-meg'));
      expect(row.getByText('Deg')).toBeTruthy();
    });

    it('har ingen «Du» og ingen «Deg» uten seer', async () => {
      await show(AFTER_13, { viewer: null });
      expect(screen.queryByTestId('nassau-card-back9-you')).toBeNull();
      expect(screen.queryByText('Deg')).toBeNull();
      expect(screen.queryByText(/^Du/)).toBeNull();
    });

    it('har «Du vant» på en avgjort kamp seeren vant alene', async () => {
      await show(AFTER_13, { viewer: 'marte' });
      expect(textOf('nassau-card-front9-you')).toBe('Du vant');
    });
  });

  it('bruker fullt navn i lista og fornavn på kortene', async () => {
    await show(AFTER_13, { viewer: null });
    expect(screen.getByText('Marte Lie')).toBeTruthy();
    // Back 9 lederen, Meg, står som fornavn på kortet.
    expect(screen.getByTestId('nassau-card-back9').props.accessibilityLabel).toContain('Meg');
  });

  it('net_to_par viser «mot par» og −2 i stedet for slag', async () => {
    await show(
      { meg: [3, 3, ...fours(7)], marte: fours(9), jonas: fours(9) },
      { ranking: 'net_to_par' },
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('nassau-card-front9'));
    });
    expect(screen.getByText('mot par')).toBeTruthy();
    expect(within(screen.getByTestId('nassau-row-meg')).getByText('−2')).toBeTruthy();
  });

  it('har ingen «kr» noe sted', async () => {
    await show(AFTER_13);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\bkr\b/);
  });

  describe('hodet', () => {
    it('har et skoggrønt hode med live-pille mens runden pågår', async () => {
      await show(AFTER_13);
      expect(screen.getByTestId('nassau-hero')).toBeTruthy();
      expect(screen.getByText('Tre kamper i én')).toBeTruthy();
      expect(textOf('nassau-pill')).toBe('Live · etter 13 hull');
      expect(screen.getByText('Nassau · netto')).toBeTruthy();
    });

    it('har ikke hodet i et ferdig spill, men sier scoringen', async () => {
      await show({ a: fours(18), b: fours(18) }, { status: 'finished', viewer: null });
      expect(screen.queryByTestId('nassau-hero')).toBeNull();
      expect(screen.queryByText('Tre kamper i én')).toBeNull();
      expect(screen.getByText('Spilles på netto.')).toBeTruthy();
    });
  });

  it('tabs-gruppen har etikett, og kortene leses som faner', async () => {
    await show(AFTER_13);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(screen.getByLabelText('Tre kamper')).toBeTruthy();
  });

  describe('reaksjoner (#2754)', () => {
    const value: ReactionsContextValue = {
      loaded: true,
      canReact: true,
      showHint: false,
      target: null,
      failure: null,
      getRow: () => ({ counts: {}, mine: [] }),
      openFor: jest.fn(),
      close: jest.fn(),
      toggle: jest.fn(),
      onRowOpened: jest.fn(),
    };

    it('et trykk på en rad åpner reaksjonsstripen for spilleren', async () => {
      await render(
        <ReactionsContext.Provider value={value}>
          <NassauBoard
            result={nassauResult(AFTER_13)}
            status="active"
            viewerUserId="meg"
            nameOf={nameOf}
            shortNameOf={shortNameOf}
          />
        </ReactionsContext.Provider>,
      );
      await act(async () => {
        fireEvent.press(screen.getByTestId('nassau-row-marte'));
      });
      expect(value.openFor).toHaveBeenCalledWith({ userId: 'marte', name: 'Marte' });
    });
  });
});
