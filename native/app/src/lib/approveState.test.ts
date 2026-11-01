// #2577: hvilken av de fire tavlene godkjenningen viser (Type A).
//
// Hvem som kan godkjenne hvem er den delte `canApproveScorecardFor`, og den
// testes der den bor. Det som testes her, er sorteringen oppå: kortene som
// venter, de jeg har godkjent, de som ikke er levert, og navnene som får
// beskjed.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundlePlayer } from '../data/gameBundle';
import { homePlayer as player } from '../test/homeFixtures';
import { approveRows, approveScreenState, cardScoresByHole } from './approveState';
import { toRoster } from './roster';

const SUBMITTED = '2026-10-13T12:30:00.000Z';
const APPROVED = '2026-10-13T12:41:00.000Z';

/** Levert av seg selv, ikke godkjent. */
const delivered = (userId: string, extra: Partial<BundlePlayer> = {}) =>
  player({ userId, submittedAt: SUBMITTED, submittedByUserId: userId, ...extra });

/** Levert og godkjent av `by`. */
const approvedBy = (userId: string, by: string, extra: Partial<BundlePlayer> = {}) =>
  delivered(userId, { approvedAt: APPROVED, approvedByUserId: by, ...extra });

type Game = Pick<BundleGame, 'gameMode' | 'status' | 'requirePeerApproval'>;
const SOLO: Game = { gameMode: 'solo_strokeplay', status: 'active', requirePeerApproval: true };
const TEXAS: Game = { gameMode: 'texas_scramble', status: 'active', requirePeerApproval: true };
const PATSOME: Game = { gameMode: 'patsome', status: 'active', requirePeerApproval: true };

function stateOf(players: BundlePlayer[], game: Game = SOLO, userId = 'me') {
  return approveScreenState({ roster: toRoster(players), game, userId });
}

const ids = (entries: readonly { user_id: string }[]) => entries.map((e) => e.user_id);

describe('approveScreenState', () => {
  it.each<[string, BundlePlayer[], Game, string]>([
    [
      'alt levert og godkjent, men av en annen',
      [delivered('me'), approvedBy('a', 'b'), approvedBy('b', 'a')],
      SOLO,
      'empty',
    ],
    // Uten porten ville rosteret under gitt «alle kortene er godkjent».
    [
      'runden er avsluttet',
      [delivered('me'), approvedBy('a', 'me')],
      { ...SOLO, status: 'finished' },
      'empty',
    ],
    [
      'runden krever ikke godkjenning',
      [delivered('me'), approvedBy('a', 'me')],
      { ...SOLO, requirePeerApproval: false },
      'empty',
    ],
    ['jeg står ikke i rosteret', [delivered('a'), delivered('b')], SOLO, 'empty'],
  ])('%s gir den tomme tilstanden', (_, players, game, kind) => {
    expect(stateOf(players, game).kind).toBe(kind);
  });

  it('to kort levert og ikke godkjent venter, i rosterens rekkefølge', () => {
    const state = stateOf([delivered('b'), delivered('me'), delivered('a')]);
    expect(state.kind).toBe('pending');
    if (state.kind !== 'pending') return;
    expect(ids(state.pending)).toEqual(['b', 'a']);
  });

  it('alt levert og godkjent av meg gir «alle kortene er godkjent»', () => {
    const state = stateOf([delivered('me'), approvedBy('a', 'me'), approvedBy('b', 'me')]);
    expect(state.kind).toBe('allApproved');
    if (state.kind !== 'allApproved') return;
    expect(ids(state.approvedByMe)).toEqual(['a', 'b']);
    expect(state.notifiedNames).toEqual(['a', 'b']);
  });

  it('ett godkjent av meg og ett ikke levert gir «ikke levert» med begge listene', () => {
    const state = stateOf([delivered('me'), approvedBy('a', 'me'), player({ userId: 'b' })]);
    expect(state.kind).toBe('notDelivered');
    if (state.kind !== 'notDelivered') return;
    expect(ids(state.approvedByMe)).toEqual(['a']);
    expect(ids(state.notDelivered)).toEqual(['b']);
  });

  it('ingen godkjent av meg og ett ikke levert gir «ikke levert» uten godkjente', () => {
    const state = stateOf([player({ userId: 'me' }), player({ userId: 'a' })]);
    expect(state.kind).toBe('notDelivered');
    if (state.kind !== 'notDelivered') return;
    expect(state.approvedByMe).toEqual([]);
    expect(state.notifiedNames).toEqual([]);
    expect(ids(state.notDelivered)).toEqual(['a']);
  });

  it('et kort jeg leverte for en annen er ikke mitt å godkjenne (beslutning 8)', () => {
    // «b» venter på en annen i flighten, men jeg leverte det og kan ikke
    // godkjenne det. Ingenting annet venter på meg.
    const state = stateOf([
      delivered('me'),
      approvedBy('a', 'me'),
      delivered('b', { submittedByUserId: 'me' }),
    ]);
    expect(state.kind).toBe('allApproved');
    if (state.kind !== 'allApproved') return;
    expect(ids(state.approvedByMe)).toEqual(['a']);
  });

  it('et ulevert kort jeg ikke kan godkjenne, står ikke under «ikke levert»', () => {
    // Trukket spiller: står ikke på banen og har ingen kort å levere.
    const state = stateOf([
      delivered('me'),
      approvedBy('a', 'me'),
      player({ userId: 'b', withdrawnAt: '2026-10-13T10:00:00.000Z' }),
    ]);
    expect(state.kind).toBe('allApproved');
  });

  it('en gjest får ikke beskjed, og bare gjester gir ingen navn mens tavla står', () => {
    const mixed = stateOf([
      delivered('me'),
      approvedBy('a', 'me', { name: 'Marte Lie' }),
      approvedBy('g', 'me', { name: 'Gjest Gjestesen', isGuest: true }),
    ]);
    expect(mixed.kind).toBe('allApproved');
    if (mixed.kind !== 'allApproved') return;
    expect(mixed.notifiedNames).toEqual(['Marte']);

    const guestsOnly = stateOf([
      delivered('me'),
      approvedBy('g', 'me', { name: 'Gjest Gjestesen', isGuest: true }),
    ]);
    expect(guestsOnly.kind).toBe('allApproved');
    if (guestsOnly.kind !== 'allApproved') return;
    expect(guestsOnly.notifiedNames).toEqual([]);
    expect(ids(guestsOnly.approvedByMe)).toEqual(['g']);
  });
});

describe('lagkort (beslutning 5)', () => {
  const team = (n: number) => ({ teamNumber: n });

  it('min ulevert lagkamerat står ikke under «ikke levert»; det andre laget er én rad', () => {
    const roster = [
      player({ userId: 'me', ...team(1) }),
      player({ userId: 'mate', ...team(1) }),
      player({ userId: 'r2', name: 'Rita', ...team(2) }),
      player({ userId: 'r1', name: 'Rolf', ...team(2) }),
    ];
    const state = stateOf(roster, TEXAS);
    expect(state.kind).toBe('notDelivered');
    if (state.kind !== 'notDelivered') return;
    expect(ids(state.notDelivered)).toEqual(['r2', 'r1']);
    expect(approveRows(state.notDelivered, toRoster(roster), TEXAS.gameMode as GameMode)).toEqual([
      { key: 'team-2', name: 'Rita og Rolf', clock: null, ownerId: 'r1' },
    ]);
  });

  it('det andre lagets godkjente kort er én rad, men hver spiller får beskjed', () => {
    const roster = [
      delivered('me', team(1)),
      delivered('mate', { ...team(1), submittedByUserId: 'me' }),
      approvedBy('r1', 'me', { name: 'Rolf Ruud', ...team(2), submittedByUserId: 'r1' }),
      approvedBy('r2', 'me', {
        name: 'Rita Ruud',
        ...team(2),
        submittedByUserId: 'r1',
        approvedAt: '2026-10-13T12:44:00.000Z',
      }),
    ];
    const state = stateOf(roster, TEXAS);
    expect(state.kind).toBe('allApproved');
    if (state.kind !== 'allApproved') return;
    expect(state.notifiedNames).toEqual(['Rolf', 'Rita']);
    expect(approveRows(state.approvedByMe, toRoster(roster), TEXAS.gameMode as GameMode)).toEqual([
      {
        key: 'team-2',
        name: 'Rolf Ruud og Rita Ruud',
        clock: '2026-10-13T12:44:00.000Z',
        ownerId: 'r1',
      },
    ]);
  });

  it('radens eier er kapteinen over hele rosteret, også når hen ikke står i lista', () => {
    // «a» er lex-min på lag 2 og eier lagets slag, men en annen godkjente
    // kortet hens. Rosteret står i tilfeldig rekkefølge (ingen `.order()`).
    const roster = toRoster([
      player({ userId: 'zed', ...team(2), submittedAt: SUBMITTED, approvedAt: APPROVED, approvedByUserId: 'me' }),
      player({ userId: 'me', ...team(1) }),
      player({ userId: 'a', ...team(2), submittedAt: SUBMITTED, approvedAt: APPROVED, approvedByUserId: 'x' }),
    ]);
    const approvedRows = approveRows([roster[0]!], roster, 'texas_scramble');
    expect(approvedRows.map((row) => row.ownerId)).toEqual(['a']);

    const undelivered = toRoster([
      player({ userId: 'zed', ...team(2) }),
      player({ userId: 'me', ...team(1) }),
      player({ userId: 'a', ...team(2), submittedAt: SUBMITTED }),
    ]);
    const notDeliveredRows = approveRows([undelivered[0]!], undelivered, 'texas_scramble');
    expect(notDeliveredRows.map((row) => row.ownerId)).toEqual(['a']);
  });

  it('bare mitt eget lag, og jeg leverte lagkortet selv, gir den tomme tilstanden', () => {
    const state = stateOf(
      [
        delivered('me', team(1)),
        delivered('mate', { ...team(1), submittedByUserId: 'me' }),
        delivered('third', { ...team(1), submittedByUserId: 'me' }),
      ],
      TEXAS,
    );
    expect(state.kind).toBe('empty');
  });

  it('utenfor lagkort-formatene er hver oppføring sin egen rad', () => {
    const roster = toRoster([
      approvedBy('a', 'me', { name: 'Marte Lie', ...team(1) }),
      approvedBy('b', 'me', { name: 'Jonas Berg', ...team(1) }),
    ]);
    expect(approveRows(roster, roster, 'solo_strokeplay')).toEqual([
      { key: 'a', name: 'Marte Lie', clock: APPROVED, ownerId: 'a' },
      { key: 'b', name: 'Jonas Berg', clock: APPROVED, ownerId: 'b' },
    ]);
  });
});

// #2751: laget deler hull 7–18, men hver spiller leverer og godkjennes for seg.
describe('Patsome', () => {
  const team = (extra: Partial<BundlePlayer> = {}) => ({ teamNumber: 1, ...extra });

  it('makkeren på laget som ikke har levert, står som ikke levert', () => {
    const roster = [
      player({ userId: 'me', ...team() }),
      player({ userId: 'mate', ...team() }),
    ];
    const state = stateOf(roster, PATSOME);
    expect(state.kind).toBe('notDelivered');
    if (state.kind !== 'notDelivered') return;
    expect(ids(state.notDelivered)).toEqual(['mate']);
  });

  it('hver spiller er sin egen rad, ikke én rad for laget', () => {
    const roster = [
      player({ userId: 'me', teamNumber: 2 }),
      delivered('a', team({ name: 'Anna' })),
      delivered('b', team({ name: 'Bjørn' })),
    ];
    const rows = approveRows(roster.slice(1).map((p) => toRoster([p])[0]!), toRoster(roster), 'patsome');
    expect(rows.map((row) => [row.key, row.ownerId])).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ]);
  });

  it('kortet er egne hull 1–6 og lagets hull 7–18, også for den som ikke er kaptein', () => {
    const roster = toRoster([player({ userId: 'a-captain', ...team() }), player({ userId: 'mate', ...team() })]);
    const row = (userId: string, holeNumber: number, strokes: number) =>
      ({ userId, holeNumber, strokes }) as LocalScore;
    const scores = [
      row('mate', 1, 5),
      row('a-captain', 1, 9),
      row('mate', 6, 4),
      row('a-captain', 7, 6),
      row('mate', 7, 8),
      row('a-captain', 18, 3),
    ];

    const mate = cardScoresByHole(scores, roster, 'patsome', 'mate');
    expect([...mate].map(([hole, score]) => [hole, score.strokes])).toEqual([
      [1, 5],
      [6, 4],
      [7, 6],
      [18, 3],
    ]);
    const captain = cardScoresByHole(scores, roster, 'patsome', 'a-captain');
    expect(captain.get(1)?.strokes).toBe(9);
    expect(captain.get(7)?.strokes).toBe(6);
  });

  it('andre formater leser som før: egne rader, og lagets rad i lagkort', () => {
    const roster = toRoster([player({ userId: 'a-captain', ...team() }), player({ userId: 'mate', ...team() })]);
    const scores = [{ userId: 'a-captain', holeNumber: 2, strokes: 4 } as LocalScore];
    expect(cardScoresByHole(scores, roster, 'solo_strokeplay', 'mate').size).toBe(0);
    expect(cardScoresByHole(scores, roster, 'texas_scramble', 'mate').get(2)?.strokes).toBe(4);
  });
});
