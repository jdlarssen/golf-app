// #2580: lagene utslagsflatene i appen leser (Type A). Regelen selv er
// lib/games/teeShots.test.ts og setningene teeShotsCopy.test.ts; her låses
// rekkefølgen, laget som stopper leveringen og arrangørens linjer.
import type { BundlePlayer } from '../data/gameBundle';
import {
  teeShotDeliveryLock,
  teeShotMinimum,
  teeShotOrganizerNotice,
  teeShotTeam,
  teeShotTeams,
} from './teeShotTeams';

function player(userId: string, name: string, teamNumber: number | null, extra: Partial<BundlePlayer> = {}) {
  return {
    userId,
    name,
    nickname: null,
    teamNumber,
    flightNumber: null,
    courseHandicap: 10,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    submittedByUserId: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    isGuest: false,
    ...extra,
  } as BundlePlayer;
}

const PLAYERS = [
  player('u-per', 'Per Hauge', 1),
  player('u-marte', 'Marte Lie', 1),
  player('u-sigrid', 'Sigrid Aas', 1),
  player('u-jonas', 'Jonas Berg', 1),
  player('u-kari', 'Kari Nord', 2),
  player('u-ola', 'Ola Sør', 2),
];

/** Lagets valg på hull 1, 2, … i den rekkefølgen. */
function picks(teamNumber: number, owners: string[]) {
  return owners.map((teeShotBy, i) => ({ teamNumber, holeNumber: i + 1, teeShotBy }));
}

// Utslag 3: Marte 7, Jonas 5, Sigrid 4, Per 2 på alle 18 hull.
const TEAM_1_SHORT = picks(1, [
  ...Array<string>(7).fill('u-marte'),
  ...Array<string>(5).fill('u-jonas'),
  ...Array<string>(4).fill('u-sigrid'),
  ...Array<string>(2).fill('u-per'),
]);
const TEAM_2_SHORT = picks(2, [...Array<string>(17).fill('u-kari'), 'u-ola']);

describe('teeShotTeams', () => {
  it('laget står i navnerekkefølgen fra nettet, med korte navn, og lagene stiger', () => {
    expect(teeShotTeam(PLAYERS, 1).members.map((m) => m.name)).toEqual(['Jonas', 'Marte', 'Per', 'Sigrid']);
    expect(teeShotTeams(PLAYERS, [2, 1, null, 2]).map((t) => t.teamNumber)).toEqual([1, 2]);
  });

  it('minimum leses bare for formater som teller utslag, med et gjennomførbart tall', () => {
    expect(teeShotMinimum({ gameMode: 'texas_scramble', modeConfig: { team_size: 4, min_tee_shots: 4 } })).toBe(4);
    expect(teeShotMinimum({ gameMode: 'texas_scramble', modeConfig: { team_size: 4 } })).toBeNull();
    expect(teeShotMinimum({ gameMode: 'solo_strokeplay', modeConfig: { min_tee_shots: 4 } })).toBeNull();
  });

  it('leveringen stoppes av det første laget blant kortene som mangler, i kortenes rekkefølge', () => {
    const rows = [...TEAM_1_SHORT, ...TEAM_2_SHORT];
    const lock = teeShotDeliveryLock({ players: PLAYERS, minimum: 4, rows, deliveringIds: ['u-ola', 'u-per'] });
    expect(lock?.team.teamNumber).toBe(2);
    expect(lock?.advice.short.map((p) => p.userId)).toEqual(['u-ola']);

    // Et lag med nok utslag stopper ingenting.
    const enough = picks(1, Array.from({ length: 18 }, (_, i) => ['u-marte', 'u-jonas', 'u-sigrid', 'u-per'][i % 4]!));
    expect(teeShotDeliveryLock({ players: PLAYERS, minimum: 4, rows: enough, deliveringIds: ['u-per'] })).toBeNull();
    expect(teeShotDeliveryLock({ players: PLAYERS, minimum: 4, rows, deliveringIds: [] })).toBeNull();
  });

  it('arrangøren får én linje per spiller under minimum, med lagnavn når spillet har flere lag', () => {
    expect(teeShotOrganizerNotice(PLAYERS, 4, [...TEAM_1_SHORT, ...TEAM_2_SHORT])).toEqual([
      'Lag 1 · Per har 2 av 4 utslag',
      'Lag 2 · Ola har 1 av 4 utslag',
    ]);
    const oneTeam = PLAYERS.filter((p) => p.teamNumber === 1);
    expect(teeShotOrganizerNotice(oneTeam, 4, TEAM_1_SHORT)).toEqual(['Per har 2 av 4 utslag']);
    // En trukket spiller teller ikke med.
    const withdrawn = oneTeam.map((p) => (p.userId === 'u-per' ? { ...p, withdrawnAt: '2026-10-16T10:00:00Z' } : p));
    expect(teeShotOrganizerNotice(withdrawn, 4, TEAM_1_SHORT)).toEqual([]);
  });
});
