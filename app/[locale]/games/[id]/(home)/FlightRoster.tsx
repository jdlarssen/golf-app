import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/Skeleton';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';
import { firstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import { getGameContext } from './gameContext';

type FlightRosterRow = {
  user_id: string;
  flight_number: number | null;
  accepted_at: string | null;
  users: {
    // `name` is null for pending invitees per migration 0014. The flight
    // roster only renders for active games, and the publish-gate (Task 7)
    // prevents a game from leaving 'draft' with pending players on the
    // roster — so in practice this is always set here. Kept nullable to
    // match the DB column and stay safe against future flows.
    name: string | null;
    nickname: string | null;
    hcp_index: number | string | null;
  } | null;
};

export async function FlightRoster({
  gameId,
  flightNumber,
  currentUserId,
  testId,
}: {
  gameId: string;
  /** null betyr «hele spillet» (singleFlight-modus — #543). */
  flightNumber: number | null;
  currentUserId: string;
  /** data-testid til <ul>-elementet — kun for e2e-guards, ikke produksjon. */
  testId?: string;
}) {
  const { supabase } = await getGameContext();
  // #543: flightNumber=null betyr singleFlight → hent alle, ingen flight-filter.
  const query = supabase
    .from('game_players')
    .select(
      'user_id, flight_number, accepted_at, users!game_players_user_id_fkey(name, nickname, hcp_index)',
    )
    .eq('game_id', gameId)
    .order('user_id');
  const { data: flightRows } = await (
    flightNumber != null ? query.eq('flight_number', flightNumber) : query
  ).returns<FlightRosterRow[]>();

  const tHome = await getTranslations('game.home');
  const flight = (flightRows ?? []).map((row) => ({
    userId: row.user_id,
    isCurrentUser: row.user_id === currentUserId,
    name: row.users?.name ?? tHome('unknownPlayer'),
    hcpIndex:
      row.users?.hcp_index == null ? null : Number(row.users.hcp_index),
    acceptedAt: row.accepted_at,
  }));

  return (
    <ul className="mt-2 flex flex-col gap-2" data-testid={testId}>
      {flight.map((p) => (
        <li key={p.userId} className="flex items-center gap-3">
          {/*
            E5 dark-mode pass: inactive avatar uses bg-surface (not
            bg-bg). In dark mode bg-bg matches the page bg
            (--bg #0f1612), so the avatar would disappear into the
            layout with only the border visible — a hole punched in
            the page. bg-surface (--surface #1a2e1f in dark) sits as a
            slightly lighter forest disc against the page bg. Light
            mode is unchanged in feel: bg-surface (#ffffff) on the
            --bg linen still reads as a paper-on-paper subtle disc.
          */}
          <span
            className={`shrink-0 w-7 h-7 rounded-full grid place-items-center font-serif text-[12px] font-medium ${
              p.isCurrentUser
                ? 'bg-primary text-white dark:text-bg'
                : 'bg-surface text-text border border-border'
            }`}
          >
            {nameInitials(p.name)}
          </span>
          <span
            className={`flex-1 truncate text-[13.5px] ${p.isCurrentUser ? 'font-semibold' : ''}`}
          >
            {firstName(p.name) ?? p.name}
            {p.isCurrentUser && (
              <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent ml-2">
                {tHome('youLabel')}
              </span>
            )}
          </span>
          {p.acceptedAt == null && !p.isCurrentUser && (
            <UnconfirmedBadge className="shrink-0" />
          )}
          <span className="shrink-0 text-xs text-muted tabular-nums">
            HCP {p.hcpIndex != null ? p.hcpIndex.toFixed(1) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FlightRosterSkeleton() {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="shrink-0 h-7 w-7 rounded-full" delay={i * 90} />
          <Skeleton className="flex-1 h-4" delay={i * 90 + 30} />
          <Skeleton className="shrink-0 h-3 w-14" delay={i * 90 + 60} />
        </li>
      ))}
    </ul>
  );
}
