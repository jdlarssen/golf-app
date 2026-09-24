import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameStatus } from '@/lib/games/status';
import type { ScoreVisibility } from '@/lib/games/visibility';
import {
  isScrambleFamily,
  isStablefordFamily,
  MODE_LABELS,
  type GameMode,
} from '@/lib/scoring/modes/types';
import {
  firstHalfTableView,
  REVEAL_ACTIVE_TABLE,
  revealActiveTable,
  tableClipsToFirstHalf,
  type FirstHalfTableView,
  type RevealActiveTable,
} from './firstHalfReveal';

// #1978. Fram til nå sto formatlista bare som POSISJON i en if-kjede i
// leaderboardContent.tsx — best ball er det eneste formatet som når
// state3/state3.5-grenen, fordi de 21 andre returnerer tidligere. Appen leste
// ikke den regelen og viste hele 18-hulls-tavla live.
//
// Radene for de ANDRE formatene er derfor det viktigste her: de gjør domenet
// til en kjørt regel i stedet for en kommentar. Flytter noen et format ut av
// en tidlig retur på webben uten å røre denne fila, blir dette rødt.

describe('tableClipsToFirstHalf', () => {
  it('klipper best ball', () => {
    expect(tableClipsToFirstHalf('best_ball')).toBe(true);
  });

  it.each<GameMode>([
    'stableford',
    'modified_stableford',
    'singles_matchplay',
    'greensome_matchplay',
    'foursomes_matchplay',
    'fourball_matchplay',
    'solo_strokeplay',
    'texas_scramble',
    'florida_scramble',
    'ambrose',
    'shamble',
    'patsome',
    'wolf',
    'skins',
    'nassau',
    'nines',
    'bingo_bango_bongo',
    'acey_deucey',
    'round_robin',
    'chapman_matchplay',
    'gruesome_matchplay',
  ])('klipper ikke %s', (mode) => {
    expect(tableClipsToFirstHalf(mode)).toBe(false);
  });
});

describe('firstHalfTableView', () => {
  const base = {
    gameMode: 'best_ball' as GameMode,
    status: 'active' as GameStatus,
    scoreVisibility: 'live' as ScoreVisibility,
    gateOpen: false,
  };

  it.each<[string, Partial<typeof base>, FirstHalfTableView]>([
    // Best ball, live, pågår — selve saken i #1978.
    ['porten er lukket: ingen lag er gjennom hull 9', { gateOpen: false }, 'waiting'],
    ['porten er åpen: første halvdel vises', { gateOpen: true }, 'first-half'],
    // Avsluttet runde er hele fasiten, som før.
    ['runden er avsluttet', { status: 'finished', gateOpen: true }, 'full'],
    ['avsluttet med lukket port', { status: 'finished', gateOpen: false }, 'full'],
    // Reveal eier sin egen skjuling på begge flater; to lag med hver sin
    // regel over samme tabell er nettopp hvordan de kom i utakt.
    ['reveal mens runden går', { scoreVisibility: 'reveal', gateOpen: true }, 'full'],
    ['reveal etter avslutning', { scoreVisibility: 'reveal', status: 'finished' }, 'full'],
    // Før første slag er runden fortsatt planlagt.
    ['runden er planlagt', { status: 'scheduled' }, 'waiting'],
  ])('best ball, %s → %s', (_label, overrides, expected) => {
    expect(firstHalfTableView({ ...base, ...overrides })).toBe(expected);
  });

  it.each<GameMode>(['stableford', 'greensome_matchplay', 'skins', 'wolf', 'texas_scramble'])(
    '%s viser hele runden live, uansett port',
    (gameMode) => {
      expect(firstHalfTableView({ ...base, gameMode, gateOpen: false })).toBe('full');
      expect(firstHalfTableView({ ...base, gameMode, gateOpen: true })).toBe('full');
    },
  );
});

// #1981. Appen skjulte bare matchplay-familien i en blind runde og viste
// bruttosummer for alt annet — også best ball, wolf, skins og de andre
// formatene der nettsiden viser ingenting. Lista skrives ut for hånd her, ikke
// avledet fra REVEAL_ACTIVE_TABLE: en test som leser fasiten fra koden den
// tester, kan ikke bli rød.
describe('revealActiveTable', () => {
  it.each<[GameMode, RevealActiveTable]>([
    // Brutto-forhåndsvisning på webben (RevealBruttoView, #801).
    ['stableford', 'gross'],
    ['modified_stableford', 'gross'],
    ['solo_strokeplay', 'gross'],
    ['texas_scramble', 'gross'],
    ['ambrose', 'gross'],
    ['florida_scramble', 'gross'],
    // Ingenting på webben (RevealHiddenView, #1441 D12).
    ['best_ball', 'hidden'],
    ['singles_matchplay', 'hidden'],
    ['fourball_matchplay', 'hidden'],
    ['foursomes_matchplay', 'hidden'],
    ['greensome_matchplay', 'hidden'],
    ['chapman_matchplay', 'hidden'],
    ['gruesome_matchplay', 'hidden'],
    // Ingenting på webben (venterommet bak isRevealHidden i *View.tsx).
    ['wolf', 'hidden'],
    ['nassau', 'hidden'],
    ['skins', 'hidden'],
    ['bingo_bango_bongo', 'hidden'],
    ['nines', 'hidden'],
    ['round_robin', 'hidden'],
    ['acey_deucey', 'hidden'],
    ['shamble', 'hidden'],
    ['patsome', 'hidden'],
  ])('%s → %s', (mode, expected) => {
    expect(revealActiveTable(mode)).toBe(expected);
  });

  it('dekker hvert format i GameMode', () => {
    // Lista over har 22 rader. Får GameMode et 23. medlem, stopper
    // kompilatoren REVEAL_ACTIVE_TABLE; denne raden stopper testlista.
    expect(Object.keys(REVEAL_ACTIVE_TABLE).sort()).toEqual(Object.keys(MODE_LABELS).sort());
    expect(Object.keys(MODE_LABELS)).toHaveLength(22);
  });

  it('skjuler et format den ikke kjenner', () => {
    // En rad fra en nyere server enn appen: heller ingenting enn en lekkasje.
    expect(revealActiveTable('nytt_format' as GameMode)).toBe('hidden');
  });
});

// Drift-vakt mot nettsiden (#1981). Webben har ingen liste: hvert format
// bestemmer selv i sin egen gren. Her leses grenene som tekst, i samme form som
// formats/contextCallSites.test.ts (#1958). Får et nytt web-format
// brutto-visningen uten at REVEAL_ACTIVE_TABLE følger etter, blir dette rødt.
//
// Vakta ser bare brutto-siden. Slutter et web-format å skjule (mister for
// eksempel `isRevealHidden`) uten å importere RevealBruttoView, merker den det
// ikke.
describe('REVEAL_ACTIVE_TABLE er enig med nettsiden', () => {
  const LEADERBOARD_DIR = join(
    __dirname,
    '..',
    '..',
    'app',
    '[locale]',
    'games',
    '[id]',
    'leaderboard',
  );
  const FORMATS_DIR = join(LEADERBOARD_DIR, 'formats');

  // Hvilke modier leaderboardContent.tsx sender til de tre brutto-modulene.
  const BRUTTO_ROUTES: ReadonlyArray<{
    render: string;
    guard: string;
    routes: (mode: GameMode) => boolean;
  }> = [
    {
      render: 'renderStableford',
      guard: 'isStablefordFamily(game.game_mode)',
      routes: isStablefordFamily,
    },
    {
      render: 'renderSoloStrokeplay',
      guard: "game.game_mode === 'solo_strokeplay'",
      routes: (mode) => mode === 'solo_strokeplay',
    },
    {
      render: 'renderTexasScramble',
      guard: 'isScrambleFamily(game.game_mode)',
      routes: isScrambleFamily,
    },
  ];

  it('bare de tre brutto-modulene i formats/ importerer RevealBruttoView', () => {
    const importers = readdirSync(FORMATS_DIR)
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .filter((name) => readFileSync(join(FORMATS_DIR, name), 'utf8').includes('RevealBruttoView'))
      .sort();
    expect(
      importers,
      'En modul i formats/ har fått (eller mistet) brutto-visningen for blinde runder. ' +
        'Oppdater REVEAL_ACTIVE_TABLE i lib/leaderboard/firstHalfReveal.ts, ellers viser ' +
        'appen noe annet enn nettsiden (#1981).',
    ).toEqual(['soloStrokeplay.tsx', 'stableford.tsx', 'texasScramble.tsx']);
  });

  it('leaderboardContent.tsx sender nøyaktig brutto-modiene til de tre modulene', () => {
    const source = readFileSync(join(LEADERBOARD_DIR, 'leaderboardContent.tsx'), 'utf8');
    const violations: string[] = [];
    for (const { render, guard } of BRUTTO_ROUTES) {
      const calls = source.split(`${render}(`).length - 1;
      if (calls !== 1) {
        violations.push(`${render}( kalles ${calls} ganger, ventet 1`);
        continue;
      }
      const before = source.slice(0, source.indexOf(`${render}(`));
      const ifLine = before.slice(before.lastIndexOf('if (')).split('\n')[0].trim();
      if (ifLine !== `if (${guard}) {`) {
        violations.push(`${render}: if-en over kallet er «${ifLine}», ventet «if (${guard}) {»`);
      }
    }
    expect(violations).toEqual([]);

    const routedToBrutto = (Object.keys(MODE_LABELS) as GameMode[])
      .filter((mode) => BRUTTO_ROUTES.some(({ routes }) => routes(mode)))
      .sort();
    const grossInTable = (Object.keys(REVEAL_ACTIVE_TABLE) as GameMode[])
      .filter((mode) => REVEAL_ACTIVE_TABLE[mode] === 'gross')
      .sort();
    expect(grossInTable).toEqual(routedToBrutto);
  });
});
