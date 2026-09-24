// lib/leaderboard/firstHalfReveal.ts
// #1978: hvilken av de tre tilstandene RESULTATTABELLEN står i mens en runde
// pågår — ingenting ennå, første halvdel synlig, eller hele runden.
//
// Regelen fantes fra før, men bare som posisjon i en if-kjede i
// `app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx`: hvert format
// unntatt best ball returnerer tidligere med sin egen visning, så
// state3/state3.5/full-grenen nås ved uttømming. Det er en regel ingen kan
// lese, og appen leste den ikke — den viste hele 18-hulls-tavla live der
// nettsiden holdt igjen alt etter hull 9. Samme runde, samme øyeblikk, to
// svar.
//
// Her er den en funksjon begge flatene kaller, så formatlista ikke kan drive
// fra hverandre.
//
// #1981: det samme gjelder blinde runder (reveal). Hvilke formater som får en
// brutto-forhåndsvisning og hvilke som ikke får noe, sto bare i hver sin gren
// på webben. Appen gjettet på formatfamilien og viste bruttosummer der
// nettsiden viser ingenting. Nå er det `REVEAL_ACTIVE_TABLE` under.
import type { GameStatus } from '@/lib/games/status';
import { revealState, type ScoreVisibility } from '@/lib/games/visibility';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Formatene der RESULTATTABELLEN holdes tilbake til segmentets første halvdel
 * mens runden pågår.
 *
 * I dag ett format. Best ball er den eneste grenen som når
 * state3/state3.5/full-fallthrough i `leaderboardContent.tsx`; de 21 andre
 * medlemmene av `GameMode` returnerer tidligere med sin egen reveal-håndtering
 * (matchplay-familien har ingen tabell å klippe, stableford/skins/scramble
 * viser hele runden live).
 *
 * ⚠️ Dette er tabellens domene, ikke hele appens. **Hull-for-hull-siden klipper
 * bredere:** `app/[locale]/games/[id]/leaderboard/holes/formats/drilldown.tsx`
 * klipper til første halvdel på `isActive` ALENE — ingen port, ingen
 * formatsjekk — for alt som ikke tar en tidlig retur i `holes/page.tsx` (lag-
 * stableford, scramble-familien, shamble, patsome og hele matchplay-familien
 * i tillegg til best ball). De to domenene er ulike med vilje så langt vi vet,
 * men de er ikke ETT sted: rører du klippe-regelen, se på begge. Appen har
 * ingen hull-for-hull-flate for lag-formater, så den siden har ingen motpart
 * her.
 */
export function tableClipsToFirstHalf(mode: GameMode): boolean {
  return mode === 'best_ball';
}

/**
 * Hva tabellen skal vise nå.
 *
 *  - `full`       — hele runden, som før.
 *  - `waiting`    — ingen tall ennå: ingen lag har fullført første halvdel.
 *  - `first-half` — første halvdel synlig, resten holdt igjen til avslutning.
 */
export type FirstHalfTableView = 'full' | 'waiting' | 'first-half';

/**
 * Klippe-avgjørelsen for resultattabellen.
 *
 * `gateOpen` er `isFrontNineOpen(...)` for spillets egne første-halvdel-hull
 * (`firstHalfHoleNumbersForSegment`). Den holdes utenfor med vilje: porten
 * trenger spillere og slag, og denne funksjonen skal kunne testes på fire
 * enkle verdier.
 *
 * Reveal-runder returnerer `full` her. Det er ikke «vis alt» — det er «denne
 * regelen eier ikke saken»: `revealState`/`shouldHideNetto` skjuler allerede
 * mer enn dette på begge flater (hvor mye: `revealActiveTable`), og to lag med
 * hver sin skjuleregel over samme tabell er hvordan de to flatene kom i utakt
 * til å begynne med.
 */
export function firstHalfTableView(opts: {
  gameMode: GameMode;
  status: GameStatus;
  scoreVisibility: ScoreVisibility;
  gateOpen: boolean;
}): FirstHalfTableView {
  const { gameMode, status, scoreVisibility, gateOpen } = opts;
  if (!tableClipsToFirstHalf(gameMode)) return 'full';
  if (revealState(scoreVisibility, status) !== 'live-always') return 'full';
  if (status === 'finished') return 'full';
  return gateOpen ? 'first-half' : 'waiting';
}

/**
 * Hva resultattabellen får vise mens en blind runde pågår (reveal, ikke
 * avsluttet).
 *
 *  - `gross`  — brutto-forhåndsvisning: slag, ingen netto, poeng eller
 *               plassering.
 *  - `hidden` — ingenting. Resultatet kommer når arrangøren avslutter.
 */
export type RevealActiveTable = 'gross' | 'hidden';

/**
 * #1981: én linje per format, speilet av det nettsiden viser i dag. Webben har
 * ingen liste; hvert format bestemmer i sin egen gren:
 *
 *  - `gross`: `formats/stableford.tsx`, `formats/soloStrokeplay.tsx` og
 *    `formats/texasScramble.tsx` → `RevealBruttoView` (#801).
 *  - `hidden`: best ball (`leaderboardContent.tsx`, siste gren) og
 *    matchplay-familien (`formats/matchplay.tsx`, `fourballMatchplay.tsx`,
 *    `foursomesMatchplay.tsx`) → `RevealHiddenView` (#1441 D12); wolf, nassau,
 *    skins, BBB, nines, round robin, acey-deucey, shamble og patsome →
 *    venterommet bak `isRevealHidden` i hver sin `*View.tsx`.
 *
 * (Stiene over er relative til `app/[locale]/games/[id]/leaderboard/`.)
 *
 * Det er en liste og ikke en familie-sjekk fordi webben ikke følger familiene:
 * scramble er et lagformat og viser lagets brutto, best ball er et lagformat og
 * viser ingenting. `Record` gjør at et nytt format ikke kompilerer før noen har
 * bestemt hva det skal vise. `firstHalfReveal.test.ts` leser web-grenene og
 * blir rød hvis de to flatene sier noe ulikt om brutto.
 */
export const REVEAL_ACTIVE_TABLE: Record<GameMode, RevealActiveTable> = {
  best_ball: 'hidden',
  stableford: 'gross',
  modified_stableford: 'gross',
  singles_matchplay: 'hidden',
  solo_strokeplay: 'gross',
  texas_scramble: 'gross',
  ambrose: 'gross',
  florida_scramble: 'gross',
  fourball_matchplay: 'hidden',
  foursomes_matchplay: 'hidden',
  greensome_matchplay: 'hidden',
  chapman_matchplay: 'hidden',
  wolf: 'hidden',
  nassau: 'hidden',
  skins: 'hidden',
  bingo_bango_bongo: 'hidden',
  nines: 'hidden',
  round_robin: 'hidden',
  acey_deucey: 'hidden',
  shamble: 'hidden',
  patsome: 'hidden',
  gruesome_matchplay: 'hidden',
};

/**
 * Oppslaget i `REVEAL_ACTIVE_TABLE`. Et format lista ikke kjenner (en rad fra
 * en nyere server enn appen) gir `hidden`: heller ingenting enn en lekkasje.
 */
export function revealActiveTable(mode: GameMode): RevealActiveTable {
  return REVEAL_ACTIVE_TABLE[mode] === 'gross' ? 'gross' : 'hidden';
}
