import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { redirect } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
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
import { HandicapChip } from '@/components/handicap/HandicapChip';
import { firstName } from '@/lib/firstName';
import {
  formatTeeOffDateLocale,
  formatTeeOffTimeLocale,
} from '@/lib/i18n/format';
import { getFinishedGamesForUser } from '@/lib/games/getFinishedGamesForUser';
import { localizeGameName } from '@/lib/games/autoGameName';
import { FinishedGameCard } from '@/components/games/FinishedGameCard';
import { HomeDiscoverySection } from './HomeDiscoverySection';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import type { AppLocale } from '@/i18n/routing';

type SearchParams = Promise<{
  profile?: string | string[];
  // #428: set by the creator delete-flow (`/?deleted=<spillnavn>`) so we can
  // confirm the deletion here — there's no «Mine spill»-hub to land on yet.
  deleted?: string | string[];
}>;

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
  const locale = (await getLocale()) as AppLocale;
  const { userId } = await getHomeContext();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const params = await searchParams;
  const profileUpdated = first(params.profile) === 'updated';
  const deletedGameName = first(params.deleted);

  const t = await getTranslations('home');

  return (
    <AppShell>
      {/* Brand-rad. Innboks-bjella er flyttet til bunn-nav-en (#355), så
          headeren er nå bare merket. */}
      <div className="mb-6">
        <BrandMark />
      </div>

      <InstallBanner />

      <Suspense fallback={null}>
        <ProductUpdateBanner userId={userId!} />
      </Suspense>

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">{t('profileUpdatedBanner')}</Banner>
        </div>
      )}

      {deletedGameName && (
        <div className="mb-4">
          <Banner tone="success">{t('gameDeletedBanner', { name: deletedGameName })}</Banner>
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
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('home');
  const tStatus = await getTranslations('gameStatus');

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
  const [profileRes, rawActiveRes, finishedGames] = await Promise.all([
    supabase
      .from('users')
      .select(
        'name, email, profile_completed_at, hcp_index, handicap_updated_at',
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
    // #571: finished games via the shared helper (same fetch the /spill-arkiv
    // page uses), already filtered + sorted newest-first (byEndedAtDesc).
    getFinishedGamesForUser(supabase, userId!),
  ]);

  const { data: profile, error: profileError } = profileRes;

  // Old logic was: "no row" means not yet onboarded — but the auth.users trigger
  // now pre-creates a placeholder row, so check the completion timestamp instead.
  if (profileError) {
    throw profileError;
  }
  if (!profile?.profile_completed_at) {
    redirect({ href: '/complete-profile', locale });
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

  const isEmptyState =
    activeGames.length === 0 && finishedGames.length === 0;

  // Løft pågående runder øverst (#363): et aktivt spill skal ikke være bare
  // ett kort blant flere. Splitt på status='active' vs. resten (planlagte).
  const inProgressGames = activeGames.filter((g) => g.status === 'active');
  const upcomingGames = activeGames.filter((g) => g.status !== 'active');
  const firstNameValue = firstName(profile?.name) ?? t('playerFallback');
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
  // #392: arrangering bor i Klubbhuset nå (Spill/Baner-seksjonene inne i
  // /admin), nådd via den universelle bunn-nav-fanen. Hjem bærer ingen create-
  // dører eller Sekretariat/Klubbhus-snarveier lenger — det er play + discover-
  // navet. Tom-tilstanden peker en fersk bruker mot Klubbhuset under.

  // Discovery i tom-tilstand: vis åpne turneringer en fersk spiller kan bli med
  // i, ved siden av pekeren til Klubbhuset for å arrangere egne.
  const discoveryData =
    isEmptyState && userId ? await getDiscoverableGames(userId) : null;
  const hasDiscoveryContent =
    (discoveryData?.clubGames.length ?? 0) > 0 ||
    (discoveryData?.openGames.length ?? 0) > 0 ||
    (discoveryData?.friendGames.length ?? 0) > 0 ||
    (discoveryData?.pendingRequests.length ?? 0) > 0;

  if (isEmptyState) {
    return (
      <>
        <section className="flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            <PinFlag size={72} className="text-primary dark:text-text" />
          </ChampagneMedallion>
          <Kicker tone="accent" className="mb-2.5">
            {t('emptyKicker')}
          </Kicker>
          <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
            {t('emptyWelcome', { name: firstNameValue })}
          </h1>
          <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[280px]">
            {hasDiscoveryContent
              ? t('emptyBodyWithDiscovery')
              : t('emptyBodyNoDiscovery')}
          </p>
          {handicapChip && <div className="mt-5">{handicapChip}</div>}
          <div className="mt-8 w-full max-w-[280px]">
            <LinkButton href="/admin" full>
              {t('emptyOpenClubhouse')}
            </LinkButton>
          </div>
          <PullQuote className="mt-8">
            {t('emptyPullQuote')}
          </PullQuote>
        </section>

        {discoveryData && hasDiscoveryContent && (
          <HomeDiscoverySection data={discoveryData} />
        )}
      </>
    );
  }

  // Felles kort-render for «Pågår nå» + «Mine spill». `accent` gir det
  // pågående spillet en champagne-ramme så det skiller seg ut (#363).
  const renderGameCard = (g: (typeof activeGames)[number], accent: boolean) => (
    <SmartLink key={g.id} href={`/games/${g.id}`} className="block">
      <Card
        className={`min-h-[44px] transition-colors p-5 ${
          accent ? 'border-accent' : 'hover:border-primary/30'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
              {localizeGameName(g.name, g.courses?.name ?? null, locale)}
            </span>
            {g.courses?.name && (
              <span className="block text-xs text-muted mt-1 truncate">
                {g.courses.name}
              </span>
            )}
            {g.scheduled_tee_off_at &&
              (() => {
                const d = new Date(g.scheduled_tee_off_at);
                return (
                  <span className="block text-xs text-muted mt-1 tabular-nums truncate">
                    {formatTeeOffDateLocale(d, locale)} {t('teeOffSeparator')} {formatTeeOffTimeLocale(d, locale)}
                  </span>
                );
              })()}
            <span className="block text-xs text-muted mt-1 truncate">
              {t('teamFlight', { teamNumber: g.teamNumber, flightNumber: g.flightNumber })}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusPill status={g.status} label={tStatus(g.status)} />
            <span aria-hidden className="text-muted">
              →
            </span>
          </div>
        </div>
      </Card>
    </SmartLink>
  );

  return (
    <>
      <PageHeader
        title={t('greeting', { name: profile?.name ?? t('playerFallback') })}
        action={handicapChip}
      />

      <nav className="space-y-6">
        {inProgressGames.length > 0 && (
          <Section label={t('sectionInProgress')}>
            {inProgressGames.map((g) => renderGameCard(g, true))}
          </Section>
        )}

        {upcomingGames.length > 0 && (
          <Section label={t('sectionMyGames')}>
            {upcomingGames.map((g) => renderGameCard(g, false))}
          </Section>
        )}

        {/* Vedvarende «Finn turneringer»-inngang (#357, #392, #500). Hjem er
            play + discover-navet (arrangering bor i Klubbhuset), så alle
            innloggede kan oppdage åpne turneringer herfra — rett under egne
            spill, over de avsluttede. */}
        <Section label={t('sectionFindTournaments')}>
          <SmartLink href="/finn-turneringer" className="block">
            <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
              <span className="text-base font-medium text-text">
                {t('discoverCard')}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        </Section>

        {finishedGames.length > 0 && (
          <Section label={t('sectionFinished')}>
            {/* #571: hjem er play + discover-navet, ikke et arkiv. Vis de
                siste 5; lenk til /spill-arkiv for resten når det finnes flere. */}
            {finishedGames.slice(0, 5).map((g) => (
              <FinishedGameCard key={g.id} game={g} />
            ))}
            {finishedGames.length > 5 && (
              <SmartLink href="/spill-arkiv" className="block">
                <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
                  <span className="text-base font-medium text-text">
                    {t('sectionFinishedShowAll')}
                  </span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </Card>
              </SmartLink>
            )}
          </Section>
        )}

      </nav>
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
