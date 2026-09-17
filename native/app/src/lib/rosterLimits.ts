// native/app/src/lib/rosterLimits.ts
// Native N6a (#1854): hvor mange spillere et format tar, og hvordan de deles
// i lag.
//
// **Hvorfor taket må stå i appen.** `fitsPlayerCount` (delt, ren TS) svarer på
// minstekravene og på de fleste takene — wolf 3–5, singles nøyaktig 2, best
// ball partall 2–40, skins/BBB 2–16. Men for stableford svarer den «1 og
// oppover», mens `buildGameInsertPayload` leser et begrenset antall spiller-
// slots. En spiller over det ville blitt STILLE DROPPET: runden opprettes,
// ingen feil vises, og én person mangler på startlista. Det er den ene feilen
// veiviseren ikke får gjøre.
//
// Taket her er derfor UI-ens vakt mot trunkering, ikke en ny regel. For best
// ball og stableford-familien leses det fra `lib/games/teamFormatLimits.ts`
// (#2148), samme tall som nettsiden. For de andre modiene er slot-tallene
// interne i `gamePayload.ts`, så `rosterLimits.test.ts` er koblingen tilbake:
// den kjører den DELTE byggeren med nøyaktig `maxPlayersForMode(...)` spillere
// og krever at alle overlever, og at én til IKKE gjør det.
import {
  TEAM_FORMAT_PLAYER_CAP,
  maxTeamsForSize,
  teamModePlayerCap,
} from '../../../../lib/games/teamFormatLimits';
import { fitsPlayerCount } from '../../../../lib/wizard/fitsPlayerCount';
import type { AppGameMode } from './appFormats';

/**
 * Høyeste spillerantall veiviseren tillater per modus.
 *
 * Kildene, én per rad (`lib/games/gamePayload.ts` og `teamFormatLimits.ts`):
 *  - stableford / modified_stableford: spillertaket på 40 (solo OG par, #2148).
 *  - singles_matchplay: nøyaktig 2 ved publisering.
 *  - best_ball: fulle par opp til taket, 20 par à nøyaktig 2 (#2148).
 *  - greensome_matchplay: 2v2, nøyaktig 4.
 *  - wolf: 5 (6 slots leses, så en sjette fanges som feil).
 *  - skins / bingo_bango_bongo: 16 (17 slots leses, samme grunn).
 */
export const MAX_PLAYERS_BY_MODE: Record<AppGameMode, number> = {
  stableford: TEAM_FORMAT_PLAYER_CAP,
  modified_stableford: TEAM_FORMAT_PLAYER_CAP,
  singles_matchplay: 2,
  best_ball: teamModePlayerCap('best_ball', 2) ?? TEAM_FORMAT_PLAYER_CAP,
  greensome_matchplay: 4,
  wolf: 5,
  bingo_bango_bongo: 16,
  skins: 16,
};

export function maxPlayersForMode(mode: AppGameMode): number {
  return MAX_PLAYERS_BY_MODE[mode];
}

/**
 * Hvilke spillerantall formatet faktisk kan spilles med, stigende.
 *
 * Utledet fra `fitsPlayerCount` og ikke skrevet ned på nytt — best ball er
 * partall 2–40, og den regelen skal bare finnes ett sted. Taket over kutter
 * halen der den delte funksjonen er permissiv.
 */
export function playerCountsForMode(mode: AppGameMode): number[] {
  const counts: number[] = [];
  for (let n = 1; n <= maxPlayersForMode(mode); n++) {
    if (fitsPlayerCount(mode, n)) counts.push(n);
  }
  return counts;
}

/** Passer dette antallet spillere formatet? Delt regel + appens tak. */
export function rosterFitsMode(mode: AppGameMode, playerCount: number): boolean {
  return playerCount <= maxPlayersForMode(mode) && fitsPlayerCount(mode, playerCount);
}

/**
 * Antallene som én lesbar frase: «2 spillere», «3–5 spillere»,
 * «2–40 spillere, partall». En jevn partall-rekke skrives som et spenn, ellers
 * ville best ball med 40 blitt tjue tall på rad (#2148).
 */
export function describePlayerCounts(mode: AppGameMode): string {
  const counts = playerCountsForMode(mode);
  if (counts.length === 0) return 'Ingen spillerantall passer';
  if (counts.length === 1) return `${counts[0]} spillere`;

  const contiguous = counts.every((n, i) => i === 0 || n === counts[i - 1]! + 1);
  if (contiguous) return `${counts[0]}–${counts[counts.length - 1]} spillere`;

  const evenStep =
    counts.length > 2 &&
    counts.every((n, i) => n % 2 === 0 && (i === 0 || n === counts[i - 1]! + 2));
  if (evenStep) return `${counts[0]}–${counts[counts.length - 1]} spillere, partall`;

  const head = counts.slice(0, -1).join(', ');
  return `${head} eller ${counts[counts.length - 1]} spillere`;
}

/** Hvordan lag-tildelingen ser ut for en modus som har en. */
export interface TeamLayout {
  /**
   * Høyeste lag/side arrangøren kan velge. For lag er det taket (20 par);
   * hvor mange knapper som faktisk vises, avgjør `PlayersStep` med
   * `teamGridSize` ut fra antall valgte (#2148).
   */
  slots: number;
  /**
   * Hva de heter i spillet. Matchplay og greensome spilles mellom to SIDER;
   * best ball og par-stableford mellom LAG. Ordet er ikke pynt — «side 3»
   * finnes ikke i en match.
   */
  noun: 'lag' | 'side';
}

/**
 * Lag-oppsettet for modusen, eller `null` når den spilles individuelt.
 *
 * `parStableford` er par-varianten av (modified) stableford — den har ingen
 * egen slug, bare `stableford_team_size = 2`, og er den ene lag-modusen som
 * ikke kan leses ut av `usesTeamAssignment` alene.
 *
 * Tallene speiler validatorene: best ball og par-stableford tar opptil
 * `maxTeamsForSize(2)` par (20, lest fra `teamFormatLimits`, #2148), matchplay
 * og greensome strengt side 1–2.
 */
export function teamLayoutFor(
  mode: AppGameMode,
  parStableford: boolean,
): TeamLayout | null {
  if (mode === 'best_ball') return { slots: maxTeamsForSize(2), noun: 'lag' };
  if (mode === 'singles_matchplay') return { slots: 2, noun: 'side' };
  if (mode === 'greensome_matchplay') return { slots: 2, noun: 'side' };
  if (parStableford) return { slots: maxTeamsForSize(2), noun: 'lag' };
  return null;
}
