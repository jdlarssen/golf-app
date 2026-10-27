// native/app/src/lib/leagueCopy.test.ts
// #2638 Del 2: tekstene på ligaskjermene (Type A).
//
// To jobber, som `rosterCopy.test.ts`:
//
//  1. **Paritetsport mot nettsiden.** Avslagene ved start, «hvem har spilt»,
//     rundechipene, innstillingskortet og tabellens kolonner er nettsidens
//     strenger fra `messages/no.json`. Rettes en av dem på nettet uten at
//     appen følger etter, blir denne rød: ellers ville spilleren fått to ulike
//     forklaringer på samme avslag, avhengig av flate.
//  2. **Ingen kode uten setning.** Hver kode `startLeagueRound` kan gi, skal
//     bli en ferdig norsk linje.
import source from '../../../../messages/no.json';
import type { AppLeagueRound } from '../../../../lib/league/appLeagueView';
import type { LeagueStartFailure } from '../data/league';
import { isFinishedSentence } from '../test/copy';
import {
  LEAGUE_TEXT,
  ROUND_START_TEXT,
  SIM_SETTINGS_TEXT,
  START_REFUSAL_TEXT,
  WINDOW_CHIP,
  describeLeagueLoadFailure,
  describeLeagueStartRefusal,
  formatLine,
  homeRoundLine,
  nextRoundOf,
  nextRoundOpens,
  openRoundOf,
  participantLabel,
  playedByNames,
  roundClosesTitle,
  roundDates,
  roundWindow,
  roundWindowSub,
  seasonLine,
  tableCaption,
  valueHeader,
} from './leagueCopy';

const player = source.liga.player;
const runde = player.runde;

describe('paritet med nettsiden (messages/no.json)', () => {
  it('hver avslagstekst er nettsidens errorMap ordrett, med {max} satt inn', () => {
    const web = Object.fromEntries(
      Object.entries(runde.errorMap).map(([key, text]) => [key, text.replace('{max}', '4')]),
    );
    expect(START_REFUSAL_TEXT).toEqual(web);
  });

  it('«hvem har spilt», rundechipene og ligaens overskrifter', () => {
    expect({
      delivered: LEAGUE_TEXT.delivered,
      inProgress: LEAGUE_TEXT.inProgress,
      missing: LEAGUE_TEXT.missing,
      you: LEAGUE_TEXT.you.toLowerCase(),
      unknownPlayer: LEAGUE_TEXT.unknownPlayer,
      chips: WINDOW_CHIP,
      kicker: LEAGUE_TEXT.kicker,
      seasonTable: LEAGUE_TEXT.seasonTable,
      rounds: LEAGUE_TEXT.rounds,
      noRounds: LEAGUE_TEXT.noRounds,
      empty: LEAGUE_TEXT.standingsEmpty,
      groupNotRanked: LEAGUE_TEXT.groupNotRanked,
      groupNotRankedYet: LEAGUE_TEXT.groupNotRankedYet,
      colRank: LEAGUE_TEXT.colRank,
      colPlayer: LEAGUE_TEXT.colPlayer,
      missingSetup: LEAGUE_TEXT.missingSetup,
    }).toEqual({
      delivered: player.playedBy.delivered,
      inProgress: player.playedBy.inProgress,
      missing: player.playedBy.missing,
      you: player.playedBy.you,
      unknownPlayer: player.playedBy.unknownPlayer,
      chips: player.windowChip,
      kicker: player.kicker,
      seasonTable: player.seasonTableHeading,
      rounds: player.roundsHeading,
      noRounds: player.noRoundsYet,
      empty: source.liga.standings.emptyState,
      groupNotRanked: source.liga.standings.groupNotRanked,
      groupNotRankedYet: source.liga.standings.groupNotRankedYet,
      colRank: source.liga.standings.colRank,
      colPlayer: source.liga.standings.colPlayer,
      missingSetup: runde.missingSetup,
    });
  });

  it('startskjermen', () => {
    expect({ ...ROUND_START_TEXT, startKicker: LEAGUE_TEXT.startKicker }).toEqual({
      coPlayersLegend: runde.coPlayersLegend,
      simulatorRule: runde.simulatorRule,
      markerRule: runde.markerRule,
      noCoPlayers: runde.noCoPlayers,
      startButton: runde.startButton,
      startPending: runde.startPending,
      lockDelivered: runde.lockDelivered,
      lockInProgress: runde.lockInProgress,
      startKicker: runde.kicker,
    });
  });

  it('innstillingskortet', () => {
    expect(SIM_SETTINGS_TEXT).toEqual({
      summary: source.liga.simSettings.summary,
      overridden: source.liga.simSettings.overridden,
      tee: source.liga.simSettings.tee,
    });
  });

  it('tabellens kolonne for sesongverdien', () => {
    const s = source.liga.standings;
    expect([
      valueHeader('best_n', 5),
      valueHeader('best_n', null),
      valueHeader('total', null),
      valueHeader('average', null),
      valueHeader('points', null),
    ]).toEqual([s.colBestN.replace('{n}', '5'), s.colBestNFallback, s.colTotal, s.colAverage, s.colPoints]);
  });
});

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
const START_FAILURES = {
  offline: true,
  network: true,
  'no-web-base-url': true,
  unauthorized: true,
  not_found: true,
  start_failed: true,
  round_not_found: true,
  round_read_failed: true,
  league_not_found: true,
  league_read_failed: true,
  league_not_active: true,
  outside_window: true,
  round_not_ready: true,
  need_marker: true,
  flight_too_large: true,
  members_failed: true,
  not_member: true,
  already_played: true,
  flight_in_progress: true,
  co_player_locked: true,
  round_check_failed: true,
  settings_freeze_failed: true,
  insert_failed: true,
  start_not_found: true,
  start_not_scheduled: true,
  start_tee_missing: true,
  start_tee_missing_rating: true,
  start_no_players: true,
  start_pending_players: true,
  start_incomplete_sides: true,
  start_decided_by_withdrawal: true,
  start_cup_finished: true,
  start_unassigned_teams: true,
  start_uneven_teams: true,
  start_unassigned_flights: true,
  start_rotation_player_count: true,
  start_db_players: true,
  start_db_game: true,
} as const satisfies Record<LeagueStartFailure, true>;

describe('describeLeagueStartRefusal', () => {
  it.each(Object.keys(START_FAILURES) as LeagueStartFailure[])('%s gir en ferdig setning', (reason) => {
    expect(isFinishedSentence(describeLeagueStartRefusal(reason))).toBe(true);
  });

  it('tegning 5b: de fire avslagene med nettsidens ord', () => {
    expect([
      describeLeagueStartRefusal('outside_window'),
      describeLeagueStartRefusal('already_played'),
      describeLeagueStartRefusal('flight_in_progress'),
      describeLeagueStartRefusal('round_not_ready'),
    ]).toEqual([
      'Runden er ikke åpen for spill nå.',
      'Du har allerede spilt denne runden.',
      'Du er allerede med i en flight i denne runden. Spill den ferdig eller trekk deg fra den først.',
      'Runden mangler bane eller tee — si fra til admin.',
    ]);
  });

  it('en kode nettsiden ikke har egen tekst for, får nettsidens fallback', () => {
    expect(describeLeagueStartRefusal('start_tee_missing_rating')).toBe(runde.errorMap.fallback);
  });
});

describe('describeLeagueLoadFailure (tegning 6)', () => {
  it.each(['offline', 'network', 'load_failed'] as const)('%s: sjekk nettet og prøv igjen', (reason) => {
    expect(describeLeagueLoadFailure(reason)).toBe('Fikk ikke tak i ligaen. Sjekk nettet og prøv igjen.');
  });

  it('not_found: ligaen finnes ikke for deg', () => {
    expect(describeLeagueLoadFailure('not_found')).toBe(
      'Fant ikke ligaen. Den kan ha blitt slettet, eller du er ikke med i den.',
    );
  });
});

describe('formatlinja og tabellens forklaring (tegning 2 og 3)', () => {
  // #2660: handicapandelen står etter «netto», også ved 100 %, og taket etter den.
  const league = {
    format: 'stableford',
    scoring: 'net',
    standingsModel: 'best_n',
    bestN: 5,
    hcpAllowancePct: 100,
    hcpMaxStrokes: null,
  } as const;
  const rounds = Array.from({ length: 7 }, () => ({}) as AppLeagueRound);

  it.each([
    ['Stableford netto 100\u00A0% · beste 5 av 7', league, 'Poeng med handicapslag'],
    ['Stableford netto 75\u00A0% · maks 32 slag · beste 5 av 7', { ...league, hcpAllowancePct: 75, hcpMaxStrokes: 32 }, 'Poeng med handicapslag'],
    ['Stableford netto 95\u00A0% · beste 5 av 7', { ...league, hcpAllowancePct: 95 }, 'Poeng med handicapslag'],
    ['Stableford brutto · beste 5 av 7', { ...league, scoring: 'gross' }, 'Poeng uten handicapslag'],
    ['Slagspill netto 100\u00A0% · beste 5 av 7', { ...league, format: 'stroke' }, 'Slag mot par'],
    ['Slagspill brutto · sum av alle runder', { ...league, format: 'stroke', scoring: 'gross', standingsModel: 'total' }, 'Slag mot par uten handicapslag'],
    ['Stableford netto 100\u00A0% · snitt per runde', { ...league, standingsModel: 'average' }, 'Poeng med handicapslag'],
    ['Stableford netto 100\u00A0% · poeng per plassering', { ...league, standingsModel: 'points' }, 'Poeng for plassering i hver runde'],
  ] as const)('%s', (line, l, caption) => {
    expect(formatLine({ league: l as never, rounds })).toBe(line);
    expect(tableCaption(l)).toBe(caption);
  });

  it('#2660: ordene er nettsidens formatlinje (liga.player.formatLine)', () => {
    const web = player.formatLine;
    const fill = (text: string, values: Record<string, number>) =>
      Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text);
    const line = (l: object) => formatLine({ league: { ...league, ...l } as never, rounds });
    const bestN = fill(web.model.best_n, { n: 5, count: 7 });
    const full = `Stableford ${web.scoring.net} ${fill(web.allowance, { pct: 100 })}`;
    expect({
      capped: line({ hcpAllowancePct: 75, hcpMaxStrokes: 32 }),
      gross: line({ scoring: 'gross' }),
      total: line({ standingsModel: 'total' }),
      average: line({ standingsModel: 'average' }),
      points: line({ standingsModel: 'points' }),
      fallback: line({ bestN: null }),
    }).toEqual({
      capped: `Stableford ${web.scoring.net} ${fill(web.allowance, { pct: 75 })} · ${fill(web.maxStrokes, { max: 32 })} · ${bestN}`,
      gross: `Stableford ${web.scoring.gross} · ${bestN}`,
      total: `${full} · ${web.model.total}`,
      average: `${full} · ${web.model.average}`,
      points: `${full} · ${web.model.points}`,
      fallback: `${full} · ${web.model.best_nFallback}`,
    });
  });
});

describe('datoene (enhetens lokaltid)', () => {
  // Tegningene: runde 3 åpner man. 30. nov og stenger tor. 10. des 23.59.
  const opensAt = new Date(2026, 10, 30, 0, 0).toISOString();
  const closesAt = new Date(2026, 11, 10, 23, 59).toISOString();

  it('raden på Hjem og rundekortet', () => {
    expect([
      homeRoundLine('Runde 3', closesAt),
      roundClosesTitle(closesAt),
      roundWindowSub(opensAt, closesAt),
      roundDates(opensAt, closesAt),
    ]).toEqual([
      'Runde 3 · stenger tor. 23.59',
      'Stenger tor. 23.59',
      '10. desember · åpnet 30. november',
      '30. nov – 10. des',
    ]);
  });

  it('sesongen og neste runde', () => {
    expect([seasonLine('2026-11-02', '2027-02-04'), nextRoundOpens(new Date(2026, 11, 14).toISOString())]).toEqual([
      'Sesong 2. nov – 4. feb',
      'Neste runde åpner man. 14. des.',
    ]);
  });

  it('rundas vindu, den åpne runden og den neste', () => {
    const round = (sequence: number, open: Date, close: Date) =>
      ({ id: `r${sequence}`, sequence, opensAt: open.toISOString(), closesAt: close.toISOString() }) as AppLeagueRound;
    const r1 = round(1, new Date(2026, 10, 2), new Date(2026, 10, 12, 23, 59));
    const r3 = round(3, new Date(2026, 10, 30), new Date(2026, 11, 10, 23, 59));
    const r4 = round(4, new Date(2026, 11, 14), new Date(2026, 11, 24, 23, 59));
    const now = new Date(2026, 11, 8, 20, 0);
    expect({
      windows: [roundWindow(r1, now), roundWindow(r3, now), roundWindow(r4, now)],
      open: openRoundOf([r4, r3, r1], now)?.id,
      next: nextRoundOf([r4, r3, r1], now)?.id,
      noneOpen: openRoundOf([r1, r4], now),
    }).toEqual({ windows: ['closed', 'open', 'upcoming'], open: 'r3', next: 'r4', noneOpen: null });
  });
});

describe('navnene (tegningene: fornavn)', () => {
  const people = [
    { userId: 'me', name: 'Jørgen Larssen', fullName: null, hcpIndex: null },
    { userId: 'm', name: 'Martin', fullName: null, hcpIndex: null },
    { userId: 'k1', name: 'Kristian Hansen', fullName: null, hcpIndex: null },
    { userId: 'k2', name: 'Kristian Berg', fullName: null, hcpIndex: null },
    { userId: 'x', name: null, fullName: null, hcpIndex: null },
  ];

  it('fornavnet, hele navnet når to har samme fornavn, og «Ukjent spiller» uten navn', () => {
    expect(people.map((p) => participantLabel(p, people))).toEqual([
      'Jørgen',
      'Martin',
      'Kristian Hansen',
      'Kristian Berg',
      'Ukjent spiller',
    ]);
  });

  it('«hvem har spilt»: «Deg» først, så de andre i rekkefølge', () => {
    expect([playedByNames(['m', 'me', 'x'], 'me', people), playedByNames(['m'], 'me', people)]).toEqual([
      'Deg, Martin, Ukjent spiller',
      'Martin',
    ]);
  });
});
