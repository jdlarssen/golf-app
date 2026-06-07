import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { firstName } from '@/lib/firstName';
import { formatRelativeNb } from '@/lib/format/relativeTimeNb';
import {
  classifyDeliveryStatus,
  isDeliveryReminderTarget,
  TOTAL_HOLES,
  type DeliveryStatus,
} from '@/lib/games/deliveryStatus';
import { remindUnsubmittedPlayers, remindUnconfirmedPlayers } from './actions';
import { RemindButton } from './RemindButton';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';

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
};

type PlayerRow = {
  user_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { name: string | null; nickname: string | null; email: string } | null;
};

type ScoreRow = { user_id: string; hole_number: number; updated_at: string };

// Badge-label + farge per status. Ferdig-men-ikke-levert (purre-kandidaten)
// får champagne-aksenten så admin ser hvem som mangler med ett blikk.
const STATUS_META: Record<DeliveryStatus, { label: string; className: string }> =
  {
    ready_not_delivered: { label: 'Ferdig, ikke levert', className: 'text-accent' },
    pending_approval: { label: 'Venter godkjenning', className: 'text-warning' },
    playing: { label: 'Spiller', className: 'text-muted' },
    not_started: { label: 'Ikke startet', className: 'text-muted' },
    delivered: { label: 'Levert', className: 'text-success' },
    withdrawn: { label: 'Trukket', className: 'text-muted' },
  };

// Sorter purre-kandidatene øverst, så de som fortsatt spiller, deretter resten.
const SORT_ORDER: Record<DeliveryStatus, number> = {
  ready_not_delivered: 0,
  playing: 1,
  not_started: 2,
  pending_approval: 3,
  delivered: 4,
  withdrawn: 5,
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GameStatusPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, require_peer_approval')
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  const [playersRes, scoresRes] = await Promise.all([
    supabase
      .from('game_players')
      .select(
        'user_id, submitted_at, approved_at, withdrawn_at, accepted_at, users!game_players_user_id_fkey(name, nickname, email)',
      )
      .eq('game_id', id)
      .returns<PlayerRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, updated_at')
      .eq('game_id', id)
      .not('strokes', 'is', null)
      .returns<ScoreRow[]>(),
  ]);

  const players = playersRes.data ?? [];
  const scores = scoresRes.data ?? [];

  // Aggreger per spiller: antall hull med registrert slag + siste registrering
  // (max updated_at). Ingen strokes-verdier hentes — ingen spoiler.
  const filledByUser = new Map<string, number>();
  const lastActionByUser = new Map<string, string>();
  for (const s of scores) {
    filledByUser.set(s.user_id, (filledByUser.get(s.user_id) ?? 0) + 1);
    const prev = lastActionByUser.get(s.user_id);
    if (!prev || s.updated_at > prev) lastActionByUser.set(s.user_id, s.updated_at);
  }

  const rows = players
    .map((p) => {
      const holesFilled = filledByUser.get(p.user_id) ?? 0;
      const status = classifyDeliveryStatus({
        holesFilled,
        submittedAt: p.submitted_at,
        approvedAt: p.approved_at,
        withdrawnAt: p.withdrawn_at,
        requirePeerApproval: game.require_peer_approval,
      });
      const fullName = p.users?.name ?? p.users?.email ?? '(ukjent spiller)';
      return {
        userId: p.user_id,
        name: fullName,
        displayName: firstName(fullName) ?? fullName,
        holesFilled,
        lastActionAt: lastActionByUser.get(p.user_id) ?? null,
        status,
        acceptedAt: p.accepted_at,
      };
    })
    .sort(
      (a, b) =>
        SORT_ORDER[a.status] - SORT_ORDER[b.status] ||
        a.name.localeCompare(b.name, 'nb'),
    );

  const rankable = players.filter((p) => !p.withdrawn_at);
  const deliveredCount = rankable.filter((p) => p.submitted_at != null).length;
  const targetCount = rows.filter((r) =>
    isDeliveryReminderTarget(r.status),
  ).length;
  const unconfirmedCount = players.filter(
    (p) => p.accepted_at == null && !p.withdrawn_at,
  ).length;

  const isActive = game.status === 'active';
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
        kicker="Spillerstatus"
      />

      <BrassRibbon kicker="Spillerstatus" />

      <div className="px-1">
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          {game.name}
        </h1>
        <p className="mt-1 font-sans text-xs tabular-nums text-muted">
          Levert {deliveredCount} / {rankable.length}
          {targetCount > 0 && ` · ${targetCount} ferdige mangler levering`}
        </p>
      </div>

      {remindedCount !== undefined && (
        <div className="mt-4">
          <Banner tone="success">
            {remindedCount === '1'
              ? '✓ Påminnelse sendt til 1 spiller.'
              : `✓ Påminnelse sendt til ${remindedCount} spillere.`}
          </Banner>
        </div>
      )}
      {unconfirmedRemindedCount !== undefined && (
        <div className="mt-4">
          <Banner tone="success">
            {unconfirmedRemindedCount === '1'
              ? '✓ Bekreftelses-påminnelse sendt til 1 spiller.'
              : `✓ Bekreftelses-påminnelse sendt til ${unconfirmedRemindedCount} spillere.`}
          </Banner>
        </div>
      )}
      {showNotActiveError && (
        <div className="mt-4">
          <Banner tone="error">
            Spillet er ikke aktivt lenger. Du kan ikke sende påminnelser.
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
                  {targetCount === 1
                    ? '1 spiller har gått ferdig, men ikke levert scorekortet. Send en påminnelse om å levere.'
                    : `${targetCount} spillere har gått ferdig, men ikke levert scorekortet. Send en påminnelse om å levere.`}
                </p>
                <RemindButton remindAction={remindAction} count={targetCount} />
              </>
            ) : (
              <p className="font-sans text-[13px] leading-relaxed text-muted">
                Ingen er ferdige uten å ha levert akkurat nå. Spillere får
                automatisk en påminnelse når de har tastet inn alle{' '}
                {TOTAL_HOLES} hull.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Ubekreftet-purre-seksjon — kun spill med ubekreftede spillere. */}
      {unconfirmedCount > 0 && (
        <section className="mt-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-4">
            <p className="mb-3 font-sans text-[13px] leading-relaxed text-muted">
              {unconfirmedCount === 1
                ? '1 spiller har ikke bekreftet deltakelse ennå. Send en påminnelse.'
                : `${unconfirmedCount} spillere har ikke bekreftet deltakelse ennå. Send en påminnelse.`}
            </p>
            <RemindButton
              remindAction={remindUnconfirmedAction}
              count={unconfirmedCount}
              label={
                unconfirmedCount === 1
                  ? 'Purr 1 ubekreftet spiller'
                  : `Purr ${unconfirmedCount} ubekreftede spillere`
              }
              confirmText={
                unconfirmedCount === 1
                  ? 'Sende bekreftelses-påminnelse til 1 spiller?'
                  : `Sende bekreftelses-påminnelse til ${unconfirmedCount} spillere?`
              }
            />
          </div>
        </section>
      )}

      {/* Spiller-liste */}
      <section className="mt-5">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Spillere
        </p>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            Ingen spillere ennå.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {rows.map((r) => {
              const meta = STATUS_META[r.status];
              const isTarget = isDeliveryReminderTarget(r.status);
              return (
                <li
                  key={r.userId}
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
                        ? `Siste registrering ${formatRelativeNb(r.lastActionAt)}`
                        : 'Ingen registreringer ennå'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-sans text-[12px] font-semibold ${meta.className}`}
                    >
                      {isTarget ? '⚠️ ' : ''}
                      {meta.label}
                    </p>
                    <p className="mt-0.5 font-sans text-[11px] tabular-nums text-muted">
                      {r.holesFilled}/{TOTAL_HOLES} hull
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
