import { describe, expect, it } from 'vitest';
import { appCupLineupSummary, buildAppCupLineupView } from './buildAppCupLineupView';
import type { CupLineupBoard } from './lineupData';

/**
 * Type A (#2752): det appen får se av uttaket. `canSeeTeamLineup` er testet for seg i
 * `captainRoles.test.ts`. Her står at viewet ikke legger noe til, og at rommets sammendrag
 * ikke kan si hvem som er valgt.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function board(over: Partial<CupLineupBoard> = {}): CupLineupBoard {
  return {
    access: {
      userId: A,
      isAdmin: false,
      groupId: null,
      role: { kind: 'captain', teamNumber: 1 },
      participants: [
        { userId: A, teamNumber: 1, isCaptain: true },
        { userId: B, teamNumber: 2, isCaptain: true },
      ],
    },
    cupName: 'Klubbmesterskapet',
    cupStatus: 'active',
    teamNames: { 1: 'Team Nord', 2: 'Team Sør' },
    plannedMatchCount: 4,
    pointsToWin: 2.5,
    hasDefaultWeights: true,
    matchCount: 0,
    pendingSlotCount: 1,
    squads: {
      1: [{ userId: A, displayName: 'Ola', hcpIndex: 12 }],
      2: [{ userId: B, displayName: 'Per', hcpIndex: 9 }],
      unassigned: [],
    },
    sessions: [
      {
        id: 'okt',
        sessionIndex: 0,
        format: 'singles_matchplay',
        slotCount: 1,
        revealedAt: null,
        teams: [
          { teamNumber: 1, submittedAt: '2026-11-02T10:00:00Z', slots: [{ slotIndex: 0, seat: 1, userId: A }] },
          { teamNumber: 2, submittedAt: '2026-11-02T10:01:00Z', slots: null },
        ],
      },
    ],
    ...over,
  };
}

describe('buildAppCupLineupView', () => {
  it('kapteinen får sitt eget lag, og motstanderens plasser er null også når laget har levert', () => {
    const view = buildAppCupLineupView(board());
    expect(view?.role).toBe('captain');
    expect(view?.myTeam).toBe(1);
    expect(view?.sessions[0].teams[0].slots).toEqual([{ slotIndex: 0, seat: 1, userId: A }]);
    expect(view?.sessions[0].teams[1]).toEqual({ teamNumber: 2, submittedAt: '2026-11-02T10:01:00Z', slots: null });
  });

  it('deltakerlista med roller blir ikke med', () => {
    const json = JSON.stringify(buildAppCupLineupView(board()));
    expect(json).not.toContain('participants');
    expect(json).not.toContain('isCaptain');
    expect(json).not.toContain('access');
  });

  it('sier om begge lag har kaptein', () => {
    expect(buildAppCupLineupView(board())?.bothCaptains).toBe(true);
    const oneCaptain = board();
    oneCaptain.access.participants = [{ userId: A, teamNumber: 1, isCaptain: true }];
    expect(buildAppCupLineupView(oneCaptain)?.bothCaptains).toBe(false);
  });

  it('den uten rolle får ingenting', () => {
    const none = board();
    none.access.role = { kind: 'none' };
    expect(buildAppCupLineupView(none)).toBeNull();
  });

  it('arrangøren har ikke noe eget lag', () => {
    const organizer = board();
    organizer.access.role = { kind: 'organizer' };
    const view = buildAppCupLineupView(organizer);
    expect(view?.role).toBe('organizer');
    expect(view?.myTeam).toBeNull();
  });
});

describe('appCupLineupSummary', () => {
  const session = (revealedAt: string | null, format = 'singles_matchplay', count = 2) => ({
    format,
    slot_count: count,
    revealed_at: revealedAt,
  });
  const captain = [{ userId: A, teamNumber: 1 as const, isCaptain: true }];
  const NOW = '2026-11-02T10:00:00Z';

  it('arrangøren får døra når cupen har en kaptein, med antall økter', () => {
    expect(
      appCupLineupSummary({ role: { kind: 'organizer' }, participants: captain, sessions: [session(NOW), session(null)], finished: false }).door,
    ).toEqual({ kind: 'organizer', sessionCount: 2 });
  });

  it('uten kapteiner og økter står rommet som før', () => {
    expect(appCupLineupSummary({ role: { kind: 'organizer' }, participants: [], sessions: [], finished: false }).door).toBeNull();
  });

  it('kapteinen får døra bare når en økt venter', () => {
    const role = { kind: 'captain' as const, teamNumber: 1 as const };
    expect(appCupLineupSummary({ role, participants: captain, sessions: [session(null)], finished: false }).door).toEqual({ kind: 'captain' });
    expect(appCupLineupSummary({ role, participants: captain, sessions: [session(NOW)], finished: false }).door).toBeNull();
  });

  it('en spiller får ingen dør, og en ferdig cup har ingen', () => {
    expect(appCupLineupSummary({ role: { kind: 'none' }, participants: captain, sessions: [session(null)], finished: false }).door).toBeNull();
    expect(appCupLineupSummary({ role: { kind: 'organizer' }, participants: captain, sessions: [session(null)], finished: true }).door).toBeNull();
  });

  it('den siste avdekkede økta står, med format og antall og ingenting annet', () => {
    const summary = appCupLineupSummary({
      role: { kind: 'none' },
      participants: captain,
      sessions: [session(NOW, 'foursomes_matchplay', 3), session(NOW, 'singles_matchplay', 4), session(null, 'chapman_matchplay', 5)],
      finished: false,
    });
    expect(summary.revealed).toEqual({ format: 'singles_matchplay', slotCount: 4 });
  });

  it('uten avdekking står det ingenting om kortet', () => {
    expect(appCupLineupSummary({ role: { kind: 'none' }, participants: [], sessions: [session(null)], finished: false }).revealed).toBeNull();
  });
});
