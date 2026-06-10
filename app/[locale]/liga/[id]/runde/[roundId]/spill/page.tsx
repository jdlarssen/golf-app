import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getServerClient } from '@/lib/supabase/server';
import { formatShortDateNbWithYear } from '@/lib/format/date';
import { RoundStartClient } from './RoundStartClient';


type Params = Promise<{ id: string; roundId: string }>;

function windowStatus(
  opensAt: string,
  closesAt: string,
): 'open' | 'upcoming' | 'closed' {
  const now = Date.now();
  if (now < new Date(opensAt).getTime()) return 'upcoming';
  if (now > new Date(closesAt).getTime()) return 'closed';
  return 'open';
}

function fmtWindow(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return formatShortDateNbWithYear(d);
}

export default async function RoundSpillPage({ params }: { params: Params }) {
  const { id: leagueId, roundId } = await params;

  const snapshot = await getLigaSnapshot(leagueId);
  if (!snapshot) redirect(`/liga/${leagueId}`);

  const { league, rounds, participants } = snapshot;

  const round = rounds.find((r) => r.id === roundId);
  if (!round) redirect(`/liga/${leagueId}`);

  // Resolve current user.
  let currentUserId = await getProxyVerifiedUserId();
  if (!currentUserId) {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  }

  // Must be a participant.
  const isParticipant =
    currentUserId !== null &&
    participants.some((p) => p.userId === currentUserId);
  if (!isParticipant) redirect(`/liga/${leagueId}`);

  const ws = windowStatus(round.opensAt, round.closesAt);

  // Co-players = all participants except the current user.
  const coPlayers = participants.filter((p) => p.userId !== currentUserId);

  return (
    <AppShell>
      <TopBar
        backHref={`/liga/${leagueId}`}
        backLabel={league.name}
        kicker="Start runde"
        userId={currentUserId}
      />

      <header className="mb-6">
        <h1 className="font-serif text-2xl text-text leading-tight tracking-[-0.015em]">
          {round.label}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fmtWindow(round.opensAt)} – {fmtWindow(round.closesAt)}
        </p>
      </header>

      {/* Window not open — show message + back */}
      {ws !== 'open' && (
        <Card className="space-y-4">
          <p className="text-sm text-text">
            {ws === 'upcoming'
              ? 'Runden er ikke åpen ennå. Kom tilbake når vinduet starter.'
              : 'Runden er stengt for innlevering. Ta kontakt med admin hvis du mener dette er feil.'}
          </p>
          <LinkButton href={`/liga/${leagueId}`} variant="secondary" full>
            Tilbake til liga
          </LinkButton>
        </Card>
      )}

      {/* Round not ready (no course/tee) */}
      {ws === 'open' && (!round.courseId || !round.teeBoxId) && (
        <Card className="space-y-4">
          <p className="text-sm text-text">
            Runden mangler bane eller tee — admin fullfører oppsettet snart.
          </p>
          <LinkButton href={`/liga/${leagueId}`} variant="secondary" full>
            Tilbake til liga
          </LinkButton>
        </Card>
      )}

      {/* Ready to start */}
      {ws === 'open' && round.courseId && round.teeBoxId && (
        <Card>
          <p className="text-sm text-muted mb-5">
            Velg hvem du spiller med. Du trenger minst én medspiller (markørregelen).
          </p>
          <RoundStartClient roundId={roundId} coPlayers={coPlayers} />
        </Card>
      )}
    </AppShell>
  );
}
