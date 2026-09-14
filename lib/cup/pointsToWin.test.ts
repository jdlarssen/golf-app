import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeCupLeaderboard } from './computeCupLeaderboard';
import {
  DEFAULT_TIE_POINTS,
  DEFAULT_WIN_POINTS,
  MAX_PLANNED_MATCH_COUNT,
  derivePointsToWin,
  derivePointsToWinWeighted,
  hasDefaultCupWeights,
  parsePlannedMatchCount,
  parseTiePoints,
  parseWinPoints,
  resolveCupMatchTotal,
} from './pointsToWin';

// Type A per docs/test-discipline.md — ren regel-logikk (#1142).
describe('derivePointsToWin', () => {
  it.each([
    // [matcher, mål] — halvparten + 0,5
    [2, 1.5],
    [4, 2.5],
    [8, 4.5], // det gamle create-form-defaultet, nå utledet av et ekte antall
    [12, 6.5],
  ])('%i matcher gir målet %f', (matchCount, expected) => {
    expect(derivePointsToWin(matchCount)).toBe(expected);
  });

  it('gir et mål motstanderen ikke kan møte, også ved oddetall matcher', () => {
    // 5 matcher → 3 poeng. Taperen kan maks nå 2 av de 5.
    expect(derivePointsToWin(5)).toBe(3);
    // Beviset regelen finnes for: målet er alltid > halve potten.
    for (const n of [2, 3, 4, 5, 8, 9]) {
      expect(derivePointsToWin(n)).toBeGreaterThan(n / 2);
    }
  });

  it('holder seg over 0 på det minste lovlige antallet (CHECK points_to_win > 0)', () => {
    // startTournament slipper aldri gjennom færre enn 2 matcher, men målet er
    // positivt selv på 0 — DB-CHECK-en kan ikke brytes av denne formelen.
    expect(derivePointsToWin(0)).toBeGreaterThan(0);
  });
});

// #1441 (D8): vektbare cup-poeng (win_points/tie_points). Når arrangøren
// avviker fra 1/0,5-default gir «halvparten av totalen» ikke lenger mening
// som mål (delt match betaler mindre enn seier) — points_to_win blir NULL i
// stedet, akkurat som en cup som ikke har startet ennå (#1142). F3b (ikke
// denne fasen) er ansvarlig for å kalle denne fra startTournament.
describe('derivePointsToWinWeighted', () => {
  it('default-vekter (1/0,5) → delegerer til derivePointsToWin', () => {
    expect(derivePointsToWinWeighted(8, 1, 0.5)).toBe(derivePointsToWin(8));
    expect(derivePointsToWinWeighted(12, 1, 0.5)).toBe(derivePointsToWin(12));
  });

  it('egendefinerte vekter (splittet-cup-dag: seier 5, delt 2) → null', () => {
    expect(derivePointsToWinWeighted(12, 5, 2)).toBeNull();
  });

  it('avvik i KUN win_points → null', () => {
    expect(derivePointsToWinWeighted(8, 2, 0.5)).toBeNull();
  });

  it('avvik i KUN tie_points → null', () => {
    expect(derivePointsToWinWeighted(8, 1, 1)).toBeNull();
  });
});

// #1902: poengmålet skal være kjent fra START, ikke utledet av de kampene som
// tilfeldigvis fantes ved cup-start. Arrangøren oppgir planlagt antall kamper
// totalt; effektiv total er `max(faktisk, planlagt)` — planlagt er et GULV for
// målet, aldri et tak for hvor mange kamper cupen får ha.
describe('resolveCupMatchTotal', () => {
  it.each([
    // [faktisk, planlagt, effektiv total]
    [8, null, 8], // ikke oppgitt → dagens oppførsel, bit for bit
    [8, 28, 28], // innsenderens Ryder Cup: 8 kamper dag 1, 28 planlagt
    [30, 28, 30], // sikkerhetsnettet: flere kamper enn planlagt → faktisk vinner
    [0, 28, 28], // ingen kamper ennå (draft) → planlagt bærer målet
  ])(
    'faktisk %i, planlagt %s → effektiv total %i',
    (actual, planned, expected) => {
      expect(resolveCupMatchTotal(actual, planned)).toBe(expected);
    },
  );

  it('en umulig verdi fra databasen kan ikke senke eller nulle målet', () => {
    // Ikke nåbart i dag: CHECK-en i 0173 og `parsePlannedMatchCount` slipper
    // hverken NaN eller negative tall inn. Radene låser garantien likevel — et
    // NaN her ville forplantet seg til `derivePointsToWin` og blitt sendt som
    // `null` av JSON.stringify, altså stilltiende slettet målet i en aktiv cup.
    expect(resolveCupMatchTotal(8, Number.NaN)).toBe(8);
    expect(resolveCupMatchTotal(8, -4)).toBe(8);
    expect(resolveCupMatchTotal(0, -4)).toBe(0);
  });

  it('likhet endrer ingenting (planlagt 28, faktisk 28)', () => {
    expect(resolveCupMatchTotal(28, 28)).toBe(28);
  });

  it('planlagt LAVERE enn faktisk kan aldri senke målet', () => {
    // Arrangøren skriver 4 på en cup som alt har 12 kamper: målet skal bli
    // 6,5 (fra 12), aldri 2,5. Et for lavt tall er en skrivefeil, ikke et tak.
    expect(resolveCupMatchTotal(12, 4)).toBe(12);
  });

  it('komposisjonen med derivePointsToWinWeighted gir målet fra start', () => {
    // Selve fiksen, i ett uttrykk: 8 spilte kamper + 28 planlagt → 14,5,
    // ikke 4,5. Ingen kan krones etter dag 1.
    expect(derivePointsToWinWeighted(resolveCupMatchTotal(8, 28), 1, 0.5)).toBe(
      14.5,
    );
    // Uten planlagt antall: nøyaktig som før (#1142).
    expect(
      derivePointsToWinWeighted(resolveCupMatchTotal(8, null), 1, 0.5),
    ).toBe(4.5);
  });

  it('vektet cup får fortsatt ikke noe mål, uansett planlagt antall (#1441 D8)', () => {
    // Planlagt antall endrer INGENTING for en vektet cup — «først til X»
    // finnes ikke der, og spørsmålet stilles derfor heller ikke i UI-et.
    expect(derivePointsToWinWeighted(resolveCupMatchTotal(8, 28), 5, 2)).toBeNull();
  });
});

// #1902: «skal spørsmålet om planlagt antall stilles?» og «gir denne cupen et
// mål i det hele tatt?» er samme spørsmål. Ett hjem for begge (AGENTS.md-felle 4).
describe('hasDefaultCupWeights', () => {
  it('default 1/0,5 → true', () => {
    expect(hasDefaultCupWeights(1, 0.5)).toBe(true);
  });

  it.each([
    [5, 2],
    [2, 0.5],
    [1, 1],
  ])('egendefinerte vekter %f/%f → false', (win, tie) => {
    expect(hasDefaultCupWeights(win, tie)).toBe(false);
  });

  it('er den samme grenen derivePointsToWinWeighted brukes av', () => {
    // Lås koblingen: hvis den ene endrer definisjon av «default» uten den
    // andre, går denne rød.
    for (const [win, tie] of [[1, 0.5], [5, 2], [1, 1]] as const) {
      expect(derivePointsToWinWeighted(8, win, tie) !== null).toBe(
        hasDefaultCupWeights(win, tie),
      );
    }
  });
});

// #1902: arrangørens tall fra uttaks-rommet. Gulvet er kampene som ALT finnes
// (pluss plassene i åpnede økter) — et lavere tall er en skrivefeil, ikke et
// ønske om å kutte kamper. Taket er DB-ens tullverdi-vakt.
describe('parsePlannedMatchCount', () => {
  it.each([
    ['', 2],
    ['   ', 2],
    ['abc', 2],
    ['3.5', 2], // ikke et helt tall — en halv kamp finnes ikke
    ['-4', 2],
    ['1', 2], // under det absolutte minstekravet (startTournament krever 2)
    ['3', 4], // under gulvet: cupen har alt 4 kamper eller åpnede plasser
  ])('ugyldig: %s med gulv %i → null', (raw, floor) => {
    expect(parsePlannedMatchCount(raw, floor)).toBeNull();
  });

  it.each([
    ['2', 2, 2], // nøyaktig på gulvet
    ['28', 8, 28], // innsenderens Ryder Cup
    ['400', 2, 400], // nøyaktig på DB-taket
  ])('gyldig: %s med gulv %i → %i', (raw, floor, expected) => {
    expect(parsePlannedMatchCount(raw, floor)).toBe(expected);
  });

  it('godtar tall som er HØYERE enn gulvet — planlagt er et gulv, ikke et tak', () => {
    // Arrangøren skal kunne planlegge 28 kamper mens bare 3 er satt opp.
    expect(parsePlannedMatchCount('28', 3)).toBe(28);
  });

  it('avviser tall over DB-ens tullverdi-vakt', () => {
    expect(parsePlannedMatchCount(String(MAX_PLANNED_MATCH_COUNT + 1), 2)).toBeNull();
  });
});

/**
 * Trap #4-avstemming (AGENTS.md): validatoren ↔ DB CHECK.
 *
 * `tournaments.planned_match_count` er avgrenset av CHECK-en
 * `tournaments_planned_match_count_range` i 0173. De samme grensene bor i
 * `parsePlannedMatchCount`. Endres den ene uten den andre, ryker denne — i
 * stedet for at et lovlig tall gir en rå 400 fra PostgREST.
 */
describe('planned_match_count DB CHECK ↔ validator (trap #4)', () => {
  function checkBounds(): { min: number; max: number } {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/0173_tournaments_planned_match_count.sql'),
      'utf-8',
    );
    const m = sql.match(
      /planned_match_count >= (\d+) and planned_match_count <= (\d+)/i,
    );
    if (!m) throw new Error('Fant ikke CHECK-grensene i 0173');
    return { min: Number(m[1]), max: Number(m[2]) };
  }

  it('nedre grense stemmer: min godtas, min-1 avvises', () => {
    const { min } = checkBounds();
    expect(parsePlannedMatchCount(String(min), min)).toBe(min);
    expect(parsePlannedMatchCount(String(min - 1), min - 1)).toBeNull();
  });

  it('øvre grense stemmer: max godtas, max+1 avvises', () => {
    const { max } = checkBounds();
    expect(parsePlannedMatchCount(String(max), 2)).toBe(max);
    expect(parsePlannedMatchCount(String(max + 1), 2)).toBeNull();
    expect(MAX_PLANNED_MATCH_COUNT).toBe(max);
  });
});

/**
 * Trap #4-avstemming (AGENTS.md, #1915): cup-vektenes default.
 *
 * `tournaments.win_points`/`tie_points` får `default 1`/`default 0.5` i 0153.
 * De samme verdiene er `DEFAULT_WIN_POINTS`/`DEFAULT_TIE_POINTS` her, og
 * `computeCupLeaderboard` faller tilbake på dem når vektene mangler. Endres
 * DB-defaulten uten konstantene, eller slutter lederbordet å bruke dem, ryker
 * denne.
 */
describe('win_points/tie_points DB default ↔ DEFAULT_* (trap #4)', () => {
  function dbDefaults(): { win: number; tie: number } {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/0153_tournaments_weighted_points.sql'),
      'utf-8',
    );
    const win = sql.match(/win_points numeric not null default ([\d.]+)/i);
    const tie = sql.match(/tie_points numeric not null default ([\d.]+)/i);
    if (!win || !tie) throw new Error('Fant ikke win_points/tie_points-defaultene i 0153');
    return { win: Number(win[1]), tie: Number(tie[1]) };
  }

  it('DEFAULT_WIN_POINTS/DEFAULT_TIE_POINTS er lik DB-defaultene i 0153', () => {
    const { win, tie } = dbDefaults();
    expect(DEFAULT_WIN_POINTS).toBe(win);
    expect(DEFAULT_TIE_POINTS).toBe(tie);
  });

  it('computeCupLeaderboard uten vekter betaler DEFAULT_* for seier og delt kamp', () => {
    const result = computeCupLeaderboard(
      {
        team_1_name: 'Lag Skog',
        team_2_name: 'Lag Sjø',
        points_to_win: null,
        status: 'active',
        winner_team: null,
      },
      [
        {
          gameId: 'g1',
          matchLabel: 'Singles 1',
          team1PlayerName: 'Per',
          team2PlayerName: 'Knut',
          status: 'finished',
          result: { winnerSide: 1, formatted: '3&2' },
        },
        {
          gameId: 'g2',
          matchLabel: 'Singles 2',
          team1PlayerName: 'Ola',
          team2PlayerName: 'Kari',
          status: 'finished',
          result: { winnerSide: 'tied', formatted: 'AS' },
        },
      ],
    );
    expect(result.team1Points).toBe(DEFAULT_WIN_POINTS + DEFAULT_TIE_POINTS);
    expect(result.team2Points).toBe(DEFAULT_TIE_POINTS);
  });
});

// #1441 (D8): form-parsere for createTournamentDraft — F3b sitt ansvar (se
// derivePointsToWinWeighted-blokkens kommentar over).
describe('parseWinPoints', () => {
  it('tomt felt → undefined (DB-default 1 gjelder)', () => {
    expect(parseWinPoints('')).toBeUndefined();
    expect(parseWinPoints('   ')).toBeUndefined();
  });

  it.each([
    ['5', 5],
    ['0.5', 0.5],
    ['1', 1],
  ])('gyldig verdi %s → %f', (raw, expected) => {
    expect(parseWinPoints(raw)).toBe(expected);
  });

  it.each(['0', '-1', 'abc', 'NaN'])('ugyldig verdi %s (win_points må være > 0) → null', (raw) => {
    expect(parseWinPoints(raw)).toBeNull();
  });
});

describe('parseTiePoints', () => {
  it('tomt felt → undefined (DB-default 0,5 gjelder)', () => {
    expect(parseTiePoints('')).toBeUndefined();
    expect(parseTiePoints('   ')).toBeUndefined();
  });

  it.each([
    ['0', 0], // delt match kan lovlig gi null poeng — ulikt parseWinPoints
    ['2', 2],
    ['0.5', 0.5],
  ])('gyldig verdi %s → %f', (raw, expected) => {
    expect(parseTiePoints(raw)).toBe(expected);
  });

  it.each(['-1', 'abc', 'NaN'])('ugyldig verdi %s (tie_points må være >= 0) → null', (raw) => {
    expect(parseTiePoints(raw)).toBeNull();
  });
});
