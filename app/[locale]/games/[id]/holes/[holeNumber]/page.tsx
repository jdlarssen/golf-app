import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { isProfileIncomplete } from '@/lib/auth/profileGate';
import { isStablefordFamily } from '@/lib/scoring/modes/types';
import { parFor } from '@/lib/scoring/modes/parResolver';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';
import { teamScoreOwnerId } from '@/lib/games/teamCaptain';
import { holeNumbersForSegment } from '@/lib/games/holeScope';
import { HoleClient } from './HoleClient';
import type { AppLocale } from '@/i18n/routing';
import { localizeGameName } from '@/lib/games/autoGameName';
import { HoleTopBanners } from './HoleTopBanners';
import {
  fetchHolePageData,
  indexScoresByUser,
  resolveGreenPinState,
  resolveMyScoredHoles,
  resolveSiblingScoreData,
} from './holePageData';
import {
  computeSkinsStake,
  computeStablefordTotals,
  computeWolfContext,
} from './holePageScoring';
import {
  buildPlayersForClient,
  buildRoundRobinPlayers,
  resolveFlight,
} from './holePagePlayers';
import {
  buildHoleStripSibling,
  resolveSegmentBridges,
  resolveSiblingMatch,
} from './holeSegmentBridges';

type Params = Promise<{ id: string; holeNumber: string }>;

export default async function HolePage({ params }: { params: Params }) {
  const { id, holeNumber: holeStr } = await params;

  const holeNumber = Number(holeStr);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    notFound();
  }

  const [tHoles, tEntry, locale] = await Promise.all([
    getTranslations('leaderboard.holes'),
    getTranslations('holes.entry'),
    getLocale(),
  ]);
  const unknownPlayer = tHoles('unknownPlayer');
  const playerFallback = tEntry('playerFallback');

  const userIdOrNull = await getProxyVerifiedUserId();
  if (!userIdOrNull) redirect({ href: '/login', locale });
  const userId = userIdOrNull as string;

  // #1176: hard profil-gate ved scoring. Den myke stripa på spill-hjem lar en
  // fersk invitert spiller SE spillet uten profil, men å taste slag krever navn
  // + handicap (course handicap må låses før netto-scoring). Slim egen-query
  // først (før de tunge fetchene under) — lukker også scoring via en direkte
  // hull-URL med plassholder-handicap.
  const supabase = await getServerClient();
  if (await isProfileIncomplete(supabase, userId)) {
    redirect({
      href: `/complete-profile?next=${encodeURIComponent(
        `/games/${id}/holes/${holeNumber}`,
      )}`,
      locale,
    });
  }

  // games + game_players come from the tag-cached helper (see
  // lib/games/getGameWithPlayers.ts). These rows don't change during a
  // hull-bytte, so reading them from the cache saves a Supabase round-trip
  // per hole-navigation. Authorization stays here at the call-site:
  // `me = allPlayers.find(...)` notFound() below covers the auth check that
  // RLS used to provide for the per-request server client.
  const result = await getGameWithPlayers(id);
  if (!result) notFound();
  const { game, players: allPlayers } = result;

  // #1441: a derived game (singles avledet fra best-ball-hosten) never
  // renders score entry — its scores live on the host game. Bounce home,
  // which shows the read-only «Slagene føres i …»-notice instead.
  if (game.source_game_id) {
    redirect({ href: `/games/${id}` as string, locale });
  }

  // #1441: front9/back9-spill har kun hull i sitt segment tilgjengelig for
  // scoring. En URL utenfor segmentet (f.eks. hull 12 på et front9-spill)
  // sender spilleren til segmentets første hull i stedet for et 404 —
  // matcher den øvrige statusbaserte redirect-praksisen i denne filen.
  const segmentHoles = holeNumbersForSegment(game.hole_segment);
  if (!segmentHoles.includes(holeNumber)) {
    redirect({
      href: `/games/${id}/holes/${segmentHoles[0]}` as string,
      locale,
    });
  }

  if (game.status === 'draft') {
    redirect({ href: '/', locale });
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect({ href: `/games/${id}` as string, locale });
  }
  if (game.status === 'finished') {
    // #1351: the round is over — entry is closed for everyone, submitted or
    // not. Without this branch the page rendered fully disabled with no
    // explanation. Game-home has its own finished state (results + scorecard),
    // and never redirects back here, so there is no bounce loop.
    redirect({ href: `/games/${id}` as string, locale });
  }

  const me = allPlayers.find((p) => p.user_id === userId);
  if (!me) notFound();

  // Once the player has submitted their scorecard, the hole pages are
  // read-only and confusing to land on. Bounce them home.
  if (me.submitted_at) {
    redirect({ href: `/games/${id}` as string, locale });
  }

  const siblingMatch = await resolveSiblingMatch(game, userId);
  const { segmentSibling, broBridge } = resolveSegmentBridges({
    game,
    holeNumber,
    siblingMatch,
  });

  const flight = resolveFlight({ game, allPlayers, me });
  const playerIds = flight.map((p) => p.user_id);

  // #1577: in the team-collapsed modes the whole team taps into ONE scores row
  // owned by the captain, so a non-captain has no rows of their own to count —
  // the deliver-CTA never appeared for them. Resolve the row owner from the
  // full team (not the flight): row ownership is a property of the team, the
  // same rule the Home card reads (#1538). Null when I have no team, when the
  // team is unreadable, or when everyone withdrew — all «count my own rows».
  const myTeamScoreOwnerId =
    me.team_number == null
      ? null
      : teamScoreOwnerId(
          allPlayers.filter((p) => p.team_number === me.team_number),
        );

  const isStableford = isStablefordFamily(game.game_mode);
  const isWolf = game.game_mode === 'wolf';
  const isSkins = game.game_mode === 'skins';
  const isBBB = game.game_mode === 'bingo_bango_bongo';
  const isPatsome = game.game_mode === 'patsome';
  const isRoundRobin = game.game_mode === 'round_robin';

  const data = await fetchHolePageData({
    supabase,
    gameId: id,
    holeNumber,
    userId,
    game,
    me,
    playerIds,
    myTeamScoreOwnerId,
    siblingMatch,
    modes: { isStableford, isWolf, isSkins, isBBB, isPatsome },
  });

  // Error ≠ absence (#1441): fetchHolePageData throws on query failure (error
  // boundary), 404 only when the hole row is genuinely missing.
  const hole = data.hole;
  if (!hole) notFound();
  if (data.scoresRes.error) throw data.scoresRes.error;

  const { greenCenter, freshPinCount } = resolveGreenPinState({
    greenPinsRes: data.greenPinsRes,
    gameId: id,
    holeNumber,
  });

  const scoresByUser = indexScoresByUser(data.scoresRes.data);
  const myScoredHoles = resolveMyScoredHoles({
    rows: data.myScoredHolesRes.data,
    gameMode: game.game_mode,
    userId,
    myTeamScoreOwnerId,
  });

  const siblingScores = await resolveSiblingScoreData({
    siblingMatch,
    siblingTeamRes: data.siblingTeamRes,
    userId,
  });
  const holeStripSibling = buildHoleStripSibling({
    siblingMatch,
    teamOwnerId: siblingScores.teamOwnerId,
    scoredHoles: siblingScores.scoredHoles,
  });

  const stableford = computeStablefordTotals({
    isStableford,
    game,
    me,
    holeNumber,
    allHolesRes: data.allHolesRes,
    myAllScoresRes: data.myAllScoresRes,
  });

  // Reveal-modus: under an active reveal-game, hide the per-card +N SLAG
  // badge so handicap-slag count stays secret. shouldHideNetto returns true
  // only for the 'reveal-active' state — live games and finished reveal games
  // render the badge normally.
  const hideNetto = shouldHideNetto(
    revealState(game.score_visibility, game.status),
  );

  const wolf = computeWolfContext({
    isWolf,
    gameId: id,
    game,
    allPlayers,
    unknownPlayer,
    wolfChoicesData: data.wolfChoicesData,
    wolfAllHolesRes: data.wolfAllHolesRes,
    wolfAllScoresRes: data.wolfAllScoresRes,
  });

  const skinsStake = computeSkinsStake({
    isSkins,
    gameId: id,
    game,
    allPlayers,
    holeNumber,
    skinsAllHolesRes: data.skinsAllHolesRes,
    skinsAllScoresRes: data.skinsAllScoresRes,
  });

  const playersForClient = buildPlayersForClient({
    game,
    holeNumber,
    flight,
    allPlayers,
    strokeIndex: hole.stroke_index,
    scoresByUser,
    unknownPlayer,
  });

  const roundRobinPlayersForClient = buildRoundRobinPlayers({
    isRoundRobin,
    allPlayers,
    unknownPlayer,
  });

  return (
    <div
      key={holeNumber}
      className="min-h-screen bg-bg flex flex-col animate-hole-enter"
      style={{ paddingTop: 54 }}
    >
      <HoleTopBanners
        game={game}
        me={me}
        flight={flight}
        gameId={id}
        holeNumber={holeNumber}
        patsomeTeeStarterUserId={
          data.patsomeTeeStarterRes.data?.tee_starter_user_id ?? null
        }
        playerFallback={playerFallback}
      />
      <HoleClient
        gameId={id}
        gameName={localizeGameName(game.name, data.courseName, locale as AppLocale)}
        gameStatus={game.status}
        gameMode={game.game_mode}
        holeSegment={game.hole_segment}
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
        myTeamNumber={me.team_number}
        myTeamScoreOwnerId={myTeamScoreOwnerId}
        myScoredHoles={myScoredHoles}
        courseId={game.course_id}
        greenCenter={greenCenter}
        freshPinCount={freshPinCount}
        myStablefordTotal={stableford.total}
        myStablefordForCurrentHole={stableford.forCurrentHole}
        hideNetto={hideNetto}
        wolfPlayers={wolf.players}
        wolfChoices={wolf.choices}
        wolfPointsByUser={wolf.pointsByUser}
        skinsAtStake={skinsStake.atStake}
        skinsCarriedIn={skinsStake.carriedIn}
        bingoBangoBongoHoles={isBBB ? (data.bbbHolesData as BingoBangoBongoHoleInput[]) : undefined}
        roundRobinPlayers={roundRobinPlayersForClient}
        segmentSibling={segmentSibling}
        holeStripSibling={holeStripSibling}
        broBridge={broBridge}
        players={playersForClient}
      />
    </div>
  );
}
