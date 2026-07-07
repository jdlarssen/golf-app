import type { ResultSummary } from '../scoring/resultSummary';
import type { GamePrize } from './prizes';

/**
 * #1051 premiebord — kobler premier til vinnere ved rundeslutt.
 *
 * Ren funksjon (Type A-testbar). Kilden er per-spiller `result_summary` (rank,
 * generisk for alle placement-modi) + `game_side_winners`-rader (LD/CTP). Ingen
 * per-modus-matte: `linkPrizesToWinners` plukker rank fra allerede-beregnede
 * summaries, akkurat som avsluttede-spill-kortene gjør.
 *
 *  - Plasseringspremier: spillere med `result_summary.rank === position` (kind
 *    `placement` eller `skins`; matchplay har ingen rank → naturlig tomt). Delt
 *    plass (flere med samme rank) lister alle navn. Lag-modi: rank er per lag,
 *    så alle lagmedlemmer med rank N listes.
 *  - LD/CTP-premier: `game_side_winners`-rad med matchende (category, position).
 *    `winner_user_id = null` («ingen vinner») → premien utelates.
 */

/** En spiller med sitt utfall — input til koblingen. `name` er ferdig
 *  visningsnavn (formatRevealName), koblingen formaterer ikke selv. */
export type PrizeWinnerPlayer = {
  userId: string;
  name: string;
  resultSummary: ResultSummary | null;
};

/** En `game_side_winners`-rad, slank. `winnerUserId = null` = ingen vinner. */
export type PrizeSideWinner = {
  category: string; // 'longest_drive' | 'closest_to_pin'
  position: number;
  winnerUserId: string | null;
};

/** En premie koblet til én eller flere vinnere. */
export type PrizeAward = {
  prize: GamePrize;
  /** Vinnernavn — ≥1 (premier uten vinner utelates fra resultatet). */
  winners: string[];
};

/**
 * Kobler hvert premie-slott til vinner(e). Premier uten vinner (ingen med
 * matchende rank, eller LD/CTP-slott meldt «ingen vinner») utelates. Beholder
 * input-rekkefølgen på premiene; grupperingen/sorteringen er visningens jobb.
 */
export function linkPrizesToWinners(
  prizes: GamePrize[],
  players: PrizeWinnerPlayer[],
  sideWinners: PrizeSideWinner[],
): PrizeAward[] {
  const nameById = new Map(players.map((p) => [p.userId, p.name]));
  const awards: PrizeAward[] = [];

  for (const prize of prizes) {
    if (prize.category === 'placement') {
      const winners = players
        .filter((p) => {
          const rs = p.resultSummary;
          if (rs == null) return false;
          // Kun placement + skins bærer en numerisk rank; matchplay har ingen.
          if (rs.kind === 'placement' || rs.kind === 'skins') {
            return rs.rank === prize.position;
          }
          return false;
        })
        .map((p) => p.name);
      if (winners.length > 0) awards.push({ prize, winners });
    } else {
      // longest_drive / closest_to_pin → game_side_winners-oppslag.
      const row = sideWinners.find(
        (s) => s.category === prize.category && s.position === prize.position,
      );
      if (row?.winnerUserId != null) {
        const name = nameById.get(row.winnerUserId);
        if (name != null) awards.push({ prize, winners: [name] });
      }
    }
  }

  return awards;
}
