// Native N3 (#1825): flight-utvalget på hull-siden.
//
// Reglene selv er delte (`lib/games/flightScope.ts` — TS-tvillingen til
// `can_score_for`), så det som testes her er oversettelsen: at bundelens
// camelCase kommer riktig inn i dem, og at de fire grenene i webbens
// `resolveFlight` gir samme utvalg i appen.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer } from '../data/gameBundle';
import { findInRoster, pendingApprovals, resolveFlight, toRoster } from './roster';

function player(overrides: Partial<BundlePlayer> & { userId: string }): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 12,
    teeGender: 'mens',
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    ...overrides,
  };
}

const SOLO: GameMode = 'solo_strokeplay';

function idsOf(entries: { user_id: string }[]): string[] {
  return entries.map((e) => e.user_id);
}

describe('resolveFlight', () => {
  it('≤4 aktive: alle er i samme gruppe, uansett flight-nummer', () => {
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 2 }),
      player({ userId: 'c', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b', 'c']);
  });

  it('>4 aktive: bare min egen flight', () => {
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 1 }),
      player({ userId: 'c', flightNumber: 2 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b']);
  });

  it('>4 aktive uten egen flight: hele rosteret (arv fra flight-løse spill)', () => {
    const roster = toRoster([
      player({ userId: 'a' }),
      player({ userId: 'b', flightNumber: 1 }),
      player({ userId: 'c', flightNumber: 1 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('wolf er én gruppe også med fem spillere', () => {
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 2 }),
      player({ userId: 'c', flightNumber: 2 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, 'wolf', me))).toHaveLength(5);
  });

  it('trukkede spillere står aldri på banen — heller ikke som kapasitet', () => {
    // Fem rader, men bare fire aktive: spillet ER én flight, og den trukkede
    // vises ikke.
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 2 }),
      player({ userId: 'c', flightNumber: 2 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2, withdrawnAt: '2026-08-30T08:00:00.000Z' }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('pendingApprovals', () => {
  it('lister leverte, ikke godkjente kort fra flight-makkere — aldri mitt eget', () => {
    const roster = toRoster([
      player({ userId: 'me', submittedAt: '2026-08-30T10:00:00.000Z' }),
      player({ userId: 'mate', submittedAt: '2026-08-30T10:05:00.000Z' }),
      player({ userId: 'nothanded' }),
      player({
        userId: 'done',
        submittedAt: '2026-08-30T10:01:00.000Z',
        approvedAt: '2026-08-30T10:02:00.000Z',
      }),
    ]);

    expect(idsOf(pendingApprovals(roster, SOLO, 'me'))).toEqual(['mate']);
  });
});
