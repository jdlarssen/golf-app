import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { maybeAutoConfirmParticipation } from '@/lib/games/confirmParticipation';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { localizeGameName } from '@/lib/games/autoGameName';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { TeamDashboardClient } from './TeamDashboardClient';
import { loadTeamDashboard } from '@/lib/games/teamDashboardCore';

type Params = Promise<{ shortId: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: 'signup' });
  return { title: t('teamDashMetaTitle') };
}

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
  const locale = await getLocale();
  const t = await getTranslations('signup');
  const game = await getGameByShortId(shortId);
  if (!game) {
    notFound();
  }
  // #2445: a draft answers like a game that does not exist, for everyone.
  if (game.status === 'draft') {
    notFound();
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=/signup/${shortId}/team`, locale });
  }

  // #2201: opening the team page marks the game's `team_member_withdrew` varsler
  // read. Keyed on the game id (the link itself uses the short id).
  // #2759: it also confirms a seat the captain gave you, as the game's page does
  // (#463), and only then checks the `team_invite` that waits for it.
  // The app's route runs the same pair through `onTeamPageVisit` (#2840).
  after(async () => {
    await maybeAutoConfirmParticipation({ gameId: game.id, userId: user.id });
    await markReadOnVisit({ userId: user.id, surface: 'teamSignup', entityId: game.id });
  });

  // #2840: the read lives in lib/games/teamDashboardCore, shared with the app.
  const view = await loadTeamDashboard(shortId, user.id);
  if (view.kind === 'not_found') {
    notFound();
  }
  const gameName = localizeGameName(view.game.name, view.game.courseName, locale);

  if (view.kind === 'no_team') {
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

  if (view.kind === 'team_unknown') {
    // Owner's decision on #1343: two stop variants. `noCaptain` means the game
    // has no active captain at all, so there is nobody to ask for a team
    // invitation and the text points at your own team instead.
    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />
        <Card>
          <div
            className="space-y-4"
            data-testid={
              view.noCaptain ? 'team-stop-no-captain' : 'team-stop-unknown-team'
            }
          >
            <Banner tone="info">
              {view.noCaptain
                ? t('teamDashNoCaptainBanner')
                : t('teamDashTeamUnknownBanner')}
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

  if (view.kind === 'invited_unknown') {
    // Landed here from the mail link a captain sent while the address was
    // unknown (before #2840).
    return (
      <AppShell>
        <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />
        <Card>
          <div className="space-y-4">
            <h2 className="font-serif text-[20px] font-medium text-text">
              {t('teamDashInvitedHeading', { gameName })}
            </h2>
            <TeamDashboardClient
              mode="invited_unknown"
              shortId={shortId}
              invitationId={view.invitationId}
              joinEffect={view.game.joinEffect}
              teamName={view.teamName ?? undefined}
              captainName={view.captainName ?? undefined}
            />
          </div>
        </Card>
      </AppShell>
    );
  }

  if (view.kind === 'solo') {
    // A solo request should not end up on the team page; a friendly note if
    // it does.
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

  const teamName = view.teamName ?? gameName;

  return (
    <AppShell>
      <TopBar backHref={`/signup/${shortId}`} back="history" kicker={t('teamDashKicker')} />

      <div className="space-y-5">
        <header className="px-1">
          <p className="font-sans text-sm font-medium text-muted">
            {gameName}
          </p>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-snug tracking-[-0.015em] text-text">
            {teamName}
          </h1>
        </header>

        {/* #543: stengt påmelding — aksept-handlinger avvises server-side
            med signup_closed; banneret forklarer hvorfor på forhånd. */}
        {view.game.signupsClosed && (
          <Banner tone="info">
            {t('teamDashSignupsClosedBanner')}
          </Banner>
        )}

        <Card>
          <TeamDashboardClient
            mode={view.kind}
            shortId={shortId}
            myRowId={view.myRowId}
            myStatus={view.myStatus}
            joinEffect={view.game.joinEffect}
            captain={
              view.captain
                ? {
                    ...view.captain,
                    displayName: view.captain.displayName ?? t('teamDashCaptainLabel'),
                  }
                : null
            }
            members={view.members.map((m) => ({
              ...m,
              displayName: m.displayName ?? t('teamDashMemberLabel'),
            }))}
          />
        </Card>
      </div>
    </AppShell>
  );
}
