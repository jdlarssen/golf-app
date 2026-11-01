// Native N4 (#1828): lag-føringen — ett kort, én rad, alle tallene fra motoren.
//
// I scramble-familien og alternate-shot-matchplay slår laget én ball. Da finnes
// det bare ÉN scores-rad per hull for hele laget, og den eies av kapteinen
// (leksikografisk minste aktive `user_id`). Alle på laget kan taste; tappet
// havner i kapteinens rad uansett hvem som holder telefonen.
//
// #2067: sletter kapteinen kontoen midt i runden, trekkes raden, og eierskapet
// går til neste medlem. Hullene som alt er ført, ligger igjen på den trukne.
// Skjermene folder dem inn med `foldLocalScores` rett etter lesingen, så alt
// videre leser ett sett rader på den nye eieren.
//
// Tre regler bor et annet sted, og hentes derfor hit i stedet for å skrives om:
//
//  1. **Hvem eier raden** — `teamScoreOwnerId` (`lib/games/teamCaptain.ts`) og
//     `scoreOwnerForHole` (`lib/games/scoreOwner.ts`). Den siste er per HULL,
//     ikke per runde: patsome bytter halvveis. Vi spør den, vi gjetter ikke.
//  2. **Hvor mange slag laget får** — motoren. `computeLeaderboard` gir
//     `teamHandicap` for scramble, per-side `extra` per hull for alternate-shot
//     og `teamExtraStrokes` per hull for patsome. Webbens hull-side har en
//     duplisert inline-kopi av 60/40- og prosent-formlene; et TREDJE hjem for
//     dem er nøyaktig fella AGENTS.md kaller trap 4. Kan ikke motoren svare,
//     viser vi ingen badge — vi finner ikke på et tall.
//  3. **Utslags-rotasjonen** i foursomes og Patsomes foursomes-del — odde hull
//     til den som ble valgt, like hull til makkeren. Kopiert regel for regel
//     fra webbens `FoursomesTeeHint` og `PatsomeTeeHint`.
import { scoredHoleNumbers } from '../../../../lib/games/scoreOwner';
import { teamScoreOwnerId } from '../../../../lib/games/teamCaptain';
import { foldTeamRows } from '../../../../lib/scoring/context/foldTeamRows';
import type { GameMode, PatsomeSegment } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { teamLabel } from './leaderboardModel';
import type { RosterEntry } from './roster';
import { computeGameLeaderboard, type LeaderboardOutcome } from './scoringContext';

/**
 * Ett lag slik hull-siden og scorekortet trenger det.
 *
 * `submittedAt`/`approvedAt` er «noen på laget»-semantikken webben bruker
 * (`anyTeamMemberSubmitted` i `holePagePlayers.ts`): lag-leveringen skriver
 * alle medlemmenes rader samtidig, så det første satte stempelet ER lagets.
 */
export interface TeamCard {
  teamNumber: number;
  /**
   * Eier lagets scores-rader, og det er hit tappene skrives. Alltid et AKTIVT
   * medlem. Rader ført før en kontosletting kan ligge på et trukket medlem
   * (#2067); les derfor gjennom `foldLocalScores`, som legger dem hit.
   */
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
 *
 * `labelOrder` (#2580): rekkefølgen navnene står i etiketten. Med «Hvem sitt
 * utslag» er det utslagsknappenes rekkefølge, så linja og knappene under den
 * er like, som på nettet. `memberIds` (og kapteinen) står uansett på id.
 */
export function buildTeamCards(
  entries: readonly RosterEntry[],
  nameOf: (userId: string) => string,
  labelOrder?: (teamNumber: number, memberIds: readonly string[]) => readonly string[],
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
      label: teamLabel(
        teamNumber,
        labelOrder ? labelOrder(teamNumber, memberIds) : memberIds,
        (id) => nameOf(id).split(' ')[0] ?? '',
      ),
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
 * «Lagets rader følger laget» (#2067) på enhetens slag.
 *
 * Tynn adapter: rosteret oversettes til rad-formen den delte `foldTeamRows`
 * leser, og regelen svarer. Rader et trukket medlem førte på lagets delte
 * hull, legges på den nåværende eieren (`TeamCard.captainId`). Eierens egen
 * rad vinner når den har slag, så en retting etter slettingen står seg.
 * Formater som aldri deler rad, og patsome hull 1–6, røres ikke.
 *
 * Rosteret må være HELT, med de trukne: uten dem vet regelen ikke hvem som
 * eide radene før.
 *
 * En foldet rad er en kopi der bare `userId` er byttet. `id` peker fortsatt på
 * den trukne raden, så ingen skriving kan ta utgangspunkt i radens `id`. Hull-
 * siden skriver på eier-id-en (`scoreOwnerForHole`), og `writeScore` slår opp
 * eierens egen rad.
 */
export function foldLocalScores(
  scores: readonly LocalScore[],
  roster: readonly RosterEntry[],
  mode: GameMode,
): LocalScore[] {
  return foldTeamRows({
    roster: roster.map((entry) => ({
      user_id: entry.user_id,
      team_number: entry.player.teamNumber,
      withdrawn_at: entry.withdrawn_at,
    })),
    rows: scores,
    mode,
  });
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
 *  - patsome: hullets `teamExtraStrokes`. Motoren regner det bare på hull med
 *    slag, så spør med {@link teamExtraOutcome}, ellers svarer et uspilt hull 0.
 *    Hull 1–6 har ingen lagball, og der svarer vi `null`.
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
    const teamHandicap = teamHandicapFor(outcome, teamNumber);
    return teamHandicap != null ? strokesForHole(teamHandicap, strokeIndex) : null;
  }

  if (result.kind === 'foursomes_matchplay') {
    const row = result.holes.find((hole) => hole.holeNumber === holeNumber);
    if (!row) return null;
    if (teamNumber === 1) return row.side1Extra;
    if (teamNumber === 2) return row.side2Extra;
    return null;
  }

  if (result.kind === 'patsome') {
    const row = result.teams
      .find((team) => team.teamNumber === teamNumber)
      ?.holes.find((hole) => hole.holeNumber === holeNumber);
    if (!row || row.segment === 'fourball') return null;
    return row.teamExtraStrokes;
  }

  return null;
}

/**
 * Motorsvaret «+N» leses fra, gitt spillets slag.
 *
 * Patsome-motoren setter `teamExtraStrokes` til 0 på et hull uten slag. Badgen
 * skal stå før noen har tastet, som på nettets hullside, og poengene skal ikke
 * regnes her. Derfor spør vi motoren med én rad per spiller på hvert hull:
 * tallene på slagene brukes ikke, bare at hullet er spilt. Formelen får ikke et
 * tredje hjem. De andre formatene regner slagene uansett, og får de ekte radene.
 */
export function teamExtraOutcome(bundle: GameBundle, scores: readonly LocalScore[]): LeaderboardOutcome {
  if (bundle.game.gameMode !== 'patsome') return computeGameLeaderboard(bundle, scores);
  const everyHole = bundle.players.flatMap((player) =>
    bundle.holes.map(
      (hole): LocalScore => ({
        id: `${bundle.game.id}:${player.userId}:${hole.holeNumber}`,
        gameId: bundle.game.id,
        userId: player.userId,
        holeNumber: hole.holeNumber,
        strokes: hole.parMens,
        putts: null,
        enteredBy: player.userId,
        clientUpdatedAt: bundle.fetchedAt,
        serverUpdatedAt: null,
      }),
    ),
  );
  return computeGameLeaderboard(bundle, everyHole);
}

/** Patsomes tre deler, 6/6/6 som i motoren. */
export function patsomeSegmentFor(holeNumber: number): PatsomeSegment {
  if (holeNumber <= 6) return 'fourball';
  if (holeNumber <= 12) return 'greensome';
  return 'foursomes';
}

/**
 * Lagets handicap i scramble-familien, slik motoren regnet det (#2262: hodet
 * på scorekortet sier «lagshandicap N»). {@link teamExtraForHole} fordeler det
 * samme tallet på hullene, så hodet og NETTO-raden kan ikke si noe forskjellig.
 *
 * `null` utenfor scramble: i alternate shot er slagene per hull en forskjell
 * mellom sidene, ikke ett tall for laget. Også `null` når motoren ikke kunne
 * regne, eller laget ikke står i resultatet.
 */
export function teamHandicapFor(
  outcome: LeaderboardOutcome,
  teamNumber: number,
): number | null {
  if (!outcome.ok || outcome.result.kind !== 'texas_scramble') return null;
  const team = outcome.result.teams.find((line) => line.teamNumber === teamNumber);
  return team ? team.teamHandicap : null;
}

/**
 * Hvem som slår ut for laget på dette hullet.
 *
 * Foursomes har valget på alle hull, Patsome bare i foursomes-delen (hull
 * 13–18). Regelen er webbens `FoursomesTeeHint` og `PatsomeTeeHint`, tegn for
 * tegn: odde hull til den laget valgte, like hull til makkeren. Greensome,
 * chapman og gruesome deler resultatform med foursomes, men ikke rotasjonen.
 *
 * `null` når valget ikke er tatt, når laget ikke er et par, eller når den
 * valgte ikke lenger står på laget — ingen av delene er en feil, bare
 * ingenting å si.
 */
export function teeStarterIdFor(opts: {
  gameMode: GameMode;
  /** Valget som gjelder (`effectiveTeeStarter`). */
  chosen: string | null;
  holeNumber: number;
  memberIds: readonly string[];
}): string | null {
  const { gameMode, chosen, holeNumber, memberIds } = opts;
  const onHole =
    gameMode === 'patsome'
      ? patsomeSegmentFor(holeNumber) === 'foursomes'
      : gameMode === 'foursomes_matchplay';
  if (!onHole || chosen == null) return null;
  if (memberIds.length !== 2 || !memberIds.includes(chosen)) return null;
  return holeNumber % 2 === 1
    ? chosen
    : (memberIds.find((id) => id !== chosen) ?? chosen);
}

/**
 * Skal laget mitt få spørsmålet på dette hullet? Som på nettet: foursomes på
 * hull 1, Patsome på alle hullene i foursomes-delen til laget har valgt. Bare
 * for et lag på to aktive der jeg selv er med, og bare mens kortet er åpent.
 */
export function showsTeeStarterPicker(opts: {
  gameMode: GameMode;
  chosen: string | null;
  holeNumber: number;
  /** Aktive medlemmer på laget mitt. */
  memberIds: readonly string[];
  userId: string;
  locked: boolean;
}): boolean {
  const { gameMode, chosen, holeNumber, memberIds, userId, locked } = opts;
  if (locked || chosen != null) return false;
  if (memberIds.length !== 2 || !memberIds.includes(userId)) return false;
  if (gameMode === 'patsome') return patsomeSegmentFor(holeNumber) === 'foursomes';
  return gameMode === 'foursomes_matchplay' && holeNumber === 1;
}
