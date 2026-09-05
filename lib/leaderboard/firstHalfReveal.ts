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
 * mer enn dette på begge flater, og to lag med hver sin skjuleregel over samme
 * tabell er hvordan de to flatene kom i utakt til å begynne med.
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
