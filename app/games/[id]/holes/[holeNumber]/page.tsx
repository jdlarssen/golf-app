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
import { HoleClient, type ClientPlayer } from './HoleClient';
import {
  FoursomesTeeStarterBanner,
  FoursomesTeeHint,
} from './FoursomesTeeStarterBanner';

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

  // For solo-modus (stableford, solo strokeplay) er flight_number null
  // på alle game_players. Spillere går likevel typisk i en felles fysisk
  // flight på 1-4 personer, og en av dem fungerer som «marker» for resten
  // (issue #163). Vi behandler derfor hele spillerlisten som én flight og lar
  // hvem som helst taste slag for alle. Best-ball- og matchplay-modus beholder
  // per-flight-filtreringen som før.
  //
  // Texas scramble: flight_number = team_number per validator, så flight-
  // filtreringen returnerer kun spillere på samme lag som «me». Disse
  // collapses senere til EN ClientPlayer (lag-kaptein-keyed) i playersForClient.
  const flight =
    me.flight_number == null
      ? allPlayers
      : allPlayers.filter((p) => p.flight_number === me.flight_number);
  const playerIds = flight.map((p) => p.user_id);

  const isStableford = isStablefordFamily(game.game_mode);
  const isTexas = game.game_mode === 'texas_scramble' || game.game_mode === 'ambrose' || game.game_mode === 'florida_scramble';
  const isFoursomes = game.game_mode === 'foursomes_matchplay';
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

    // 4 spillere med team_number 1-4 — validatoren sikrer at det er nøyaktig 4.
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

  // For Texas scramble collapses vi flight-medlemmer til ett kort per lag.
  // Lag-kapteinen (lex-min userId) eier scores-radene; alle medlemmer kan
  // taste, alle tap skriver til kapteinens userId. Kortets `name` viser
  // «Lag N · Navn1, Navn2» og `initial`-avataren viser lag-nummeret slik at
  // det visuelt skiller seg fra per-spiller-kort i andre moduser.
  //
  // Lag-handicap beregnes etter NGF-konvensjon:
  //   teamHCP = round(combinedCourseHandicap × team_handicap_pct / 100)
  // og fordeles per hull via vanlig SI-allokering (strokesForHole).
  let playersForClient: ClientPlayer[];

  if (isTexas || isFoursomes) {
    const captain = flight.reduce(
      (min, p) => (p.user_id < min.user_id ? p : min),
      flight[0],
    );
    const combinedCH = flight.reduce(
      (sum, p) => sum + (p.course_handicap ?? 0),
      0,
    );
    let teamHandicap: number;
    if (isFoursomes) {
      // Foursomes: WHS-diff-formel. Beregn motstander-sidens combined CH
      // og gi diff til høyeste lag. Lavlaget får 0.
      const oppPlayers = allPlayers.filter(
        (p) => p.team_number !== me.team_number && p.team_number !== null,
      );
      const oppCombinedCH = oppPlayers.reduce(
        (sum, p) => sum + (p.course_handicap ?? 0),
        0,
      );
      const allowancePct =
        game.mode_config.kind === 'foursomes_matchplay'
          ? game.mode_config.allowance_pct
          : 50;
      const diff = Math.abs(combinedCH - oppCombinedCH);
      const highSideExtraHCP = Math.round((diff * allowancePct) / 100);
      teamHandicap = combinedCH > oppCombinedCH ? highSideExtraHCP : 0;
    } else {
      const handicapPct =
        game.mode_config.kind === 'texas_scramble' || game.mode_config.kind === 'ambrose' || game.mode_config.kind === 'florida_scramble'
          ? game.mode_config.team_handicap_pct
          : 0;
      teamHandicap = Math.round((combinedCH * handicapPct) / 100);
    }
    const captainScoreRow = scoresByUser[captain.user_id];
    const memberNames = flight
      .map((p) => p.users?.name ?? '')
      .map((n) => n.split(/\s+/)[0])
      .filter((n) => n.length > 0)
      .join(', ');
    // Lag-tilstand er «innlevert» hvis NOEN på laget har submitted_at — alle
    // medlemmer ser samme lag-kort og samme submit-status. Strammere flow
    // (kun én submit per lag) er en separat design-oppgave, ikke nødvendig
    // for v1-rendering.
    const anyTeamMemberSubmitted = flight.some((p) => p.submitted_at != null);
    playersForClient = [
      {
        userId: captain.user_id,
        name: `Lag ${me.team_number} · ${memberNames}`,
        nickname: null,
        initial: String(me.team_number),
        extraStrokes: strokesForHole(teamHandicap, hole.stroke_index),
        initialStrokes: captainScoreRow?.strokes ?? null,
        initialClientUpdatedAt: captainScoreRow?.client_updated_at ?? null,
        initialServerUpdatedAt: captainScoreRow?.updated_at ?? null,
        submitted: anyTeamMemberSubmitted,
      },
    ];
  } else {
    playersForClient = flight.map((p) => {
      const name = p.users?.name ?? '(ukjent spiller)';
      const rawNickname = p.users?.nickname ?? null;
      const nickname =
        rawNickname && rawNickname.trim().length > 0 ? rawNickname : null;
      const ch = p.course_handicap ?? 0;
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
    const partners = flight.map((p) => ({
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

  return (
    <div
      key={holeNumber}
      className="min-h-screen bg-bg flex flex-col animate-hole-enter"
      style={{ paddingTop: 54, paddingBottom: 34 }}
    >
      {foursomesTeeSlot && <div className="px-3">{foursomesTeeSlot}</div>}
      <HoleClient
        gameId={id}
        gameName={game.name}
        gameStatus={game.status}
        gameMode={game.game_mode}
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
