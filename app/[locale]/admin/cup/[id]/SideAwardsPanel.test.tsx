import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SideAwardsPanel } from './SideAwardsPanel';
import type { CupSideAwardSnapshot } from '@/lib/cup/getCupSnapshot';
import { girReportsFor, slotReportsFor, type CupSideReports } from '@/lib/cup/cupSideReports';

// Type C render-test per docs/test-discipline.md — verifiserer at panelet
// veksler mellom redigerbar oppsett-visning og read-only-recap basert på
// `configEditable`, og at registrerings-seksjonen dukker opp når
// `showWinnerRegistration` er satt (vinner-dropdown for ctp/ld-slots,
// teller-felter for gir, #1489). Server-action-kall (lagre/registrer) er
// dekket av lib/cup/sideAwardActions.test.ts — denne testen mocker dem bort;
// config↔DB-rad-grupperingen er dekket av lib/cup/sideAwardRows.test.ts.

vi.mock('@/lib/cup/sideAwardActions', () => ({
  saveSideAwardConfig: vi.fn(async () => ({ ok: true })),
  registerSideAwardWinner: vi.fn(async () => ({ ok: true })),
  registerGirCounts: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The real lookups, wrapped so «ett hjem»-testen kan se at panelet kaller dem (som
// `endGamePlan.test.ts` gjør i appen). Alt annet i testfila går gjennom den ekte funksjonen.
vi.mock('@/lib/cup/cupSideReports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cup/cupSideReports')>();
  return { ...actual, slotReportsFor: vi.fn(actual.slotReportsFor), girReportsFor: vi.fn(actual.girReportsFor) };
});

const AWARDS: CupSideAwardSnapshot[] = [
  { id: 'a1', kind: 'ctp', holeNumber: 4, points: 2, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null, noWinner: false },
  { id: 'a2', kind: 'ld', holeNumber: 6, points: 3, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null, noWinner: false },
];

// #1489: 2×ctp-slots på samme hull + en gir-rad.
const SLOTTED_AWARDS: CupSideAwardSnapshot[] = [
  { id: 'b1', kind: 'ctp', holeNumber: 4, points: 2, slot: 1, slotCount: 2, winnerUserId: null, winnerTeam: null, noWinner: false },
  { id: 'b2', kind: 'ctp', holeNumber: 4, points: 2, slot: 2, slotCount: 2, winnerUserId: null, winnerTeam: null, noWinner: false },
  { id: 'b3', kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3, team1Count: null, team2Count: null },
];

const ROSTER = [
  { userId: 'p1', label: 'Kari Nordmann (Ørnen)' },
  { userId: 'p2', label: 'Ola Hansen (Falken)' },
];

const BASE_PROPS = {
  tournamentId: 't-1',
  rosterOptions: ROSTER,
  team1Name: 'Nord',
  team2Name: 'Sør',
};

describe('SideAwardsPanel', () => {
  it('redigerbar modus: viser rader + legg-til/fjern, ingen vinner-seksjon uten showWinnerRegistration', () => {
    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={AWARDS}
        configEditable
        showWinnerRegistration={false}
      />,
    );

    expect(screen.getByTestId('cup-side-awards')).toBeInTheDocument();
    // Two config rows rendered as number inputs (hole + points + winners per row).
    expect(screen.getAllByLabelText(/hull/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/vinnere/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /legg til sidepoeng/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /etter runden/i })).not.toBeInTheDocument();

    // Add a row → three hole-inputs now.
    fireEvent.click(screen.getByRole('button', { name: /legg til sidepoeng/i }));
    expect(screen.getAllByLabelText(/hull/i)).toHaveLength(3);
  });

  it('read-only modus + vinner-registrering: recap-liste og én vinner-dropdown per innslag', () => {
    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={AWARDS}
        configEditable={false}
        showWinnerRegistration
      />,
    );

    // No editable hole-inputs in read-only mode.
    expect(screen.queryAllByLabelText(/^hull$/i)).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /etter runden/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/vinner/i)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /registrer/i })).toHaveLength(2);
  });

  it('slots + gir (#1489): slot-rader nummereres «(1 av 2)», gir-raden får teller-felt i stedet for dropdown', () => {
    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={SLOTTED_AWARDS}
        configEditable={false}
        showWinnerRegistration
      />,
    );

    // Recap grupperer slot-radene til én linje («2 vinnere») + gir-linjen.
    // Gir-suffikset viser maks POENG per lag (3 × 1,5 p = 4,5 p), ikke antall
    // («maks 4,5 p per lag» står også i gir-registreringsraden → getAllByText).
    expect(screen.getByText(/2 vinnere/)).toBeInTheDocument();
    expect(screen.getAllByText(/maks 4,5 p per lag/).length).toBeGreaterThan(0);

    // Registrering: to vinner-dropdowns (én per ctp-slot, nummerert), og to
    // GIR-teller-felt (ett per lag) med egen registrer-knapp.
    expect(screen.getAllByLabelText(/vinner/i)).toHaveLength(2);
    expect(screen.getByText(/\(1 av 2\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(2 av 2\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/hvor mange gir klarte nord/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hvor mange gir klarte sør/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /registrer/i })).toHaveLength(3);
  });

  it('«ingen vinner» (#1530): valget finnes og sender winnerUserId null til actionen', async () => {
    const { registerSideAwardWinner } = await import('@/lib/cup/sideAwardActions');
    vi.mocked(registerSideAwardWinner).mockClear();

    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={[AWARDS[0]]}
        configEditable={false}
        showWinnerRegistration
      />,
    );

    const select = screen.getByTestId('side-award-winner-select');
    const registerButton = screen.getByTestId('side-award-register');

    // Uregistrert innslag: knappen er låst til arrangøren har svart noe.
    expect(registerButton).toBeDisabled();

    fireEvent.change(select, { target: { value: '__none__' } });
    expect(registerButton).not.toBeDisabled();
    fireEvent.click(registerButton);

    expect(registerSideAwardWinner).toHaveBeenCalledWith({
      tournamentId: BASE_PROPS.tournamentId,
      awardId: AWARDS[0].id,
      winnerUserId: null,
    });
  });
});

// #2283 (V4): «Meldt inn fra kampene» under each award and under both GIR
// counters. The box is read-only text: the selects and the counters stay as
// the organiser left them (nothing prefilled), and registering is unchanged.
describe('SideAwardsPanel: det kampene har meldt inn', () => {
  const CUP_AWARDS: CupSideAwardSnapshot[] = [
    { id: 'c1', kind: 'ctp', holeNumber: 3, points: 2, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null, noWinner: false },
    { id: 'c2', kind: 'ld', holeNumber: 9, points: 2, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null, noWinner: false },
    { id: 'c3', kind: 'gir', holeNumber: 5, points: 1.5, maxPerTeam: 2, team1Count: null, team2Count: null },
  ];
  const CUP_PROPS = { ...BASE_PROPS, team1Name: 'Rød', team2Name: 'Blå', initialAwards: CUP_AWARDS, configEditable: false, showWinnerRegistration: true };

  const REPORTS: CupSideReports = {
    slots: [
      {
        kind: 'ctp',
        holeNumber: 3,
        lines: [
          { gameId: 'g2', matchLabel: 'Four-ball 2', name: 'Kristian', distanceM: 1.8 },
          { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 },
        ],
        missing: [],
      },
      {
        kind: 'ld',
        holeNumber: 9,
        lines: [
          { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: null },
          { gameId: 'g2', matchLabel: 'Four-ball 2', name: null, distanceM: null },
        ],
        missing: [],
      },
    ],
    gir: [
      {
        holeNumber: 5,
        maxPerTeam: 2,
        team1: { count: 3, names: ['Jonas', 'Marte', 'Sigrid'], overMax: true },
        team2: { count: 1, names: ['Tore'], overMax: false },
        reportedMatches: 2,
        missing: [],
      },
    ],
  };

  const renderPanel = (sideReports?: CupSideReports | 'failed' | null) =>
    render(<SideAwardsPanel {...CUP_PROPS} sideReports={sideReports} />);

  it('en boks per innslag: kampen som avsender, vinneren, avstanden, og «Ingen på fairway»', () => {
    renderPanel(REPORTS);

    const ctp = screen.getByTestId('side-reports-c1');
    expect(within(ctp).getByText('Meldt inn fra kampene')).toBeInTheDocument();
    const rows = within(ctp).getAllByRole('listitem');
    // Shortest distance first, as the sender reads it: the match, the winner, the distance.
    expect(rows[0]).toHaveTextContent('Four-ball 2');
    expect(rows[0]).toHaveTextContent('Kristian');
    expect(rows[0]).toHaveTextContent('1,8 m');
    expect(rows[1]).toHaveTextContent('Four-ball 1');
    expect(rows[1]).toHaveTextContent('Marte');
    expect(rows[1]).toHaveTextContent('2,4 m');

    const ld = within(screen.getByTestId('side-reports-c2')).getAllByRole('listitem');
    expect(ld[0]).toHaveTextContent('Jonas');
    expect(ld[1]).toHaveTextContent('Four-ball 2');
    expect(ld[1]).toHaveTextContent('Ingen på fairway');
  });

  it('GIR: én boks under begge tellerne, ett lag per linje, over maks i advarselsfarge', () => {
    renderPanel(REPORTS);

    const boxes = screen.getAllByTestId('side-reports-c3');
    expect(boxes).toHaveLength(1);
    const red = within(boxes[0]).getByTestId('side-reports-gir-team1');
    expect(red).toHaveTextContent('Rød: 3 (Jonas, Marte, Sigrid) · maks 2 GIR');
    expect(red).toHaveClass('text-warning-text');
    const blue = within(boxes[0]).getByTestId('side-reports-gir-team2');
    expect(blue).toHaveTextContent('Blå: 1 (Tore)');
    expect(blue).not.toHaveClass('text-warning-text');
    expect(blue).not.toHaveTextContent('maks');

    // Both counters are described by the one box.
    expect(screen.getByTestId('gir-count-team1')).toHaveAttribute('aria-describedby', boxes[0].id);
    expect(screen.getByTestId('gir-count-team2')).toHaveAttribute('aria-describedby', boxes[0].id);
  });

  it('et lag uten treff står som 0, uten parentes og uten advarsel', () => {
    renderPanel({
      ...REPORTS,
      gir: [{ ...REPORTS.gir[0], team1: { count: 2, names: ['Jonas', 'Marte'], overMax: false }, team2: { count: 0, names: [], overMax: false } }],
    });
    const blue = screen.getByTestId('side-reports-gir-team2');
    expect(blue).toHaveTextContent(/^Blå: 0$/);
    expect(screen.getByTestId('side-reports-gir-team1')).not.toHaveClass('text-warning-text');
  });

  it('en kamp som ikke har meldt inn står med navn i alle tre boksene; en uten navn heter «Match»', () => {
    renderPanel({
      slots: [
        {
          kind: 'ctp',
          holeNumber: 3,
          lines: [{ gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 }],
          missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
        },
        { kind: 'ld', holeNumber: 9, lines: [{ gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: null }], missing: [{ gameId: 'g3', matchLabel: null }] },
      ],
      gir: [{ ...REPORTS.gir[0], reportedMatches: 1, missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }] }],
    });
    expect(screen.getByTestId('side-reports-c1')).toHaveTextContent('Four-ball 2 har ikke meldt inn');
    expect(screen.getByTestId('side-reports-c2')).toHaveTextContent('Match har ikke meldt inn');
    expect(screen.getByTestId('side-reports-c3')).toHaveTextContent('Four-ball 2 har ikke meldt inn');
  });

  it('ingen har meldt inn: «Ingen kamper har meldt inn ennå.» i hver boks, uten navngitte kamper', () => {
    renderPanel({
      slots: [
        { kind: 'ctp', holeNumber: 3, lines: [], missing: [{ gameId: 'g1', matchLabel: 'Four-ball 1' }] },
        { kind: 'ld', holeNumber: 9, lines: [], missing: [{ gameId: 'g1', matchLabel: 'Four-ball 1' }] },
      ],
      gir: [{ ...REPORTS.gir[0], team1: { count: 0, names: [], overMax: false }, team2: { count: 0, names: [], overMax: false }, reportedMatches: 0, missing: [{ gameId: 'g1', matchLabel: 'Four-ball 1' }] }],
    });
    for (const id of ['side-reports-c1', 'side-reports-c2', 'side-reports-c3']) {
      expect(screen.getByTestId(id)).toHaveTextContent('Ingen kamper har meldt inn ennå.');
      expect(screen.getByTestId(id)).not.toHaveTextContent('har ikke meldt inn');
    }
  });

  it('lesefeil: samme linje som avslutt-siden sier, med «kampene», og registreringen virker', () => {
    renderPanel('failed');
    for (const id of ['side-reports-c1', 'side-reports-c2', 'side-reports-c3']) {
      expect(screen.getByTestId(id)).toHaveTextContent('Fikk ikke hentet det kampene har meldt inn.');
    }
    expect(screen.getAllByTestId('side-award-winner-select')).toHaveLength(2);
    expect(screen.getByTestId('gir-count-team1')).toBeEnabled();
    expect(screen.getByTestId('gir-count-team2')).toBeEnabled();
  });

  it('uten lest data (null eller ikke gitt) står ingen boks', () => {
    for (const sideReports of [null, undefined] as const) {
      const { unmount } = renderPanel(sideReports);
      expect(screen.queryByRole('group', { name: 'Meldt inn fra kampene' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('to vinner-plasser på samme hull: hver boks har sin egen test-id (kåringens id), og hver velger peker på sin boks', () => {
    const slotted: CupSideAwardSnapshot[] = [
      { id: 'b1', kind: 'ctp', holeNumber: 4, points: 2, slot: 1, slotCount: 2, winnerUserId: null, winnerTeam: null, noWinner: false },
      { id: 'b2', kind: 'ctp', holeNumber: 4, points: 2, slot: 2, slotCount: 2, winnerUserId: null, winnerTeam: null, noWinner: false },
      { id: 'b3', kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3, team1Count: null, team2Count: null },
    ];
    const sideReports: CupSideReports = {
      slots: [
        {
          kind: 'ctp',
          holeNumber: 4,
          lines: [{ gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 }],
          missing: [],
        },
      ],
      gir: [{ ...REPORTS.gir[0], holeNumber: 3 }],
    };
    render(<SideAwardsPanel {...CUP_PROPS} initialAwards={slotted} sideReports={sideReports} />);

    // Én boks per vinner-plass: ikke to like test-id-er for «ctp, hull 4».
    expect(screen.getAllByRole('group', { name: 'Meldt inn fra kampene' })).toHaveLength(3);
    const first = screen.getByTestId('side-reports-b1');
    const second = screen.getByTestId('side-reports-b2');
    expect(first).not.toBe(second);
    expect(first).toHaveTextContent('Marte');
    expect(second).toHaveTextContent('Marte');
    const [firstSelect, secondSelect] = screen.getAllByTestId('side-award-winner-select');
    expect(firstSelect).toHaveAttribute('aria-describedby', first.id);
    expect(secondSelect).toHaveAttribute('aria-describedby', second.id);
    expect(first.id).not.toBe(second.id);
    expect(screen.getByTestId('side-reports-b3')).toBeInTheDocument();
  });

  it('panelet bruker de delte oppslagene: hullet slås opp med kåringens type og hull, og svaret er det boksen viser', () => {
    vi.mocked(slotReportsFor).mockClear();
    vi.mocked(girReportsFor).mockClear();
    // Første oppslag (ctp, hull 3) svarer «feilet» selv om rapporten har linjer: boksen følger oppslaget.
    vi.mocked(slotReportsFor).mockReturnValueOnce('failed');
    renderPanel(REPORTS);

    expect(slotReportsFor).toHaveBeenCalledWith(REPORTS, 'ctp', 3);
    expect(slotReportsFor).toHaveBeenCalledWith(REPORTS, 'ld', 9);
    expect(girReportsFor).toHaveBeenCalledWith(REPORTS, 5);
    expect(screen.getByTestId('side-reports-c1')).toHaveTextContent('Fikk ikke hentet det kampene har meldt inn.');
    expect(screen.getByTestId('side-reports-c1')).not.toHaveTextContent('Kristian');
    // De to andre går gjennom den ekte funksjonen.
    expect(screen.getByTestId('side-reports-c2')).toHaveTextContent('Jonas');
    expect(screen.getByTestId('side-reports-c3')).toHaveTextContent('Rød: 3');
  });

  it('ingenting forhåndsutfylt: velgerne og tellerne står tomme, og registrer er låst til arrangøren svarer', () => {
    renderPanel(REPORTS);
    for (const select of screen.getAllByTestId('side-award-winner-select')) {
      expect(select).toHaveValue('');
      expect(select).toHaveAttribute('aria-describedby');
    }
    expect(screen.getByTestId('gir-count-team1')).toHaveValue(null);
    expect(screen.getByTestId('gir-count-team2')).toHaveValue(null);
    for (const button of screen.getAllByTestId('side-award-register')) expect(button).toBeDisabled();
    expect(screen.getByTestId('gir-register')).toBeDisabled();
  });
});
