// Native N4 (#1828): lag-føringen — ett kort, én rad, alle tallene fra motoren.
//
// I scramble-familien og alternate-shot-matchplay slår laget én ball. Da finnes
// det bare ÉN scores-rad per hull for hele laget, og den eies av kapteinen
// (leksikografisk minste aktive `user_id`). Alle på laget kan taste; tappet
// havner i kapteinens rad uansett hvem som holder telefonen.
//
// Tre regler bor et annet sted, og hentes derfor hit i stedet for å skrives om:
//
//  1. **Hvem eier raden** — `teamScoreOwnerId` (`lib/games/teamCaptain.ts`) og
//     `scoreOwnerForHole` (`lib/games/scoreOwner.ts`). Den siste er per HULL,
//     ikke per runde: patsome bytter halvveis, og selv om den fortsatt er gatet
//     i appen er det regelen som gjelder — vi spør den, vi gjetter ikke.
//  2. **Hvor mange slag laget får** — motoren. `computeLeaderboard` gir
//     `teamHandicap` for scramble og per-side `extra` per hull for
//     alternate-shot. Webbens hull-side har en duplisert inline-kopi av 60/40-
//     og prosent-formlene; et TREDJE hjem for dem er nøyaktig fella AGENTS.md
//     kaller trap 4. Kan ikke motoren svare, viser vi ingen badge — vi finner
//     ikke på et tall.
//  3. **Utslags-rotasjonen i foursomes** — odde hull til den som ble valgt,
//     like hull til makkeren. Kopiert regel for regel fra webbens
//     `FoursomesTeeHint`; valget selv gjøres på nettsiden.
import { scoredHoleNumbers } from '../../../../lib/games/scoreOwner';
import { teamScoreOwnerId } from '../../../../lib/games/teamCaptain';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { BundleGame } from '../data/gameBundle';
import { teamLabel } from './leaderboardModel';
import type { RosterEntry } from './roster';
import type { LeaderboardOutcome } from './scoringContext';

/**
 * Ett lag slik hull-siden og scorekortet trenger det.
 *
 * `submittedAt`/`approvedAt` er «noen på laget»-semantikken webben bruker
 * (`anyTeamMemberSubmitted` i `holePagePlayers.ts`): lag-leveringen skriver
 * alle medlemmenes rader samtidig, så det første satte stempelet ER lagets.
 */
export interface TeamCard {
  teamNumber: number;
  /** Eier lagets scores-rader. Alltid et AKTIVT medlem. */
  captainId: string;
  /** Aktive medlemmer, sortert på `user_id` for stabil rekkefølge. */
  members: RosterEntry[];
  memberIds: string[];
  /** «Lag 2 · Anna, Bjørn». */
  label: string;
  submittedAt: string | null;
  approvedAt: string | null;
}

/** Første satte tidsstempel blant medlemmene, eller `null`. */
function firstStamp(
  members: readonly RosterEntry[],
  pick: (entry: RosterEntry) => string | null,
): string | null {
  for (const member of members) {
    const stamp = pick(member);
    if (stamp != null) return stamp;
  }
  return null;
}

/**
 * Rosteret → ett kort per lag, sortert på lagnummer.
 *
 * Grupperingen skjer på ALLE rader (også trukkede), og kapteinen plukkes av den
 * delte `teamScoreOwnerId` — som filtrerer trukkede selv og svarer `null` når
 * ingen står igjen. Et helt trukket lag faller dermed ut av lista i stedet for
 * å bli et kort ingen kan taste på. Spillere uten lagnummer hører ikke hjemme i
 * et lag-format og hoppes over.
 */
export function buildTeamCards(
  entries: readonly RosterEntry[],
  nameOf: (userId: string) => string,
): TeamCard[] {
  const byTeam = new Map<number, RosterEntry[]>();
  for (const entry of entries) {
    const teamNumber = entry.player.teamNumber;
    if (teamNumber == null) continue;
    const bucket = byTeam.get(teamNumber);
    if (bucket) bucket.push(entry);
    else byTeam.set(teamNumber, [entry]);
  }

  const cards: TeamCard[] = [];
  for (const teamNumber of [...byTeam.keys()].sort((a, b) => a - b)) {
    const all = byTeam.get(teamNumber) ?? [];
    const captainId = teamScoreOwnerId(all);
    if (captainId == null) continue;
    const members = all
      .filter((entry) => entry.withdrawn_at == null)
      .sort((a, b) => (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0));
    const memberIds = members.map((entry) => entry.user_id);
    cards.push({
      teamNumber,
      captainId,
      members,
      memberIds,
      // Fornavn: «Lag 1 · Anna Andersen, Bjørn Berg» blir en linje ingen rekker
      // å lese på banen. Samme kutt som webbens lag-kort gjør.
      label: teamLabel(teamNumber, memberIds, (id) => nameOf(id).split(' ')[0] ?? ''),
      submittedAt: firstStamp(members, (entry) => entry.submitted_at),
      approvedAt: firstStamp(members, (entry) => entry.approved_at),
    });
  }
  return cards;
}

/** Kortet jeg selv står på, eller `null`. */
export function findMyTeamCard(
  cards: readonly TeamCard[],
  userId: string,
): TeamCard | null {
  return cards.find((card) => card.memberIds.includes(userId)) ?? null;
}

/**
 * Kapteinen for MITT lag — den som eier radene jeg fører i.
 *
 * `null` når jeg ikke er med, ikke har lagnummer, eller hele laget har trukket
 * seg. Alle tre betyr det samme for kallerne: bruk mine egne rader, som før.
 */
export function myTeamCaptainId(
  roster: readonly RosterEntry[],
  userId: string,
): string | null {
  const me = roster.find((entry) => entry.user_id === userId);
  const teamNumber = me?.player.teamNumber;
  if (teamNumber == null) return null;
  return teamScoreOwnerId(
    roster.filter((entry) => entry.player.teamNumber === teamNumber),
  );
}

/**
 * Hullene jeg har slag på — lagets rader i de kollapsede modiene, mine egne
 * ellers.
 *
 * `scoredHoleNumbers` er den delte regelen: den spør per rad hvem som eier
 * NETTOPP det hullet, så et lagkort teller kapteinens rader og et solo-kort
 * mine. Filteret på `strokes` er appens: en rad kan ha putter uten slag, og et
 * hull uten slag er ikke ført.
 */
export function filledHolesForOwner(
  scores: readonly LocalScore[],
  mode: GameMode,
  viewerId: string,
  teamOwnerId: string | null,
): number[] {
  return scoredHoleNumbers(
    scores.filter((score) => score.strokes != null),
    mode,
    viewerId,
    teamOwnerId,
  );
}

/**
 * «+N»-badgen for ett lag på ett hull, HENTET FRA MOTOREN.
 *
 *  - scramble (`texas_scramble`/`ambrose`/`florida_scramble` → `kind:
 *    'texas_scramble'`): lagets `teamHandicap` fordelt på hullet med den delte
 *    SI-allokeringen.
 *  - alternate shot (foursomes/greensome/chapman/gruesome → `kind:
 *    'foursomes_matchplay'`): hullets ferdig regnede per-side-extra.
 *
 * `null` betyr «vi vet ikke» — motoren kunne ikke bygge konteksten, laget står
 * ikke i resultatet, eller hullet mangler. Da vises ingen badge. Et gjettet
 * `0` ville sett ut som et svar.
 */
export function teamExtraForHole(
  outcome: LeaderboardOutcome,
  teamNumber: number,
  holeNumber: number,
  strokeIndex: number,
): number | null {
  if (!outcome.ok) return null;
  const result = outcome.result;

  if (result.kind === 'texas_scramble') {
    const team = result.teams.find((line) => line.teamNumber === teamNumber);
    return team ? strokesForHole(team.teamHandicap, strokeIndex) : null;
  }

  if (result.kind === 'foursomes_matchplay') {
    const row = result.holes.find((hole) => hole.holeNumber === holeNumber);
    if (!row) return null;
    if (teamNumber === 1) return row.side1Extra;
    if (teamNumber === 2) return row.side2Extra;
    return null;
  }

  return null;
}

/**
 * Hvem som slår ut for siden på dette hullet i foursomes.
 *
 * Regelen er webbens `FoursomesTeeHint`, tegn for tegn: odde hull til den siden
 * valgte på nettsiden, like hull til makkeren. Rotasjonen er fast hele runden,
 * så ett valg driver alle 18 hullene.
 *
 * `null` når valget ikke er tatt, når laget ikke er et par, eller når den
 * valgte ikke lenger står på laget — ingen av delene er en feil, bare
 * ingenting å si.
 */
export function foursomesTeeStarterId(opts: {
  gameMode: GameMode;
  game: Pick<
    BundleGame,
    'foursomesSide1TeeStarterUserId' | 'foursomesSide2TeeStarterUserId'
  >;
  teamNumber: number;
  holeNumber: number;
  memberIds: readonly string[];
}): string | null {
  const { gameMode, game, teamNumber, holeNumber, memberIds } = opts;
  // Kun foursomes har kolonnene. Greensome/chapman/gruesome deler resultat-form
  // med den, men ikke utslags-rotasjonen — samme avgrensning som webben.
  if (gameMode !== 'foursomes_matchplay') return null;
  const chosen =
    teamNumber === 1
      ? game.foursomesSide1TeeStarterUserId
      : teamNumber === 2
        ? game.foursomesSide2TeeStarterUserId
        : null;
  if (chosen == null) return null;
  if (memberIds.length !== 2 || !memberIds.includes(chosen)) return null;
  return holeNumber % 2 === 1
    ? chosen
    : (memberIds.find((id) => id !== chosen) ?? chosen);
}
