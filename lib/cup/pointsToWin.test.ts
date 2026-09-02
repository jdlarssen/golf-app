import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
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
