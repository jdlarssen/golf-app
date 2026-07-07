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
import {
  saveDraftAction,
  publishFromDraftAction,
  updateScheduledAction,
} from '@/app/[locale]/admin/games/[id]/edit/actions';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import {
  buildEditInitialValues,
  type EditGameRow,
  type EditGamePlayerRow,
} from '@/lib/games/editGameInitialValues';

/**
 * Creator-facing «Rediger spill»-flate (#428) — the non-admin mirror of the
 * admin edit flow (`/admin/games/[id]/edit`), in `AppShell` instead of the
 * Sekretariat shell. Gated on `requireAdminOrCreator`, so a game's creator (or
 * an admin) can edit their own game; everyone else bounces to `/`.
 *
 * Reuses the SAME `GameForm` + the SAME `saveDraftAction` / `publishFromDraftAction`
 * / `updateScheduledAction` server actions the admin uses — those branch their
 * redirects to `/games/*` for a non-admin caller (#428). Options load through
 * `getNewGameFormData(false)` — the e-post-fri roster variant (#435). RLS on
 * `users` already scopes the picker to the creator + their shared-game
 * co-players (which covers this game's roster); `includeEmail=false` drops the
 * `email` column so those co-players' e-postadresser never reach the payload.
 */

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
}>;

const GAME_SELECT =
  'id, name, status, course_id, courses(name), tee_box_id, scheduled_tee_off_at, hcp_allowance_pct, require_peer_approval, score_visibility, side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories, game_mode, mode_config, registration_mode, registration_type, entry_fee_kr, payment_link, prizes';

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
  const emails = first(sp.emails);
  function buildErrorMessage(): string | undefined {
    if (!errorCode) return undefined;
    const key = `${errorCode}` as Parameters<typeof tErrors>[0];
    if (!tErrors.has(key)) return undefined;
    return tErrors(key, { list: emails ? `: ${emails}` : '' });
  }
  const errorMessage = buildErrorMessage();

  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, id);

  const { data: maybeGame, error: gameError } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('id', id)
    .single<EditGameRow>();

  if (gameError || !maybeGame) {
    redirect({ href: `/games/${id}` as string, locale });
  }
  const game = maybeGame!;

  // Edits are allowed while the game is still in 'draft' or 'scheduled'. Once it
  // flips to 'active' or 'finished', frozen handicaps + recorded scores make the
  // roster and tee-off effectively immutable (same gate as the admin flow).
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect({ href: `/games/${id}?error=not_editable` as string, locale });
  }

  return (
    <AppShell>
      <TopBar backHref={`/games/${id}`} kicker={t('kicker')} userId={role.userId} />
      <PageHeader
        title={localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale)}
        subtitle={t('subtitle')}
      />

      <div className="space-y-2">
        {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
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
  const initialValues = buildEditInitialValues(game, playerRows);

  if (game.status === 'draft') {
    return (
      <GameForm
        courses={courses}
        players={players}
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
      players={players}
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
