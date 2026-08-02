import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { localizeGameName } from '@/lib/games/autoGameName';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { TeamDashboardClient } from './TeamDashboardClient';
import {
  getCaptainDisplayName,
  pickCaptainRequest,
  pickPendingInvitation,
} from './captainLookup';

type Params = Promise<{ shortId: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: 'signup' });
  return { title: t('teamDashMetaTitle') };
}

type TeamMemberRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  is_team_captain: boolean;
  team_name: string | null;
  team_request_id: string | null;
};

type PendingInvitation = {
  id: string;
  email: string;
  invited_by: string | null;
};

type CaptainRequestRow = {
  id: string;
  user_id: string;
  team_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
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
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('signup');
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
    redirect({ href: `/login?next=/signup/${shortId}/team`, locale });
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
  let pendingInvitation: PendingInvitation | null = null;
  let captainRows: CaptainRequestRow[] = [];
  if (!myRow) {
    const { data: userRow } = await admin
      .from('users')
      .select('email')
      .eq('id', user!.id)
      .maybeSingle<{ email: string }>();
    if (userRow?.email) {
      // Ingen unique på (email, game_id): både arrangøren og en kaptein kan ha
      // invitert samme e-post. `.maybeSingle()` ville feilet med PGRST116 og
      // sendt brukeren i en blindvei — vi henter alle åpne og lar
      // `pickPendingInvitation` velge (#1343).
      const { data: invitations } = await admin
        .from('invitations')
        .select('id, email, invited_by')
        .ilike('email', userRow.email)
        .eq('game_id', game.id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .returns<PendingInvitation[]>();
      if (invitations && invitations.length > 0) {
        // Kaptein-radene hentes FØR vi velger invitasjon: det er de som avgjør
        // hvilken invitasjon som gir et sikkert lag-treff. Tar vi bare den
        // nyeste, skygger arrangørens invitasjon for kapteinens (#1343).
        const { data: captains } = await admin
          .from('game_registration_requests')
          .select('id, user_id, team_name, status')
          .eq('game_id', game.id)
          .eq('is_team_captain', true)
          .in('status', ['pending', 'approved'])
          .order('created_at', { ascending: false })
          .returns<CaptainRequestRow[]>();
        captainRows = captains ?? [];
        pendingInvitation = pickPendingInvitation(
          invitations,
          captainRows.map((r) => r.user_id),
        );
      }
    }
  }

  if (!myRow && !pendingInvitation) {
    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />
        <Card>
          <Banner tone="info">
            {t('teamDashNoTeamBanner')}
          </Banner>
        </Card>
      </AppShell>
    );
  }

  // Hvis brukeren har en pending invitation men ingen request-rad,
  // rendrer vi attach-flyt. Disse landed her via mail-link-en kaptein
  // sendte da brukeren var ukjent.
  if (!myRow && pendingInvitation) {
    // Vi kobler kun på når vi VET hvilket lag det er: inviteren må selv være
    // kaptein i spillet. Traff vi bare fallback-heuristikken, stopper vi og
    // sier fra — å sette noen på feil lag er verre enn å be dem spørre
    // kapteinen (#1343). `captainRows` er alt hentet over.
    const picked = pickCaptainRequest(
      captainRows,
      pendingInvitation.invited_by,
    );
    if (picked?.source !== 'invited_by') {
      return (
        <AppShell>
          <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />
          <Card>
            <div className="space-y-4">
              <Banner tone="info">
                {t('teamDashTeamUnknownBanner')}
              </Banner>
              <LinkButton
                href={`/signup/${shortId}`}
                full
                variant="secondary"
              >
                {t('teamDashRegisterOwnTeamButton')}
              </LinkButton>
            </div>
          </Card>
        </AppShell>
      );
    }

    const captainName = await getCaptainDisplayName(picked.row.user_id);
    const invitedTeamName = picked.row.team_name;

    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />
        <Card>
          <div className="space-y-4">
            <h2 className="font-serif text-[20px] font-medium text-text">
              {t('teamDashInvitedHeading', { gameName: localizeGameName(game.name, game.courses?.name ?? null, locale) })}
            </h2>
            <TeamDashboardClient
              mode="invited_unknown"
              shortId={shortId}
              invitationId={pendingInvitation.id}
              joinEffect={joinEffect}
              teamName={invitedTeamName ?? undefined}
              captainName={captainName ?? undefined}
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
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />
        <Card>
          <Banner tone="info">
            {t('teamDashSoloPlayerBanner')}
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
  const teamName =
    captainRow?.team_name ??
    myRow!.team_name ??
    localizeGameName(game.name, game.courses?.name ?? null, locale);

  return (
    <AppShell>
      <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />

      <div className="space-y-5">
        <header className="px-1">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {localizeGameName(game.name, game.courses?.name ?? null, locale)}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {teamName}
          </h1>
        </header>

        {/* #543: stengt påmelding — aksept-handlinger avvises server-side
            med signup_closed; banneret forklarer hvorfor på forhånd. */}
        {game.signups_closed_at != null && game.status === 'scheduled' && (
          <Banner tone="info">
            {t('teamDashSignupsClosedBanner')}
          </Banner>
        )}

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
                      usersById.get(captainRow.user_id)?.name ?? t('teamDashCaptainLabel'),
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
