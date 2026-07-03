import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  GameForm,
  type CourseOption,
  type PlayerOption,
} from '@/app/[locale]/admin/games/new/GameForm';
import {
  saveDraftAction,
  publishFromDraftAction,
  updateScheduledAction,
} from './actions';
import {
  buildEditInitialValues,
  type EditGameRow,
  type EditGamePlayerRow,
} from '@/lib/games/editGameInitialValues';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
}>;


type CourseRow = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    slope_mens: number | null;
    course_rating_mens: number | null;
    par_total_mens: number | null;
    slope_ladies: number | null;
    course_rating_ladies: number | null;
    par_total_ladies: number | null;
    slope_juniors: number | null;
    course_rating_juniors: number | null;
    par_total_juniors: number | null;
  }[];
};

type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  email: string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

const getEditContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function EditGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const tErrors = await getTranslations('wizard.errors');
  const t = await getTranslations('admin.game.edit');
  const tNav = await getTranslations('admin.nav');
  const errorCode = first(sp.error);
  const emails = first(sp.emails);
  function buildErrorMessage(): string | undefined {
    if (!errorCode) return undefined;
    const key = `${errorCode}` as Parameters<typeof tErrors>[0];
    if (!tErrors.has(key)) return undefined;
    return tErrors(key, { list: emails ? `: ${emails}` : '' });
  }
  const errorMessage = buildErrorMessage();

  const locale = await getLocale();
  const { supabase, userId } = await getEditContext();
  if (!userId) redirect({ href: '/login', locale });

  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // inline is_admin Promise.all-entry; the game row fetches below now
  // runs sequentially after the gate so trusted-non-admin callers don't
  // even trigger the games-select.
  await requireAdmin(supabase);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, courses(name), tee_box_id, scheduled_tee_off_at, hcp_allowance_pct, require_peer_approval, score_visibility, side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories, game_mode, mode_config, registration_mode, registration_type, let_friends_skip_gate, entry_fee_kr, payment_link',
    )
    .eq('id', id)
    .single<EditGameRow>();

  if (gameError || !game) {
    redirect({ href: '/admin/games', locale });
  }

  // Edits are allowed while the game is still in 'draft' or 'scheduled'.
  // Once it flips to 'active' or 'finished', state changes (handicaps, scores)
  // make the roster and tee-off effectively immutable.
  if (game!.status !== 'draft' && game!.status !== 'scheduled') {
    redirect({ href: `/admin/games/${id}?error=not_editable`, locale });
  }

  // TypeScript cannot narrow past next-intl redirect; use non-null assertion.
  const g = game!;

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker={tNav('gamesLog')}
      />

      <BrassRibbon kicker={t('kicker')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {localizeGameName(g.name, g.courses?.name ?? null, locale as AppLocale)}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('subtitle')}
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        <Banner tone="info">
          {g.status === 'draft' ? t('bannerDraft') : t('bannerScheduled')}
        </Banner>
        <Suspense fallback={null}>
          <PlayerShortageBanner gameMode={g.game_mode} />
        </Suspense>
      </div>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <EditGameFormBody gameId={id} game={g} />
          </Suspense>
        </Card>
      </div>
    </AdminShell>
  );
}

const getOptions = cache(async () => {
  const { supabase } = await getEditContext();
  const [coursesResult, usersResult] = await Promise.all([
    supabase
      .from('courses')
      .select(
        'id, name, tee_boxes(id, name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
      )
      .order('name', { ascending: true })
      .returns<CourseRow[]>(),
    supabase
      .from('users')
      .select('id, name, nickname, hcp_index, email, profile_completed_at, gender, level')
      .order('profile_completed_at', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>(),
  ]);
  if (coursesResult.error) throw coursesResult.error;
  if (usersResult.error) throw usersResult.error;

  const courses: CourseOption[] = (coursesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    tee_boxes: (c.tee_boxes ?? [])
      .map((t) => ({
        id: t.id,
        name: t.name,
        has_mens:
          t.slope_mens !== null &&
          t.course_rating_mens !== null &&
          t.par_total_mens !== null,
        has_ladies:
          t.slope_ladies !== null &&
          t.course_rating_ladies !== null &&
          t.par_total_ladies !== null,
        has_juniors:
          t.slope_juniors !== null &&
          t.course_rating_juniors !== null &&
          t.par_total_juniors !== null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  }));

  const playerOptions: PlayerOption[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    email: u.email,
    pending: u.profile_completed_at === null,
    gender: u.gender,
    level: u.level,
  }));

  return { courses, playerOptions };
});

async function PlayerShortageBanner({ gameMode }: { gameMode: GameMode }) {
  // Stableford trenger bare 1 spiller — banner-en (som nudge om total
  // klubb-størrelse) er ikke relevant her, og «Du trenger 8 spillere»-copy-en
  // ville vært direkte misvisende for et solo-format.
  if (isStablefordFamily(gameMode)) return null;
  const { playerOptions } = await getOptions();
  if (playerOptions.length >= 8) return null;
  const tEdit = await getTranslations('admin.game.edit');
  return (
    <Banner tone="info">
      {tEdit.rich('playerShortageBanner', {
        link: (chunks) => (
          <SmartLink href="/admin/spillere" className="underline hover:no-underline">
            {chunks}
          </SmartLink>
        ),
      })}
    </Banner>
  );
}

async function EditGameFormBody({
  gameId,
  game,
}: {
  gameId: string;
  game: EditGameRow;
}) {
  const { supabase } = await getEditContext();
  const [{ courses, playerOptions }, playersResult] = await Promise.all([
    getOptions(),
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number, tee_gender')
      .eq('game_id', gameId)
      .returns<EditGamePlayerRow[]>(),
  ]);

  if (playersResult.error) throw playersResult.error;

  const playerRows = playersResult.data ?? [];
  const initialValues = buildEditInitialValues(game, playerRows);

  if (game.status === 'draft') {
    return (
      <GameForm
        courses={courses}
        players={playerOptions}
        initialValues={initialValues}
        mode={{
          kind: 'edit-draft',
          gameId,
          saveDraftAction,
          publishAction: publishFromDraftAction,
        }}
      />
    );
  }

  return (
    <GameForm
      courses={courses}
      players={playerOptions}
      initialValues={initialValues}
      mode={{
        kind: 'edit-scheduled',
        gameId,
        updateAction: updateScheduledAction,
      }}
    />
  );
}

function GameFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" delay={60} />
      <Skeleton className="h-32 w-full rounded-lg" delay={120} />
      <Skeleton className="h-32 w-full rounded-lg" delay={180} />
      <Skeleton className="h-12 w-full rounded-full" delay={240} />
    </div>
  );
}
