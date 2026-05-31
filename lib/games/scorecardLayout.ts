import { pickTeamCaptain } from './teamCaptain';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import type { StablefordPointsFn } from '@/lib/scoring/modes/stableford';
import {
  classifyMatchplayHole,
  computeMatchplayRunningStatus,
} from '@/lib/scoring/modes/singlesMatchplay';
import {
  isStablefordFamily,
  isAlternateShotMatchplay,
} from '@/lib/scoring/modes/types';
import type { GameForHole, PlayerForHole } from './getGameWithPlayers';

/**
 * Player som vises i en kolonne på Layout B. `displayName` brukes til
 * footer-totaler («Du: ... · Partner: ...»). `initial` til kolonne-headeren.
 * `courseHandicap` til netto-utregning. `isCurrentUser` styrer hvilken
 * kolonne som er leftmost.
 */
export interface ScorecardColumnPlayer {
  userId: string;
  initial: string;
  displayName: string;
  courseHandicap: number;
  isCurrentUser: boolean;
  /**
   * Spillerens `game_players.team_number`. Brukes av Layout B for å gruppere
   * kolonner i 2+2 (fourball) — me's side til venstre, motstander til høyre.
   * Bevart som `number | null` for å være kompatibel med solo-modi der team
   * ikke er meningsfull (null) — selv om Layout B i praksis alltid har et
   * team_number siden modi som krever sider validerer kolonnen ved publish.
   */
  teamNumber: number | null;
}

/**
 * Layout-spesifikasjon for scorekort-flaten.
 *
 *  - `variant: 'a'` — single-player tabell (solo-modi + Texas + reveal-fallback).
 *  - `variant: 'b'` — side-om-side (best-ball, par-stableford team, matchplay).
 *
 * `scoreUserIds` styrer hvilke user_ids vi henter scorer for. For Layout A
 * er det én (me eller captain). For Layout B er det me + partner(e) /
 * motstander. Authz-sjekk skjer på call-site (`me ∈ players`), helperen
 * gjør ingen sikkerhetsbeslutninger.
 */
export interface ScorecardLayout {
  variant: 'a' | 'b';
  /** Kolonner som rendres i Layout B. Tom for Layout A. */
  columns: ScorecardColumnPlayer[];
  /** Alle user_ids vi henter scorer for (én for solo/Texas, N for team-modi). */
  scoreUserIds: string[];
  /** Layout A: hvilken userId vi viser scorer for (én kolonne). */
  primaryUserId: string;
  /**
   * Layout A: course-handicap brukt til netto-utregning. For Texas brukes
   * lag-handicap (sum av medlemmer × pct), ikke individuell.
   */
  primaryHandicap: number;
  /** True for par-stableford (Layout B viser poeng istedenfor netto). */
  isStableford: boolean;
  /** True for matchplay (footer viser match-status istedenfor lag-total). */
  isMatchplay: boolean;
  /**
   * True for fourball matchplay (2v2). Layout B med 4 kolonner: me + partner
   * (samme `team_number`) + 2 motstandere. Footer viser match-status basert
   * på lag-best-netto per side, ikke individuell netto som singles_matchplay.
   *
   * Når true er `isMatchplay` også true — fourball er en variant av matchplay.
   * Konsumenter velger fourball-spesifikk total-utregning via dette flagget
   * uten å bryte singles-matchplay-grenen.
   */
  isFourball: boolean;
  /**
   * True for foursomes matchplay (2v2 alternate-shot). Layout B med 2 kolonner:
   * me's side (kaptein-userId, lex-min) + motstander-siden (kaptein-userId).
   * Hver kolonne representerer ett LAG, ikke én spiller — `displayName` rendres
   * som «Per/Knut» og score-input ruter til kaptein-userId via primaryUserId.
   * `courseHandicap` per kolonne = lagets effective extra-HCP (high side får
   * diff via WHS-formelen, low side får 0).
   *
   * Når true er `isMatchplay` også true — foursomes er en variant av matchplay
   * og bruker singles' 2-kolonne `computeMatchplayRunningStatus`-grenen for
   * match-status. Konsumenter velger foursomes-spesifikk rendering (tee-starter-
   * banner, lag-fokusert display) via dette flagget.
   */
  isFoursomes: boolean;
  /**
   * For Layout B (fourball + foursomes + singles matchplay + best-ball +
   * par-stableford): me sitt `team_number`. Brukes til å skille side 1 (me's
   * lag) fra side 2 (motstander-laget) i match-status-beregningen.
   */
  meTeamNumber: number | null;
}

interface ColumnFormatter {
  initials(player: PlayerForHole): string;
  displayName(player: PlayerForHole, fallback: string): string;
}

/**
 * Bestemmer scorekort-layout basert på spillmodus, spillerlista og
 * reveal-state. Ren funksjon (ingen DB-tilgang) — call-site fetcher
 * scorer basert på `layout.scoreUserIds`.
 *
 * Regler:
 *  - Texas scramble: Layout A med captain-userId (lex-min) som primær.
 *    Lag-handicap = round(sum(member.course_handicap) × team_handicap_pct / 100).
 *  - Reveal-active (visibility=reveal + status=active): Layout A med me,
 *    uansett modus. Beholder reveal-prinsippet om å skjule andres data.
 *  - Solo-modi (stableford team_size=1, solo strokeplay): Layout A med me.
 *  - Best-ball, par-stableford (team_size=2): Layout B med me + partner
 *    på samme team_number.
 *  - Matchplay (1v1): Layout B med me + motstander (annet team_number).
 *  - Defensiv fallback: hvis team-modus mangler partner (skal ikke skje
 *    under aktivt spill) → Layout A med me.
 */
export function resolveScorecardLayout(
  game: GameForHole,
  players: PlayerForHole[],
  me: PlayerForHole,
  revealActive: boolean,
  fmt: ColumnFormatter,
): ScorecardLayout {
  const mode = game.game_mode;
  const cfg = game.mode_config;

  if (mode === 'texas_scramble' || mode === 'ambrose' || mode === 'florida_scramble') {
    const teamMembers = players.filter((p) => p.team_number === me.team_number);
    const captainId =
      teamMembers.length > 0
        ? pickTeamCaptain(teamMembers.map((m) => m.user_id))
        : me.user_id;
    const combinedCH = teamMembers.reduce(
      (sum, p) => sum + (p.course_handicap ?? 0),
      0,
    );
    const pct =
      cfg.kind === 'texas_scramble' || cfg.kind === 'ambrose' || cfg.kind === 'florida_scramble'
        ? cfg.team_handicap_pct
        : 0;
    const teamHandicap = Math.round((combinedCH * pct) / 100);
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [captainId],
      primaryUserId: captainId,
      primaryHandicap: teamHandicap,
      isStableford: false,
      isMatchplay: false,
      isFourball: false,
      isFoursomes: false,
      meTeamNumber: me.team_number ?? null,
    };
  }

  if (mode === 'patsome') {
    // Patsome er hybrid: hull 1–6 per spiller (4BBB), hull 7–18 én lagball
    // (kaptein-eid, som Texas). Scorekort-oversikten klarer ikke å uttrykke
    // per-segment-handicap i én verdi, så vi viser lagets kort fra kapteinen
    // (lex-min) uten strokes-dotter. De handicap-justerte poengene og hele
    // segment-fordelingen vises på leaderboard (PatsomeView).
    const teamMembers = players.filter((p) => p.team_number === me.team_number);
    const captainId =
      teamMembers.length > 0
        ? pickTeamCaptain(teamMembers.map((m) => m.user_id))
        : me.user_id;
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [captainId],
      primaryUserId: captainId,
      primaryHandicap: 0,
      isStableford: false,
      isMatchplay: false,
      isFourball: false,
      isFoursomes: false,
      meTeamNumber: me.team_number ?? null,
    };
  }

  if (isAlternateShotMatchplay(mode)) {
    // Alternate-shot-familien (foursomes + greensome + chapman) adopterer Texas
    // captain-pattern (én ball per lag, kaptein-userId eier scores-radene) men
    // rendres som 2-kolonne head-to-head matchplay-scorekort. Allowance via
    // WHS-diff-formel: lavlaget får 0 strokes, høylaget får round(|sideDiff| ×
    // allowance_pct / 100) strokes. Side-HCP: foursomes = sum; greensome +
    // chapman = 60/40-blanding (0,6×laveste + 0,4×høyeste).
    const mySidePlayers = players.filter(
      (p) => p.team_number === me.team_number,
    );
    const oppSidePlayers = players.filter(
      (p) => p.team_number !== me.team_number && p.team_number !== null,
    );

    // Defensiv fallback: må ha begge sider med 2 spillere hver. Solo-shell
    // hindrer kræsj hvis draft-state mangler partner/motstander.
    if (mySidePlayers.length !== 2 || oppSidePlayers.length !== 2) {
      return {
        variant: 'a',
        columns: [],
        scoreUserIds: [me.user_id],
        primaryUserId: me.user_id,
        primaryHandicap: me.course_handicap ?? 0,
        isStableford: false,
        isMatchplay: false,
        isFourball: false,
        isFoursomes: false,
        meTeamNumber: me.team_number ?? null,
      };
    }

    const mySideCaptainId = pickTeamCaptain(
      mySidePlayers.map((p) => p.user_id),
    );
    const oppSideCaptainId = pickTeamCaptain(
      oppSidePlayers.map((p) => p.user_id),
    );

    // WHS-diff: high side får (sideDiff × allowance_pct/100) som lag-strokes,
    // low side 0. Allowance leses fra mode_config (default 50 for foursomes,
    // 100 for greensome/chapman). Side-HCP: foursomes = sum; greensome + chapman
    // = 0,6×laveste + 0,4×høyeste. Holdt i sync med scoring-engine så scorekort
    // og leaderboard viser samme strokes.
    const allowancePct =
      cfg.kind === 'foursomes_matchplay' ||
      cfg.kind === 'greensome_matchplay' ||
      cfg.kind === 'chapman_matchplay' ||
      cfg.kind === 'gruesome_matchplay'
        ? cfg.allowance_pct
        : 50;

    const isSixtyForty =
      mode === 'greensome_matchplay' || mode === 'chapman_matchplay';
    // Gruesome: same as foursomes (sum handicap, isSixtyForty = false)
    function sideHandicap(sidePlayers: typeof mySidePlayers): number {
      if (isSixtyForty) {
        const chs = sidePlayers.map((p) => p.course_handicap ?? 0);
        const low = Math.min(...chs);
        const high = Math.max(...chs);
        return Math.round(0.6 * low + 0.4 * high);
      }
      return sidePlayers.reduce((sum, p) => sum + (p.course_handicap ?? 0), 0);
    }
    const mySideCombined = sideHandicap(mySidePlayers);
    const oppSideCombined = sideHandicap(oppSidePlayers);
    const diff = Math.abs(mySideCombined - oppSideCombined);
    const highSideExtra = Math.round((diff * allowancePct) / 100);
    const mySideExtra = mySideCombined > oppSideCombined ? highSideExtra : 0;
    const oppSideExtra = oppSideCombined > mySideCombined ? highSideExtra : 0;

    // Sort each side deterministisk på userId for stabil rendering. Kaptein
    // ender opp først hvis dens userId er lex-min — som er konvensjonen.
    const mySideSorted = [...mySidePlayers].sort((a, b) =>
      a.user_id.localeCompare(b.user_id),
    );
    const oppSideSorted = [...oppSidePlayers].sort((a, b) =>
      a.user_id.localeCompare(b.user_id),
    );

    const mySideDisplay =
      mySideSorted
        .map((p) => fmt.displayName(p, 'Partner'))
        .join('/') || 'Ditt lag';
    const oppSideDisplay =
      oppSideSorted
        .map((p) => fmt.displayName(p, 'Motstander'))
        .join('/') || 'Motstander';

    // Kolonne-initial: bruk kapteinens initialer. Layout B rendrer dette i
    // header-celler — fullt navn vises i footer-totaler.
    const mySideCaptain = mySideSorted.find((p) => p.user_id === mySideCaptainId);
    const oppSideCaptain = oppSideSorted.find(
      (p) => p.user_id === oppSideCaptainId,
    );

    const mySideColumn: ScorecardColumnPlayer = {
      userId: mySideCaptainId,
      initial: mySideCaptain ? fmt.initials(mySideCaptain) : '?',
      displayName: mySideDisplay,
      courseHandicap: mySideExtra,
      isCurrentUser: true,
      teamNumber: me.team_number ?? null,
    };
    const oppSideColumn: ScorecardColumnPlayer = {
      userId: oppSideCaptainId,
      initial: oppSideCaptain ? fmt.initials(oppSideCaptain) : '?',
      displayName: oppSideDisplay,
      courseHandicap: oppSideExtra,
      isCurrentUser: false,
      teamNumber: oppSidePlayers[0].team_number,
    };

    return {
      variant: 'b',
      columns: [mySideColumn, oppSideColumn],
      scoreUserIds: [mySideCaptainId, oppSideCaptainId],
      primaryUserId: mySideCaptainId,
      primaryHandicap: mySideExtra,
      isStableford: false,
      isMatchplay: true,
      isFourball: false,
      isFoursomes: true,
      meTeamNumber: me.team_number ?? null,
    };
  }

  const isStablefordTeam =
    isStablefordFamily(mode) &&
    (cfg.kind === 'stableford' || cfg.kind === 'modified_stableford') &&
    cfg.team_size === 2;
  const isBestBall = mode === 'best_ball';
  const isMatchplaySingles = mode === 'singles_matchplay';
  const isFourball = mode === 'fourball_matchplay';
  const isMatchplay = isMatchplaySingles || isFourball;
  const isTeamMode = isBestBall || isStablefordTeam || isMatchplay;

  if (!isTeamMode || revealActive) {
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [me.user_id],
      primaryUserId: me.user_id,
      primaryHandicap: me.course_handicap ?? 0,
      isStableford: false,
      isMatchplay: false,
      isFourball: false,
      isFoursomes: false,
      meTeamNumber: me.team_number ?? null,
    };
  }

  // Partner-utvalg per modus:
  //  - Best-ball / par-stableford: alle på samme team_number unntatt me selv
  //  - Singles matchplay: motstander (annet team_number) — 1 spiller
  //  - Fourball matchplay (2v2): partner (samme team_number) + motstanderne
  //    (annet team_number) — totalt 3 spillere ved siden av me. Kolonne-
  //    rekkefølge: me → partner → motstander 1 → motstander 2 slik at lag
  //    1 og lag 2 visuelt grupperes i 2+2-layout.
  let partners: PlayerForHole[];
  if (isFourball) {
    const myPartner = players.filter(
      (p) => p.team_number === me.team_number && p.user_id !== me.user_id,
    );
    const opponents = players
      .filter((p) => p.team_number !== me.team_number)
      .sort((a, b) => a.user_id.localeCompare(b.user_id));
    partners = [...myPartner, ...opponents];
  } else if (isMatchplaySingles) {
    partners = players.filter((p) => p.team_number !== me.team_number);
  } else {
    partners = players.filter(
      (p) => p.team_number === me.team_number && p.user_id !== me.user_id,
    );
  }

  if (partners.length === 0) {
    return {
      variant: 'a',
      columns: [],
      scoreUserIds: [me.user_id],
      primaryUserId: me.user_id,
      primaryHandicap: me.course_handicap ?? 0,
      isStableford: false,
      isMatchplay: false,
      isFourball: false,
      isFoursomes: false,
      meTeamNumber: me.team_number ?? null,
    };
  }

  const meColumn: ScorecardColumnPlayer = {
    userId: me.user_id,
    initial: fmt.initials(me),
    displayName: fmt.displayName(me, 'Du'),
    courseHandicap: me.course_handicap ?? 0,
    isCurrentUser: true,
    teamNumber: me.team_number ?? null,
  };
  const partnerColumns: ScorecardColumnPlayer[] = partners.map((p) => {
    const fallback = isFourball
      ? p.team_number === me.team_number
        ? 'Partner'
        : 'Motstander'
      : isMatchplaySingles
        ? 'Motstander'
        : 'Partner';
    return {
      userId: p.user_id,
      initial: fmt.initials(p),
      displayName: fmt.displayName(p, fallback),
      courseHandicap: p.course_handicap ?? 0,
      isCurrentUser: false,
      teamNumber: p.team_number ?? null,
    };
  });

  return {
    variant: 'b',
    columns: [meColumn, ...partnerColumns],
    scoreUserIds: [meColumn.userId, ...partnerColumns.map((p) => p.userId)],
    primaryUserId: me.user_id,
    primaryHandicap: me.course_handicap ?? 0,
    isStableford: isStablefordTeam,
    isMatchplay,
    isFourball,
    isFoursomes: false,
    meTeamNumber: me.team_number ?? null,
  };
}

// ─── Footer-totals for Layout B ─────────────────────────────────────────

export interface LayoutBHoleInput {
  hole_number: number;
  par: number;
  stroke_index: number;
}

export interface LayoutBPlayerTotal {
  userId: string;
  holesPlayed: number;
  brutto: number;
  netto: number;
  points: number;
}

export type LayoutBMatchplayHoleResult = 'won' | 'lost' | 'tied' | 'unplayed';

export interface LayoutBTotals {
  perPlayer: LayoutBPlayerTotal[];
  /** Sum av per-hull lag-best-netto. Brukes til best-ball-footer. */
  teamTotalNetto: number;
  /** Sum av per-hull MAX-stableford-poeng. Brukes til par-stableford-footer. */
  teamTotalPoints: number;
  /** Antall hull der minst én spiller har skåret (for footer-tellingen). */
  playedTeamHoles: number;
  /** Match-status fra me's perspektiv. Null for ikke-matchplay. */
  matchStatus: string | null;
}

/**
 * Ren totals-utregning for Layout B-footeret. Tester (alle 4 team-modi)
 * verifiserer at per-spiller- og lag-tall stemmer mot fixture-data.
 *
 *  - Best-ball: lag-best = MIN(netto) per hull, lag-total = sum av lag-best.
 *  - Par-stableford: lag-poeng = MAX(stableford-poeng) per hull, lag-total
 *    = sum av lag-poeng.
 *  - Singles matchplay (1v1): ingen lag-total — i stedet match-status
 *    «X up etter N hull» basert på individuell netto.
 *  - Fourball matchplay (2v2): match-status basert på lag-best-netto per side
 *    (MIN av partnernes netto), sett fra me's perspektiv. `meTeamNumber` +
 *    `fourballAssignments` per kolonne nødvendig for å dele de 4 spillerne
 *    i to sider.
 *
 * `scoresByUserHole` har nøkkel `${userId}#${holeNumber}` → strokes | null.
 * `columns[0]` antas å være me (matchplay holes-up regnes fra me's perspektiv).
 */
export function computeLayoutBTotals(
  holes: readonly LayoutBHoleInput[],
  scoresByUserHole: ReadonlyMap<string, number | null>,
  columns: readonly ScorecardColumnPlayer[],
  opts: {
    isStableford: boolean;
    isMatchplay: boolean;
    isFourball?: boolean;
    /** For fourball: me's team_number. Bestemmer hvilken side som er «vi». */
    meTeamNumber?: number | null;
    /**
     * Poeng-tabell for stableford-poeng. Default standard-tabellen; modified
     * stableford (#281) sender `computeModifiedStablefordPoints`. Ignorert når
     * `isStableford` er false.
     */
    pointsFn?: StablefordPointsFn;
  },
): LayoutBTotals {
  const { isStableford, isMatchplay } = opts;
  const isFourball = opts.isFourball === true;
  const pointsFn = opts.pointsFn ?? computeStablefordPoints;

  const perPlayer: LayoutBPlayerTotal[] = columns.map((c) => ({
    userId: c.userId,
    holesPlayed: 0,
    brutto: 0,
    netto: 0,
    points: 0,
  }));

  let teamTotalNetto = 0;
  let teamTotalPoints = 0;
  let playedTeamHoles = 0;

  for (const hole of holes) {
    const nettos: number[] = [];
    const pointsPerPlayer: (number | null)[] = [];
    let hasAnyScore = false;

    columns.forEach((c, idx) => {
      const strokes =
        scoresByUserHole.get(`${c.userId}#${hole.hole_number}`) ?? null;
      if (strokes === null) {
        pointsPerPlayer.push(null);
        return;
      }
      hasAnyScore = true;
      const extra = strokesForHole(c.courseHandicap, hole.stroke_index);
      const netto = strokes - extra;
      perPlayer[idx].holesPlayed += 1;
      perPlayer[idx].brutto += strokes;
      perPlayer[idx].netto += netto;
      nettos.push(netto);
      if (isStableford) {
        const pts = pointsFn({ par: hole.par, netStrokes: netto });
        perPlayer[idx].points += pts;
        pointsPerPlayer.push(pts);
      } else {
        pointsPerPlayer.push(null);
      }
    });

    if (isStableford) {
      // Lag-hull-poeng = MAX av spillernes poeng, der ikke-spilt teller som 0
      // (pointsFn(null) = 0). Speiler scoring-motoren i stableford.ts. Ingen
      // 0-gulv: modified stableford (#281) kan ha negativ lag-MAX når alle
      // partnere spilte og fikk minuspoeng — da skal teamPoints være negativ,
      // ikke klemt til 0, ellers drifter scorekort-footeren fra leaderboard.
      const teamPoints = Math.max(...pointsPerPlayer.map((p) => p ?? 0));
      teamTotalPoints += teamPoints;
      if (hasAnyScore) playedTeamHoles += 1;
    } else if (!isMatchplay) {
      // Best-ball: lag-best = MIN(netto). Matchplay-grenen bruker shared
      // helper utenfor løkken (issue #205).
      if (nettos.length > 0) {
        teamTotalNetto += Math.min(...nettos);
        playedTeamHoles += 1;
      }
    }
  }

  // Matchplay: deleger running-status til shared helper i singlesMatchplay
  // (issue #205) slik at scorekort og leaderboard ikke kan drifte fra
  // hverandre på win/loss/tied-klassifisering. Status-stringen er fortsatt
  // scorekortets ansvar — leaderboard bruker «1up»/«AS»/«3&2», vi bruker
  // «Du er X up etter N hull».
  let matchStatus: string | null = null;
  if (
    isFourball &&
    columns.length === 4 &&
    opts.meTeamNumber != null
  ) {
    // Fourball-matchplay: 2v2. Side 1 (me's side) = kolonner med
    // `teamNumber === meTeamNumber`; side 2 = de andre to. Per-hull side-best
    // = MIN av side-spillernes individuelle netto. Match-status sammenligner
    // side1Best vs side2Best via samme `classifyMatchplayHole` som leaderboard
    // og scoring-laget — ingen drift mellom flatene.
    const meTeamNumber = opts.meTeamNumber;
    const meSideCols = columns.filter((c) => c.teamNumber === meTeamNumber);
    const oppSideCols = columns.filter((c) => c.teamNumber !== meTeamNumber);

    let meWins = 0;
    let oppWins = 0;
    let fourballHolesPlayed = 0;

    for (const hole of holes) {
      const netForSide = (sideCols: readonly ScorecardColumnPlayer[]): number | null => {
        const nettos: number[] = [];
        for (const c of sideCols) {
          const gross =
            scoresByUserHole.get(`${c.userId}#${hole.hole_number}`) ?? null;
          if (gross === null) continue;
          const extra = strokesForHole(c.courseHandicap, hole.stroke_index);
          nettos.push(gross - extra);
        }
        return nettos.length > 0 ? Math.min(...nettos) : null;
      };
      const meBest = netForSide(meSideCols);
      const oppBest = netForSide(oppSideCols);
      const r = classifyMatchplayHole(meBest, oppBest);
      if (r === 'side1_wins') {
        meWins += 1;
        fourballHolesPlayed += 1;
      } else if (r === 'side2_wins') {
        oppWins += 1;
        fourballHolesPlayed += 1;
      } else if (r === 'tied') {
        fourballHolesPlayed += 1;
      }
    }

    const holesUp = meWins - oppWins;
    if (fourballHolesPlayed === 0) {
      matchStatus = 'Ingen hull spilt ennå';
    } else if (holesUp === 0) {
      matchStatus = `AS (${fourballHolesPlayed} hull spilt)`;
    } else if (holesUp > 0) {
      matchStatus = `Laget ditt er ${holesUp} up etter ${fourballHolesPlayed} hull`;
    } else {
      matchStatus = `Laget ditt er ${-holesUp} down etter ${fourballHolesPlayed} hull`;
    }
  } else if (isMatchplay && columns.length === 2) {
    const status = computeMatchplayRunningStatus(
      holes.map((h) => ({ number: h.hole_number, strokeIndex: h.stroke_index })),
      { userId: columns[0].userId, courseHandicap: columns[0].courseHandicap },
      { userId: columns[1].userId, courseHandicap: columns[1].courseHandicap },
      scoresByUserHole,
    );
    if (status.holesPlayed === 0) {
      matchStatus = 'Ingen hull spilt ennå';
    } else if (status.holesUp === 0) {
      matchStatus = `AS (${status.holesPlayed} hull spilt)`;
    } else if (status.holesUp > 0) {
      matchStatus = `Du er ${status.holesUp} up etter ${status.holesPlayed} hull`;
    } else {
      matchStatus = `Du er ${-status.holesUp} down etter ${status.holesPlayed} hull`;
    }
  }

  return {
    perPlayer,
    teamTotalNetto,
    teamTotalPoints,
    playedTeamHoles,
    matchStatus,
  };
}
