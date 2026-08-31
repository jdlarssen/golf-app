// Native sideturnering (#1850): broen fra appens data til den DELTE
// sideturnerings-motoren.
//
// Sideturneringen er runden ved siden av runden — lengste drive, nærmest
// flagget, flest birdier, kongen av par 3. Hver kategori har sin egen
// poengregel, og de reglene bor ETT sted: `lib/scoring/sideTournament.ts`.
// Denne fila regner ikke ett eneste poeng. Den monterer inputen motoren vil
// ha — bundelen + de lokale slagene — og leverer nøyaktig de feltene webbens
// `SideTournamentView` konsumerer, så de to flatene ikke kan drive fra
// hverandre.
//
// Hvorfor monteringen er SPEILET mens beslutningene er DELT: webbens
// `computeSideTournament` bor i `app/[locale]/games/[id]/leaderboard/` — i
// Next-rutetreet, sammen med `getTranslations` og en Supabase-klient. Appen
// importerer aldri fra `app/` (samme grunn som `data/sideWinners.ts` gir:
// rutetreet flytter når rutene flytter, og `[locale]`/`[id]` i stien er en
// snublestein for Metro). Så monteringen er skrevet om her, linje for linje
// mot webbens fasit, mens hver eneste POENG-avgjørelse går gjennom
// `calculateSideTournament`, `buildCourseArrays`, `mapSideWinners` og
// `strokesForHole` — de delte funksjonene webben selv kaller.
//
// Fire valg bærer fila:
//
//  1. **`teamGrouping` UTLEDES, den slås ikke opp i en håndskrevet liste.**
//     Se `resolveTeamGrouping`. En ny spillmodus i den delte unionen skal få
//     riktig svar uten at noen husker å redigere her.
//  2. **`ModeResult` kommer INN, den regnes ikke om.** Leaderboard-skjermen
//     har den allerede fra `computeGameLeaderboard`; å regne hele
//     leaderboardet på nytt for å lese ett felt ville vært 22 mode-moduler for
//     ingenting. Den bærer dessuten et bevis: har kalleren en `ModeResult`,
//     kjente `buildScoringContext` moden.
//  3. **WD-filteret skjer HER.** `scoringContext.ts` filtrerer trukne
//     spillere for hovedtabellen; denne modulen leser bundelen direkte og må
//     derfor eie sitt eget filter. En trukket spiller deltar ikke i
//     sideturneringen (#386).
//  4. **Navnløse spillere BEHOLDES.** Se `eligiblePlayers` — det er en
//     bevisst avvik-note, ikke en forglemmelse.
import { firstName } from '../../../../lib/firstName';
import { formatRevealName } from '../../../../lib/names/formatRevealName';
import {
  MODE_LABELS,
  isSoloFormat,
  isStablefordFamily,
  type GameMode,
  type ModeResult,
} from '../../../../lib/scoring/modes/types';
import {
  calculateSideTournament,
  type SideTournamentInput,
  type SideTournamentResult,
} from '../../../../lib/scoring/sideTournament';
import {
  ALL_CATEGORY_IDS,
  type SideCategoryId,
} from '../../../../lib/scoring/sideTournamentConfig';
import {
  buildCourseArrays,
  mapSideWinners,
} from '../../../../lib/scoring/sideTournamentInput';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { BundlePlayer, GameBundle } from '../data/gameBundle';
import type { SideWinnerRow } from '../data/sideWinners';

/**
 * Hvordan spillerne samles til «lag» i sideturneringen.
 *
 *  - `byTeamNumber` — lagene fra `game_players.team_number`. Lag-aggregerte
 *    kategorier (flest birdier på laget, best netto best-ball) gir mening.
 *  - `solo` — hver spiller er sitt eget lag av én. Lag-kategoriene faller
 *    naturlig sammen med de individuelle.
 */
export type TeamGrouping = 'solo' | 'byTeamNumber';

/** Ett medlem i et sideturnerings-lag, ferdig navngitt for visning. */
export interface SideTournamentMember {
  userId: string;
  /** Fullt visningsnavn med evt. kallenavn: `Per "Pelle" Hansen`. */
  displayName: string;
  /** Fornavnet alene — brukes der radene blir trange. */
  firstName: string;
}

/** Ett lag i sideturneringen. */
export interface SideTournamentTeam {
  teamId: number;
  /** `Lag 2` i lag-grupperingen, fornavnet i solo-grupperingen. */
  label: string;
  members: SideTournamentMember[];
}

/**
 * Én kåret slot, i motorens camelCase.
 *
 * `position` er hvilket LD-/CTP-HULL raden gjelder, ikke en plassering — se
 * `BundleGame.sideLdCount`. Samme spiller kan derfor vinne begge slots og få
 * poeng to ganger; det er riktig, ikke en dublett.
 */
export interface SideTournamentSlotWinner {
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  winnerUserId: string | null;
}

/**
 * Alt en sideturnerings-flate trenger. Feltene er de samme webbens
 * `computeSideTournament` returnerer, med samme navn — en visning skrevet mot
 * den ene passer den andre.
 */
export interface SideTournamentData {
  teams: SideTournamentTeam[];
  result: SideTournamentResult;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
  sideWinners: SideTournamentSlotWinner[];
  coursePars: number[];
  disabledCategories: SideCategoryId[];
}

/** Webbens `leaderboard.common.teamLabel` («Lag {number}»), ren form. */
function teamLabel(teamNumber: number): string {
  return `Lag ${teamNumber}`;
}

/** Webbens `leaderboard.common.unknownPlayer`. */
const UNKNOWN_PLAYER = '(ukjent)';

/**
 * `game_mode` kommer ut av bundelen som `string`. `MODE_LABELS` er den delte
 * `Record<GameMode, string>`-en — å spørre den om medlemskap er derfor et
 * oppslag i selve unionen, ikke i en kopi av den som kan bli utdatert.
 */
function asGameMode(raw: string): GameMode | null {
  return Object.prototype.hasOwnProperty.call(MODE_LABELS, raw)
    ? (raw as GameMode)
    : null;
}

/**
 * Lag-gruppering for ett spill — UTLEDT fra de delte predikatene, ikke slått
 * opp i en modus-liste her.
 *
 * Webbens fasit er spredt over 14 renderer-filer (`teamGrouping: '…'` i
 * `leaderboard/formats/*.tsx` + `renderMatchplaySideSection`). Sammenstilt gir
 * de nøyaktig `isSoloFormat`:
 *
 *  - `solo` — solo slagspill, skins, wolf, BBB, nassau, round robin, nines,
 *    acey deucey, og stableford-familien i solo-varianten.
 *  - `byTeamNumber` — best ball, hele matchplay-familien, scramble-familien,
 *    shamble, patsome, og stableford-familien i par-varianten.
 *
 * `isSoloFormat` klassifiserer alle 22 modiene med en `never`-uttømt switch, og
 * trenger kun ÉN opplysning bundelen ikke svarer autoritativt på: lagstørrelsen
 * i stableford-familien. Den henter vi fra motorens eget svar — `variant` er
 * det `computeWithPointsTable` faktisk valgte ut fra `mode_config.team_size`,
 * og dermed sannere enn å lese konfigen om igjen her.
 *
 * `modified_stableford` trenger ingen egen gren: den går gjennom
 * `isStablefordFamily` og arver lag/solo-grenen, akkurat som på web.
 *
 * Ukjent modus → `solo`. Uoppnåelig via `computeGameLeaderboard` (den svarer
 * `unknown-mode` og gir aldri en `ModeResult`), og solo er den samme trygge
 * defaulten stableford-motoren selv velger når konfigen mangler: den kan ikke
 * finne på et lag som ikke finnes.
 */
export function resolveTeamGrouping(
  gameMode: string,
  result: ModeResult,
): TeamGrouping {
  const mode = asGameMode(gameMode);
  if (mode === null) return 'solo';
  const teamSize =
    isStablefordFamily(mode) &&
    result.kind === 'stableford' &&
    result.variant === 'team'
      ? 2
      : 1;
  return isSoloFormat(mode, teamSize) ? 'solo' : 'byTeamNumber';
}

/**
 * `side_ld_count`/`side_ctp_count` er 0–2 i DB (CHECK), men bærer `number`
 * gjennom bundelen. Utenfor området slår vi av sloten i stedet for å gjette:
 * en oppfunnet slot deler ut 2p til noen.
 */
function asSlotCount(raw: number): 0 | 1 | 2 {
  return raw === 1 || raw === 2 ? raw : 0;
}

/**
 * Smalner de lagrede kategori-ID-ene mot den delte `ALL_CATEGORY_IDS`.
 *
 * Oppførselen er identisk med webbens rette gjennomkjøring: motoren sjekker
 * `disabledCategories.includes(kategori)`, og en ukjent streng treffer aldri
 * noe uansett. Filteret er altså bare typen gjort ærlig, ikke en ny regel.
 */
function asDisabledCategories(raw: readonly string[]): SideCategoryId[] {
  return raw.filter((id): id is SideCategoryId =>
    (ALL_CATEGORY_IDS as readonly string[]).includes(id),
  );
}

/** Brutto + netto per hull for én spiller, 18 plasser, `null` = ikke spilt. */
interface PlayerHoleScores {
  userId: string;
  perHoleGross: Array<number | null>;
  perHoleNetto: Array<number | null>;
}

/** Ett lag før navnene settes på: hvem er med, og hva heter raden. */
interface TeamGroup {
  teamId: number;
  label: string;
  userIds: string[];
}

/**
 * Grupperer de kvalifiserte spillerne til lag.
 *
 * `byTeamNumber` hopper over rader uten lag (`null` eller `0` — kolonnen er
 * nullable i prod, #844, og `0` er «ikke tildelt»). En slik spiller har ikke
 * noe lag å score for, og et lag 0 ville vært et oppfunnet lag.
 */
function groupTeams(
  eligiblePlayers: readonly BundlePlayer[],
  grouping: TeamGrouping,
): TeamGroup[] {
  if (grouping === 'solo') {
    return eligiblePlayers.map((player, index) => {
      const name = player.name ?? UNKNOWN_PLAYER;
      return {
        teamId: index + 1,
        label: firstName(name) ?? name,
        userIds: [player.userId],
      };
    });
  }

  const byTeam = new Map<number, string[]>();
  for (const player of eligiblePlayers) {
    const teamNumber = player.teamNumber;
    if (teamNumber == null || teamNumber === 0) continue;
    const members = byTeam.get(teamNumber) ?? [];
    members.push(player.userId);
    byTeam.set(teamNumber, members);
  }
  return [...byTeam.keys()]
    .sort((a, b) => a - b)
    .map((teamNumber) => ({
      teamId: teamNumber,
      label: teamLabel(teamNumber),
      userIds: byTeam.get(teamNumber) ?? [],
    }));
}

/**
 * Bygger sideturneringen for ett spill.
 *
 * Ren funksjon: ingen nett, ingen SQLite, ingen React. Kalleren har allerede
 * lest bundelen (`loadGameBundle`), de lokale slagene (`readScoresForGame`),
 * vinnerradene (`fetchSideWinners`) og hovedtabellen
 * (`computeGameLeaderboard`).
 *
 * @param opts.result Motorens svar for spillets HOVEDformat. Brukes kun til å
 *   avgjøre lag-grupperingen (se {@link resolveTeamGrouping}) — sideturneringens
 *   egne tall kommer alltid fra `calculateSideTournament`.
 */
export function buildSideTournament(opts: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  sideWinnerRows: readonly SideWinnerRow[];
  result: ModeResult;
}): SideTournamentData {
  const { bundle, scores, sideWinnerRows, result } = opts;

  // Trukne spillere deltar ikke i sideturneringen (#386) — filteret er dette
  // lagets eget, siden bundelen leses direkte her.
  //
  // AVVIK fra webbens `computeSideTournament`, med vilje: webben filtrerer
  // også på `p.users != null`, men bundelen har kollapset «ingen users-rad» og
  // «users-rad uten navn» til samme `name: null` (`toBundle` i
  // `data/gameBundle.ts`). De to er ikke det samme: `handle_new_auth_user`
  // setter bare `(id, email, hcp_index)`, så en fersk selvregistrert spiller
  // står med `name = null` til profilen fylles ut — og en SLETTET bruker heter
  // `'Slettet bruker'` (`anonymize_user`, 0131), ikke null. Å filtrere på navn
  // ville altså kastet ut aktive spillere og ikke fanget en eneste slettet.
  // Verre: nettoen deres ville forsvunnet fra lagets best-ball, så lagets
  // sidepoeng ble stille feil. De beholdes derfor og vises som «(ukjent)»,
  // nøyaktig som webben viser en spiller uten navn. Samme avveining som
  // `scoringContext.ts` gjør for hovedtabellen — og de to MÅ være enige, ellers
  // spriker de to tabellene på samme skjerm.
  const eligiblePlayers = bundle.players.filter(
    (player) => player.withdrawnAt == null,
  );

  // coursePars / courseStrokeIndices + siByHole fra den DELTE
  // `buildCourseArrays` — samme fallback-disiplin som webbens leaderboard og
  // delekort. `siByHole` tas imot rått fordi netto-loopen under trenger en
  // ANNEN fallback (`?? 18`) enn `courseStrokeIndices`-arrayet (`?? h`). De to
  // må ikke blandes.
  const { coursePars, courseStrokeIndices, siByHole } = buildCourseArrays(
    bundle.holes.map((hole) => ({
      holeNumber: hole.holeNumber,
      par: hole.parMens,
      strokeIndex: hole.strokeIndex,
    })),
  );

  // Sideturneringen trenger BÅDE brutto og netto per hull — en stableford-
  // eller matchplay-`ModeResult` bærer bare sitt eget format sine tall. Derfor
  // regnes de her, fra de rå slagene, som på web.
  const scoresByPlayer = new Map<string, Map<number, number>>();
  for (const score of scores) {
    if (score.strokes == null) continue;
    let holes = scoresByPlayer.get(score.userId);
    if (!holes) {
      holes = new Map();
      scoresByPlayer.set(score.userId, holes);
    }
    holes.set(score.holeNumber, score.strokes);
  }

  const perHolePerPlayer: PlayerHoleScores[] = eligiblePlayers.map((player) => {
    // Kolonnen er nullable i prod (#844); `?? 0` er samme kollaps webben gjør.
    const courseHandicap = player.courseHandicap ?? 0;
    const perHoleGross: Array<number | null> = new Array(18).fill(null);
    const perHoleNetto: Array<number | null> = new Array(18).fill(null);
    const playerScores = scoresByPlayer.get(player.userId);
    if (playerScores) {
      for (let hole = 1; hole <= 18; hole++) {
        const gross = playerScores.get(hole);
        // Uspilt hull forblir `null`, aldri `0` — motoren skiller på det.
        if (gross == null) continue;
        const strokeIndex = siByHole.get(hole) ?? 18;
        perHoleGross[hole - 1] = gross;
        perHoleNetto[hole - 1] =
          gross - strokesForHole(courseHandicap, strokeIndex);
      }
    }
    return { userId: player.userId, perHoleGross, perHoleNetto };
  });

  const teamGrouping = resolveTeamGrouping(bundle.game.gameMode, result);
  const teamGroups = groupTeams(eligiblePlayers, teamGrouping);

  const nettoByUserId = new Map(
    perHolePerPlayer.map((entry) => [entry.userId, entry.perHoleNetto]),
  );

  // Best ball per hull per lag: MIN av lagets nettoer. `null` når ingen på
  // laget har spilt hullet.
  const nettoBestBallPerHole = teamGroups.map((group) => {
    const perHoleNetto: Array<number | null> = new Array(18).fill(null);
    for (let index = 0; index < 18; index++) {
      const nettos = group.userIds
        .map((userId) => nettoByUserId.get(userId)?.[index])
        .filter((value): value is number => typeof value === 'number');
      if (nettos.length > 0) perHoleNetto[index] = Math.min(...nettos);
    }
    return { teamId: group.teamId, perHoleNetto };
  });

  const ldCount = asSlotCount(bundle.game.sideLdCount);
  const ctpCount = asSlotCount(bundle.game.sideCtpCount);
  const disabledCategories = asDisabledCategories(
    bundle.game.sideDisabledCategories,
  );

  const input: SideTournamentInput = {
    config: {
      // Webben hardkoder `true` fordi alle 14 kalle-stedene har gatet på
      // flagget før de kommer hit. Vi sender flagget videre i stedet: for et
      // spill med sideturnering PÅ er de to identiske, og for et spill med den
      // AV svarer motoren null poeng i stedet for å dele ut premier ingen har
      // bedt om.
      enabled: bundle.game.sideTournamentEnabled,
      ldCount,
      ctpCount,
      disabledCategories,
    },
    teams: teamGroups.map((group) => ({
      teamId: group.teamId,
      userIds: group.userIds,
    })),
    coursePars,
    courseStrokeIndices,
    playerScoresPerHole: perHolePerPlayer,
    nettoBestBallPerHole,
    sideWinners: mapSideWinners([...sideWinnerRows]),
  };

  const playerByUserId = new Map(
    eligiblePlayers.map((player) => [player.userId, player]),
  );

  const teams: SideTournamentTeam[] = teamGroups.map((group) => ({
    teamId: group.teamId,
    label: group.label,
    members: group.userIds.map((userId) => {
      const player = playerByUserId.get(userId);
      const name = player?.name ?? UNKNOWN_PLAYER;
      const nickname = player?.nickname ?? null;
      const displayName = formatRevealName(name, nickname);
      return {
        userId,
        displayName,
        firstName: firstName(name) ?? displayName ?? '?',
      };
    }),
  }));

  return {
    teams,
    result: calculateSideTournament(input),
    ldCount,
    ctpCount,
    // ALLE radene, ikke bare slot 1/2 — visningen lister hva som ble kåret,
    // mens `input.sideWinners` er den filtrerte lista motoren regner på.
    // Samme todeling som web.
    sideWinners: sideWinnerRows.map((row) => ({
      category: row.category,
      position: row.position,
      winnerUserId: row.winner_user_id,
    })),
    coursePars,
    disabledCategories,
  };
}
