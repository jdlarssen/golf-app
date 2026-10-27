// #2638 Del 2: ligaen slik `GET /api/liga/[id]` sender den, med tegningenes
// eksempeldata (Vinterliga på Trackman, midt i runde 3). Delt av
// `League.test.tsx` og `LeagueRoundStart.test.tsx`.
import type {
  AppLeagueParticipant,
  AppLeagueRound,
  AppLeagueView,
} from '../../../../lib/league/appLeagueView';

const DAY = 86_400_000;

/** En runde med vinduet `opensInDays` fram (negativt = åpnet) og `days` langt. */
export function leagueRound(
  sequence: number,
  opensInDays: number,
  overrides: Partial<AppLeagueRound> = {},
  days = 10,
): AppLeagueRound {
  const opens = new Date(Date.now() + opensInDays * DAY);
  return {
    id: `r${sequence}`,
    label: `Runde ${sequence}`,
    sequence,
    opensAt: opens.toISOString(),
    closesAt: new Date(opens.getTime() + days * DAY).toISOString(),
    ready: true,
    teeName: 'Gul',
    delivered: [],
    inProgress: [],
    simSettings: {
      pins: 'MEDIUM',
      putting: 'AUTO_TOUR_PRO',
      gimme: 'NOT_APPLICABLE',
      mulligans: 'NO',
      wind: 'CALM',
      fairway_firmness: 'MEDIUM',
      green_firmness: 'MEDIUM',
      green_stimp: '12',
    },
    overriddenKeys: ['green_stimp'],
    settingsLocked: false,
    ...overrides,
  };
}

export function participant(userId: string, name: string, hcpIndex: number | null = null): AppLeagueParticipant {
  return { userId, name: name.split(' ')[0], fullName: name, hcpIndex };
}

export const PEOPLE: AppLeagueParticipant[] = [
  participant('me', 'Jørgen Larssen', 12.6),
  participant('martin', 'Martin Lie', 9.4),
  participant('kristian', 'Kristian Holm', 14.2),
  participant('erlend', 'Erlend Nes', 18),
  participant('sindre', 'Sindre Aas', 21),
];

/** Runde 1–2 stengt, 3 åpen (Martin og Kristian har spilt, Erlend er i gang), 4 kommer. */
export function leagueView(overrides: {
  league?: Partial<AppLeagueView['league']>;
  rounds?: AppLeagueRound[];
  participants?: AppLeagueParticipant[];
  standings?: AppLeagueView['standings'];
  me?: Partial<AppLeagueView['me']>;
} = {}): AppLeagueView {
  const rounds = overrides.rounds ?? [
    leagueRound(1, -30, { delivered: ['me', 'martin'], overriddenKeys: [] }),
    leagueRound(2, -16, { delivered: ['me', 'kristian'], overriddenKeys: [] }),
    leagueRound(3, -2, { delivered: ['martin', 'kristian'], inProgress: ['erlend'] }),
    leagueRound(4, 6, { overriddenKeys: [] }),
  ];
  return {
    league: {
      id: 'liga-vinter',
      name: 'Vinterliga på Trackman',
      status: 'active',
      format: 'stableford',
      scoring: 'net',
      standingsModel: 'best_n',
      bestN: 5,
      isSimulator: true,
      simSettings: {},
      seasonStart: '2026-11-02',
      seasonEnd: '2027-02-04',
      hcpAllowancePct: 75,
      hcpMaxStrokes: 32,
      ...overrides.league,
    },
    rounds,
    participants: overrides.participants ?? PEOPLE,
    standings: overrides.standings ?? [
      {
        userId: 'martin',
        rank: 1,
        value: 74,
        ranked: true,
        roundsPlayed: 2,
        perRound: [
          { roundId: 'r1', value: 38, points: null, penalised: false },
          { roundId: 'r3', value: 36, points: null, penalised: false },
        ],
      },
      {
        userId: 'me',
        rank: 2,
        value: 69,
        ranked: true,
        roundsPlayed: 2,
        perRound: [
          { roundId: 'r1', value: 36, points: null, penalised: false },
          { roundId: 'r2', value: 33, points: null, penalised: false },
        ],
      },
    ],
    me: { userId: 'me', isParticipant: true, ...overrides.me },
  };
}
