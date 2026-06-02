import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { TeamDashboardClient } from './TeamDashboardClient';

export const metadata = {
  title: 'Mitt lag – Tørny',
};

type Params = Promise<{ shortId: string }>;

type TeamMemberRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  is_team_captain: boolean;
  team_name: string | null;
  team_request_id: string | null;
};

/**
 * Lag-oversikt for kapteinen og medspillerne (#199 chunks 8+9).
 *
 * To roller bruker samme side:
 *   - Kaptein: ser alle medspillere med status. Kan re-sende invitasjon
 *     til pending eller fjerne medspiller.
 *   - Medspiller: ser laget + kaptein, med aksepter/avslå-knapper hvis
 *     egen rad er pending.
 *
 * Det er også en tredje rolle: en ukjent som nettopp logget inn for
 * første gang via e-post-invitasjon (chunk 9-flyten). Den brukeren har
 * INGEN game_registration_requests-rad ennå (kapteinen opprettet bare
 * `invitations`-raden siden e-posten var ukjent). Vi detekterer det her
 * og tilbyr en "Bli med på lag"-knapp som kjører `attachToCaptainTeam`-
 * action-en og oppretter request + game_players-raden retrospektivt.
 */
export default async function TeamDashboardPage({
  params,
}: {
  params: Params;
}) {
  const { shortId } = await params;
  const game = await getGameByShortId(shortId);
  if (!game) {
    notFound();
  }

  // Hva «bli med» fører til: open → rett inn i spillet, ellers venter laget
  // på at arrangøren godkjenner. Styrer neste-steg-copy (#362).
  const joinEffect: 'instant' | 'approval' =
    game.registration_mode === 'open' ? 'instant' : 'approval';

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/signup/${shortId}/team`);
  }

  const admin = getAdminClient();

  // Brukerens egen rad — bestemmer rolle.
  const { data: myRow } = await admin
    .from('game_registration_requests')
    .select('id, user_id, status, is_team_captain, team_name, team_request_id')
    .eq('game_id', game.id)
    .eq('user_id', user!.id)
    .maybeSingle<TeamMemberRow>();

  // Hvis brukeren ikke har noen request-rad, sjekk om de har en åpen
  // invitations-rad for spillet — da kan vi tilby attach-knapp.
  let pendingInvitation: { id: string; email: string } | null = null;
  if (!myRow) {
    const { data: userRow } = await admin
      .from('users')
      .select('email')
      .eq('id', user!.id)
      .maybeSingle<{ email: string }>();
    if (userRow?.email) {
      const { data: inv } = await admin
        .from('invitations')
        .select('id, email')
        .ilike('email', userRow.email)
        .eq('game_id', game.id)
        .is('accepted_at', null)
        .maybeSingle<{ id: string; email: string }>();
      pendingInvitation = inv;
    }
  }

  if (!myRow && !pendingInvitation) {
    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker="Lag" />
        <Card>
          <Banner tone="info">
            Du har ikke et lag på dette spillet. Be kapteinen om å legge
            deg til, eller meld på et eget lag fra påmeldings-siden.
          </Banner>
        </Card>
      </AppShell>
    );
  }

  // Hvis brukeren har en pending invitation men ingen request-rad,
  // rendrer vi attach-flyt. Disse landed her via mail-link-en kaptein
  // sendte da brukeren var ukjent.
  if (!myRow && pendingInvitation) {
    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker="Lag" />
        <Card>
          <div className="space-y-4">
            <h2 className="font-serif text-[20px] font-medium text-text">
              Du er invitert til et lag i «{game.name}»
            </h2>
            <TeamDashboardClient
              mode="invited_unknown"
              shortId={shortId}
              invitationId={pendingInvitation.id}
              joinEffect={joinEffect}
            />
          </div>
        </Card>
      </AppShell>
    );
  }

  // Bygg lag-context: hvis brukeren er kaptein → de er kaptein-raden.
  // Hvis medspiller → hent kapteinens rad via team_request_id.
  const captainRequestId = myRow!.is_team_captain
    ? myRow!.id
    : myRow!.team_request_id;

  if (!captainRequestId) {
    // Solo-rad (ikke et lag) — bør egentlig ikke ende opp på team-siden,
    // men vi gir en vennlig melding hvis det skjer.
    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker="Lag" />
        <Card>
          <Banner tone="info">
            Du er påmeldt som solo-spiller. Det er ikke noe lag å vise her.
          </Banner>
        </Card>
      </AppShell>
    );
  }

  const { data: allRows } = await admin
    .from('game_registration_requests')
    .select('id, user_id, status, is_team_captain, team_name, team_request_id')
    .or(`id.eq.${captainRequestId},team_request_id.eq.${captainRequestId}`)
    .returns<TeamMemberRow[]>();

  const rows = allRows ?? [];
  const captainRow = rows.find((r) => r.is_team_captain);
  const memberRows = rows.filter((r) => !r.is_team_captain);

  // User-display lookup — best-effort.
  const userIds = rows.map((r) => r.user_id);
  const { data: userRows } = await admin
    .from('users')
    .select('id, name, email, nickname')
    .in('id', userIds)
    .returns<
      { id: string; name: string | null; email: string; nickname: string | null }[]
    >();
  const usersById = new Map(
    (userRows ?? []).map((u) => [
      u.id,
      {
        name: u.name?.trim() || u.email,
        email: u.email,
        nickname: u.nickname,
      },
    ]),
  );

  const isCaptain = myRow!.is_team_captain;
  const teamName = captainRow?.team_name ?? myRow!.team_name ?? 'Laget';

  return (
    <AppShell>
      <TopBar backHref={`/signup/${shortId}`} back="history" kicker="Lag" />

      <div className="space-y-5">
        <header className="px-1">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {game.name}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {teamName}
          </h1>
        </header>

        <Card>
          <TeamDashboardClient
            mode={isCaptain ? 'captain' : 'member'}
            shortId={shortId}
            myRowId={myRow!.id}
            myStatus={myRow!.status}
            joinEffect={joinEffect}
            captain={
              captainRow
                ? {
                    requestId: captainRow.id,
                    userId: captainRow.user_id,
                    displayName:
                      usersById.get(captainRow.user_id)?.name ?? 'Kaptein',
                    status: captainRow.status,
                  }
                : null
            }
            members={memberRows.map((r) => ({
              requestId: r.id,
              userId: r.user_id,
              displayName: usersById.get(r.user_id)?.name ?? r.user_id,
              status: r.status,
            }))}
          />
        </Card>
      </div>
    </AppShell>
  );
}
