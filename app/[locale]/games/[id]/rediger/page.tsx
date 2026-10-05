import { first } from '@/lib/url/searchParams';
import { Suspense } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameForm } from '@/app/[locale]/admin/games/new/GameForm';
import { GameWizard } from '@/app/[locale]/admin/games/new/GameWizard';
import { getOrganiserWizardMountData } from '@/lib/wizard/getWizardMountData';
import { loadDraftResume } from '@/lib/wizard/loadDraftResume';
import { resumeExpectedPlayerCount } from '@/lib/wizard/draftResumePlan';
import {
  saveDraftAction,
  publishFromDraftAction,
  updateScheduledAction,
} from '@/app/[locale]/admin/games/[id]/edit/actions';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { withRosterPlayerOptions } from '@/lib/games/getRosterPlayerOptions';
import { localizeGameName } from '@/lib/games/autoGameName';
import {
  buildEditFormInitialValues,
  buildEditInitialValues,
  EDIT_FORM_COLUMNS,
  type EditGameRow,
  type EditGamePlayerRow,
} from '@/lib/games/editGameInitialValues';

/**
 * Creator-facing «Rediger spill»-flate (#428) — the non-admin mirror of the
 * admin edit flow (`/admin/games/[id]/edit`), in `AppShell` instead of the
 * Sekretariat shell. Gated on `requireAdminOrCreator`, so a game's creator (or
 * an admin) can edit their own game; everyone else bounces to `/`.
 *
 * A draft resumes in the SAME `GameWizard` the admin's edit route uses (#2269,
 * `loadDraftResume`); a scheduled game, and a cup-/league-linked draft, get the
 * SAME `GameForm`. Both post to the SAME `saveDraftAction` /
 * `publishFromDraftAction` / `updateScheduledAction` server actions the admin
 * uses — those branch their redirects to `/games/*` for a non-admin caller
 * (#428). Options load through
 * `getNewGameFormData(false)` — the e-post-fri roster variant (#435). RLS on
 * `users` scopes that picker to the creator + the co-players they share a game
 * with AS A PLAYER, so an organiser who does not play in this game sees none
 * of its roster. #2210: the roster's own users are therefore added via
 * `getRosterPlayerOptions` (service-role, exactly these ids, no e-mail).
 * `includeEmail=false` keeps co-players' e-postadresser out of the payload.
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
}>;

// Every column the form writes back must be read here, or a save resets it
// (#2258) — the shared list is checked against the update in a test.
// #2433: group_id + tournament_id only tell buildEditFormInitialValues whether
// this is a club tournament; neither comes back through the form.
// league_round_id: a league-linked draft keeps GameForm (`loadDraftResume`).
const GAME_SELECT = `${EDIT_FORM_COLUMNS}, group_id, tournament_id, league_round_id`;

export default async function CreatorEditGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations('game.edit');
  const locale = await getLocale();

  const tErrors = await getTranslations('wizard.errors');
  const errorCode = first(sp.error);
  function buildErrorMessage(): string | undefined {
    if (!errorCode) return undefined;
    const key = errorCode as Parameters<typeof tErrors>[0];
    if (!tErrors.has(key)) return undefined;
    return tErrors(key, { list: '' });
  }
  const errorMessage = buildErrorMessage();

  const supabase = await getServerClient();
  // Authz-gate (redirecter til '/' hvis ikke admin/oppretter), før noe av
  // spillet eller rosteren leses.
  const ctx = await requireAdminOrCreator(supabase, id);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('id', id)
    .maybeSingle<EditGameRow>();

  // Error ≠ absence (#1445): a transient query failure must reach the error
  // boundary, not bounce the organiser back to the game page as if the row
  // were gone. Only a genuine 0-row result redirects.
  if (gameError) {
    console.error('[GameEditPage] game fetch failed', gameError);
    throw gameError;
  }
  if (!game) {
    redirect({ href: `/games/${id}`, locale });
  }

  // Edits are allowed while the game is still in 'draft' or 'scheduled'. Once it
  // flips to 'active' or 'finished', frozen handicaps + recorded scores make the
  // roster and tee-off effectively immutable (same gate as the admin flow).
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect({ href: `/games/${id}?error=not_editable`, locale });
  }

  // #2269 (eierens svar 05.10, PR #2537): an organiser's draft resumes in the
  // wizard like admin's does, so «fortsett der du slapp» lands on «Klar?».
  // Same rule (`loadDraftResume`), same actions and publish path; the data are
  // the organiser's own (`/opprett-spill`'s), plus the draft's roster (#2210).
  // Scheduled games and cup-/league-linked drafts keep GameForm below.
  const resume = await loadDraftResume(supabase, id, game, () =>
    getOrganiserWizardMountData(ctx.userId),
  );
  if (resume) {
    const { wizardData, plan, playerRows } = resume;
    const players = await withRosterPlayerOptions(
      wizardData.players,
      playerRows.map((r) => r.user_id),
    );
    return (
      // `data-hides-bottom-nav`: the wizard owns its chrome, as on admin's edit
      // route (#2260).
      <div data-hides-bottom-nav>
        <AppShell showVersion={false}>
          <GameWizard
            courses={wizardData.courses}
            players={players}
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
            currentUserId={ctx.userId}
            initialExpectedPlayerCount={resumeExpectedPlayerCount(
              game.game_mode,
              playerRows.length,
            )}
            isAdmin={ctx.isAdmin}
            isClubAdmin={wizardData.isClubAdmin}
            formatGuide={wizardData.formatGuide}
            backHref={`/games/${id}`}
            entryLabel={t('kicker')}
            notice={
              <div className="mt-4 space-y-2">
                {errorMessage && (
                  <Banner tone="error" testId="edit-error-banner">
                    {errorMessage}
                  </Banner>
                )}
                <Banner tone="info">{t('draftBanner')}</Banner>
              </div>
            }
          />
        </AppShell>
      </div>
    );
  }

  return (
    <AppShell>
      <TopBar backHref={`/games/${id}`} kicker={t('kicker')} />
      <PageHeader
        title={localizeGameName(game.name, game.courses?.name ?? null, locale)}
        subtitle={t('subtitle')}
      />

      <div className="space-y-2">
        {errorMessage && (
          <Banner tone="error" testId="edit-error-banner">
            {errorMessage}
          </Banner>
        )}
        <Banner tone="info">
          {game.status === 'draft' ? t('draftBanner') : t('scheduledBanner')}
        </Banner>
      </div>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <EditGameFormBody gameId={id} game={game} />
          </Suspense>
        </Card>
      </div>
    </AppShell>
  );
}

async function EditGameFormBody({
  gameId,
  game,
}: {
  gameId: string;
  game: EditGameRow;
}) {
  const supabase = await getServerClient();
  const [{ courses, players }, playersResult] = await Promise.all([
    // includeEmail=false (#435): the creator-facing edit flow is non-admin, so
    // the roster must not carry co-players' e-postadresser into the payload.
    getNewGameFormData(false),
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number, tee_gender')
      .eq('game_id', gameId)
      .returns<EditGamePlayerRow[]>(),
  ]);

  if (playersResult.error) throw playersResult.error;

  const playerRows = playersResult.data ?? [];
  // #2433: a club tournament saves with an empty roster here too.
  const initialValues = buildEditFormInitialValues(game, playerRows);

  // #2210: every rostered player must be in the options, or the form hides
  // them (and best ball with finished teams crashed). Co-players the creator
  // can already see come first; the rest of the roster is added after them.
  const allPlayers = await withRosterPlayerOptions(
    players,
    playerRows.map((r) => r.user_id),
  );

  if (game.status === 'draft') {
    return (
      <GameForm
        courses={courses}
        players={allPlayers}
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
      players={allPlayers}
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
