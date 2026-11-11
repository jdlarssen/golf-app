import { meetsFlightMinimum } from './flightRules';

/**
 * The cards of a league flight that count in the season table (#453, #2661),
 * one home for the table and the card view (#2815, AGENTS.md trap 4):
 * `getLigaSnapshot` scores only these, and `leagueCardAccess` shows a card
 * only when it is one of them, so a tap on a cell can never open a card the
 * table did not count, and a card the table counts is never refused.
 *
 *  - only a `finished` flight counts;
 *  - a card counts when it is delivered and not withdrawn, and in a simulator
 *    league also approved by its marker (#2661);
 *  - the flight needs that many counting cards for the marker rule
 *    (`meetsFlightMinimum`: two, one in a simulator league, #2638), else none
 *    of its cards count.
 *
 * Whether the card is complete (every hole played) is the scoring's rule
 * (`computeFlightRoundValues`), which both callers run afterwards.
 */
export function countingCards<
  P extends { withdrawn_at: string | null; submitted_at: string | null; approved_at: string | null },
>(flightStatus: string, players: readonly P[], isSimulator: boolean): P[] {
  if (flightStatus !== 'finished') return [];
  const eligible = players.filter(
    (p) => p.withdrawn_at === null && p.submitted_at !== null && (!isSimulator || p.approved_at !== null),
  );
  return meetsFlightMinimum(eligible.length, isSimulator) ? eligible : [];
}
