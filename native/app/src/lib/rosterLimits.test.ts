// native/app/src/lib/rosterLimits.test.ts
// Type A — den ene testen som gjør spillertaket til noe annet enn åtte tall
// noen skrev ned en gang.
//
// Slot-tallene i `gamePayload.ts` er interne (`for (let i = 0; i < 8; i++)`)
// og eksporteres ikke, så taket her KAN ikke utledes — det må speiles. Prisen
// for et speil er drift, og drift på nettopp dette tallet er stille: byggeren
// leser slottene den leser, og en spiller utenfor rekkevidde forsvinner uten
// feilmelding.
//
// Testen betaler den prisen ved å kjøre den DELTE byggeren:
//
//  - med nøyaktig taket → alle spillerne skal komme ut igjen, uten feilkode.
//    Er taket satt for HØYT, faller den ut her.
//  - med én over → payloaden skal IKKE bære alle. Er taket satt for LAVT,
//    faller den ut her (én til ville gått fint, og vi sperrer i overkant).
import { APP_SUPPORTED_MODES, type AppGameMode } from './appFormats';
import {
  describePlayerCounts,
  maxPlayersForMode,
  playerCountsForMode,
  rosterFitsMode,
  teamLayoutFor,
} from './rosterLimits';
import { buildDraftPayload, type GameDraft, type ModeSetup } from './wizardPayload';

/**
 * Et utkast med `count` spillere, lag fordelt som veiviseren ville fordelt
 * dem: like mange per lag, fylt fortløpende. Går antallet ikke opp i
 * lag-oppsettet, havner de siste i et lag som ikke finnes — nøyaktig det den
 * ekte skjermen ville produsert hvis taket var feil.
 */
function draftWith(
  mode: AppGameMode,
  count: number,
  setup: ModeSetup = {},
): GameDraft {
  const layout = teamLayoutFor(mode, setup.stablefordTeamSize === 2);
  const perTeam = layout ? Math.max(1, maxPlayersForMode(mode) / layout.slots) : 0;

  return {
    name: 'Testrunden',
    gameMode: mode,
    courseId: 'course-1',
    teeBoxId: 'tee-1',
    teeOffLocal: '2099-06-01T09:00',
    players: Array.from({ length: count }, (_, i) => ({
      userId: `player-${i}`,
      teeGender: 'M' as const,
      teamNumber: layout ? Math.floor(i / perTeam) + 1 : null,
    })),
    setup,
  };
}

const CASES: [label: string, mode: AppGameMode, setup: ModeSetup][] = [
  ['stableford (solo)', 'stableford', {}],
  ['stableford (par)', 'stableford', { stablefordTeamSize: 2 }],
  ['modified_stableford', 'modified_stableford', {}],
  ['singles_matchplay', 'singles_matchplay', {}],
  ['best_ball', 'best_ball', {}],
  ['greensome_matchplay', 'greensome_matchplay', {}],
  ['wolf', 'wolf', {}],
  ['skins', 'skins', {}],
  ['bingo_bango_bongo', 'bingo_bango_bongo', {}],
];

describe('maxPlayersForMode er enig med den delte payload-byggeren', () => {
  it.each(CASES)(
    '%s: taket bæres helt fram, og én over gjør det ikke',
    (_label, mode, setup) => {
      const cap = maxPlayersForMode(mode);

      const atCap = buildDraftPayload(draftWith(mode, cap, setup)).payload;
      // `errorCode` er valgfritt i `ParsedPayload` og settes kun på feilgrenen.
      expect(atCap.errorCode).toBeUndefined();
      expect(atCap.players).toHaveLength(cap);

      // Én over: enten en feilkode, eller færre rader enn valgt. Begge deler
      // er greie svar fra byggeren — det som ikke er greit, er at alle
      // `cap + 1` skulle kommet gjennom, for da sperrer veiviseren for tidlig.
      const overCap = buildDraftPayload(draftWith(mode, cap + 1, setup)).payload;
      expect(
        overCap.errorCode !== undefined || overCap.players.length !== cap + 1,
      ).toBe(true);
    },
  );

  it('setter et tak for hver av de åtte modiene appen tilbyr', () => {
    for (const mode of APP_SUPPORTED_MODES) {
      expect(maxPlayersForMode(mode)).toBeGreaterThan(0);
    }
  });
});

describe('playerCountsForMode / describePlayerCounts', () => {
  it('leser antallene ut av den delte fitsPlayerCount, ikke ut av en egen liste', () => {
    expect(playerCountsForMode('best_ball')).toEqual([2, 4, 6, 8]);
    expect(playerCountsForMode('wolf')).toEqual([3, 4, 5]);
    expect(playerCountsForMode('singles_matchplay')).toEqual([2]);
    // Stableford er «1 og oppover» i den delte funksjonen — taket er appens.
    expect(playerCountsForMode('stableford')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('skriver antallene som en frase arrangøren kan lese', () => {
    expect(describePlayerCounts('singles_matchplay')).toBe('2 spillere');
    expect(describePlayerCounts('wolf')).toBe('3–5 spillere');
    expect(describePlayerCounts('best_ball')).toBe('2, 4, 6 eller 8 spillere');
    expect(describePlayerCounts('stableford')).toBe('1–8 spillere');
  });
});

describe('rosterFitsMode', () => {
  it('avviser både for få, feil paritet og over taket', () => {
    expect(rosterFitsMode('wolf', 2)).toBe(false);
    expect(rosterFitsMode('wolf', 3)).toBe(true);
    expect(rosterFitsMode('wolf', 6)).toBe(false);
    expect(rosterFitsMode('best_ball', 3)).toBe(false);
    expect(rosterFitsMode('best_ball', 4)).toBe(true);
    // Taket appen legger på et format den delte funksjonen lar stå åpent.
    expect(rosterFitsMode('stableford', 8)).toBe(true);
    expect(rosterFitsMode('stableford', 9)).toBe(false);
  });
});
