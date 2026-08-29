import { computeCupMatchResult, type CupMatchSidePlayer } from './computeCupMatchResult';
import { computeCupBestBallAward } from './computeCupBestBallAward';
import type { CupMatchInput } from './computeCupLeaderboard';

/**
 * Det VISTE resultatet for én cup-kamp (#1522, utdrag fra `getCupSnapshot`).
 * Tre regler i én ren funksjon:
 *
 *  1. `best_ball` (#1441 D4/D11 — back9-hosten i splittet cup-dag) poengsettes
 *     på netto LAGTOTAL, ikke hull-for-hull matchplay. `computeCupMatchResult`s
 *     `MATCHPLAY_CONFIG` har ingen `best_ball`-rad (og skal ikke ha — det er en
 *     fundamentalt annen sammenligning).
 *  2. Alt annet går gjennom den tabell-drevne matchplay-dispatchen (#331), som
 *     selv returnerer `null` for ukjent modus, feil side-størrelse eller en
 *     uavgjort-så-langt kamp.
 *  3. Blind cup-dag (#1441, D12): en bunt-kamp med `score_visibility='reveal'`
 *     eksponerer INGEN resultat før arrangøren avslutter den — uansett om
 *     scorene alt gjør utfallet avgjørbart. Poeng var (og forblir) kun tildelt
 *     ferdige spill (`computeCupLeaderboard.pointsForMatch` gater på
 *     `status !== 'finished'`); dette gater kun det VISTE resultatet.
 *     Non-reveal-spill (dagens 'live'-default) beholder dagens oppførsel: et
 *     avgjort resultat vises så snart scorene avgjør det, uavhengig av status.
 */
export type CupMatchDisplayResultInput = {
  gameId: string;
  /** `games.game_mode` — fri tekst fra DB, ikke en smal union. */
  gameMode: string;
  /** `games.status`. Kun `'finished'` åpner en reveal-gatet kamp. */
  status: string;
  /** `games.score_visibility` — `'reveal'` = blind til kampen er avsluttet. */
  scoreVisibility: string;
  modeConfig: {
    allowance_pct?: number;
    team_strokes_override?: { team1: number; team2: number };
  } | null;
  side1: CupMatchSidePlayer[];
  side2: CupMatchSidePlayer[];
  /** Allerede segment-filtrert (#1441 D1/D2) av kalleren. */
  holes: Array<{ number: number; par: number; strokeIndex: number }>;
  scores: Array<{ userId: string; holeNumber: number; gross: number | null }>;
};

export function computeCupMatchDisplayResult(
  input: CupMatchDisplayResultInput,
): CupMatchInput['result'] {
  const result =
    input.gameMode === 'best_ball'
      ? computeCupBestBallAward({
          side1: input.side1,
          side2: input.side2,
          holes: input.holes.map((h) => ({ number: h.number, strokeIndex: h.strokeIndex })),
          scores: input.scores,
        })
      : computeCupMatchResult({
          gameId: input.gameId,
          gameMode: input.gameMode,
          modeConfig: input.modeConfig,
          side1: input.side1,
          side2: input.side2,
          holes: input.holes,
          scores: input.scores,
        });

  if (input.scoreVisibility === 'reveal' && input.status !== 'finished') return null;
  return result;
}
