import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { Banner } from '@/components/ui/Banner';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { maybeAutoConfirmLeagueParticipation } from '@/lib/league/confirmLeagueParticipation';
import { leagueSelfServiceState } from '@/lib/league/selfService';
import { joinClubLeague } from '@/lib/league/actions';
import type { LeagueStatus } from '@/lib/league/types';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getServerClient } from '@/lib/supabase/server';
import { LeagueStandingsPanel } from '@/components/league/LeagueStandingsPanel';
import { isPointsBasedFormat } from '@/lib/league/flightFormat';
import type { LeagueFormat } from '@/lib/league/types';
import { formatShortDateNbWithYear } from '@/lib/format/date';


type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/** Join-feilkoder fra join_club_league-RPC-en → norsk melding. */
const JOIN_ERROR_MESSAGES: Record<string, string> = {
  not_draft: 'Ligaen har allerede startet. Be klubb-admin om å legge deg til.',
  not_member: 'Du er ikke medlem av klubben.',
  not_club_league: 'Denne ligaen kan du ikke bli med i selv.',
  already_member: 'Du er allerede med i ligaen.',
  join_failed: 'Noe gikk galt. Prøv igjen.',
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Determine window status relative to now. */
function windowStatus(
  opensAt: string,
  closesAt: string,
): 'open' | 'upcoming' | 'closed' {
  const now = Date.now();
  if (now < new Date(opensAt).getTime()) return 'upcoming';
  if (now > new Date(closesAt).getTime()) return 'closed';
  return 'open';
}

/**
 * Format an ISO date/timestamp string as a short Norwegian date.
 * For plain YYYY-MM-DD dates (season start/end), we parse as local time by
 * appending T12:00:00 (midday avoids any UTC-midnight edge near DST).
 * For timestamptz strings (round windows), we use them directly.
 */
function fmtWindow(iso: string): string {
  // Plain date: "2026-06-01" — no time component
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return formatShortDateNbWithYear(d);
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  active: 'Aktiv',
  finished: 'Avsluttet',
};

const WINDOW_CHIP: Record<
  'open' | 'upcoming' | 'closed',
  { label: string; style: React.CSSProperties }
> = {
  open: {
    label: 'Åpen',
    style: {
      background: 'var(--score-under-bg)',
      color: 'var(--score-under-fg)',
    },
  },
  upcoming: {
    label: 'Kommer',
    style: {
      background: 'var(--score-par-bg)',
      color: 'var(--score-par-fg)',
    },
  },
  closed: {
    label: 'Lukket',
    style: {
      background: 'var(--score-over2-bg)',
      color: 'var(--score-over2-fg)',
    },
  },
};

function WindowChip({ status }: { status: 'open' | 'upcoming' | 'closed' }) {
  const { label, style } = WINDOW_CHIP[status];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase"
      style={{ letterSpacing: '0.14em', ...style }}
    >
      {label}
    </span>
  );
}

function StatusChipLeague({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const style: React.CSSProperties =
    status === 'active'
      ? { background: 'var(--score-under-bg)', color: 'var(--score-under-fg)' }
      : status === 'finished'
        ? { background: 'var(--score-par-bg)', color: 'var(--score-par-fg)' }
        : { background: 'var(--score-over1-bg)', color: 'var(--score-over1-fg)' };

  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase"
      style={{ letterSpacing: '0.14em', ...style }}
    >
      {label}
    </span>
  );
}

export default async function LigaPublicPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;

  // Load snapshot (admin client — no auth needed for RLS bypass; route is
  // session-gated by proxy.ts already).
  const snapshot = await getLigaSnapshot(id);
  if (!snapshot) notFound();

  const { league, rounds, participants, standings } = snapshot;

  // Get current user id to check participation and show the "play" button.
  const userId = await getProxyVerifiedUserId();

  // If proxy header is missing, fall back to supabase.auth.getUser().
  let currentUserId = userId;
  if (!currentUserId) {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  }

  // #480: en klubb-scopet liga er kun synlig for klubbens medlemmer, deltakerne
  // og global admin. Snapshot-en bruker admin-client (RLS-bypass), så denne
  // gaten — ikke RLS — er det som skjuler klubb-ligaer på den lenke-delbare
  // siden for utenforstående.
  let isClubMember = false;
  if (league.group_id) {
    const isPart =
      currentUserId !== null &&
      participants.some((p) => p.userId === currentUserId);
    let allowed = isPart;
    if (!allowed && currentUserId) {
      const supabase = await getServerClient();
      const [{ data: membership }, { data: profile }] = await Promise.all([
        supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', league.group_id)
          .eq('user_id', currentUserId)
          .maybeSingle(),
        supabase
          .from('users')
          .select('is_admin')
          .eq('id', currentUserId)
          .maybeSingle(),
      ]);
      isClubMember = membership !== null;
      allowed = isClubMember || profile?.is_admin === true;
    }
    if (!allowed) notFound();
  }

  const me =
    currentUserId !== null
      ? participants.find((p) => p.userId === currentUserId)
      : undefined;
  const isParticipant = me !== undefined;

  // #463: å åpne liga-siden er en aktivitet = implisitt bekreftelse. Rydder
  // «Ikke bekreftet»-badgen for aktive deltakere. Deferert via after().
  if (me && me.acceptedAt == null) {
    after(() =>
      maybeAutoConfirmLeagueParticipation({ leagueId: id, userId: me.userId }),
    );
  }

  // #452 Fase 3: medlems-self-service. Knappene vises ut fra denne rene
  // predikaten; RPC-ene (0086) er sannheten ved klikk.
  const { canJoin, canLeave } = leagueSelfServiceState({
    groupId: league.group_id,
    status: league.status as LeagueStatus,
    isClubMember,
    isParticipant,
    hasPlayed: me?.hasPlayed ?? false,
  });
  const sp = await searchParams;
  const joinError = firstParam(sp.error);
  const joinErrorMessage = joinError ? JOIN_ERROR_MESSAGES[joinError] : undefined;

  return (
    <AppShell>
      <TopBar backHref="/" back="history" kicker="Liga" userId={currentUserId} />

      {/* Header */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-serif text-2xl text-text leading-tight tracking-[-0.015em]">
            {league.name}
          </h1>
          <StatusChipLeague status={league.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {fmtWindow(league.season_start)} – {fmtWindow(league.season_end)}
        </p>
      </header>

      {/* #452 Fase 3: medlems-self-service */}
      {joinErrorMessage && (
        <div className="mb-6">
          <Banner tone="error">{joinErrorMessage}</Banner>
        </div>
      )}
      {canJoin && (
        <section className="mb-8">
          <Card className="p-4 sm:p-5">
            <p className="font-serif text-base text-text">Bli med i ligaen</p>
            <p className="mt-1 mb-3 text-sm text-muted">
              Du er medlem i klubben. Meld deg på før ligaen starter.
            </p>
            <form action={joinClubLeague}>
              <input type="hidden" name="league_id" value={league.id} />
              <SubmitButton
                className="w-full sm:w-auto"
                pendingLabel="Melder deg på …"
              >
                Bli med i ligaen
              </SubmitButton>
            </form>
          </Card>
        </section>
      )}

      {/* Standings table */}
      <section className="mb-8">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
          Sesong-tabell
        </h2>
        <Card className="p-3 sm:p-4">
          <LeagueStandingsPanel
            standings={standings}
            rounds={rounds}
            participants={participants}
            standingsModel={league.standings_model}
            bestNCount={league.best_n_count}
            pointsBased={isPointsBasedFormat(league.format as LeagueFormat)}
          />
        </Card>
      </section>

      {/* Rounds list */}
      <section className="mb-6">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
          Runder
        </h2>
        {rounds.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">Ingen runder er satt opp ennå.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {rounds.map((round) => {
              const ws = windowStatus(round.opensAt, round.closesAt);
              const roundReady = round.courseId !== null && round.teeBoxId !== null;
              const canPlay = isParticipant && ws === 'open' && roundReady;

              return (
                <li key={round.id} data-testid="liga-round">
                  <Card className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                            Runde {round.sequence}
                          </span>
                          <WindowChip status={ws} />
                        </div>
                        <p className="font-serif text-base text-text">
                          {round.label}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {fmtWindow(round.opensAt)} – {fmtWindow(round.closesAt)}
                        </p>
                        {round.flightCount > 0 && (
                          <p className="mt-0.5 text-xs text-muted">
                            {round.flightCount}{' '}
                            {round.flightCount === 1 ? 'flight' : 'flights'} spilt
                          </p>
                        )}
                      </div>

                      {/* Action area */}
                      <div className="shrink-0 self-center">
                        {canPlay ? (
                          <LinkButton
                            href={`/liga/${id}/runde/${round.id}/spill`}
                            variant="primary"
                            className="text-sm px-4 py-2 min-h-[44px]"
                          >
                            Spill
                          </LinkButton>
                        ) : isParticipant && ws === 'open' && !roundReady ? (
                          <span className="text-xs text-muted italic">
                            Ikke klar ennå
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* #452 Fase 3: meld deg av (kun før spilt runde) */}
      {canLeave && (
        <div className="mb-6 text-center">
          <SmartLink
            href={`/liga/${id}/meld-av`}
            className="font-sans text-[13px] text-muted underline underline-offset-2 hover:text-text"
          >
            Meld deg av ligaen
          </SmartLink>
        </div>
      )}
    </AppShell>
  );
}
