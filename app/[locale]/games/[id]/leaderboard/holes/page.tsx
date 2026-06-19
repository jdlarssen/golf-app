import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/Skeleton';
import { parseMode, type LeaderboardMode } from '@/lib/leaderboard';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { LeaderboardRealtime } from '../LeaderboardRealtime';
import { getDrilldownContext } from './holesData';
import { SkinsHolesBody } from './formats/skins';
import { WolfHolesBody } from './formats/wolf';
import { NinesHolesBody } from './formats/nines';
import { RoundRobinHolesBody } from './formats/roundRobin';
import { AceyDeuceyHolesBody } from './formats/aceyDeucey';
import { BingoBangoBongoHolesBody } from './formats/bingoBangoBongo';
import { NassauHolesBody } from './formats/nassau';
import { SoloStrokeplayHolesBody } from './formats/soloStrokeplay';
import { SoloStablefordHolesBody } from './formats/soloStableford';
import { DrilldownBody } from './formats/drilldown';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  team?: string | string[];
}>;

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
