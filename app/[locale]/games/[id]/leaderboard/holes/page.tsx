import { Suspense, cache, type ReactNode } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import {
  computeLeaderboard,
  parseMode,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { nameInitials } from '@/lib/names/initials';
import {
  getGameWithPlayers,
  type GameForHole,
} from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import {
  hasParDifference,
  formatOtherGendersPar,
} from '@/lib/games/parDisplay';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildSkinsContext } from '@/lib/scoring/context/buildSkinsContext';
import { SkinsHolesView } from './SkinsHolesView';
import type { SkinsPlayerInfo } from '../SkinsView';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { WolfHolesView } from './WolfHolesView';
import type { WolfPlayerInfo } from '../WolfView';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { buildNinesContext } from '@/lib/scoring/context/buildNinesContext';
import { NinesHolesView } from './NinesHolesView';
import type { NinesPlayerInfo } from '../NinesView';
import { buildRoundRobinContext } from '@/lib/scoring/context/buildRoundRobinContext';
import { RoundRobinHolesView } from './RoundRobinHolesView';
import type { RoundRobinPlayerInfo } from '../RoundRobinView';
import { buildAceyDeuceyContext } from '@/lib/scoring/context/buildAceyDeuceyContext';
import { AceyDeuceyHolesView } from './AceyDeuceyHolesView';
import type { AceyDeuceyPlayerInfo } from '../AceyDeuceyView';
import { buildBingoBangoBongoContext } from '@/lib/scoring/context/buildBingoBangoBongoContext';
import { BingoBangoBongoHolesView } from './BingoBangoBongoHolesView';
import type { BingoBangoBongoPlayerInfo } from '../BingoBangoBongoView';
import { getBingoBangoBongoHoles } from '@/lib/bbb/getBingoBangoBongoHoles';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import { NassauHolesView } from './NassauHolesView';
import type { NassauPlayerInfo } from '../NassauView';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { SoloStrokeplayHolesView } from './SoloStrokeplayHolesView';
import type { SoloStrokeplayPlayerInfo } from '../SoloStrokeplayView';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import { SoloStablefordHolesView } from './SoloStablefordHolesView';
import type { SoloStablefordPlayerInfo } from '../SoloStablefordView';
import { LeaderboardRealtime } from '../LeaderboardRealtime';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  team?: string | string[];
}>;

type CourseHoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

const getDrilldownContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

/**
 * #624 — re-lokaliser det frosne, auto-genererte spillnavnet ved visning.
 * Banenavnet hentes slankt (den cachede `getGameWithPlayers` joiner bevisst
 * ikke courses). `getDrilldownContext` er `cache()`-wrappet, så context-kallet
 * er gratis innen requesten; kun én bane-PK-oppslag legges til, og bare den
 * ene modus-grenen som faktisk rendres kjører den. Norsk visning er byte-
 * identisk (helperen returnerer tidlig for 'no').
 */
async function localizeHolesGameName(game: GameForHole): Promise<string> {
  const [{ supabase }, locale] = await Promise.all([
    getDrilldownContext(),
    getLocale(),
  ]);
  const courseRes = game.course_id
    ? await supabase
        .from('courses')
        .select('name')
        .eq('id', game.course_id)
        .maybeSingle<{ name: string }>()
    : { data: null as { name: string } | null };
  return localizeGameName(
    game.name,
    courseRes.data?.name ?? null,
    locale as AppLocale,
  );
}

export default async function LeaderboardHolesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const requestedMode: LeaderboardMode = parseMode(sp.mode);
  const teamParam = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const requestedTeam = teamParam ? Number.parseInt(teamParam, 10) : null;

  const locale = await getLocale();
  const { supabase, userId: userIdRaw } = await getDrilldownContext();
  if (!userIdRaw) redirect({ href: '/login', locale });
  const userId = userIdRaw as string; // guarded non-null above (redirect isn't typed `never`)

  // Game + players come from the tag-cached helper. Admin check stays
  // direct since it isn't game-scoped.
  const [gwp, profileRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single<{ is_admin: boolean }>(),
  ]);

  if (!gwp) notFound();
  const game = gwp.game;

  if (game.status === 'draft' || game.status === 'scheduled') {
    redirect({ href: `/games/${id}` as string, locale });
  }
  const isActive = game.status === 'active';

  // Reveal-modus override: in reveal-active state, force brutto. Netto-mode
  // would expose the very ordering the admin has chosen to hide until the
  // game finishes. Stale `?mode=netto` query params from bookmarks or
  // before-the-toggle-flip links also fall through to brutto.
  const state = revealState(game.score_visibility, game.status);
  const forceBrutto = shouldHideNetto(state);
  const mode: LeaderboardMode = forceBrutto ? 'brutto' : requestedMode;

  const isAdmin = profileRes.data?.is_admin === true;
  // Non-admin players must be a participant. Reads from cached players list.
  if (!isAdmin && !gwp.players.some((p) => p.user_id === userId)) {
    notFound();
  }

  // Live auto-refresh (#679). Per-hull-siden rendrer ikke gjennom
  // `LeaderboardShell`, så den får sin egen montering. Gatet på aktivt spill:
  // et avsluttet «Hull for hull» trenger ingen WebSocket. Wrapper hver
  // format-gren så alle per-hull-visningene arver den.
  const withRealtime = (body: ReactNode) => (
    <>
      <LeaderboardRealtime gameId={id} active={isActive} />
      {body}
    </>
  );

  // Format-bevisst «Hull for hull» (epic #496): solo-format får sin egen
  // per-hull-visning i stedet for det generiske best-ball lag-scorekortet,
  // som aldri forgrenet på game_mode. Alle solo-format tatt: Skins + Wolf +
  // Nines + Round Robin + Acey-Deucey + Bingo Bango Bongo + Nassau + solo
  // strokeplay + solo/modified stableford.
  if (game.game_mode === 'skins') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <SkinsHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'wolf') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <WolfHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'nines') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <NinesHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'round_robin') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <RoundRobinHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'acey_deucey') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <AceyDeuceyHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'bingo_bango_bongo') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <BingoBangoBongoHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'nassau') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <NassauHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  if (game.game_mode === 'solo_strokeplay') {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <SoloStrokeplayHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  // Solo stableford + modified stableford (team_size === 1). Par-/team-
  // stableford (team_size === 2) er et lag-format og faller gjennom til den
  // generiske DrilldownBody — utenfor epic-scope.
  if (
    (game.mode_config.kind === 'stableford' ||
      game.mode_config.kind === 'modified_stableford') &&
    game.mode_config.team_size === 1
  ) {
    return withRealtime(
      <Suspense fallback={<DrilldownSkeleton />}>
        <SoloStablefordHolesBody gameId={id} courseId={game.course_id} />
      </Suspense>,
    );
  }

  return withRealtime(
    <Suspense fallback={<DrilldownSkeleton />}>
      <DrilldownBody
        gameId={id}
        courseId={game.course_id}
        mode={mode}
        isActive={isActive}
        requestedTeam={requestedTeam}
      />
    </Suspense>,
  );
}

/**
 * Skins «Hull for hull» (epic #496). Henter samme rå-data som DrilldownBody,
 * men bygger Skins-konteksten via den delte `buildSkinsContext`-helperen,
 * kjører mode-router-en og rendrer den Skins-riktige per-hull-visningen i
 * stedet for lag-scorekortet. Ingen front-9-clip — Skins viser alle hull
 * (carryover er sekvensiell over hele runden), likt SkinsView.
 */
async function SkinsHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildSkinsContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'skins') notFound();

  const playersById = new Map<string, SkinsPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <SkinsHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Wolf «Hull for hull» (epic #496, PR 2). Som SkinsHolesBody, men henter også
 * per-hull-valgene fra `wolf_hole_choices` (`getWolfChoices`, tag-cachet) og
 * injiserer dem i konteksten via `buildWolfContext`.
 */
async function WolfHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes, wolfChoices] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    getWolfChoices(gameId),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildWolfContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
    wolfChoices,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'wolf') notFound();

  const playersById = new Map<string, WolfPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <WolfHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Nines / Split Sixes «Hull for hull» (epic #496, PR 3). Som SkinsHolesBody
 * (ingen ekstra fetch utover scores — poengfordeling er ren funksjon av
 * scores), men bygger Nines-konteksten via den delte `buildNinesContext`-
 * helperen og rendrer den Nines-riktige, plassering-først per-hull-visningen.
 */
async function NinesHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildNinesContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nines') notFound();

  const playersById = new Map<string, NinesPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <NinesHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Round Robin «Hull for hull» (epic #496, PR 4). Som NinesHolesBody (ingen
 * ekstra fetch — rotasjonen er ren funksjon av slot + hull, scorer fra
 * scores-tabellen), men bygger Round Robin-konteksten via den delte
 * `buildRoundRobinContext`-helperen og rendrer den segment-grupperte,
 * roterende per-hull-visningen.
 */
async function RoundRobinHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildRoundRobinContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'round_robin') notFound();

  const playersById = new Map<string, RoundRobinPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <RoundRobinHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Acey-Deucey «Hull for hull» (epic #496, PR 5). Som NinesHolesBody (solo,
 * ingen ekstra fetch — poeng er ren funksjon av scores), men bygger
 * konteksten via den delte `buildAceyDeuceyContext`-helperen og rendrer den
 * score-rangerte ace/deuce-visningen.
 */
async function AceyDeuceyHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildAceyDeuceyContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'acey_deucey') notFound();

  const playersById = new Map<string, AceyDeuceyPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <AceyDeuceyHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Bingo Bango Bongo «Hull for hull» (epic #496, PR 6). Som WolfHolesBody: henter
 * per-hull-prestasjonsdata fra `bingo_bango_bongo_holes` (`getBingoBangoBongoHoles`,
 * tag-cachet) og injiserer dem i konteksten via `buildBingoBangoBongoContext`.
 * BBB teller ikke slag — `rawScoresRes` sendes gjennom for shape-konsistens men
 * ignoreres av scoring-laget. Rendrer den prestasjons-først per-hull-visningen.
 */
async function BingoBangoBongoHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes, bingoBangoBongoHoles] =
    await Promise.all([
      getGameWithPlayers(gameId),
      supabase
        .from('course_holes')
        .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
        .eq('course_id', courseId)
        .order('hole_number', { ascending: true })
        .returns<CourseHoleRow[]>(),
      supabase
        .from('scores')
        .select('user_id, hole_number, strokes')
        .eq('game_id', gameId)
        .returns<ScoreRow[]>(),
      getBingoBangoBongoHoles(gameId),
    ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildBingoBangoBongoContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
    bingoBangoBongoHoles,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'bingo_bango_bongo') notFound();

  const playersById = new Map<string, BingoBangoBongoPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <BingoBangoBongoHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Nassau «Hull for hull» (epic #496, PR 7). Som SkinsHolesBody (solo, ingen
 * ekstra fetch utover scores — Nassaus tre seksjoner er ren funksjon av
 * scores), men bygger konteksten via den delte `buildNassauContext`-helperen og
 * rendrer den seksjons-tro per-hull-visningen (For 9 / Bak 9 / Totalt).
 */
async function NassauHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildNassauContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nassau') notFound();

  const playersById = new Map<string, NassauPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <NassauHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Solo strokeplay «Hull for hull» (epic #496, PR 8). Som NassauHolesBody (solo,
 * ingen ekstra fetch utover scores), men bygger konteksten via den delte
 * `buildSoloStrokeplayContext`-helperen — som også eier WD-filtreringen (#386)
 * av spillere + scorer, så «Hull for hull» og leaderboard ser samme felt.
 * Rendrer det klassiske per-spiller-scorekortet.
 */
async function SoloStrokeplayHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;

  const ctx = buildSoloStrokeplayContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'solo_strokeplay') notFound();

  const playersById = new Map<string, SoloStrokeplayPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <SoloStrokeplayHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

/**
 * Solo / modified stableford «Hull for hull» (epic #496, PR 9). Som
 * SoloStrokeplayHolesBody, men bygger konteksten via `buildStablefordContext`
 * (game_mode-passthrough så modified får riktig poeng-tabell; eier WD #386-
 * filtrering). Kun solo-varianten (team_size === 1) ruter hit — par-stableford
 * faller til generisk visning. Rendrer det klassiske stableford-scorekortet.
 */
async function SoloStablefordHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const game = gwp.game;
  const stablefordMode: 'stableford' | 'modified_stableford' =
    game.game_mode === 'modified_stableford' ? 'modified_stableford' : 'stableford';

  const ctx = buildStablefordContext({
    gameId,
    gameMode: stablefordMode,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRes.data ?? [],
    scoresRows: rawScoresRes.data ?? [],
  });

  const result = computeModeResult(ctx);
  // Solo-flaten kun for solo-varianten. Team faller aldri hit (page-branchen
  // gater på team_size === 1), men vi narrower defensivt.
  if (result.kind !== 'stableford' || result.variant !== 'solo') notFound();

  const playersById = new Map<string, SoloStablefordPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <SoloStablefordHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      formatLabel={
        stablefordMode === 'modified_stableford'
          ? 'Modifisert Stableford'
          : 'Stableford'
      }
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}

async function DrilldownBody({
  gameId,
  courseId,
  mode,
  isActive,
  requestedTeam,
}: {
  gameId: string;
  courseId: string;
  mode: LeaderboardMode;
  isActive: boolean;
  requestedTeam: number | null;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  // Players come from the tag-cached helper (cache hit — outer page already
  // warmed it). Holes + scores stay direct fetches.
  const [gwp, rawHolesRes, rawScoresRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
  ]);

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  const players: LbPlayer[] = gwp.players
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      // Defensive: see comment on LbPlayer in the leaderboard page.
      name: p.users!.name ?? tCommon('unknownPlayer'),
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
      teeGender: p.tee_gender,
    }));

  const allHoles: LbHole[] = (rawHolesRes.data ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));

  const allScores: LbScore[] = (rawScoresRes.data ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    strokes: s.strokes,
  }));

  // Active rounds: clip to front 9 so back-9 suspense stays intact. Matches
  // state #3.5 on the leaderboard view.
  const holes = isActive
    ? allHoles.filter((h) => h.holeNumber >= 1 && h.holeNumber <= 9)
    : allHoles;
  const scores = isActive
    ? allScores.filter((s) => s.holeNumber >= 1 && s.holeNumber <= 9)
    : allScores;

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);

  if (orderedLines.length === 0) {
    // Nothing to drill into — bounce back to the parent leaderboard, which
    // will render its own empty state.
    redirect({
      href: `/games/${gameId}/leaderboard?mode=${mode}` as string,
      locale: await getLocale(),
    });
  }

  // Resolve which team's drilldown to render. Default = the leader (rank 1).
  // Invalid `?team=` falls back to the leader rather than erroring, so a
  // stale link from a deleted team still lands somewhere useful.
  const fallback = orderedLines[0]!;
  const selected =
    (requestedTeam != null
      ? orderedLines.find((l) => l.teamNumber === requestedTeam)
      : null) ?? fallback;

  // HOLE_WINNERS: per hole, which team won outright. Null on ties. Computed
  // once across all teams so each row in the table knows whether to show the
  // champagne dot.
  const holeWinners: Array<number | null> = selected.holes.map((h) => {
    const eligible = orderedLines
      .map((l) => {
        const row = l.holes.find((r) => r.holeNumber === h.holeNumber);
        return row?.teamNet == null
          ? null
          : { teamNumber: l.teamNumber, net: row.teamNet };
      })
      .filter((x): x is { teamNumber: number; net: number } => x !== null);
    if (eligible.length === 0) return null;
    const min = Math.min(...eligible.map((e) => e.net));
    const winners = eligible.filter((e) => e.net === min);
    return winners.length === 1 ? winners[0]!.teamNumber : null;
  });

  return (
    <DrilldownView
      gameId={gameId}
      mode={mode}
      isActive={isActive}
      orderedLines={orderedLines}
      selected={selected}
      holeWinners={holeWinners}
    />
  );
}

function DrilldownSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-md pb-12">
        <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text">
            ‹
          </span>
          <Skeleton className="h-3 w-32" />
          <span className="w-8" aria-hidden />
        </header>
        <div className="flex items-center gap-3.5 px-4 pt-1.5 pb-3.5">
          <Skeleton className="h-12 w-12 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-2/5" delay={30} />
            <Skeleton className="mt-1 h-3 w-3/5" delay={60} />
          </div>
          <div className="shrink-0 text-right">
            <Skeleton className="ml-auto h-6 w-12" delay={90} />
            <Skeleton className="ml-auto mt-1 h-2.5 w-10" delay={120} />
          </div>
        </div>
        <div className="mx-4 mt-2 overflow-hidden rounded-[14px] border border-border bg-surface">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="grid items-center gap-2.5 px-3.5 py-2.5"
              style={{
                gridTemplateColumns: '28px 30px 1fr auto 32px 14px',
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <Skeleton className="h-3 w-4" delay={i * 40} />
              <Skeleton className="h-3 w-6" delay={i * 40 + 20} />
              <Skeleton className="h-3 w-16" delay={i * 40 + 40} />
              <Skeleton className="ml-auto h-4 w-6" delay={i * 40 + 60} />
              <Skeleton className="h-3 w-8" delay={i * 40 + 80} />
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View — drilldown for a single team (UT + INN + total bar)
// ─────────────────────────────────────────────────────────────────────────────

function DrilldownView({
  gameId,
  mode,
  isActive,
  orderedLines,
  selected,
  holeWinners,
}: {
  gameId: string;
  mode: LeaderboardMode;
  isActive: boolean;
  orderedLines: TeamLine[];
  selected: TeamLine;
  holeWinners: Array<number | null>;
}) {
  const t = useTranslations('leaderboard.holes');
  const tc = useTranslations('leaderboard.common');
  const frontRows = selected.holes.filter((h) => h.holeNumber <= 9);
  const backRows = selected.holes.filter((h) => h.holeNumber >= 10);

  const frontPar = frontRows.reduce((sum, h) => sum + h.par, 0);
  const backPar = backRows.reduce((sum, h) => sum + h.par, 0);
  const frontNet = frontRows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  const backNet = backRows.reduce((sum, h) => sum + (h.teamNet ?? 0), 0);
  const totalPar = frontPar + backPar;
  const totalVsPar = selected.total - totalPar;
  const holesWon = holeWinners.filter((w) => w === selected.teamNumber).length;

  const isLeader = selected.rank === 1;
  // Finished games surface the dramatic reveal-name; mid-round we keep the
  // compact first-name + HCP label so the drilldown stays readable on
  // narrow tiles.
  const isFinished = !isActive;
  const playerMeta = isFinished
    ? selected.players
        .map((p) => formatRevealName(p.name, p.nickname))
        .join(' · ')
    : selected.players
        .map((p) => `${firstNameOf(p.name)} (HCP ${p.courseHandicap})`)
        .join(' · ');

  // Find sibling teams for prev/next within the ordered list — lets the user
  // tab through teams without going back to the leaderboard. Index by rank
  // ascending; if multiple teams tied, sort stably by teamNumber.
  const stableOrder = orderedLines;
  const myIdx = stableOrder.findIndex(
    (l) => l.teamNumber === selected.teamNumber,
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-md pb-12">
        <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
          <SmartLink
            href={`/games/${gameId}/leaderboard?mode=${mode}`}
            aria-label={t('backAriaLabel')}
            className="-ml-2 inline-flex h-8 w-8 items-center justify-center text-lg text-text"
          >
            ‹
          </SmartLink>
          <span className="flex-1 truncate text-center text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
            {t('teamHeader', { number: selected.teamNumber, rank: selected.rank })}
          </span>
          <span className="w-8" aria-hidden />
        </header>

        {/* Team hero */}
        <div className="flex items-center gap-3.5 px-4 pt-1.5 pb-3.5">
          <div
            className={`min-w-[50px] text-center font-serif text-[48px] font-semibold leading-none tracking-[-0.04em] tabular-nums ${
              isLeader ? 'text-accent' : 'text-muted'
            }`}
          >
            {selected.rank}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-serif text-[22px] font-medium tracking-[-0.015em] text-text">
              {tc('teamLabel', { number: selected.teamNumber })}
            </h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {playerMeta || t('noPlayers')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="block font-serif text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-text">
              {selected.total}
            </span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
              {formatVsPar(selected.total - totalPar)} PAR
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-5 pb-2 text-[10.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <strong className="font-serif font-bold text-text">B</strong>
            <span>{t('legendNetLabel')}</span>
          </span>
          <span className="ml-auto font-serif text-[11px] italic">
            {t('legendFormat')}
          </span>
        </div>

        {/* Front nine */}
        <div className="px-5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
          {t('frontNineLabel')}
        </div>
        <HoleTable
          rows={frontRows}
          teamPlayers={selected.players}
          summaryLabel={t('summaryUt')}
          summaryPar={frontPar}
          summaryNet={frontNet}
        />

        {/* Back nine (finished only) */}
        {isActive ? (
          <div className="mx-4 mt-5 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center">
            <p className="font-serif text-[16px] font-medium text-text">
              {t('hiddenBackNineHeading')}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t('hiddenBackNineSub')}
            </p>
          </div>
        ) : (
          <>
            <div className="px-5 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.20em] text-muted">
              {t('backNineLabel')}
            </div>
            <HoleTable
              rows={backRows}
              teamPlayers={selected.players}
              summaryLabel={t('summaryInn')}
              summaryPar={backPar}
              summaryNet={backNet}
            />

            {/* Total bar — read-only summary, ikke en CTA. Toner ned fra
                tidligere bg-primary-fyll (skrek til leseren) til en stille
                surface med subtil topp-border. Tall + accent-kicker bærer
                hierarkiet uten å trenge høy-kontrast fyll. */}
            <div className="mx-4 mt-5 mb-5 flex items-center justify-between rounded-[14px] border border-border bg-surface px-5 py-3.5 text-text">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.20em] text-accent">
                  {t('totalLabel')}
                </span>
                <span className="mt-0.5 block text-[11.5px] tabular-nums text-muted">
                  {t('holesWon', { count: holesWon })}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                  {selected.total}
                </span>
                <span className="font-sans text-[14px] font-semibold tabular-nums text-muted">
                  {formatVsPar(totalVsPar)}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Team prev/next inside the drilldown so the user can scrub through
            the field without going back to the leaderboard first. Hidden if
            there's only one team. */}
        {stableOrder.length > 1 && (
          <div className="mt-2 flex items-center justify-between px-4">
            <TeamNavLink
              gameId={gameId}
              mode={mode}
              target={stableOrder[myIdx - 1] ?? null}
              direction="prev"
            />
            <TeamNavLink
              gameId={gameId}
              mode={mode}
              target={stableOrder[myIdx + 1] ?? null}
              direction="next"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hole table — one card per hole. Hull-info on the left, per-player rows
// (initial · brutto-shape · netto · netto-vs-par) stacked on the right.
// ─────────────────────────────────────────────────────────────────────────────

function HoleTable({
  rows,
  teamPlayers,
  summaryLabel,
  summaryPar,
  summaryNet,
}: {
  rows: TeamLine['holes'];
  teamPlayers: LbPlayer[];
  summaryLabel: string;
  summaryPar: number;
  summaryNet: number;
}) {
  const summaryTone = vsParTone(summaryNet - summaryPar);
  return (
    <div className="mx-4 mt-1.5 overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,46,31,0.03)]">
      {rows.map((row, ii) => (
        <HoleRow
          key={row.holeNumber}
          row={row}
          teamPlayers={teamPlayers}
          staggerIndex={ii}
        />
      ))}
      {/* Summary row — same flex shape as HoleRow but with totals on the right. */}
      <div
        className="flex items-center gap-2 bg-surface-2 px-3 py-2.5"
        style={{ borderTop: '1.5px solid var(--border)' }}
      >
        <div className="flex w-[40px] shrink-0 flex-col items-center justify-center">
          <span className="font-serif text-[13px] font-semibold tracking-[0.04em] text-muted">
            {summaryLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
            P{summaryPar}
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-right font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {summaryNet}
        </span>
        <span
          className="ml-2 w-[40px] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold tabular-nums"
          style={{
            background: `var(${summaryTone.bg})`,
            color: `var(${summaryTone.fg})`,
          }}
        >
          {formatVsPar(summaryNet - summaryPar)}
        </span>
      </div>
    </div>
  );
}

function HoleRow({
  row,
  teamPlayers,
  staggerIndex,
}: {
  row: TeamLine['holes'][number];
  teamPlayers: LbPlayer[];
  staggerIndex: number;
}) {
  const t = useTranslations('leaderboard.holes');
  // Map userId → first + last name initial (e.g. "Karl Hansen" → "KH").
  const initialFor = new Map<string, string>();
  for (const p of teamPlayers) {
    initialFor.set(p.userId, nameInitials(p.name));
  }

  const teamVsPar = row.teamNet == null ? null : row.teamNet - row.par;
  const teamTone = vsParTone(teamVsPar ?? 0);

  return (
    <div
      className="reveal-up flex items-stretch gap-2 border-t border-border bg-surface px-3 py-2 first:border-t-0"
      style={{ animationDelay: `${40 + staggerIndex * 22}ms` }}
    >
      {/* Hull # + Par on the left, spanning both player rows. */}
      <div className="flex w-[40px] shrink-0 flex-col items-center justify-center">
        <span className="font-serif text-[15px] font-medium leading-none tabular-nums text-text">
          {row.holeNumber}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted">
          P{row.par}
          {row.parByGender && hasParDifference(row.parByGender) && (
            <sup
              data-testid="par-aside-marker"
              title={t('parAsideTitle', {
                genders: formatOtherGendersPar(row.parByGender, undefined, {
                  mens: t('parGenderMens', { par: row.parByGender.mens }),
                  ladies: t('parGenderLadies', { par: row.parByGender.ladies }),
                  juniors: t('parGenderJuniors', { par: row.parByGender.juniors }),
                }),
              })}
              aria-label={t('parAsideAriaLabel', {
                genders: formatOtherGendersPar(row.parByGender, undefined, {
                  mens: t('parGenderMens', { par: row.parByGender.mens }),
                  ladies: t('parGenderLadies', { par: row.parByGender.ladies }),
                  juniors: t('parGenderJuniors', { par: row.parByGender.juniors }),
                }),
              })}
              className="ml-0.5 cursor-help text-[0.65em] font-semibold text-muted"
            >
              *
            </sup>
          )}
        </span>
      </div>

      {/* Per-player rows stacked vertically — initial · brutto · netto · vs-par. */}
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {row.players.map((pc) => {
          const isBestNet =
            pc.net !== null && row.teamNet !== null && pc.net === row.teamNet;
          const grossText = pc.gross == null ? '–' : String(pc.gross);
          const nettoText = pc.net == null ? '–' : String(pc.net);
          const initial = initialFor.get(pc.userId) ?? '?';
          // Per-spiller-par (`pc.par`), ikke lagets representant-par
          // (`row.par`). På blandet-kjønn-lag på avvikshull får medspiller
          // av annet kjønn enn «kapteinen» riktig netto-vs-par og celle-tone. #252.
          const nettoVsPar = pc.net == null ? null : pc.net - pc.par;
          const nettoTone = vsParTone(nettoVsPar ?? 0);

          return (
            <div
              key={pc.userId}
              className="flex items-center gap-2 font-serif tabular-nums"
              aria-label={
                isBestNet
                  ? t('playerScoreAriaUsed', { initial, gross: grossText, extra: pc.extraStrokes, net: nettoText })
                  : t('playerScoreAria', { initial, gross: grossText, extra: pc.extraStrokes, net: nettoText })
              }
            >
              <span
                className={`w-6 text-center text-[12px] ${
                  isBestNet ? 'font-bold text-text' : 'font-normal text-muted'
                }`}
              >
                {initial}
              </span>
              <ScoreShape
                shape={scoreShape(pc.gross, pc.par)}
                tone={scoreTone(pc.gross, pc.par)}
                size="sm"
              >
                {grossText}
              </ScoreShape>
              <span
                className={`min-w-[18px] text-right text-[14px] ${
                  isBestNet ? 'font-semibold text-text' : 'font-normal text-muted'
                }`}
              >
                {nettoText}
              </span>
              <span
                className="w-[32px] rounded-full py-0.5 text-center text-[10px] font-semibold tabular-nums"
                style={
                  nettoVsPar !== null
                    ? {
                        background: `var(${nettoTone.bg})`,
                        color: `var(${nettoTone.fg})`,
                      }
                    : { color: 'var(--text-muted)' }
                }
              >
                {nettoVsPar === null ? '—' : formatVsPar(nettoVsPar)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Lagets score på hullet — spans both player rows on the far right. */}
      <div className="flex shrink-0 items-center justify-end gap-2">
        <span className="font-serif text-[18px] font-semibold leading-none tracking-[-0.015em] tabular-nums text-text">
          {row.teamNet ?? '–'}
        </span>
        <span
          className="w-[40px] rounded-full py-0.5 text-center text-[10px] font-semibold tabular-nums"
          style={
            teamVsPar !== null
              ? {
                  background: `var(${teamTone.bg})`,
                  color: `var(${teamTone.fg})`,
                }
              : { color: 'var(--text-muted)' }
          }
        >
          {teamVsPar === null ? '—' : formatVsPar(teamVsPar)}
        </span>
      </div>
    </div>
  );
}

function TeamNavLink({
  gameId,
  mode,
  target,
  direction,
}: {
  gameId: string;
  mode: LeaderboardMode;
  target: TeamLine | null;
  direction: 'prev' | 'next';
}) {
  const t = useTranslations('leaderboard.holes');
  if (!target) {
    return <span className="w-1/2" aria-hidden />;
  }
  const isPrev = direction === 'prev';
  return (
    <SmartLink
      href={`/games/${gameId}/leaderboard/holes?team=${target.teamNumber}&mode=${mode}`}
      className={`inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text ${
        isPrev ? '' : 'ml-auto'
      }`}
    >
      {isPrev && <span aria-hidden>‹</span>}
      <span>
        {isPrev
          ? t('prevTeam', { rank: target.rank, number: target.teamNumber })
          : t('nextTeam', { rank: target.rank, number: target.teamNumber })}
      </span>
      {!isPrev && <span aria-hidden>›</span>}
    </SmartLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type ScoreTone = {
  fg: '--score-under-fg' | '--score-par-fg' | '--score-over1-fg' | '--score-over2-fg';
  bg: '--score-under-bg' | '--score-par-bg' | '--score-over1-bg' | '--score-over2-bg';
};

function vsParTone(vs: number): ScoreTone {
  if (vs < 0) return { fg: '--score-under-fg', bg: '--score-under-bg' };
  if (vs === 0) return { fg: '--score-par-fg', bg: '--score-par-bg' };
  if (vs === 1) return { fg: '--score-over1-fg', bg: '--score-over1-bg' };
  return { fg: '--score-over2-fg', bg: '--score-over2-bg' };
}

function formatVsPar(v: number): string {
  if (v === 0) return 'E';
  if (v > 0) return `+${v}`;
  return String(v);
}

function firstNameOf(fullName: string): string {
  const t = fullName.trim();
  if (t === '') return '';
  return t.split(/\s+/)[0]!;
}
