import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import { isStablefordFamily } from '@/lib/scoring/modes/types';
import { parFor } from '@/lib/scoring/modes/parResolver';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { nameInitials } from '@/lib/names/initials';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { getBingoBangoBongoHoles } from '@/lib/bbb/getBingoBangoBongoHoles';
import { computeLeaderboard } from '@/lib/scoring';
import * as skins from '@/lib/scoring/modes/skins';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';
import { isSingleFlightGame } from '@/lib/games/flightScope';
import { HoleClient, type ClientPlayer } from './HoleClient';
import {
  FoursomesTeeStarterBanner,
  FoursomesTeeHint,
} from './FoursomesTeeStarterBanner';
import { PatsomeSegmentBanner } from './PatsomeSegmentBanner';
import {
  PatsomeTeeStarterBanner,
  PatsomeTeeHint,
} from './PatsomeTeeStarterBanner';
import { ChapmanPhaseReminder } from './ChapmanPhaseReminder';

type Params = Promise<{ id: string; holeNumber: string }>;

type HoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  strokes: number | null;
  client_updated_at: string | null;
  updated_at: string | null;
};

export default async function HolePage({ params }: { params: Params }) {
  const { id, holeNumber: holeStr } = await params;

  const holeNumber = Number(holeStr);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    notFound();
  }

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');

  // games + game_players come from the tag-cached helper (see
  // lib/games/getGameWithPlayers.ts). These rows don't change during a
  // hull-bytte, so reading them from the cache saves a Supabase round-trip
  // per hole-navigation. Authorization stays here at the call-site:
  // `me = allPlayers.find(...)` notFound() below covers the auth check that
  // RLS used to provide for the per-request server client.
  const result = await getGameWithPlayers(id);
  if (!result) notFound();
  const { game, players: allPlayers } = result;

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

  const me = allPlayers.find((p) => p.user_id === userId);
  if (!me) notFound();

  // Once the player has submitted their scorecard, the hole pages are
  // read-only and confusing to land on. Bounce them home.
  if (me.submitted_at) {
    redirect(`/games/${id}`);
  }

  // #543: én-flight-regelen — alle aktive spillere er i samme gruppe når
  // spillet har ≤4 aktive spillere ELLER formatet er wolf.
  //
  // Når singleFlight er true vises ALLE aktive spillere uavhengig av
  // flight_number. Dette fikser bl.a. matchplay-motstanderens scorer
  // (side 1 vs side 2) og foursomes/texas (lag 1 vs lag 2) for 4-spiller-spill.
  //
  // Når singleFlight er false brukes eksisterende logikk:
  //   • flight_number == null → alle spillere (legacy ≤4 flightless)
  //   • flight_number != null → kun samme flight
  //
  // Trukkede spillere filtreres ut av roster slik at de ikke vises som
  // aktive kort på hull-siden (#386/#387-presedensen).
  const singleFlight = isSingleFlightGame(game.game_mode, allPlayers);
  const roster: typeof allPlayers = singleFlight
    ? allPlayers.filter((p) => p.withdrawn_at == null)
    : me.flight_number == null
      ? allPlayers.filter((p) => p.withdrawn_at == null)
      : allPlayers.filter(
          (p) => p.flight_number === me.flight_number && p.withdrawn_at == null,
        );

  // «flight» er nå et alias for roster (backward compat for resten av siden
  // som bruker «flight» for å referere til den aktive gruppen).
  const flight = roster;
  const playerIds = flight.map((p) => p.user_id);

  const isStableford = isStablefordFamily(game.game_mode);
  const isTexas = game.game_mode === 'texas_scramble' || game.game_mode === 'ambrose' || game.game_mode === 'florida_scramble';
  const isFoursomes = game.game_mode === 'foursomes_matchplay';
  const isGreensome = game.game_mode === 'greensome_matchplay';
  const isChapman = game.game_mode === 'chapman_matchplay';
  const isGruesome = game.game_mode === 'gruesome_matchplay';
  const isPatsome = game.game_mode === 'patsome';
  const isWolf = game.game_mode === 'wolf';
  const isSkins = game.game_mode === 'skins';
  const isBBB = game.game_mode === 'bingo_bango_bongo';
  const isRoundRobin = game.game_mode === 'round_robin';

  // Round 2 — hole row, flight scores and the user's completed-hole count.
  // All three are independent and can run in parallel:
  //   hole       needs game.course_id (resolved from the cached read above)
  //   scores     needs playerIds (also resolved above)
  //   scoreCount needs only id + userId, available from the start
  //
  // For stableford-modus henter vi i tillegg ALLE hull-pars/SI + ALLE av
  // brukerens scorer slik at server-en kan summere stableford-poeng for
  // «Dine poeng»-headeren og per-hull-poeng-chip-en. Best-ball-modus dropper
  // disse to ekstra queryene (de er null) for å holde latency lik dagens.
  const supabase = await getServerClient();
  const [
    holeRes,
    scoresRes,
    scoreCountRes,
    allHolesRes,
    myAllScoresRes,
    wolfChoicesData,
    wolfAllScoresRes,
    wolfAllHolesRes,
    skinsAllScoresRes,
    skinsAllHolesRes,
    bbbHolesData,
    patsomeTeeStarterRes,
  ] = await Promise.all([
      supabase
        .from('course_holes')
        .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
        .eq('course_id', game.course_id)
        .eq('hole_number', holeNumber)
        .single<HoleRow>(),
      supabase
        .from('scores')
        .select('user_id, strokes, client_updated_at, updated_at')
        .eq('game_id', id)
        .eq('hole_number', holeNumber)
        .in('user_id', playerIds)
        .returns<ScoreRow[]>(),
      supabase
        .from('scores')
        .select('hole_number', { count: 'exact', head: true })
        .eq('game_id', id)
        .eq('user_id', userId)
        .not('strokes', 'is', null),
      isStableford
        ? supabase
            .from('course_holes')
            .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
            .eq('course_id', game.course_id)
            .returns<HoleRow[]>()
        : Promise.resolve({ data: null, error: null }),
      isStableford
        ? supabase
            .from('scores')
            .select('hole_number, strokes')
            .eq('game_id', id)
            .eq('user_id', userId)
            .returns<{ hole_number: number; strokes: number | null }[]>()
        : Promise.resolve({ data: null, error: null }),
      isWolf ? getWolfChoices(id) : Promise.resolve([]),
      isWolf
        ? supabase
            .from('scores')
            .select('user_id, hole_number, strokes')
            .eq('game_id', id)
            .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>()
        : Promise.resolve({ data: null, error: null }),
      isWolf
        ? supabase
            .from('course_holes')
            .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
            .eq('course_id', game.course_id)
            .returns<HoleRow[]>()
        : Promise.resolve({ data: null, error: null }),
      // Skins: alle scores for hele spillet + alle hull-definisjonar for å
      // bygge full ScoringContext og finne riktig atStake for gjeldende hull.
      isSkins
        ? supabase
            .from('scores')
            .select('user_id, hole_number, strokes')
            .eq('game_id', id)
            .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>()
        : Promise.resolve({ data: null, error: null }),
      isSkins
        ? supabase
            .from('course_holes')
            .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
            .eq('course_id', game.course_id)
            .returns<HoleRow[]>()
        : Promise.resolve({ data: null, error: null }),
      // Bingo Bango Bongo: henter alle hull-rader for spillet (tag-cachet).
      // Speiler getWolfChoices-mønstret — returnerer tom array for andre modi.
      isBBB ? getBingoBangoBongoHoles(id) : Promise.resolve([]),
      // Patsome: henter lagets tee-starter-valg for foursomes-segmentet (13–18).
      // Kun relevant for patsome-modus; andre modi returnerer null-shell.
      isPatsome && me.team_number != null
        ? supabase
            .from('patsome_tee_starters')
            .select('tee_starter_user_id')
            .eq('game_id', id)
            .eq('team_number', me.team_number)
            .maybeSingle<{ tee_starter_user_id: string }>()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const { data: hole, error: holeError } = holeRes;
  if (holeError || !hole) notFound();
  if (scoresRes.error) throw scoresRes.error;

  const scoresByUser: Record<string, ScoreRow> = {};
  for (const s of scoresRes.data ?? []) scoresByUser[s.user_id] = s;

  const myCompletedHoles = scoreCountRes.count ?? 0;

  // Stableford totals — komputeres server-side når modus krever det.
  // myStablefordTotal: summen over alle ferdig-tastede hull (brukerens egen
  // course-handicap brukes til stroke-fordeling). myStablefordForCurrent:
  // poeng for current hull spesifikt, brukes til «N poeng»-chip-en.
  let myStablefordTotal: number | null = null;
  let myStablefordForCurrent: number | null = null;
  if (isStableford) {
    if (allHolesRes.error) throw allHolesRes.error;
    if (myAllScoresRes.error) throw myAllScoresRes.error;
    const myCh = me.course_handicap ?? 0;
    const holesByNum = new Map<number, HoleRow>();
    for (const h of allHolesRes.data ?? []) holesByNum.set(h.hole_number, h);
    const stablefordPointsFn = game.game_mode === 'modified_stableford'
      ? computeModifiedStablefordPoints
      : computeStablefordPoints;
    let total = 0;
    for (const s of myAllScoresRes.data ?? []) {
      if (s.strokes == null) continue;
      const h = holesByNum.get(s.hole_number);
      if (!h) continue;
      const extra = strokesForHole(myCh, h.stroke_index);
      const net = s.strokes - extra;
      // #240 — meg's stableford-poeng skal bruke meg's tee_gender-par.
      // parFor() leser av per-kjønn-tabellen og faller tilbake til mens
      // når kolonnene er like (vanlig tilfelle).
      const myPar = parFor(
        {
          number: h.hole_number,
          par: h.par_mens,
          parByGender: {
            mens: h.par_mens,
            ladies: h.par_ladies,
            juniors: h.par_juniors,
          },
          strokeIndex: h.stroke_index,
        },
        me.tee_gender,
      );
      const pts = stablefordPointsFn({ par: myPar, netStrokes: net });
      total += pts;
      if (s.hole_number === holeNumber) {
        myStablefordForCurrent = pts;
      }
    }
    myStablefordTotal = total;
  }

  // Reveal-modus: under an active reveal-game, hide the per-card +N SLAG
  // badge so handicap-slag count stays secret. shouldHideNetto returns true
  // only for the 'reveal-active' state — live games and finished reveal games
  // render the badge normally.
  const hideNetto = shouldHideNetto(
    revealState(game.score_visibility, game.status),
  );

  // Wolf-mode-spesifikt: regn ut pointsByUser server-side via scoring-modulen.
  // Klient-laget bruker dette til trailing-wolf-regelen (hull 17-18). Vi
  // kjører `computeLeaderboard()` med full ScoringContext slik at vi får
  // konsistent answer med leaderboard-rendringen. wolfPlayers er server-
  // valgt subset av game_players med team_number 1-4 og navn.
  let wolfChoicesForClient: import(
    '@/lib/scoring/modes/types'
  ).WolfHoleChoice[] = [];
  let wolfPointsByUser: Record<string, number> | undefined;
  let wolfPlayersForClient:
    | Array<{ userId: string; teamNumber: number; name: string }>
    | undefined;

  if (isWolf) {
    wolfChoicesForClient = wolfChoicesData as import(
      '@/lib/scoring/modes/types'
    ).WolfHoleChoice[];

    // n spillere (3-5, #465) med team_number 1..n — validatoren sikrer riktig
    // antall + sammenhengende slots.
    wolfPlayersForClient = allPlayers
      .filter((p) => p.team_number != null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number as number,
        name: p.users?.nickname?.trim() || p.users?.name || '(ukjent spiller)',
      }));

    // Bygg ScoringContext for compute(). Vi trenger course-holes for SI/par
    // og scores for alle spillere over hele runden.
    if (
      !wolfAllHolesRes.error &&
      !wolfAllScoresRes.error &&
      game.mode_config.kind === 'wolf'
    ) {
      const holesForCtx: ScoringHole[] = (wolfAllHolesRes.data ?? []).map(
        (h) => ({
          number: h.hole_number,
          par: h.par_mens,
          parByGender: {
            mens: h.par_mens,
            ladies: h.par_ladies,
            juniors: h.par_juniors,
          },
          strokeIndex: h.stroke_index,
        }),
      );
      const playersForCtx: ScoringPlayer[] = allPlayers.map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number,
        flightNumber: p.flight_number,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender ?? 'mens',
      }));
      const scoresForCtx: ScoringHoleScore[] = (wolfAllScoresRes.data ?? []).map(
        (s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          gross: s.strokes,
        }),
      );
      const ctx: ScoringContext = {
        game: {
          id: id,
          game_mode: 'wolf',
          mode_config: game.mode_config,
        },
        players: playersForCtx,
        holes: holesForCtx,
        scores: scoresForCtx,
        wolfChoices: wolfChoicesForClient,
      };
      const result = computeLeaderboard(ctx);
      if (result.kind === 'wolf') {
        const map: Record<string, number> = {};
        for (const p of result.players) {
          map[p.userId] = p.totalPoints;
        }
        wolfPointsByUser = map;
      }
    }
  }

  // Skins-modus: beregn atStake for gjeldende hull via compute() over alle
  // scorer. Sendes til HoleClient som informasjons-banner. Speiler Wolf-mønstret.
  let skinsAtStake: number | undefined;
  let skinsCarriedIn: number | undefined;

  if (
    isSkins &&
    !skinsAllHolesRes.error &&
    !skinsAllScoresRes.error &&
    game.mode_config.kind === 'skins'
  ) {
    const holesForCtx: ScoringHole[] = (skinsAllHolesRes.data ?? []).map(
      (h) => ({
        number: h.hole_number,
        par: h.par_mens,
        parByGender: {
          mens: h.par_mens,
          ladies: h.par_ladies,
          juniors: h.par_juniors,
        },
        strokeIndex: h.stroke_index,
      }),
    );
    const playersForCtx: ScoringPlayer[] = allPlayers.map((p) => ({
      userId: p.user_id,
      teamNumber: p.team_number,
      flightNumber: p.flight_number,
      courseHandicap: p.course_handicap ?? 0,
      teeGender: p.tee_gender ?? 'mens',
    }));
    const scoresForCtx: ScoringHoleScore[] = (skinsAllScoresRes.data ?? []).map(
      (s) => ({
        userId: s.user_id,
        holeNumber: s.hole_number,
        gross: s.strokes,
      }),
    );
    const skinsCtx: ScoringContext = {
      game: {
        id: id,
        game_mode: 'skins',
        mode_config: game.mode_config,
      },
      players: playersForCtx,
      holes: holesForCtx,
      scores: scoresForCtx,
    };
    const skinsResult = skins.compute(skinsCtx);
    const row = skinsResult.holes.find((r) => r.holeNumber === holeNumber);
    if (row) {
      skinsAtStake = row.atStake;
      skinsCarriedIn = row.carriedIn;
    }
  }

  // For Texas scramble collapses vi lag-medlemmer til ett kort per lag.
  // Lag-kapteinen (lex-min userId) eier scores-radene; alle medlemmer kan
  // taste, alle tap skriver til kapteinens userId. Kortets `name` viser
  // «Lag N · Navn1, Navn2» og `initial`-avataren viser lag-nummeret slik at
  // det visuelt skiller seg fra per-spiller-kort i andre moduser.
  //
  // #543: når singleFlight er true og rosteret spenner over flere lag (f.eks.
  // foursomes med 4 spillere totalt), bygger vi ETT kort PER LAG slik at alle
  // kan taste på begge kortene. Handicap-formlene er identiske med eksisterende
  // logikk: begge lags tall produserer det den andre siden ser i dag.
  //
  // Lag-handicap beregnes etter NGF-konvensjon:
  //   teamHCP = round(combinedCourseHandicap × team_handicap_pct / 100)
  // og fordeles per hull via vanlig SI-allokering (strokesForHole).
  let playersForClient: ClientPlayer[];

  if (
    isTexas ||
    isFoursomes ||
    isGreensome ||
    isChapman ||
    isGruesome ||
    (isPatsome && holeNumber >= 7)
  ) {
    // Grupper roster på team_number. Vanligvis ett lag (når flight-filteret kun
    // returnerer mitt lag), men ved singleFlight får vi alle lag.
    const teamNumbers = [
      ...new Set(
        flight
          .map((p) => p.team_number)
          .filter((t): t is number => t != null),
      ),
    ].sort((a, b) => a - b);

    // WHS-diff-formel (foursomes/greensome/chapman/gruesome) beregnes globalt
    // mot motstander-sidens combined CH. Vi trenger alle aktive lag-spillere
    // for begge sider — bruk allPlayers (ikke flight) for å få motstander-tallene.
    const isSixtyForty = isGreensome || isChapman;
    const isDiffFormat = isFoursomes || isGreensome || isChapman || isGruesome;

    function sideHandicap(players: typeof flight): number {
      if (isSixtyForty) {
        const chs = players.map((p) => p.course_handicap ?? 0);
        if (chs.length === 0) return 0;
        return Math.round(0.6 * Math.min(...chs) + 0.4 * Math.max(...chs));
      }
      return players.reduce((sum, p) => sum + (p.course_handicap ?? 0), 0);
    }

    function teamHandicapFor(teamNum: number): number {
      const teamPlayers = flight.filter((p) => p.team_number === teamNum);
      const combinedCH = teamPlayers.reduce(
        (sum, p) => sum + (p.course_handicap ?? 0),
        0,
      );
      if (isDiffFormat) {
        // Alle aktive lag-spillere — bruk allPlayers for diff-beregning.
        const oppPlayers = allPlayers.filter(
          (p) =>
            p.team_number !== teamNum &&
            p.team_number !== null &&
            p.withdrawn_at == null,
        );
        const thisSideCH = isSixtyForty ? sideHandicap(teamPlayers) : combinedCH;
        const oppCH = sideHandicap(oppPlayers);
        const allowancePct =
          game.mode_config.kind === 'foursomes_matchplay'
            ? game.mode_config.allowance_pct
            : game.mode_config.kind === 'greensome_matchplay'
              ? game.mode_config.allowance_pct
              : game.mode_config.kind === 'chapman_matchplay'
                ? game.mode_config.allowance_pct
                : game.mode_config.kind === 'gruesome_matchplay'
                  ? game.mode_config.allowance_pct
                  : 50;
        const diff = Math.abs(thisSideCH - oppCH);
        const highSideExtra = Math.round((diff * allowancePct) / 100);
        return thisSideCH > oppCH ? highSideExtra : 0;
      } else if (isPatsome) {
        const patsomeScoring =
          game.mode_config.kind === 'patsome'
            ? game.mode_config.patsome_scoring
            : 'net';
        if (patsomeScoring === 'gross') return 0;
        if (holeNumber <= 12) {
          const chs = teamPlayers.map((p) => p.course_handicap ?? 0);
          if (chs.length === 0) return 0;
          return Math.round(0.6 * Math.min(...chs) + 0.4 * Math.max(...chs));
        }
        return Math.round(0.5 * combinedCH);
      } else {
        // Texas/ambrose/florida
        const handicapPct =
          game.mode_config.kind === 'texas_scramble' ||
          game.mode_config.kind === 'ambrose' ||
          game.mode_config.kind === 'florida_scramble'
            ? game.mode_config.team_handicap_pct
            : 0;
        return Math.round((combinedCH * handicapPct) / 100);
      }
    }

    playersForClient = teamNumbers.map((teamNum) => {
      const teamPlayers = flight.filter((p) => p.team_number === teamNum);
      const captain = teamPlayers.reduce(
        (min, p) => (p.user_id < min.user_id ? p : min),
        teamPlayers[0],
      );
      const teamHCP = teamHandicapFor(teamNum);
      const captainScoreRow = scoresByUser[captain.user_id];
      const memberNames = teamPlayers
        .map((p) => p.users?.name ?? '')
        .map((n) => n.split(/\s+/)[0])
        .filter((n) => n.length > 0)
        .join(', ');
      const anyTeamMemberSubmitted = teamPlayers.some(
        (p) => p.submitted_at != null,
      );
      return {
        userId: captain.user_id,
        name: `Lag ${teamNum} · ${memberNames}`,
        nickname: null,
        initial: String(teamNum),
        extraStrokes: strokesForHole(teamHCP, hole.stroke_index),
        initialStrokes: captainScoreRow?.strokes ?? null,
        initialClientUpdatedAt: captainScoreRow?.client_updated_at ?? null,
        initialServerUpdatedAt: captainScoreRow?.updated_at ?? null,
        submitted: anyTeamMemberSubmitted,
      };
    });
  } else {
    // Patsome hull 1–6: 4BBB — begge taster sin egen ball.
    // I brutto-modus har ingen spillere ekstra slag.
    const patsomeScoringForPerPlayer =
      isPatsome && game.mode_config.kind === 'patsome'
        ? game.mode_config.patsome_scoring
        : 'net';
    playersForClient = flight.map((p) => {
      const name = p.users?.name ?? '(ukjent spiller)';
      const rawNickname = p.users?.nickname ?? null;
      const nickname =
        rawNickname && rawNickname.trim().length > 0 ? rawNickname : null;
      const ch =
        isPatsome && patsomeScoringForPerPlayer === 'gross'
          ? 0
          : (p.course_handicap ?? 0);
      const scoreRow = scoresByUser[p.user_id];
      return {
        userId: p.user_id,
        name,
        nickname,
        initial: nameInitials(name),
        extraStrokes: strokesForHole(ch, hole.stroke_index),
        initialStrokes: scoreRow?.strokes ?? null,
        initialClientUpdatedAt: scoreRow?.client_updated_at ?? null,
        initialServerUpdatedAt: scoreRow?.updated_at ?? null,
        submitted: p.submitted_at != null,
      };
    });
  }

  // Round Robin: bygg spillerliste med teamNumber + visningsnavn for badge.
  // Speiler wolfPlayersForClient-mønstret — samme datakilde (allPlayers),
  // ingen ekstra fetch nødvendig.
  const roundRobinPlayersForClient = isRoundRobin
    ? allPlayers
        .filter((p) => p.team_number != null)
        .map((p) => ({
          userId: p.user_id,
          teamNumber: p.team_number as number,
          name: p.users?.nickname?.trim() || p.users?.name || '(ukjent spiller)',
        }))
    : undefined;

  // Foursomes (#218): tee-starter-banner på hull 1 hvis ikke valgt; hint per
  // hull etter at valget er gjort. Begrenset til foursomes-modus + me's side.
  let foursomesTeeSlot: ReactNode = null;
  if (isFoursomes && me.team_number != null) {
    const sideNumber = me.team_number as 1 | 2;
    const teeStarterCol =
      sideNumber === 1
        ? game.foursomes_side1_tee_starter_user_id
        : game.foursomes_side2_tee_starter_user_id;
    // Tee-starter-banneret gjelder kun mitt lag (2 spillere) — filtrer til
    // min side uavhengig av om hele flighten er synlig (#543).
    const myTeamPlayers = flight.filter(
      (p) => p.team_number === me.team_number,
    );
    const partners = myTeamPlayers.map((p) => ({
      userId: p.user_id,
      displayName:
        (p.users?.nickname ?? p.users?.name ?? '').split(/\s+/)[0] || 'Spiller',
    }));
    if (teeStarterCol == null && holeNumber === 1 && partners.length === 2) {
      foursomesTeeSlot = (
        <FoursomesTeeStarterBanner
          gameId={id}
          sideNumber={sideNumber}
          options={partners}
        />
      );
    } else if (teeStarterCol != null && partners.length === 2) {
      foursomesTeeSlot = (
        <FoursomesTeeHint
          holeNumber={holeNumber}
          teeStarterUserId={teeStarterCol}
          partners={partners}
        />
      );
    }
  }

  // Chapman (#290): statisk fase-stripe på hver hull-side (begge slår ut → bytt
  // ball → velg beste → spill annenhver). Ingen tee-starter — begge teer hvert
  // hull, så det finnes ingen fast odd/even-rotasjon å spore.
  const chapmanPhaseSlot: ReactNode = isChapman ? <ChapmanPhaseReminder /> : null;

  // Patsome (#286): segment-banner på alle hull; tee-starter-velger/-hint kun i
  // foursomes-segmentet (13–18). Velgeren vises på alle foursomes-hull til laget
  // har valgt (mer tilgivende enn foursomes' kun-hull-1), deretter hint-chipen.
  let patsomeSegmentSlot: ReactNode = null;
  let patsomeTeeSlot: ReactNode = null;
  if (isPatsome) {
    patsomeSegmentSlot = <PatsomeSegmentBanner holeNumber={holeNumber} />;
    // Patsome tee-starter: filtrer til mitt lag (2 spillere) — uavhengig av
    // om hele flighten er synlig (#543).
    const myPatsomeTeam = flight.filter(
      (p) => p.team_number === me.team_number,
    );
    if (me.team_number != null && holeNumber >= 13 && myPatsomeTeam.length === 2) {
      const teeStarter = patsomeTeeStarterRes.data?.tee_starter_user_id ?? null;
      const partners = myPatsomeTeam.map((p) => ({
        userId: p.user_id,
        displayName:
          (p.users?.nickname ?? p.users?.name ?? '').split(/\s+/)[0] || 'Spiller',
      }));
      patsomeTeeSlot =
        teeStarter == null ? (
          <PatsomeTeeStarterBanner
            gameId={id}
            teamNumber={me.team_number}
            options={partners}
          />
        ) : (
          <PatsomeTeeHint
            holeNumber={holeNumber}
            teeStarterUserId={teeStarter}
            partners={partners}
          />
        );
    }
  }

  return (
    <div
      key={holeNumber}
      className="min-h-screen bg-bg flex flex-col animate-hole-enter"
      style={{ paddingTop: 54, paddingBottom: 34 }}
    >
      {patsomeSegmentSlot && <div className="px-3">{patsomeSegmentSlot}</div>}
      {patsomeTeeSlot && <div className="px-3">{patsomeTeeSlot}</div>}
      {foursomesTeeSlot && <div className="px-3">{foursomesTeeSlot}</div>}
      {chapmanPhaseSlot && <div className="px-3">{chapmanPhaseSlot}</div>}
      <HoleClient
        gameId={id}
        gameName={game.name}
        gameStatus={game.status}
        gameMode={game.game_mode}
        withdrawn={me.withdrawn_at != null}
        currentHole={holeNumber}
        par={parFor(
          {
            number: hole.hole_number,
            par: hole.par_mens,
            parByGender: {
              mens: hole.par_mens,
              ladies: hole.par_ladies,
              juniors: hole.par_juniors,
            },
            strokeIndex: hole.stroke_index,
          },
          me.tee_gender,
        )}
        parByGender={{
          mens: hole.par_mens,
          ladies: hole.par_ladies,
          juniors: hole.par_juniors,
        }}
        playerGender={me.tee_gender}
        strokeIndex={hole.stroke_index}
        myUserId={userId}
        myCompletedHoles={myCompletedHoles}
        myStablefordTotal={myStablefordTotal}
        myStablefordForCurrentHole={myStablefordForCurrent}
        hideNetto={hideNetto}
        wolfPlayers={wolfPlayersForClient}
        wolfChoices={wolfChoicesForClient}
        wolfPointsByUser={wolfPointsByUser}
        skinsAtStake={skinsAtStake}
        skinsCarriedIn={skinsCarriedIn}
        bingoBangoBongoHoles={isBBB ? (bbbHolesData as BingoBangoBongoHoleInput[]) : undefined}
        roundRobinPlayers={roundRobinPlayersForClient}
        players={playersForClient}
      />
    </div>
  );
}
