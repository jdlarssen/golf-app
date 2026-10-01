import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { requireAdmin } from '@/lib/admin/auth';
import { pendingPlayerList } from '@/lib/admin/pendingPlayerEmails';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
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
import { GameWizard } from '@/app/[locale]/admin/games/new/GameWizard';
import { getWizardMountData } from '@/lib/wizard/getWizardMountData';
import {
  planDraftResume,
  resumeExpectedPlayerCount,
} from '@/lib/wizard/draftResumePlan';
import {
  saveDraftAction,
  publishFromDraftAction,
  updateScheduledAction,
} from './actions';
import {
  buildEditInitialValues,
  EDIT_FORM_COLUMNS,
  type EditGameRow,
  type EditGamePlayerRow,
} from '@/lib/games/editGameInitialValues';
import { localizeGameName } from '@/lib/games/autoGameName';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import { getAdminClient } from '@/lib/supabase/admin';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
  pending?: string | string[];
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
  // #2207: the gate sends ids (`pending=`), never addresses; they are turned
  // back into addresses only after requireAdmin below.
  async function buildErrorMessage(): Promise<string | undefined> {
    if (!errorCode) return undefined;
    const key = `${errorCode}` as Parameters<typeof tErrors>[0];
    if (!tErrors.has(key)) return undefined;
    const list =
      errorCode === 'pending_players' ? await pendingPlayerList(first(sp.pending)) : '';
    return tErrors(key, { list });
  }

  const locale = await getLocale();
  const { supabase, userId } = await getEditContext();
  if (!userId) redirect({ href: '/login', locale });

  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // inline is_admin Promise.all-entry; the game row fetches below now
  // runs sequentially after the gate so trusted-non-admin callers don't
  // even trigger the games-select.
  await requireAdmin(supabase);
  const errorMessage = await buildErrorMessage();

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(`${EDIT_FORM_COLUMNS}, group_id, tournament_id, league_round_id`)
    .eq('id', id)
    .maybeSingle<EditGameRow>();

  // Error ≠ absence (#1445): a transient query failure must reach the error
  // boundary, not silently bounce the admin back to the list as if the game
  // were gone. Only a genuine 0-row result redirects.
  if (gameError) {
    console.error('[AdminGameEditPage] game fetch failed', gameError);
    throw gameError;
  }
  if (!game) {
    redirect({ href: '/admin/games', locale });
  }

  // Edits are allowed while the game is still in 'draft' or 'scheduled'.
  // Once it flips to 'active' or 'finished', state changes (handicaps, scores)
  // make the roster and tee-off effectively immutable.
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect({ href: `/admin/games/${id}?error=not_editable`, locale });
  }

  // #2260: the wizard owns its chrome (the top from the format-card artboard,
  // linen background, no bottom nav), so the choice between wizard and
  // GameForm is made here, before any chrome renders. The cost: resuming a
  // draft shows no skeleton while the wizard data loads.
  const resume = await loadWizardResume(id, game);
  if (resume) {
    const { wizardData, plan, playerRows } = resume;
    return (
      // `data-hides-bottom-nav`: the global bottom nav hides while this branch
      // is on screen (the rule in app/globals.css). The GameForm branches
      // below keep it.
      <div data-hides-bottom-nav>
        <AppShell showVersion={false}>
          <GameWizard
            courses={wizardData.courses}
            players={wizardData.players}
            initialValues={buildEditInitialValues(game, playerRows)}
            mode={{
              kind: 'edit-draft',
              gameId: id,
              saveDraftAction,
              publishAction: publishFromDraftAction,
            }}
            initialIntent={plan.intent}
            defaultGroupId={plan.groupId}
            formatsByIntent={wizardData.formatsByIntent}
            clubs={wizardData.clubs}
            friendPlayerIds={wizardData.friendPlayerIds}
            clubMemberIdsByClub={wizardData.clubMemberIdsByClub}
            currentUserId={wizardData.userId ?? ''}
            // Uten denne står #373-telleren på default-4, og steg 2 filtrerer
            // bort utkastets eget format for alt som ikke passer fire spillere.
            initialExpectedPlayerCount={resumeExpectedPlayerCount(
              game.game_mode,
              playerRows.length,
            )}
            // Ruta er `requireAdmin`-gatet over, så Solo- og Klubb-flisene i
            // steg 1 skal vises (IntentSelector skjuler begge uten dette).
            isAdmin
            formatGuide={wizardData.formatGuide}
            backHref={`/admin/games/${id}`}
            entryLabel={t('kicker')}
            notice={
              <div className="mt-4 space-y-2">
                {errorMessage && (
                  <Banner tone="error" testId="edit-error-banner">
                    {errorMessage}
                  </Banner>
                )}
                <Banner tone="info">{t('bannerDraft')}</Banner>
                <Suspense fallback={null}>
                  <PlayerShortageBanner gameMode={game.game_mode} />
                </Suspense>
              </div>
            }
          />
        </AppShell>
      </div>
    );
  }

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker={tNav('gamesLog')}
      />

      <BrassRibbon kicker={t('kicker')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {localizeGameName(game.name, game.courses?.name ?? null, locale)}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('subtitle')}
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {errorMessage && (
          <Banner tone="error" testId="edit-error-banner">
            {errorMessage}
          </Banner>
        )}
        <Banner tone="info">
          {game.status === 'draft' ? t('bannerDraft') : t('bannerScheduled')}
        </Banner>
        <Suspense fallback={null}>
          <PlayerShortageBanner gameMode={game.game_mode} />
        </Suspense>
      </div>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <EditGameFormBody gameId={id} game={game} />
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
    // Paged (#2227): the picker lists every user, past PostgREST's 1 000-row cap.
    selectAllRowsResult(
      (from, to) =>
        getAdminClient()
          .from('users')
          .select('id, name, nickname, hcp_index, email, profile_completed_at, gender, level')
          .order('profile_completed_at', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true, nullsFirst: true })
          .order('id')
          .range(from, to)
          .returns<UserRow[]>(),
      'edit game users',
    ),
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
  // #1838: samme terskel som `/opprett-spill` (#1794) og `/admin/games/new`.
  if (playerOptions.length > 1) return null;
  const tEdit = await getTranslations('admin.game.edit');
  return (
    <Banner tone="info" testId="player-shortage-banner">
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

/**
 * #1385: et utkast gjenopptas i veiviseren det ble laget i. Cup-/liga-koblede
 * utkast er unntaket (veiviserens cup-gren er en opprettelses-kortslutning,
 * ikke en redigeringsflate) — de trenger ikke veiviser-oppsettet i det hele
 * tatt, og heller ikke planlagte spill. Null → GameForm.
 */
async function loadWizardResume(gameId: string, game: EditGameRow) {
  const mayResumeInWizard =
    game.status === 'draft' && !game.tournament_id && !game.league_round_id;
  if (!mayResumeInWizard) return null;

  const { supabase } = await getEditContext();
  const [playersResult, wizardData] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number, tee_gender')
      .eq('game_id', gameId)
      .returns<EditGamePlayerRow[]>(),
    getWizardMountData(),
  ]);
  if (playersResult.error) throw playersResult.error;

  // Katalog-vakten kan fortsatt sende utkastet til GameForm: finnes ikke
  // formatet i noen av veiviserens kataloger, ville steg 2 vist et grid uten
  // spillets eget format.
  const plan = planDraftResume(game, wizardData.formatsByIntent);
  if (plan.kind !== 'wizard') return null;
  return { wizardData, plan, playerRows: playersResult.data ?? [] };
}

async function EditGameFormBody({
  gameId,
  game,
}: {
  gameId: string;
  game: EditGameRow;
}) {
  const { supabase } = await getEditContext();

  const [playersResult, { courses, playerOptions }] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number, tee_gender')
      .eq('game_id', gameId)
      .returns<EditGamePlayerRow[]>(),
    getOptions(),
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
