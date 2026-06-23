import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getTeamCandidates } from '@/lib/users/getTeamCandidates';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { supportsWithdrawal } from '@/lib/scoring';
import { ApprovePlayerButton } from '@/app/[locale]/admin/games/[id]/ApprovePlayerButton';
import {
  adminWithdrawPlayer,
  adminUndoWithdraw,
  adminApproveScorecard,
} from '@/app/[locale]/admin/games/[id]/actions';
import { removePlayerFromGame, cancelGameInvitation } from './actions';
import { CreatorRosterClient } from './CreatorRosterClient';
import type { PlayerForHole } from '@/lib/games/getGameWithPlayers';
import type { AppLocale } from '@/i18n/routing';
import { localizeGameName } from '@/lib/games/autoGameName';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ status?: string; error?: string }>;

const BEST_BALL_MAX_PLAYERS = 8;

const STATUS_KEYS = new Set([
  'invite_added',
  'invite_sent',
  'player_removed',
  'player_withdrawn',
  'player_reinstated',
  'admin_approved',
  'invite_cancelled',
]);

const ERROR_KEYS = new Set([
  'disposable_email',
  'invite_invalid_email',
  'invite_missing_user',
  'invite_not_allowed',
  'remove_missing_user',
  'game_locked',
  'roster_locked',
  'game_full',
  'db_players',
  'invite_failed',
  'mail_failed',
  'cancel_failed',
  'not_found',
]);

function playerName(p: Pick<PlayerForHole, 'users'>): string {
  return formatRevealName(p.users?.name ?? '', p.users?.nickname ?? null);
}

/**
 * Creator/admin roster + approval cockpit for a single game (#429). Gated on
 * requireAdminOrCreator — a game's creator (or an admin) manages their own
 * game; everyone else bounces to `/`.
 *
 * The roster is read via getGameWithPlayers (admin-client cache), so it renders
 * even for a non-playing creator; every write goes through a request-scoped
 * server action covered by creator RLS (migrations 0071 + 0072). The surface
 * adapts to game state:
 *  - draft/scheduled → add existing co-players, invite new ones by e-post,
 *    remove players, cancel pending invites.
 *  - active → withdraw/reinstate players (#386) and, when peer approval is on,
 *    approve stuck scorecards on behalf of the flight (#360 parity).
 *  - finished → read-only roster.
 */
export default async function CreatorSpillerePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: gameId } = await params;
  const { status: statusParam, error: errorParam } = await searchParams;
  const detailPath = `/games/${gameId}`;

  const t = await getTranslations('game.players');
  const locale = (await getLocale()) as AppLocale;

  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, gameId);

  const gwp = await getGameWithPlayers(gameId);
  if (!gwp) notFound();

  const { game, players } = gwp;

  const courseRes = game.course_id
    ? await supabase.from('courses').select('name').eq('id', game.course_id).maybeSingle<{ name: string }>()
    : { data: null as { name: string } | null };
  const courseName = courseRes.data?.name ?? null;
  const status = game.status;
  const isPreStart = status === 'draft' || status === 'scheduled';
  const isActive = status === 'active';
  const canWithdraw = supportsWithdrawal(game.game_mode);
  const isBestBall = game.game_mode === 'best_ball';
  const isFull = isBestBall && players.length >= BEST_BALL_MAX_PLAYERS;

  // Pre-start the page needs two independent reads: the pending game-scoped
  // invitations and the creator's co-player network for the add-picker. They
  // don't depend on each other, so fetch them in parallel rather than letting
  // the invitations round-trip block the network lookup.
  //  - pendingInvites: request-scoped (creator sees their own via RLS 0072,
  //    admin sees all). Only meaningful before the round starts.
  //  - candidates: co-player network, minus whoever's already on the roster.
  let pendingInvites: { id: string; email: string }[] = [];
  let candidates: { id: string; name: string | null; nickname: string | null; email: string }[] = [];
  if (isPreStart) {
    const rosterIds = new Set(players.map((p) => p.user_id));
    const [invitesRes, network] = await Promise.all([
      supabase
        .from('invitations')
        .select('id, email')
        .eq('game_id', gameId)
        .is('accepted_at', null)
        .order('created_at', { ascending: true })
        .returns<{ id: string; email: string }[]>(),
      getTeamCandidates(role.userId),
    ]);
    pendingInvites = invitesRes.data ?? [];
    candidates = network.filter((c) => !rosterIds.has(c.id));
  }

  const banner = statusParam && STATUS_KEYS.has(statusParam) ? (
    <Banner tone="success">{t(`statusMessages.${statusParam}` as Parameters<typeof t>[0])}</Banner>
  ) : errorParam && ERROR_KEYS.has(errorParam) ? (
    <Banner tone={errorParam === 'mail_failed' ? 'warning' : errorParam === 'game_full' ? 'info' : 'error'}>
      {t(`errorMessages.${errorParam}` as Parameters<typeof t>[0], { max: BEST_BALL_MAX_PLAYERS })}
    </Banner>
  ) : null;

  // Pending approvals across all flights (override use-case: a peer vanished).
  const awaitingApproval =
    isActive && game.require_peer_approval
      ? players.filter((p) => !p.withdrawn_at && p.submitted_at && !p.approved_at)
      : [];

  return (
    <AppShell>
      <TopBar backHref={detailPath} kicker={t('kicker')} userId={role.userId} />
      <PageHeader
        title={t('heading')}
        subtitle={t('subtitle', { name: localizeGameName(game.name, courseName, locale) })}
      />

      <div className="space-y-6">
        {banner}

        {/* ── Roster ───────────────────────────────────────────────── */}
        <section>
          <MiniRibbon>{t('rosterSection')}</MiniRibbon>
          {players.length === 0 ? (
            <p className="px-1 text-sm text-muted">{t('noPlayers')}</p>
          ) : (
            <ul className="space-y-2">
              {players.map((p) => {
                const wd = !!p.withdrawn_at;
                const submitted = !!p.submitted_at;
                const approved = !!p.approved_at;
                const stateLabel = wd
                  ? t('stateWithdrawn')
                  : approved
                    ? t('stateApproved')
                    : submitted
                      ? t('stateSubmitted')
                      : isActive
                        ? t('stateNotSubmitted')
                        : null;
                return (
                  <li
                    key={p.user_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${wd ? 'text-muted line-through' : 'text-text'}`}>
                        {playerName(p)}
                      </p>
                      {stateLabel && (
                        <p className="mt-0.5 text-xs text-muted">{stateLabel}</p>
                      )}
                    </div>

                    {isPreStart && (
                      <form action={removePlayerFromGame.bind(null, gameId)}>
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button
                          type="submit"
                          className="min-h-[44px] rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
                        >
                          {t('removeButton')}
                        </button>
                      </form>
                    )}

                    {isActive && canWithdraw && !wd && (
                      <form action={adminWithdrawPlayer.bind(null, gameId, p.user_id)}>
                        <button
                          type="submit"
                          className="min-h-[44px] whitespace-nowrap rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
                        >
                          {t('withdrawButton')}
                        </button>
                      </form>
                    )}

                    {isActive && canWithdraw && wd && (
                      <form action={adminUndoWithdraw.bind(null, gameId, p.user_id)}>
                        <button
                          type="submit"
                          className="min-h-[44px] whitespace-nowrap rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-text"
                        >
                          {t('undoWithdrawButton')}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Pending approvals (active + peer approval) ───────────── */}
        {awaitingApproval.length > 0 && (
          <section>
            <MiniRibbon>{t('approvalSection')}</MiniRibbon>
            <p className="mb-2 px-1 text-sm text-muted">
              {t('approvalHint')}
            </p>
            <ul className="space-y-2">
              {awaitingApproval.map((p) => (
                <li
                  key={p.user_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
                >
                  <p className="min-w-0 truncate text-sm font-medium text-text">
                    {playerName(p)}
                  </p>
                  <ApprovePlayerButton
                    approveAction={adminApproveScorecard.bind(null, gameId, p.user_id)}
                    playerName={playerName(p)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Pending invitations (pre-start) ──────────────────────── */}
        {isPreStart && pendingInvites.length > 0 && (
          <section>
            <MiniRibbon>{t('pendingInvitesSection')}</MiniRibbon>
            <ul className="space-y-2">
              {pendingInvites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
                >
                  <p className="min-w-0 truncate text-sm text-text">{inv.email}</p>
                  <form action={cancelGameInvitation.bind(null, gameId)}>
                    <input type="hidden" name="invitation_id" value={inv.id} />
                    <button
                      type="submit"
                      className="min-h-[44px] rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      {t('cancelInviteButton')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Add players (pre-start) ──────────────────────────────── */}
        {isPreStart && (
          <section>
            <MiniRibbon>{t('addPlayersSection')}</MiniRibbon>
            <div className="rounded-xl border border-border bg-surface px-3.5 py-4">
              {isFull && (
                <div className="mb-4">
                  <Banner tone="info">
                    {t('fullBanner', { max: BEST_BALL_MAX_PLAYERS })}
                  </Banner>
                </div>
              )}
              <CreatorRosterClient
                gameId={gameId}
                candidates={candidates}
                disabled={isFull}
              />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
