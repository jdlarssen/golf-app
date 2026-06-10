import { notFound } from 'next/navigation';
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

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ status?: string; error?: string }>;

const BEST_BALL_MAX_PLAYERS = 8;

const STATUS_MESSAGES: Record<string, string> = {
  invite_added: 'Spilleren er lagt til.',
  invite_sent: 'Invitasjonen er sendt.',
  player_removed: 'Spilleren er fjernet.',
  player_withdrawn: 'Spilleren er trukket fra spillet.',
  player_reinstated: 'Spilleren er med igjen.',
  admin_approved: 'Scorekortet er godkjent.',
  invite_cancelled: 'Invitasjonen er trukket tilbake.',
};

const ERROR_MESSAGES: Record<string, string> = {
  disposable_email:
    'Den e-postadressen ser ut som en engangsadresse. Be om en vanlig e-post.',
  invite_invalid_email: 'Ugyldig e-postadresse.',
  invite_missing_user: 'Fant ikke spilleren.',
  remove_missing_user: 'Fant ikke spilleren.',
  game_locked: 'Spillet er i gang. Du kan ikke endre spillerne nå.',
  roster_locked: 'Spillet er i gang. Trekk spilleren i stedet for å fjerne.',
  game_full: `Spillet er fullt (${BEST_BALL_MAX_PLAYERS} spillere).`,
  db_players: 'Noe gikk galt. Prøv igjen.',
  invite_failed: 'Invitasjonen kunne ikke sendes. Prøv igjen.',
  mail_failed: 'Invitasjonen ble lagret, men e-posten kom ikke fram.',
  cancel_failed: 'Kunne ikke trekke invitasjonen.',
  not_found: 'Fant ikke spillet.',
};

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

  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, gameId);

  const gwp = await getGameWithPlayers(gameId);
  if (!gwp) notFound();

  const { game, players } = gwp;
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

  const banner = statusParam && STATUS_MESSAGES[statusParam] ? (
    <Banner tone="success">{STATUS_MESSAGES[statusParam]}</Banner>
  ) : errorParam && ERROR_MESSAGES[errorParam] ? (
    <Banner tone={errorParam === 'mail_failed' ? 'warning' : errorParam === 'game_full' ? 'info' : 'error'}>
      {ERROR_MESSAGES[errorParam]}
    </Banner>
  ) : null;

  // Pending approvals across all flights (override use-case: a peer vanished).
  const awaitingApproval =
    isActive && game.require_peer_approval
      ? players.filter((p) => !p.withdrawn_at && p.submitted_at && !p.approved_at)
      : [];

  return (
    <AppShell>
      <TopBar backHref={detailPath} kicker="Spillere" userId={role.userId} />
      <PageHeader
        title="Spillere"
        subtitle={`Styr hvem som er med i «${game.name}».`}
      />

      <div className="space-y-6">
        {banner}

        {/* ── Roster ───────────────────────────────────────────────── */}
        <section>
          <MiniRibbon>Med i spillet</MiniRibbon>
          {players.length === 0 ? (
            <p className="px-1 text-sm text-muted">Ingen spillere ennå.</p>
          ) : (
            <ul className="space-y-2">
              {players.map((p) => {
                const wd = !!p.withdrawn_at;
                const submitted = !!p.submitted_at;
                const approved = !!p.approved_at;
                const stateLabel = wd
                  ? 'Trukket'
                  : approved
                    ? 'Godkjent'
                    : submitted
                      ? 'Levert'
                      : isActive
                        ? 'Ikke levert'
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
                          Fjern
                        </button>
                      </form>
                    )}

                    {isActive && canWithdraw && !wd && (
                      <form action={adminWithdrawPlayer.bind(null, gameId, p.user_id)}>
                        <button
                          type="submit"
                          className="min-h-[44px] whitespace-nowrap rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
                        >
                          Trekk
                        </button>
                      </form>
                    )}

                    {isActive && canWithdraw && wd && (
                      <form action={adminUndoWithdraw.bind(null, gameId, p.user_id)}>
                        <button
                          type="submit"
                          className="min-h-[44px] whitespace-nowrap rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-text"
                        >
                          Angre
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
            <MiniRibbon>Venter på godkjenning</MiniRibbon>
            <p className="mb-2 px-1 text-sm text-muted">
              Får ikke en medspiller godkjent et scorekort, kan du godkjenne på
              vegne av flighten her. Da kan du avslutte spillet.
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
            <MiniRibbon>Inviterte (venter på innlogging)</MiniRibbon>
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
                      Trekk
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
            <MiniRibbon>Legg til spillere</MiniRibbon>
            <div className="rounded-xl border border-border bg-surface px-3.5 py-4">
              {isFull && (
                <div className="mb-4">
                  <Banner tone="info">
                    Spillet er fullt ({BEST_BALL_MAX_PLAYERS} av{' '}
                    {BEST_BALL_MAX_PLAYERS}). Fjern noen for å invitere flere.
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
