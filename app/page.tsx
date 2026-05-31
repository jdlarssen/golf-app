import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { BrandMark } from '@/components/ui/BrandMark';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
import { PinFlag } from '@/components/icons/PinFlag';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { ProductUpdateBanner } from '@/components/products/ProductUpdateBanner';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { HandicapChip } from '@/components/handicap/HandicapChip';
import { firstName } from '@/lib/firstName';
import { formatTeeOffDate, formatTeeOffTime } from '@/lib/format/teeOff';
import { STATUS_LABELS } from '@/lib/games/status';
import { CREATE_GAME_LABEL } from '@/lib/games/createGameLabel';
import { isTrustedCreator } from '@/lib/admin/trustedCreators';
import { HomeDiscoverySection } from './HomeDiscoverySection';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';

type SearchParams = Promise<{ profile?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

// Request-scoped Supabase client + verified user id. The user id is forwarded
// by proxy.ts (which already called auth.getUser to refresh the session) so
// we don't pay another Supabase Auth round-trip per page render.
const getHomeContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await getHomeContext();
  if (!userId) {
    redirect('/login');
  }

  const params = await searchParams;
  const profileUpdated = first(params.profile) === 'updated';

  return (
    <AppShell>
      {/* Header-rad: brand venstre, bjelle høyre. BrandMark er ikke en lenke
          så vi pakker den i en flex-rad sammen med NotificationBell-en så
          den lander på samme høyde som varselsbjella på indre sider med
          TopBar. */}
      <div className="mb-6 flex items-start justify-between">
        <BrandMark />
        <NotificationBell userId={userId} />
      </div>

      <InstallBanner />

      <Suspense fallback={null}>
        <ProductUpdateBanner userId={userId} />
      </Suspense>

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">✓ Profilen din er oppdatert.</Banner>
        </div>
      )}

      <Suspense fallback={<HomeBodySkeleton />}>
        <HomeBody />
      </Suspense>
    </AppShell>
  );
}

// ─── Body ────────────────────────────────────────────────────────────────

async function HomeBody() {
  const { supabase, userId } = await getHomeContext();

  type GameRow = {
    game_id: string;
    team_number: number;
    flight_number: number;
    games: {
      id: string;
      name: string;
      status: 'draft' | 'scheduled' | 'active' | 'finished';
      ended_at: string | null;
      scheduled_tee_off_at: string | null;
      courses: { name: string } | null;
    } | null;
  };

  // Parallel-fetch profile, active games, finished games — they don't depend
  // on each other and roughly triple-tripled the latency when run serially.
  const [profileRes, rawActiveRes, rawFinishedRes] = await Promise.all([
    supabase
      .from('users')
      .select(
        'name, email, is_admin, profile_completed_at, hcp_index, handicap_updated_at',
      )
      .eq('id', userId!)
      .single(),
    supabase
      .from('game_players')
      .select(
        'game_id, team_number, flight_number, games!inner(id, name, status, ended_at, scheduled_tee_off_at, courses(name))',
      )
      .eq('user_id', userId!)
      .in('games.status', ['draft', 'scheduled', 'active'])
      .returns<GameRow[]>(),
    supabase
      .from('game_players')
      .select(
        'game_id, team_number, games!inner(id, name, status, ended_at, scheduled_tee_off_at, courses(name))',
      )
      .eq('user_id', userId!)
      .eq('games.status', 'finished')
      .order('ended_at', { foreignTable: 'games', ascending: false })
      .returns<GameRow[]>(),
  ]);

  const { data: profile, error: profileError } = profileRes;

  // Old logic was: "no row" means not yet onboarded — but the auth.users trigger
  // now pre-creates a placeholder row, so check the completion timestamp instead.
  if (profileError) {
    throw profileError;
  }
  if (!profile?.profile_completed_at) {
    redirect('/complete-profile');
  }

  const activeGames = (rawActiveRes.data ?? [])
    .filter((row): row is GameRow & { games: NonNullable<GameRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({
      ...row.games,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
    }));

  const finishedGames = (rawFinishedRes.data ?? [])
    .filter((row): row is GameRow & { games: NonNullable<GameRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({
      ...row.games,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
    }));

  const isEmptyState =
    activeGames.length === 0 && finishedGames.length === 0;
  const firstNameValue = firstName(profile?.name) ?? 'spiller';
  // Always-visible handicap reflection (#209). Only render when we have
  // both fields — defensive against a degraded fetch.
  const handicapChip =
    profile?.hcp_index != null && profile?.handicap_updated_at ? (
      <HandicapChip
        hcpIndex={Number(profile.hcp_index)}
        handicapUpdatedAt={profile.handicap_updated_at}
        nextPath="/"
      />
    ) : null;
  // Trusted creators (#198 small-bet MVP) får samme «Opprett spill»-inngang
  // som admin, men ledes til /opprett-spill istedenfor /admin/games/new så
  // de slipper Sekretariat-shellen.
  const canCreateGame =
    profile?.is_admin === true || isTrustedCreator(profile?.email);

  // «Funn turneringer»-data hentes kun for non-admin når vi rendrer empty-state.
  // Brukes både til å bytte velkomst-teksten og til å rendre selve seksjonen
  // uten å hente data to ganger.
  const discoveryData =
    isEmptyState && !canCreateGame && userId
      ? await getDiscoverableGames(userId)
      : null;
  const hasDiscoveryContent =
    (discoveryData?.openGames.length ?? 0) > 0 ||
    (discoveryData?.pendingRequests.length ?? 0) > 0;

  if (isEmptyState) {
    return (
      <>
        <section className="flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            <PinFlag size={72} className="text-primary dark:text-text" />
          </ChampagneMedallion>
          <Kicker tone="accent" className="mb-2.5">
            KLUBBHUSET ER ÅPENT
          </Kicker>
          <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
            Velkommen, {firstNameValue}.
          </h1>
          <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[280px]">
            {canCreateGame
              ? 'Ingen turneringer enda. Sett opp første runde og kom i gang.'
              : hasDiscoveryContent
                ? 'Du er klar. Velg en turnering under, eller vent på en invitasjon.'
                : 'Du er klar. Be en arrangør om å invitere deg til neste runde.'}
          </p>
          {handicapChip && <div className="mt-5">{handicapChip}</div>}
          {canCreateGame && (
            <div className="mt-8 w-full max-w-[280px]">
              <LinkButton
                href={profile?.is_admin ? '/admin/games/new' : '/opprett-spill'}
                full
              >
                {CREATE_GAME_LABEL}
              </LinkButton>
            </div>
          )}
          <PullQuote className="mt-8">
            En god runde begynner med god planlegging.
          </PullQuote>
        </section>

        {discoveryData && hasDiscoveryContent && (
          <HomeDiscoverySection data={discoveryData} />
        )}

        <HomeUtilityFooter isAdmin={profile?.is_admin === true} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Hei, ${profile?.name ?? 'spiller'}.`}
        action={handicapChip}
      />

      {/* Fast Opprett-inngang — alltid synlig for de som kan opprette, ikke
          bare i tom-tilstand (#346). Samme etikett + rolle-routing som tom-
          CTA-en og spill-lista. */}
      {canCreateGame && (
        <div className="mb-6">
          <LinkButton
            href={profile?.is_admin ? '/admin/games/new' : '/opprett-spill'}
            full
          >
            {CREATE_GAME_LABEL}
          </LinkButton>
        </div>
      )}

      <nav className="space-y-6">
        {activeGames.length > 0 && (
          <Section label="Mine spill">
            {activeGames.map((g) => (
              <SmartLink key={g.id} href={`/games/${g.id}`} className="block">
                <Card className="min-h-[44px] hover:border-primary/30 transition-colors p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
                        {g.name}
                      </span>
                      {g.courses?.name && (
                        <span className="block text-xs text-muted mt-1 truncate">
                          {g.courses.name}
                        </span>
                      )}
                      {g.scheduled_tee_off_at && (() => {
                        const d = new Date(g.scheduled_tee_off_at);
                        return (
                          <span className="block text-xs text-muted mt-1 tabular-nums truncate">
                            {formatTeeOffDate(d)} kl. {formatTeeOffTime(d)}
                          </span>
                        );
                      })()}
                      <span className="block text-xs text-muted mt-1 truncate">
                        Lag {g.teamNumber} · Flight {g.flightNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusPill
                        status={g.status}
                        label={STATUS_LABELS[g.status]}
                      />
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </div>
                  </div>
                </Card>
              </SmartLink>
            ))}
          </Section>
        )}

        {finishedGames.length > 0 && (
          <Section label="Avsluttede spill">
            {finishedGames.map((g) => (
              <SmartLink
                key={g.id}
                href={`/games/${g.id}/leaderboard`}
                className="block"
              >
                <Card className="min-h-[44px] hover:border-primary/30 transition-colors p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
                        {g.name}
                      </span>
                      <span className="block text-xs text-muted mt-1 truncate">
                        {[g.courses?.name, 'Leaderboard']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span aria-hidden className="text-accent shrink-0">
                      🏆
                    </span>
                  </div>
                </Card>
              </SmartLink>
            ))}
          </Section>
        )}

        <Section label="Spillformer">
          <SmartLink href="/spillformer" className="block">
            <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
              <span className="text-base font-medium text-text">
                Slik spiller du formene
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        </Section>

      </nav>

      <p className="mt-10 text-xs text-muted text-center">
        Mer kommer her snart.
      </p>

      {/* Samme utility-footer i begge hjem-grener → én konsistent
          representasjon av Sekretariatet-lenken (#346). */}
      <HomeUtilityFooter isAdmin={profile?.is_admin === true} />
    </>
  );
}

// ─── Body skeleton ───────────────────────────────────────────────────────

function HomeBodySkeleton() {
  return (
    <>
      <div className="mb-6">
        <Skeleton className="h-9 w-3/5" />
      </div>

      <nav className="space-y-6">
        <SectionSkeleton labelWidth={80} cardCount={1} delay={0} />
        <SectionSkeleton labelWidth={140} cardCount={1} delay={120} />
        <SectionSkeleton labelWidth={60} cardCount={1} delay={240} />
      </nav>
    </>
  );
}

function SectionSkeleton({
  labelWidth,
  cardCount,
  delay,
}: {
  labelWidth: number;
  cardCount: number;
  delay: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Skeleton
          className="h-2.5"
          style={{ width: labelWidth }}
          delay={delay}
        />
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-[72px] rounded-2xl"
            delay={delay + 30 + i * 30}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Shared utility footer used by BOTH home states (#346). Gives the
 * Sekretariatet link one consistent representation and weight instead of the
 * old split (muted footer link in empty-state, accent Section card in
 * non-empty). Min profil + (admin) Sekretariatet + Logg ut, all muted.
 */
function HomeUtilityFooter({ isAdmin }: { isAdmin: boolean }) {
  return (
    <footer className="mt-14 pt-6 border-t border-border/60 dark:border-border/80">
      <ul className="flex flex-col gap-1 items-center">
        <li>
          <SmartLink
            href="/profile"
            className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-text transition-colors"
          >
            Min profil
          </SmartLink>
        </li>
        {isAdmin && (
          <li>
            <SmartLink
              href="/admin"
              className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-text transition-colors"
            >
              Sekretariatet
            </SmartLink>
          </li>
        )}
        <li>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-danger transition-colors"
            >
              Logg ut
            </button>
          </form>
        </li>
      </ul>
    </footer>
  );
}

function Section({
  label,
  accent = false,
  children,
}: {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
            accent ? 'text-accent' : 'text-muted'
          }`}
        >
          {label}
        </p>
        <div
          className={`h-px flex-1 ${accent ? 'bg-accent/30' : 'bg-border'}`}
        />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StatusPill({
  status,
  label,
}: {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  label: string;
}) {
  const classes =
    status === 'active'
      ? 'bg-primary-soft text-primary border-primary/20'
      : status === 'scheduled'
        ? 'bg-success/10 text-success border-success/30'
        : status === 'draft'
          ? 'bg-warning/10 text-warning border-warning/30'
          : 'bg-border/40 text-muted border-border';
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full border ${classes}`}
    >
      {label}
    </span>
  );
}
