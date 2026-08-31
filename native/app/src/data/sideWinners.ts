// Native sideturnering (#1850): LD/CTP-vinnerne for ett spill.
//
// Sideturneringen er en runde ved siden av runden — lengste drive og nærmest
// flagget, kåret på egne hull. Vinnerne bor i `game_side_winners`, én rad per
// slot, og denne fila er appens eneste vei inn i den.
//
// Tre valg bærer fila:
//
//  1. **Read-only, aldri innom sync-køen.** Kåringen skjer på nettsiden når
//     runden avsluttes; appen viser den bare. Ingen lokal kopi, ingen kø, ingen
//     LWW — det finnes ikke noe her spilleren kan skrive.
//  2. **Fetch KASTER ved feil.** Samme kontrakt som `choices.ts` og
//     `fetchGameBundle`: tom liste er et SVAR («ingen ble kåret»), en feilet
//     henting er det ikke. Skillet er hele poenget her — et gammelt spill som
//     ble avsluttet uten kåring har lovlig tomt resultat, mens en fetch som
//     falt på nettet må gi en ærlig note i skjermen. Leses de to likt, tegner
//     appen en poengtabell der alle mangler sine sidepoeng, og LD/CTP gir 2p
//     per slot — totalene blir stille feil, som er verre enn ingen tabell.
//  3. **Rad-typen defineres her, ikke importeres.** Webbens fasit er
//     `app/[locale]/games/[id]/leaderboard/leaderboardTypes.ts`, men appen
//     importerer aldri fra `app/`-treet — kun fra `lib/`, som er den delte
//     koden. `app/` er Next-rutetreet: filene flytter når rutene flytter, og
//     `[locale]`/`[id]` i stien er dessuten en snublestein for Metro. Fire
//     linjer duplisert type er billigere enn den koblingen. Kolonnelista under
//     er derimot ord for ord webbens, og DET er kontrakten som må holde.
import { supabase } from '../supabase';

// Ord for ord `fetchSideWinners` i webbens `leaderboardContext.ts`. Får de to
// sidene ulike kolonner eller ulik sortering, viser appen andre vinnere enn
// nettsiden for samme runde.
const SIDE_WINNER_SELECT = 'category, position, winner_user_id';

/**
 * Én kåret slot.
 *
 * `position` er hvilken SLOT raden gjelder (LD-hull 1 eller 2), ikke en
 * plassering — se `BundleGame.sideLdCount`. `winner_user_id` er null når sloten
 * ble spilt uten at noen vant den.
 */
export interface SideWinnerRow {
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  winner_user_id: string | null;
}

/**
 * Alle LD/CTP-vinnerne i spillet, sortert på kategori og deretter slot.
 *
 * Leses under vanlig RLS — appen har ingen service-role. Policyen slipper kun
 * deltakere til på et avsluttet spill, som er nøyaktig når kåringen finnes.
 *
 * @throws {Error} når spørringen feiler. Tom liste betyr «ingen ble kåret» og
 *   er et gyldig svar; et kast betyr «vi vet ikke», og kalleren MÅ si det i
 *   stedet for å vise en poengtabell uten sidepoengene.
 */
export async function fetchSideWinners(gameId: string): Promise<SideWinnerRow[]> {
  const { data, error } = await supabase
    .from('game_side_winners')
    .select(SIDE_WINNER_SELECT)
    .eq('game_id', gameId)
    .order('category')
    .order('position')
    // CHECK-en på tabellen holder `category` innenfor unionen; samme cast som web.
    .returns<SideWinnerRow[]>();

  if (error) throw new Error(`fetchSideWinners: ${error.message}`);

  return data ?? [];
}
