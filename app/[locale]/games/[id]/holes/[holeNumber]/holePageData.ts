// Server-fetchene hull-siden trenger (#1716 — ren flytting ut av `page.tsx`).
//
// Rekkefølgen er en del av kontrakten: alt hentes i ÉN `Promise.all`-bølge
// (`courses.name` inkludert — #1779 fjernet den sekvensielle forhåndslesingen;
// navnet mater ingenting i bølgen), og søsken-scorene leses etter den bølgen
// fordi de venter på hvem som eier lagets rader. Cachingen er uendret:
// `games`/`game_players` kommer fra den tag-cachede `getGameWithPlayers`
// (kaller i page.tsx), mens alt her er ucachede per-request-lesinger.

import { getAdminClient } from '@/lib/supabase/admin';
import type { getServerClient } from '@/lib/supabase/server';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import type { SegmentSibling } from '@/lib/games/segmentSibling';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { getBingoBangoBongoHoles } from '@/lib/bbb/getBingoBangoBongoHoles';
import { scoredHoleNumbers, scoreOwnerUserIds } from '@/lib/games/scoreOwner';
import { formerTeamRowOwnerIds, teamScoreOwnerId } from '@/lib/games/teamCaptain';
import { computeGreenCenter } from '@/lib/geo/greenCenter';
import { PIN_GATE_MAX_PINS, PIN_GATE_WINDOW_DAYS } from '@/lib/geo/pinRules';
import type { LatLng } from '@/lib/geo/distance';
import type { GameMode } from '@/lib/scoring/modes/types';
import { usesParDifference } from '@/lib/scoring/parDifference';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { readHoleClaims, type HoleClaimsNeed } from '@/lib/games/sideClaims';
import {
  contestsForHole,
  CUP_SIDE_AWARD_SELECT,
  toCupSideAwards,
  type CupSideAward,
  type CupSideAwardRow,
} from '@/lib/games/sideContest';
import { sideHolesConfigFor } from './holeSideContest';

/** Cookie-basert per-request-klient (typet via helperen, jf. #844). */
type ServerClient = Awaited<ReturnType<typeof getServerClient>>;

export type HoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

export type ScoreRow = {
  user_id: string;
  strokes: number | null;
  putts: number | null;
  client_updated_at: string | null;
  updated_at: string | null;
};

/** Hvilke modus-avhengige queryer bølgen skal ta med. */
export type HoleFetchModes = {
  isWolf: boolean;
  isSkins: boolean;
  isBBB: boolean;
  isPatsome: boolean;
};

/** The cup's side awards (CTP, LD, GIR holes), or `ok: false` when the read failed. */
export type CupSideAwardsRead = { ok: true; awards: CupSideAward[] } | { ok: false; error: unknown };

/**
 * #2283: the holes where the cup has closest to pin, longest drive or GIR.
 * Read with the user's own session: `tournament_side_awards` has a SELECT policy
 * for every signed-in user, and `CUP_SIDE_AWARD_SELECT` leaves out the winner
 * and the counters, so a hole shows nothing from the other matches (#1495).
 * Never throws: it runs inside the render wave, where a thrown error would fell
 * the whole hole page for a card that is secondary.
 */
export async function readCupSideAwards(
  supabase: Pick<ServerClient, 'from'>,
  tournamentId: string,
): Promise<CupSideAwardsRead> {
  try {
    const { data, error } = await supabase
      .from('tournament_side_awards')
      .select(CUP_SIDE_AWARD_SELECT)
      .eq('tournament_id', tournamentId)
      .in('kind', ['ctp', 'ld', 'gir'])
      .returns<CupSideAwardRow[]>();
    if (error) return { ok: false, error };
    return { ok: true, awards: toCupSideAwards(data ?? []) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * #2283: what the render wave has to read for the side contests on this hole.
 *
 *  - A derived game (`source_game_id`) has no contests (`contestsForHole`).
 *  - Without a cup, the game's own slots say whether this hole is a contest hole
 *    before anything is read: no slot here, no reads at all, so a normal round
 *    costs no extra query. Only closest to pin and longest drive exist there.
 *  - In a cup, the awards decide the hole, and they are read in the same wave as
 *    the claims instead of ahead of them. A hole that turns out not to be a
 *    contest hole discards the claims: two cheap reads on a primary-key prefix
 *    against a waterfall on every hole page of a cup match.
 *  - Claims are read only for someone who may report (`canReport`): RLS shows a
 *    withdrawn player nothing, and an empty answer would read as «ingen har meldt inn».
 */
export function planSideContestReads(
  game: Pick<
    GameForHole,
    | 'side_ld_count'
    | 'side_ctp_count'
    | 'side_ld_holes'
    | 'side_ctp_holes'
    | 'source_game_id'
    | 'tournament_id'
  >,
  holeNumber: number,
  canReport: boolean,
): { awards: boolean; claims: HoleClaimsNeed | null } {
  if (game.source_game_id != null) return { awards: false, claims: null };
  const inCup = game.tournament_id != null;
  if (!inCup && contestsForHole(sideHolesConfigFor(game), null, holeNumber).length === 0) {
    return { awards: false, claims: null };
  }
  // GIR exists only in a cup (0237): the game's own side tournament has no such category.
  return { awards: inCup, claims: canReport ? { side: true, gir: inCup } : null };
}

export async function fetchHolePageData(args: {
  supabase: ServerClient;
  gameId: string;
  holeNumber: number;
  userId: string;
  game: GameForHole;
  me: PlayerForHole;
  playerIds: string[];
  myTeamScoreOwnerId: string | null;
  /**
   * #2067: withdrawn teammates who may still hold holes entered before their
   * account was deleted — `formerTeamRowOwnerIds` of my team.
   */
  myFormerTeamRowOwnerIds: string[];
  /**
   * #2067: the same for every team in the flight. They are out of `playerIds`
   * (the flight drops withdrawn players), but the current hole's card has to
   * read their rows too; page.tsx folds them onto each team's owner.
   */
  flightFormerRowOwnerIds: string[];
  siblingMatch: SegmentSibling | null;
  modes: HoleFetchModes;
  /**
   * #2283: an active round, and I am an active player with a claim flight
   * (`sideClaimFlightKey`). Decides whether the hole's claims are read.
   */
  canReportSideClaims: boolean;
}) {
  const {
    supabase,
    gameId,
    holeNumber,
    userId,
    game,
    me,
    playerIds,
    myTeamScoreOwnerId,
    myFormerTeamRowOwnerIds,
    flightFormerRowOwnerIds,
    siblingMatch,
    modes,
    canReportSideClaims,
  } = args;
  const { isWolf, isSkins, isBBB, isPatsome } = modes;
  const sideReads = planSideContestReads(game, holeNumber, canReportSideClaims);

  // Round 2 — ONE Promise.all wave with everything the page needs up front:
  // course name, hole row, flight scores, the user's completed holes, plus the
  // mode-gated extras below. Every element is independent of the others:
  //   courseName needs game.course_id (resolved from the cached read above)
  //   hole       needs game.course_id (same)
  //   scores     needs playerIds (also resolved above)
  //   scoreCount needs only id + userId, available from the start
  //
  // supabase-klienten er allerede opprettet for profil-gaten i page.tsx.
  const [
    courseNameRes,
    holeRes,
    scoresRes,
    myScoredHolesRes,
    wolfChoicesData,
    wolfAllScoresRes,
    wolfAllHolesRes,
    skinsAllScoresRes,
    skinsAllHolesRes,
    bbbHolesData,
    patsomeTeeStarterRes,
    greenPinsRes,
    siblingTeamRes,
    cupAwardsRes,
    holeClaimsRes,
    parHolesRes,
  ] = await Promise.all([
      game.course_id
        ? supabase.from('courses').select('name').eq('id', game.course_id).maybeSingle<{ name: string }>()
        : { data: null as { name: string } | null },
      supabase
        .from('course_holes')
        .select(COURSE_HOLES_SELECT)
        .eq('course_id', game.course_id)
        .eq('hole_number', holeNumber)
        .maybeSingle<HoleRow>(),
      supabase
        .from('scores')
        .select('user_id, strokes, putts, client_updated_at, updated_at')
        .eq('game_id', gameId)
        .eq('hole_number', holeNumber)
        .in('user_id', [...new Set([...playerIds, ...flightFormerRowOwnerIds])])
        .returns<ScoreRow[]>(),
      // #1352: radene, ikke bare antallet — hull-stripa trenger å vite HVILKE
      // hull som har score for å skille et hoppet-over hull fra et tastet.
      // Maks 36 rader, samme filtre og RLS-vei som count-en den erstattet
      // (samme mønster som PrimaryCta.tsx).
      // #1577: i lag-kollapsede modus ligger radene på kapteinen, så vi henter
      // begge id-enes rader og siler per hull under — kapteinens rad teller kun
      // på hull der modusen faktisk kollapser (patsome sin 4BBB-halvdel ikke).
      supabase
        .from('scores')
        .select('hole_number, user_id')
        .eq('game_id', gameId)
        .in(
          'user_id',
          scoreOwnerUserIds(
            game.game_mode,
            userId,
            myTeamScoreOwnerId,
            myFormerTeamRowOwnerIds,
          ),
        )
        .not('strokes', 'is', null)
        .returns<{ hole_number: number; user_id: string }[]>(),
      isWolf ? getWolfChoices(gameId) : Promise.resolve([]),
      isWolf
        ? selectAllRowsResult(
            (from, to) =>
              supabase
                .from('scores')
                .select(SCORES_SELECT)
                .eq('game_id', gameId)
                .order('id')
                .range(from, to)
                .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>(),
            'holePageData wolf scores',
          )
        : Promise.resolve({ data: null, error: null }),
      isWolf
        ? supabase
            .from('course_holes')
            .select(COURSE_HOLES_SELECT)
            .eq('course_id', game.course_id)
            .returns<HoleRow[]>()
        : Promise.resolve({ data: null, error: null }),
      // Skins: alle scores for hele spillet + alle hull-definisjonar for å
      // bygge full ScoringContext og finne riktig atStake for gjeldende hull.
      isSkins
        ? selectAllRowsResult(
            (from, to) =>
              supabase
                .from('scores')
                .select(SCORES_SELECT)
                .eq('game_id', gameId)
                .order('id')
                .range(from, to)
                .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>(),
            'holePageData skins scores',
          )
        : Promise.resolve({ data: null, error: null }),
      isSkins
        ? supabase
            .from('course_holes')
            .select(COURSE_HOLES_SELECT)
            .eq('course_id', game.course_id)
            .returns<HoleRow[]>()
        : Promise.resolve({ data: null, error: null }),
      // Bingo Bango Bongo: henter alle hull-rader for spillet (tag-cachet).
      // Speiler getWolfChoices-mønstret — returnerer tom array for andre modi.
      isBBB ? getBingoBangoBongoHoles(gameId) : Promise.resolve([]),
      // Patsome: henter lagets tee-starter-valg for foursomes-segmentet (13–18).
      // Kun relevant for patsome-modus; andre modi returnerer null-shell.
      isPatsome && me.team_number != null
        ? supabase
            .from('patsome_tee_starters')
            .select('tee_starter_user_id')
            .eq('game_id', gameId)
            .eq('team_number', me.team_number)
            .maybeSingle<{ tee_starter_user_id: string }>()
        : Promise.resolve({ data: null, error: null }),
      // #1210: hullets green-pins. Course-data, holdt UTENFOR game-${id}-
      // cachen (samme begrunnelse som courses/tee_boxes-joinen). Eksplisitt
      // kolonneliste — user_id er ikke klient-lesbar (kolonne-privilegium,
      // 0142), så en select * ville feilet.
      game.course_id
        ? supabase
            .from('green_pins')
            .select('lat, lng, created_at')
            .eq('course_id', game.course_id)
            .eq('hole_number', holeNumber)
            .returns<{ lat: number; lng: number; created_at: string }[]>()
        : Promise.resolve({ data: null, error: null }),
      // #1578: who holds the shared scores rows on the SIBLING half, so the
      // strip can mark that half's holes ført/mangler instead of guessing from
      // position. Admin client on purpose (same as findSegmentSibling): in a
      // team-collapsed sibling mode a non-captain reads 0 captain rows through
      // RLS, and 0 rows comes back as `error == null` — the strip would silently
      // claim the whole half was skipped. Membership on the sibling is already
      // proven: findSegmentSibling only ever returns a half where I have an
      // active game_players row. Rides along in round 2 (only the scores read
      // below has to wait for the answer).
      siblingMatch && siblingMatch.myTeamNumber != null
        ? getAdminClient()
            .from('game_players')
            .select('user_id, withdrawn_at')
            .eq('game_id', siblingMatch.gameId)
            .eq('team_number', siblingMatch.myTeamNumber)
            .returns<{ user_id: string; withdrawn_at: string | null }[]>()
        : Promise.resolve({ data: null, error: null }),
      // #2283: the cup's side holes and this hole's claims (own flight under
      // RLS). Neither can fell the page: a failed read is a value
      // (`ok: false`), and the card says «Fikk ikke hentet».
      sideReads.awards && game.tournament_id
        ? readCupSideAwards(supabase, game.tournament_id)
        : Promise.resolve(null),
      sideReads.claims
        ? readHoleClaims(supabase, { gameId, holeNumber, need: sideReads.claims })
        : Promise.resolve(null),
      // #2941: a new match with the par rule sums every hole's par per tee
      // for the extra strokes, as the engine does; this hole alone is not
      // enough. Any other game skips the read.
      usesParDifference(game.mode_config)
        ? supabase
            .from('course_holes')
            .select(COURSE_HOLES_SELECT)
            .eq('course_id', game.course_id)
            .returns<HoleRow[]>()
        : Promise.resolve({ data: [] as HoleRow[], error: null }),
    ]);
  const courseName = courseNameRes.data?.name ?? null;

  // Error ≠ absence (#1441): throw on query failure (error boundary), 404
  // only when the hole row is genuinely missing — the caller does that.
  if (holeRes.error) throw holeRes.error;
  // #2941: without every hole the cards would give a new mixed match no par
  // strokes while the board gives them — fail like the hole row.
  if (parHolesRes.error) throw parHolesRes.error;

  return {
    courseName,
    hole: holeRes.data,
    scoresRes,
    myScoredHolesRes,
    wolfChoicesData,
    wolfAllScoresRes,
    wolfAllHolesRes,
    skinsAllScoresRes,
    skinsAllHolesRes,
    bbbHolesData,
    patsomeTeeStarterRes,
    greenPinsRes,
    siblingTeamRes,
    cupAwardsRes,
    holeClaimsRes,
    /** #2941: every hole of the course for a match with the par rule, else `[]`. */
    parHoles: parHolesRes.data ?? [],
  };
}

export type HolePageData = Awaited<ReturnType<typeof fetchHolePageData>>;

/** Slår opp gjeldende hulls score per spiller. */
export function indexScoresByUser(
  rows: ScoreRow[] | null,
): Record<string, ScoreRow> {
  const scoresByUser: Record<string, ScoreRow> = {};
  for (const s of rows ?? []) scoresByUser[s.user_id] = s;
  return scoresByUser;
}

/**
 * `?? []` degraderer på samme måte som dagens `?? 0` gjorde: en feilet
 * lesing gir tom liste, og Dexie-settet på klienten dekker uansett alt som
 * er tastet på enheten.
 * #1577: per-hull-eier siler bort raden som ikke gjelder — er jeg kaptein
 * (eller er modusen ikke kollapset) er dette nøyaktig dagens `user_id`-filter.
 */
export function resolveMyScoredHoles(args: {
  rows: { hole_number: number; user_id: string }[] | null;
  gameMode: GameMode;
  userId: string;
  myTeamScoreOwnerId: string | null;
  /** #2067: folded onto the owner — a withdrawn captain's entered holes count. */
  myFormerTeamRowOwnerIds: readonly string[];
}): number[] {
  return scoredHoleNumbers(
    (args.rows ?? []).map((r) => ({
      holeNumber: r.hole_number,
      userId: r.user_id,
    })),
    args.gameMode,
    args.userId,
    args.myTeamScoreOwnerId,
    args.myFormerTeamRowOwnerIds,
  );
}

/**
 * #1210: green-senter (per-akse-median) + fresh pin-count for chip-gaten.
 * Fail-soft: en feil her (f.eks. miljø der 0142 ikke er påført ennå) skjuler
 * featuren i stedet for å felle hull-siden — senter null (ingen linje) og
 * gate stengt (ingen chip).
 */
export function resolveGreenPinState(args: {
  greenPinsRes: HolePageData['greenPinsRes'];
  gameId: string;
  holeNumber: number;
}): { greenCenter: LatLng | null; freshPinCount: number } {
  const { greenPinsRes, gameId, holeNumber } = args;
  if (greenPinsRes.error) {
    console.error('[holes] green_pins fetch failed — distance feature hidden', {
      gameId,
      holeNumber,
      error: greenPinsRes.error,
    });
    return { greenCenter: null, freshPinCount: PIN_GATE_MAX_PINS };
  }
  if (!greenPinsRes.data) {
    return { greenCenter: null, freshPinCount: PIN_GATE_MAX_PINS };
  }
  // Snapshot "now" once per request — this runs server-side, so the snapshot
  // is a server-side now(). (The `react-hooks/purity` carve-out the inlined
  // version needed is gone with the move: the rule only fires inside a
  // component, and this is a plain module function.)
  const windowCutoffMs = Date.now() - PIN_GATE_WINDOW_DAYS * 86_400_000;
  return {
    greenCenter: computeGreenCenter(
      greenPinsRes.data.map((p) => ({ lat: p.lat, lng: p.lng })),
    ),
    freshPinCount: greenPinsRes.data.filter(
      (p) => new Date(p.created_at).getTime() > windowCutoffMs,
    ).length,
  };
}

/**
 * #1578: «hvilke hull er ført på den ANDRE halvdelen av en splittet cup-dag?»
 * Begge lesingene er fail-soft med vilje — stripa er sekundær UI, og en
 * halvdel vi ikke fikk lest må falle tilbake til den posisjonelle
 * utledningen i stedet for å felle hull-siden (eller, verre, beskylde
 * spilleren for å ha hoppet over hull hen faktisk har ført). `null` hele
 * veien gjennom betyr «ingen data».
 */
export async function resolveSiblingScoreData(args: {
  siblingMatch: SegmentSibling | null;
  siblingTeamRes: HolePageData['siblingTeamRes'];
  userId: string;
}): Promise<{
  teamOwnerId: string | null;
  formerTeamRowOwnerIds: string[];
  scoredHoles: number[] | null;
}> {
  const { siblingMatch, siblingTeamRes, userId } = args;
  if (!siblingMatch) {
    return { teamOwnerId: null, formerTeamRowOwnerIds: [], scoredHoles: null };
  }
  if (siblingTeamRes.error) {
    console.error('[holes] sibling team fetch failed — strip stays positional', {
      gameId: siblingMatch.gameId,
      error: siblingTeamRes.error,
    });
    return { teamOwnerId: null, formerTeamRowOwnerIds: [], scoredHoles: null };
  }
  const teamOwnerId = siblingTeamRes.data
    ? teamScoreOwnerId(siblingTeamRes.data)
    : null;
  // #2067: a captain who deleted their account holds the holes entered before.
  const formerOwnerIds = siblingTeamRes.data
    ? formerTeamRowOwnerIds(siblingTeamRes.data)
    : [];
  // Admin client for the same reason as the roster read above: the shared
  // row lives under the captain's id, which RLS does not hand a non-captain
  // on the other host.
  const siblingScoresRes = await getAdminClient()
    .from('scores')
    .select('hole_number, user_id')
    .eq('game_id', siblingMatch.gameId)
    .in(
      'user_id',
      scoreOwnerUserIds(siblingMatch.gameMode, userId, teamOwnerId, formerOwnerIds),
    )
    .not('strokes', 'is', null)
    .returns<{ hole_number: number; user_id: string }[]>();
  if (siblingScoresRes.error) {
    console.error('[holes] sibling scores fetch failed — strip stays positional', {
      gameId: siblingMatch.gameId,
      error: siblingScoresRes.error,
    });
    return { teamOwnerId, formerTeamRowOwnerIds: formerOwnerIds, scoredHoles: null };
  }
  return {
    teamOwnerId,
    formerTeamRowOwnerIds: formerOwnerIds,
    scoredHoles: resolveMyScoredHoles({
      rows: siblingScoresRes.data,
      gameMode: siblingMatch.gameMode,
      userId,
      myTeamScoreOwnerId: teamOwnerId,
      myFormerTeamRowOwnerIds: formerOwnerIds,
    }),
  };
}
