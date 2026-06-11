import type { ReactNode } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link, redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { supportsWithdrawal } from '@/lib/scoring';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  SideWinnersForm,
  type PlayerOption,
} from '@/app/[locale]/admin/games/[id]/avslutt/SideWinnersForm';
import { endGameWithSideWinners } from '@/app/[locale]/admin/games/[id]/avslutt/actions';
import { endGame } from '@/app/[locale]/admin/games/[id]/actions';
import { endGameMarkingWithdrawals } from '@/app/[locale]/admin/games/[id]/avslutt-likevel/actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

/**
 * Creator-facing «Avslutt spill»-flate (#427) — the non-admin mirror of the
 * admin finish flow, in `AppShell` instead of the Sekretariat shell. Gated on
 * `requireAdminOrCreator`, so a game's creator (or an admin) can finish their
 * own game; everyone else bounces to `/`.
 *
 * Unlike the admin side (split across /avslutt + /avslutt-likevel), this is one
 * page that adapts to the game's state, delegating to the SAME server actions
 * the admin uses (their redirects branch to /games/* for a non-admin caller):
 *  - peer-approval still pending → blocking notice, no finish button (the gate
 *    the action would enforce anyway, surfaced here so the creator gets feedback
 *    rather than a silent bounce — /games/[id] doesn't render ?error).
 *  - side tournament on → LD/CTP winner picker (endGameWithSideWinners). Missing
 *    submitters are listed and auto-allowed (allowMissing = missing > 0).
 *  - no side tournament + missing submitters → «avslutt likevel» with optional
 *    per-player WD (endGameMarkingWithdrawals).
 *  - no side tournament + everyone submitted → plain confirm (endGame).
 */
export default async function CreatorAvsluttPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { error } = await searchParams;
  const t = await getTranslations('game.finish');
  const locale = await getLocale();
  const detailPath = `/games/${gameId}`;

  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, gameId);

  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, require_peer_approval, game_mode, side_tournament_enabled, side_ld_count, side_ctp_count',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      require_peer_approval: boolean;
      game_mode: GameMode;
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
    }>();

  if (!game) notFound();
  if (game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active` as string, locale });
  }

  const { data: gamePlayers } = await supabase
    .from('game_players')
    .select(
      'user_id, submitted_at, approved_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        submitted_at: string | null;
        approved_at: string | null;
        withdrawn_at: string | null;
        users: { name: string | null; nickname: string | null } | null;
      }[]
    >();

  const displayName = (gp: { users: { name: string | null; nickname: string | null } | null }) =>
    formatRevealName(gp.users?.name ?? '', gp.users?.nickname ?? null);

  // Withdrawn players are out of the ranking entirely — never block the end.
  const active = (gamePlayers ?? []).filter((gp) => !gp.withdrawn_at);
  const missing = active.filter((gp) => !gp.submitted_at);
  // Peer approval (when required) blocks finishing — the creator can't force it,
  // so surface it as a wait state rather than letting the action silently bounce.
  const unapproved = game.require_peer_approval
    ? active.filter((gp) => gp.submitted_at && !gp.approved_at)
    : [];

  const sideOn =
    game.side_tournament_enabled &&
    game.side_ld_count + game.side_ctp_count > 0;

  const playerOptions: PlayerOption[] = active.map((gp) => ({
    user_id: gp.user_id,
    display_name: displayName(gp),
  }));

  const missingList = missing.length > 0 && (
    <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
      <p className="font-medium">
        {t('missingCount', { count: missing.length })}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
        {missing.map((gp) => (
          <li key={gp.user_id}>{displayName(gp)}</li>
        ))}
      </ul>
      <p className="mt-2 text-text">
        {t('missingNote')}
      </p>
    </div>
  );

  let body: ReactNode;

  if (unapproved.length > 0) {
    // Can't finish until every submitted scorecard is approved by a co-player.
    body = (
      <div className="space-y-4 px-1">
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <p className="font-medium">
            {t('unapprovedCount', { count: unapproved.length })}
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {unapproved.map((gp) => (
              <li key={gp.user_id}>{displayName(gp)}</li>
            ))}
          </ul>
          <p className="mt-2 text-text">
            {t('unapprovedNote')}
          </p>
        </div>
        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          {t('backToGame')}
        </Link>
      </div>
    );
  } else if (sideOn) {
    const action = endGameWithSideWinners.bind(null, gameId, missing.length > 0);
    body = (
      <div className="space-y-4 px-1">
        {missingList}
        <SideWinnersForm
          gameId={gameId}
          ldCount={game.side_ld_count}
          ctpCount={game.side_ctp_count}
          players={playerOptions}
          action={action}
          error={error}
          cancelHref={detailPath}
        />
      </div>
    );
  } else if (missing.length > 0) {
    const allowWd = supportsWithdrawal(game.game_mode);
    const endAnywayAction = endGameMarkingWithdrawals.bind(null, gameId);
    body = (
      <div className="space-y-4 px-1">
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <p className="font-medium">
            {t('missingCount', { count: missing.length })}
          </p>
          <ul className="mt-2 space-y-2">
            {missing.map((gp) =>
              allowWd ? (
                <li key={gp.user_id} className="flex items-center gap-3">
                  <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      name={`withdraw_${gp.user_id}`}
                      value="on"
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm text-text">{displayName(gp)}</span>
                    <span className="ml-auto text-xs text-muted">
                      {t('withdrawLabel')}
                    </span>
                  </label>
                </li>
              ) : (
                <li key={gp.user_id} className="text-sm text-text">
                  {displayName(gp)}
                </li>
              ),
            )}
          </ul>
        </div>
        <p className="text-sm text-muted">
          {allowWd ? t('explanationAllowWd') : t('explanationNoWd')}
        </p>
        <form action={endAnywayAction}>
          <SubmitButton className="w-full" pendingLabel={t('finishPending')}>
            {t('finishAnywayButton')}
          </SubmitButton>
        </form>
        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          {t('cancelButton')}
        </Link>
      </div>
    );
  } else {
    // Everyone submitted (and approved if required) — plain confirm.
    const finishAction = endGame.bind(null, gameId, false);
    body = (
      <div className="space-y-4 px-1">
        <p className="text-sm text-muted">
          {t('allSubmittedNote')}
        </p>
        <form action={finishAction}>
          <SubmitButton className="w-full" pendingLabel={t('finishPending')}>
            {t('finishButton')}
          </SubmitButton>
        </form>
        <Link
          href={detailPath}
          className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
        >
          {t('cancelButton')}
        </Link>
      </div>
    );
  }

  return (
    <AppShell>
      <TopBar backHref={detailPath} kicker={t('kicker')} userId={role.userId} />
      <PageHeader
        title={t('heading')}
        subtitle={
          sideOn
            ? t('subtitleSide', { name: game.name })
            : t('subtitlePlain', { name: game.name })
        }
      />
      {body}
    </AppShell>
  );
}
