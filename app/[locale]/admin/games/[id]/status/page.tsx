import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { firstName } from '@/lib/firstName';
import { formatRelativeLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import {
  classifyDeliveryStatus,
  type DeliveryStatus,
} from '@/lib/games/deliveryStatus';
import { ownedScoresByPlayer } from '@/lib/games/filledHoles';
import { holeCountForSegment } from '@/lib/games/holeScope';
import { previewReminder } from '@/lib/games/remindUnsubmitted';
import type { HoleSegment } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import { remindUnsubmittedPlayers, remindUnconfirmedPlayers } from './actions';
import { RemindButton } from './RemindButton';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  count?: string | string[];
  error?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  require_peer_approval: boolean;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
  // #1441 — front9/back9-spill er «ferdig» ved 9 hull, ikke 18.
  hole_segment: HoleSegment;
  // #2041: decides who owns each hole's row. DB type is `string`;
  // games_game_mode_check constrains it to GameMode.
  game_mode: GameMode;
};

type PlayerRow = {
  user_id: string;
  // #2041: groups the roster into teams so a teammate counts the captain's card.
  team_number: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { name: string | null; nickname: string | null; email: string } | null;
};

type ScoreRow = { user_id: string; hole_number: number; updated_at: string };

// Sorter purre-kandidatene øverst, så de som fortsatt spiller, deretter resten.
const SORT_ORDER: Record<DeliveryStatus, number> = {
  ready_not_delivered: 0,
  playing: 1,
  not_started: 2,
  pending_approval: 3,
  delivered: 4,
  withdrawn: 5,
};

export default async function GameStatusPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const locale = await getLocale();
  const t = await getTranslations('admin.game.status');
  const tDetail = await getTranslations('admin.game.detail');

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, require_peer_approval, courses(name), hole_segment, game_mode')
    .eq('id', id)
    .maybeSingle<GameRow>();
  // Error ≠ absence (#1445): a transient query failure must reach the error
  // boundary, not render as «spillet finnes ikke».
  if (gameError) {
    console.error('[AdminGameStatusPage] game fetch failed', gameError);
    throw gameError;
  }
  if (!game) notFound();

  // #1441: front9/back9-spill er «ferdig» ved 9 hull, ikke 18.
  const expectedHoles = holeCountForSegment(game.hole_segment);

  const [playersRes, scoresRes] = await Promise.all([
    supabase
      .from('game_players')
      .select(
        'user_id, team_number, submitted_at, approved_at, withdrawn_at, accepted_at, users!game_players_user_id_fkey(name, nickname, email)',
      )
      .eq('game_id', id)
      .returns<PlayerRow[]>(),
    selectAllRowsResult(
      (from, to) =>
        supabase
          .from('scores')
          .select('user_id, hole_number, updated_at')
          .eq('game_id', id)
          .not('strokes', 'is', null)
          .order('id')
          .range(from, to)
          .returns<ScoreRow[]>(),
      'AdminGameStatusPage scores',
    ),
  ]);

  const players = playersRes.data ?? [];
  const scores = scoresRes.data ?? [];

  const isActive = game.status === 'active';
  // På avsluttet spill roes leverings-rammingen ned (#918): «ikke levert» blir
  // et nøytralt historisk faktum, ikke en ventende handling.
  const isFinished = game.status === 'finished';

  // Per player: holes with an entered stroke + last action (max updated_at).
  // No strokes values are fetched — no spoiler.
  //
  // #2041: both come from the rows that player's round runs on. In the one-ball
  // formats the captain owns the team's rows, so counting own rows read a
  // teammate as «not started» however far the team had got.
  // `ownedScoresByPlayer` is the one home for that rule (#2017); withdrawn
  // players stay in the roster so it can pick each team's row owner.
  const ownedByUser = ownedScoresByPlayer({
    players,
    scores,
    mode: game.game_mode,
  });

  const rows = players
    .map((p) => {
      const owned = ownedByUser.get(p.user_id) ?? [];
      const holesFilled = owned.length;
      let lastActionAt: string | null = null;
      for (const s of owned) {
        if (lastActionAt == null || s.updated_at > lastActionAt) {
          lastActionAt = s.updated_at;
        }
      }
      const status = classifyDeliveryStatus({
        holesFilled,
        submittedAt: p.submitted_at,
        approvedAt: p.approved_at,
        withdrawnAt: p.withdrawn_at,
        requirePeerApproval: game.require_peer_approval,
        expectedHoles,
      });
      const fullName = p.users?.name ?? p.users?.email ?? tDetail('unknownPlayer');
      return {
        userId: p.user_id,
        name: fullName,
        displayName: firstName(fullName) ?? fullName,
        holesFilled,
        lastActionAt,
        status,
        acceptedAt: p.accepted_at,
      };
    })
    .sort((a, b) =>
      // Avsluttet: rolig alfabetisk oversikt — ingen accent-topp-sortering av
      // ferdig-ikke-levert (#918). Aktivt: purre-kandidater øverst.
      isFinished
        ? a.name.localeCompare(b.name, 'nb')
        : SORT_ORDER[a.status] - SORT_ORDER[b.status] ||
          a.name.localeCompare(b.name, 'nb'),
    );

  const statusLabels: Record<DeliveryStatus, { label: string; className: string }> = {
    // Avsluttet (#918): «Ikke levert» som nøytralt faktum (muted), ikke accent-varsel.
    ready_not_delivered: isFinished
      ? { label: tDetail('statusNotSubmitted'), className: 'text-muted' }
      : { label: t('statusLabels.ready_not_delivered'), className: 'text-accent-text' },
    pending_approval: { label: t('statusLabels.pending_approval'), className: 'text-warning-text' },
    playing: { label: t('statusLabels.playing'), className: 'text-muted' },
    not_started: { label: t('statusLabels.not_started'), className: 'text-muted' },
    delivered: { label: t('statusLabels.delivered'), className: 'text-success-text' },
    withdrawn: { label: t('statusLabels.withdrawn'), className: 'text-muted' },
  };

  const rankable = players.filter((p) => !p.withdrawn_at);
  const deliveredCount = rankable.filter((p) => p.submitted_at != null).length;
  // #2017: the button and the banner must count the same. `previewReminder` is
  // exactly the selection `sendReminders` hits (#1891), so the button text can
  // never promise more reminders than the click sends.
  const preview = await previewReminder(id);
  const targetCount = preview.ok ? preview.targets : 0;
  // #2041: ⚠️ marks exactly the players the count covers — teammates, guests
  // and #1466 split-day players included — so the two cannot disagree.
  const targetUserIds = new Set(preview.ok ? preview.targetUserIds : []);
  const unconfirmedCount = players.filter(
    (p) => p.accepted_at == null && !p.withdrawn_at,
  ).length;

  const remindAction = remindUnsubmittedPlayers.bind(null, id);
  const remindUnconfirmedAction = remindUnconfirmedPlayers.bind(null, id);

  const remindedCount = sp.status === 'reminded' ? first(sp.count) : undefined;
  const unconfirmedRemindedCount =
    sp.status === 'reminded_unconfirmed' ? first(sp.count) : undefined;
  const showNotActiveError = first(sp.error) === 'not_active';

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/games/${id}`}
        kicker={t('topBarKicker')}
      />

      <BrassRibbon kicker={t('brassRibbon')} />

      <div className="px-1">
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          {localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale)}
        </h1>
        <p className="mt-1 font-sans text-xs tabular-nums text-muted">
          {t('deliveredSummary', { delivered: deliveredCount, total: rankable.length })}
          {!isFinished && targetCount > 0 && ` ${t('readyMissingDelivery', { count: targetCount })}`}
        </p>
      </div>

      {remindedCount !== undefined && (
        <div
          className="mt-4"
          data-testid="status-reminder-sent"
          data-count={Number(remindedCount)}
        >
          <Banner tone="success">
            {t('reminderSent', { count: Number(remindedCount) })}
          </Banner>
        </div>
      )}
      {unconfirmedRemindedCount !== undefined && (
        <div className="mt-4">
          <Banner tone="success">
            {t('unconfirmedReminderSent', { count: Number(unconfirmedRemindedCount) })}
          </Banner>
        </div>
      )}
      {showNotActiveError && (
        <div className="mt-4">
          <Banner tone="error">
            {t('notActiveError')}
          </Banner>
        </div>
      )}

      {/* Purre-seksjon — kun aktive spill. */}
      {isActive && (
        <section className="mt-5">
          <div className="rounded-xl border border-border bg-surface px-4 py-4">
            {targetCount > 0 ? (
              <>
                <p className="mb-3 font-sans text-[13px] leading-relaxed text-muted">
                  {t('remindReady', { count: targetCount })}
                </p>
                <RemindButton
                  remindAction={remindAction}
                  count={targetCount}
                  labelKey="remindButton"
                  confirmKey="remindConfirm"
                  testId="status-remind-button"
                />
              </>
            ) : (
              <p className="font-sans text-[13px] leading-relaxed text-muted">
                {t('remindNone', { totalHoles: expectedHoles })}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Ubekreftet-purre-seksjon — kun aktive spill med ubekreftede spillere (#918).
          På avsluttet/scheduled spill er det ingen handling igjen å purre. */}
      {isActive && unconfirmedCount > 0 && (
        <section className="mt-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-4">
            <p className="mb-3 font-sans text-[13px] leading-relaxed text-muted">
              {t('remindUnconfirmed', { count: unconfirmedCount })}
            </p>
            <RemindButton
              remindAction={remindUnconfirmedAction}
              count={unconfirmedCount}
              labelKey="purreUnconfirmedButton"
              confirmKey="purreUnconfirmedConfirm"
              testId="status-remind-unconfirmed-button"
            />
          </div>
        </section>
      )}

      {/* Spiller-liste */}
      <section className="mt-5">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('heading')}
        </p>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            {t('emptyState')}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {rows.map((r) => {
              const meta = statusLabels[r.status];
              const isTarget = targetUserIds.has(r.userId);
              return (
                <li
                  key={r.userId}
                  data-testid="status-player-row"
                  data-userid={r.userId}
                  data-holes-filled={r.holesFilled}
                  className="flex items-center justify-between gap-3 border-t px-3.5 py-3 first:border-t-0"
                  style={{ borderColor: 'var(--row-divider-warm)' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-sans text-[14px] font-medium text-text">
                        {r.displayName}
                      </p>
                      {r.acceptedAt == null && (
                        <UnconfirmedBadge />
                      )}
                    </div>
                    <p className="mt-0.5 font-sans text-[11.5px] text-muted">
                      {r.lastActionAt
                        ? t('lastAction', { relative: formatRelativeLocale(r.lastActionAt, locale) })
                        : t('noActions')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-sans text-[12px] font-semibold ${meta.className}`}
                    >
                      {isTarget && !isFinished ? '⚠️ ' : ''}
                      {meta.label}
                    </p>
                    <p className="mt-0.5 font-sans text-[11px] tabular-nums text-muted">
                      {t('hullCount', { filled: r.holesFilled, total: expectedHoles })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
