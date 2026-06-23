import { first } from '@/lib/url/searchParams';
import { Suspense, cache, Children, isValidElement } from 'react';
import {
  type QueryData,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
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
import { formatTeeOffParts } from '@/lib/i18n/format';
import { teeOffProximity } from '@/lib/format/teeOffProximity';
import { getFinishedGamesForUser } from '@/lib/games/getFinishedGamesForUser';
import { localizeGameName } from '@/lib/games/autoGameName';
import { FinishedGameCard } from '@/components/games/FinishedGameCard';
import { GameRowCard, GameRowMetaLine } from '@/components/games/GameRowCard';
import { HomeDiscoverySection } from './HomeDiscoverySection';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import {
  getActiveGameCardData,
  type ActiveCardExtras,
} from '@/lib/games/getActiveGameCardData';
import type { ActiveCardState } from '@/lib/games/activeCardState';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { GameStatus } from '@/lib/games/status';
import type { AppLocale } from '@/i18n/routing';

type SearchParams = Promise<{
  profile?: string | string[];
  // #428: set by the creator delete-flow (`/?deleted=<spillnavn>`) so we can
  // confirm the deletion here — there's no «Mine spill»-hub to land on yet.
  deleted?: string | string[];
}>;

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

// The viewer's open games (draft/scheduled/active) with the embedded game +
// course. Defined as a query thunk so `GameRow` is DERIVED from the select
// string via `QueryData` — the select string is the single source of truth,
// so dropping a column tsc-fails its consumer instead of silently drifting
// (AGENTS.md trap #1, the class that drove #641/#647). `game_status` comes
// through as the generated enum, which keeps the StatusPill union honest.
const activeGamesQuery = (
  supabase: SupabaseClient<Database>,
  userId: string,
) =>
  supabase
    .from('game_players')
    .select(
      'game_id, team_number, flight_number, submitted_at, withdrawn_at, approved_at, games!inner(id, name, status, ended_at, scheduled_tee_off_at, require_peer_approval, game_mode, courses(name))',
    )
    .eq('user_id', userId)
    .in('games.status', ['draft', 'scheduled', 'active']);

type GameRow = QueryData<ReturnType<typeof activeGamesQuery>>[number];

async function HomeBody() {
  const { supabase, userId } = await getHomeContext();
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('home');
  const tStatus = await getTranslations('gameStatus');
  // #878: reuse the spill-hjem peer-approval strings (pendingApprovals/reviewLink)
  // for the Home nudge — same wording, one source of truth.
  const tGameHome = await getTranslations('game.home');

  // Parallel-fetch profile, active games, finished games — they don't depend
  // on each other and roughly triple-tripled the latency when run serially.
  const [profileRes, rawActiveRes, finishedGames, discoveryData] =
    await Promise.all([
      supabase
        .from('users')
        .select(
          'name, email, profile_completed_at, hcp_index, handicap_updated_at',
        )
        .eq('id', userId!)
        .single(),
      activeGamesQuery(supabase, userId!),
      // #571: finished games via the shared helper (same fetch the /spill-arkiv
      // page uses), already filtered + sorted newest-first (byEndedAtDesc).
      getFinishedGamesForUser(supabase, userId!),
      // #879: funn-feeden hentes for ALLE innloggede (ikke lenger gated på tom-
      // tilstand) og parallelt her, så den ikke legger til seriell latens.
      getDiscoverableGames(userId!),
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

  // #877: must throw BEFORE deriving activeGames/isEmptyState — otherwise a
  // failed fetch falls through to `[]`, computes as `isEmptyState`, and renders
  // the «start here» welcome over a real in-progress round. error.tsx catches
  // this and shows a «Noe gikk galt»-retry instead (mirrors profileError above).
  if (rawActiveRes.error) {
    throw rawActiveRes.error;
  }

  const activeGames = (rawActiveRes.data ?? []).map((row: GameRow) => ({
    ...row.games,
    // The generated types widen `games.game_mode` to plain `string`; the app
    // works in the narrower GameMode union. The query never broadens it at
    // runtime, so bridge the type here (honest cast at the data boundary).
    game_mode: row.games.game_mode as GameMode,
    // The query filters status to draft/scheduled/active, so a finished game
    // never reaches the StatusPill — narrow the type to match the runtime
    // invariant (and to keep the pill's prop type free of the dead branch).
    status: row.games.status as Exclude<GameStatus, 'finished'>,
    // team_number/flight_number are nullable in the schema but always assigned
    // for a joined player; the prior hand-typed GameRow asserted them non-null
    // and the teamFlight label still does — keep that exact assumption here.
    teamNumber: row.team_number as number,
    flightNumber: row.flight_number as number,
    submitted_at: row.submitted_at,
    withdrawn_at: row.withdrawn_at,
    approved_at: row.approved_at,
  }));

  const isEmptyState =
    activeGames.length === 0 && finishedGames.length === 0;

  // Løft pågående runder øverst (#363): et aktivt spill skal ikke være bare
  // ett kort blant flere. Splitt på status='active' vs. resten (planlagte).
  const inProgressGames = activeGames.filter((g) => g.status === 'active');
  // #880: sorter planlagte spill stigende på tee-off (nulls sist) så nærmeste
  // runde ligger øverst. `now` regnes ut én gang til relativ-merkingen under.
  const now = new Date();
  const upcomingGames = activeGames
    .filter((g) => g.status !== 'active')
    .sort((a, b) => {
      const at = a.scheduled_tee_off_at
        ? new Date(a.scheduled_tee_off_at).getTime()
        : Infinity;
      const bt = b.scheduled_tee_off_at
        ? new Date(b.scheduled_tee_off_at).getTime()
        : Infinity;
      return at - bt;
    });
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

  // #879: funn-feeden (hentet i Promise.all-en over) vises både i tom-tilstand
  // (full) og i fylt tilstand (kappet forhåndsvisning + «Se alle»-hale).
  const hasDiscoveryContent =
    discoveryData.clubGames.length > 0 ||
    discoveryData.openGames.length > 0 ||
    discoveryData.friendGames.length > 0 ||
    discoveryData.pendingRequests.length > 0;

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
          <h1 className="font-serif text-[30px] font-medium tracking-tight leading-tight text-text">
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

        {hasDiscoveryContent && (
          <HomeDiscoverySection data={discoveryData} />
        )}
      </>
    );
  }

  // #878: per-active-game card data — display state, «rett inn i runden»-href,
  // and peer-approval count. Bounded to the viewer's handful of active games.
  const activeCardData: Map<string, ActiveCardExtras> =
    inProgressGames.length > 0
      ? await getActiveGameCardData(
          supabase,
          userId!,
          inProgressGames.map((g) => ({
            id: g.id,
            game_mode: g.game_mode,
            flightNumber: g.flightNumber,
            require_peer_approval: g.require_peer_approval,
            submitted_at: g.submitted_at,
            withdrawn_at: g.withdrawn_at,
            approved_at: g.approved_at,
          })),
        )
      : new Map();

  // «Mine spill» (planlagte/utkast): uendret kort med status-pille, lenker til
  // spill-oversikten.
  const renderGameCard = (g: (typeof activeGames)[number]) => {
    const teeOff = g.scheduled_tee_off_at
      ? new Date(g.scheduled_tee_off_at)
      : null;
    const prox = teeOffProximity(g.scheduled_tee_off_at, now);
    const teeParts = teeOff ? formatTeeOffParts(teeOff, locale) : null;
    return (
      <GameRowCard
        key={g.id}
        href={`/games/${g.id}`}
        title={localizeGameName(g.name, g.courses?.name ?? null, locale)}
        meta={
          <>
            {g.courses?.name && (
              <GameRowMetaLine>{g.courses.name}</GameRowMetaLine>
            )}
            {teeParts && (
              <>
                {prox && (
                  <span className="block text-xs font-medium text-text mt-1 truncate">
                    {prox.kind === 'today'
                      ? t('proximity.today', { time: teeParts.time })
                      : prox.kind === 'tomorrow'
                        ? t('proximity.tomorrow')
                        : t('proximity.days', { days: prox.days })}
                  </span>
                )}
                <GameRowMetaLine tabular>
                  {teeParts.date} {t('teeOffSeparator')} {teeParts.time}
                </GameRowMetaLine>
              </>
            )}
            <GameRowMetaLine>
              {t('teamFlight', { teamNumber: g.teamNumber, flightNumber: g.flightNumber })}
            </GameRowMetaLine>
          </>
        }
        trailing={
          <div className="flex items-center gap-3 shrink-0">
            <StatusPill status={g.status} label={tStatus(g.status)} />
            <span aria-hidden className="text-muted">
              →
            </span>
          </div>
        }
      />
    );
  };

  // #878: «Pågår nå»-kortet er kjerne-løkke-bevisst — state-etikett i stedet for
  // generisk status-pille, lenker «rett inn i runden» (neste utastede hull /
  // lever-siden), og en accent-nudge-linje under kortet når en flight-peer
  // venter på din godkjenning. `continue`-kortet beholder gull-rammen (#363).
  const renderActiveGameCard = (g: (typeof activeGames)[number]) => {
    const extras: ActiveCardExtras = activeCardData.get(g.id) ?? {
      state: 'continue',
      href: `/games/${g.id}`,
      pendingApprovalsForMe: 0,
    };
    const stateLabel =
      extras.state === 'continue'
        ? t('cardStateContinue')
        : extras.state === 'submitted'
          ? t('cardStateSubmitted')
          : extras.state === 'pending_approval'
            ? t('cardStatePendingApproval')
            : t('cardStateWithdrawn');
    return (
      <div key={g.id} className="space-y-2">
        <GameRowCard
          href={extras.href}
          highlighted={extras.state === 'continue'}
          title={localizeGameName(g.name, g.courses?.name ?? null, locale)}
          meta={
            <>
              {g.courses?.name && (
                <GameRowMetaLine>{g.courses.name}</GameRowMetaLine>
              )}
              <GameRowMetaLine>
                {t('teamFlight', { teamNumber: g.teamNumber, flightNumber: g.flightNumber })}
              </GameRowMetaLine>
            </>
          }
          trailing={
            <div className="flex items-center gap-3 shrink-0">
              <ActiveStateLabel state={extras.state} label={stateLabel} />
              <span aria-hidden className="text-muted">
                →
              </span>
            </div>
          }
        />
        {extras.pendingApprovalsForMe > 0 && (
          <SmartLink
            href={`/games/${g.id}/approve`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-2.5 transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <span className="text-xs font-medium text-text">
              {tGameHome('pendingApprovals', {
                count: extras.pendingApprovalsForMe,
              })}
            </span>
            <span className="text-xs font-medium text-accent whitespace-nowrap">
              {tGameHome('reviewLink')}
            </span>
          </SmartLink>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={t('greeting', { name: firstNameValue })}
        action={handicapChip}
      />

      {/* #882: not a nav landmark — these are links to data, not site/app
          navigation. The real global nav is the bottom-nav in the layout. */}
      <div className="space-y-6">
        {inProgressGames.length > 0 && (
          <Section label={t('sectionInProgress')} accent>
            {inProgressGames.map((g) => renderActiveGameCard(g))}
          </Section>
        )}

        {upcomingGames.length > 0 && (
          <Section label={t('sectionMyGames')}>
            {upcomingGames.map((g) => renderGameCard(g))}
          </Section>
        )}

        {/* Vedvarende funn-inngang (#357, #392, #500, #879). Hjem er play +
            discover-navet (arrangering bor i Klubbhuset), så alle innloggede
            kan oppdage turneringer herfra — rett under egne spill, over de
            avsluttede. Med innhold: kappet forhåndsvisning (klubb/venner/åpne
            + egne forespørsler) + «Se alle»-hale. Uten: ett lenkekort som
            persistent inngang. Ingen create-dører her (#392). */}
        {hasDiscoveryContent ? (
          <HomeDiscoverySection data={discoveryData} preview />
        ) : (
          <Section label={t('sectionFindTournaments')}>
            <SmartLink
              href="/finn-turneringer"
              className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
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
        )}

        {/* #865: Toppliste-inngang (global tavle, flyttet fra profilen). Kun i
            fylt tilstand — en fersk bruker uten spill får ren velkomst-hero.
            Ett kompakt lenkekort, samme mønster som «Finn turneringer». */}
        <Section label={t('sectionToppliste')}>
          <SmartLink
            href="/profile/statistikk"
            className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
              <span className="text-base font-medium text-text">
                {t('topplisteCard')}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        </Section>

        {finishedGames.length > 0 && (
          <Section label={t('sectionFinished')}>
            {/* #571 + #865: hjem er play + discover-navet, ikke et arkiv. Vis de
                siste 3 (kompakt, så Toppliste-inngangen ikke gjør Hjem scroll-
                tung); lenk til /spill-arkiv for resten når det finnes flere. */}
            {finishedGames.slice(0, 3).map((g) => (
              <FinishedGameCard key={g.id} game={g} />
            ))}
            {finishedGames.length > 3 && (
              <SmartLink
                href="/spill-arkiv"
                className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
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

      </div>
    </>
  );
}

// ─── Body skeleton ───────────────────────────────────────────────────────

// Skeleton-troskap (#881): a neutral loading state that doesn't lurch.
// Two earlier problems: (a) flat `h-[72px]` cards nearly doubled to ~116px
// when real cards (Card + p-5 + serif title + meta lines) streamed in, and
// (b) the skeleton always rendered the filled-list shape with section labels,
// which jumped for a fresh user whose real state is the centered hero. Now:
// a greeting line + card-shaped skeletons that match the real card frame and
// height, with no section labels committing to the filled layout.
function HomeBodySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-3/5" />
      <div className="space-y-3">
        <HomeCardSkeleton delay={0} />
        <HomeCardSkeleton delay={120} />
      </div>
    </div>
  );
}

function HomeCardSkeleton({ delay }: { delay: number }) {
  return (
    <Card className="p-5">
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-1/2" delay={delay} />
        <Skeleton className="h-3 w-2/3" delay={delay + 30} />
        <Skeleton className="h-3 w-1/3" delay={delay + 60} />
      </div>
    </Card>
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
        {/* #882: section labels are h2s (mirrors HomeDiscoverySection) so
            screen-reader rotor/heading nav has more than the single h1.
            Same styling → no visual change. */}
        <h2
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
            accent ? 'text-accent' : 'text-muted'
          }`}
        >
          {label}
        </h2>
        <div
          className={`h-px flex-1 ${accent ? 'bg-accent/30' : 'bg-border'}`}
        />
      </div>
      {/* #885: a list of games is a list — give it ul/li semantics so a screen
          reader announces «list, 3 items» / «1 of 3». list-none p-0 keeps it
          pixel-identical to the old `space-y-3` div (Preflight already zeroes
          ul margin). Children.toArray strips falsy children (e.g. a
          `cond && <…>` that is false) so no empty <li> is emitted. */}
      <ul className="list-none p-0 space-y-3">
        {Children.toArray(children).map((child, index) => (
          <li key={isValidElement(child) ? child.key : index}>{child}</li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({
  status,
  label,
}: {
  // The Home query only surfaces draft/scheduled/active games, so this pill is
  // never asked to render a finished one — the type excludes it so a future
  // mis-use is a tsc error, not a silently-dead branch.
  status: Exclude<GameStatus, 'finished'>;
  label: string;
}) {
  const classes =
    status === 'active'
      ? 'bg-primary-soft text-primary border-primary/20'
      : status === 'scheduled'
        ? // #884: a planlagt (not-yet-played) game must not wear success-green —
          // green reads as «done/ok» and made a waiting round look finished.
          // Calm forest tone signals «informative, upcoming» instead.
          'bg-primary-soft text-primary border-primary/20'
        : // draft — the only remaining status (finished never reaches this pill).
          'bg-warning/10 text-warning border-warning/30';
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full border ${classes}`}
    >
      {label}
    </span>
  );
}

// #878: state-aware chip for the «Pågår nå» card. Distinct tones per state:
// continue = forest (act now), submitted = success-green (done — semantically
// «ferdig», so green is correct here, unlike the scheduled-pill in #884),
// pending_approval = amber (waiting on a peer), withdrawn = muted (out).
// Non-uppercase so longer labels («Til godkjenning») stay legible on mobile.
function ActiveStateLabel({
  state,
  label,
}: {
  state: ActiveCardState;
  label: string;
}) {
  const classes =
    state === 'continue'
      ? 'bg-primary-soft text-primary border-primary/20'
      : state === 'submitted'
        ? 'bg-success/10 text-success border-success/30'
        : state === 'pending_approval'
          ? 'bg-warning/10 text-warning border-warning/30'
          : 'bg-border/40 text-muted border-border';
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  );
}
