import type { Metadata } from 'next';
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
import { AnonLanding } from './AnonLanding';
import { canonicalPath } from '@/lib/seo/canonical';
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
import { PushNudge } from '@/components/pwa/PushNudge';
import { PasskeyEnrollmentNudge } from '@/components/passkey/PasskeyEnrollmentNudge';
import { ProductUpdateBanner } from '@/components/products/ProductUpdateBanner';
import { HandicapChip } from '@/components/handicap/HandicapChip';
import { StreakChip } from '@/components/stats/StreakChip';
import { getUserStreak } from '@/lib/stats/getUserStreak';
import { MIN_STREAK_WEEKS } from '@/lib/stats/streak';
import { firstName } from '@/lib/firstName';
import { formatTeeOffParts } from '@/lib/i18n/format';
import { teeOffProximity } from '@/lib/format/teeOffProximity';
import { getFinishedGamesForUser } from '@/lib/games/getFinishedGamesForUser';
import { toFinishedEntries } from '@/lib/games/finishedEntries';
import { localizeGameName } from '@/lib/games/autoGameName';
import { FinishedRoundsSection } from '@/components/games/FinishedRoundsSection';
import { GameRowCard, GameRowMetaLine } from '@/components/games/GameRowCard';
import { HomeDiscoverySection } from './HomeDiscoverySection';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { getGamesSocialProof } from '@/lib/games/getGameSocialProof';
import {
  getActiveGameCardData,
  type ActiveCardExtras,
} from '@/lib/games/getActiveGameCardData';
import {
  pairSplitDayGames,
  type PairableGame,
  type SplitDayEntry,
} from '@/lib/games/splitDayPairing';
import { mergePairExtras } from '@/lib/games/pairActiveCard';
import type { ActiveCardState } from '@/lib/games/activeCardState';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import type { GameStatus } from '@/lib/games/status';
import { routing, type AppLocale } from '@/i18n/routing';

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

// #1265: metadata for `/` — the SAME rute serves both the anonymous public
// landing and the logged-in home, so one metadata covers both audiences. Only
// `params` is read (never headers/cookies) so the route keeps its static shell
// under cacheComponents. Known trade-off: a logged-in visitor's tab title
// becomes the SEO title instead of the plain «Tørny» — accepted per contract.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return {
    // Absolute (not the «%s – Tørny» template): the front page is navigation
    // search's landing surface — the template form would hide the brand name.
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    alternates: { canonical: canonicalPath(locale, '/') },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = (await getLocale()) as AppLocale;
  const { userId } = await getHomeContext();
  // #1265: anonymous visitors get the public landing (proxy.ts makes `/`
  // auth-optional). Return BEFORE the Suspense/HomeBody block below so the
  // logged-in skeleton never flashes for an anon. The logged-in path is
  // otherwise byte-identical — every userId-dependent piece stays behind this
  // guard.
  if (!userId) {
    return <AnonLanding locale={locale} />;
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
      <PushNudge />

      <Suspense fallback={null}>
        <PasskeyEnrollmentNudge />
      </Suspense>

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
      // #1449: `source_game_id` filter drops derived cup games (they never
      // render as cards); `tournament_id`/`created_at` + the cup name embed let
      // us pair the two host halves of a split cup day into one merged card.
      'game_id, team_number, flight_number, submitted_at, withdrawn_at, approved_at, games!inner(id, name, status, ended_at, scheduled_tee_off_at, created_at, tournament_id, require_peer_approval, game_mode, hole_segment, courses(name), tournament:tournaments(name))',
    )
    .eq('user_id', userId)
    .in('games.status', ['draft', 'scheduled', 'active'])
    .is('games.source_game_id', null);

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
  const [profileRes, rawActiveRes, finishedGames, discoveryData, streakSummary] =
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
      // #1194: ukentlig streak for hjem-chippen — samme «runde»-definisjon som
      // historikk. Best-effort: en dekorativ chip skal aldri velte hjem-siden,
      // så en feil degraderer til «ingen chip» (jf. #877 — men det gjaldt den
      // KRITISKE spill-fetchen, ikke denne).
      getUserStreak(supabase, userId!).catch(() => null),
    ]);

  // #1193: sosialt bevis per funn-kort — ett samlet roster- + venne-oppslag for
  // alle listede spill (klubb/venner/åpne). Lagt etter funn-fetchen fordi det
  // trenger spill-idene derfra; batches så det blir to spørringer, ikke N.
  const discoverySocialProof = await getGamesSocialProof(
    [
      ...discoveryData.clubGames,
      ...discoveryData.friendGames,
      ...discoveryData.openGames,
    ].map((g) => g.id),
    userId!,
  );

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
    // Same widen-to-string trap as game_mode above (#1441).
    hole_segment: row.games.hole_segment as HoleSegment,
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
    // #1449: split-day pairing needs the tournament + a day anchor; `cupName`
    // titles the merged card (the cup, not the per-match host name).
    tournament_id: row.games.tournament_id,
    created_at: row.games.created_at,
    cupName: row.games.tournament?.name ?? null,
  }));
  type ActiveGame = (typeof activeGames)[number];

  // #1449: fold split cup days into cup entries; the empty-state (and the
  // finished section) derive from the MERGED lists, so a split-day player never
  // sees the «start here» welcome and never sees the plumbing.
  const finishedEntries = toFinishedEntries(finishedGames);

  // #1449: pair the two host halves of a split cup day into one card. A half the
  // viewer withdrew from stays single (pairEligible false) so it degrades to
  // today's single-card behaviour; non-cup / full-segment games are always
  // singles. Day-bucketing anchors on tee-off, falling back to created_at.
  const activeEntries = pairSplitDayGames(
    activeGames.map((g) => ({
      gameId: g.id,
      tournamentId: g.tournament_id,
      holeSegment: g.hole_segment,
      dayAnchor: g.scheduled_tee_off_at
        ? new Date(g.scheduled_tee_off_at)
        : g.created_at
          ? new Date(g.created_at)
          : null,
      pairEligible: g.withdrawn_at == null,
      data: g,
    })),
  );

  const isEmptyState =
    activeEntries.length === 0 && finishedEntries.length === 0;

  // An entry is «pågår nå» when any of its games is active; otherwise it's a
  // planlagt/utkast round. `now` is computed once for the relative tee-off
  // labels below and the upcoming sort.
  const now = new Date();
  const entryGames = (e: SplitDayEntry<ActiveGame>): ActiveGame[] =>
    e.kind === 'pair' ? [e.front9.data, e.back9.data] : [e.game.data];
  const isInProgressEntry = (e: SplitDayEntry<ActiveGame>) =>
    entryGames(e).some((g) => g.status === 'active');
  const earliestTeeOff = (e: SplitDayEntry<ActiveGame>) =>
    Math.min(
      ...entryGames(e).map((g) =>
        g.scheduled_tee_off_at
          ? new Date(g.scheduled_tee_off_at).getTime()
          : Infinity,
      ),
    );

  // Løft pågående runder øverst (#363): et aktivt spill skal ikke være bare
  // ett kort blant flere.
  const inProgressEntries = activeEntries.filter(isInProgressEntry);
  // #880: sorter planlagte runder stigende på tee-off (nulls sist) så nærmeste
  // ligger øverst.
  const upcomingEntries = activeEntries
    .filter((e) => !isInProgressEntry(e))
    .sort((a, b) => earliestTeeOff(a) - earliestTeeOff(b));
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
  // #1194: vis streak-chippen kun for en PÅGÅENDE streak på ≥ MIN_STREAK_WEEKS —
  // en enkelt uke er ikke en serie, og en hvilende streak vises aldri som tap.
  const streakChip =
    streakSummary &&
    streakSummary.weeklyStreakActive &&
    streakSummary.weeklyStreak >= MIN_STREAK_WEEKS ? (
      <StreakChip
        weeks={streakSummary.weeklyStreak}
        ariaLabel={t('streakChipAria', { count: streakSummary.weeklyStreak })}
      />
    ) : null;
  // Monter chippene varsomt: handicap (primær refleksjon) først, streak som en
  // liten highlight ved siden. Ingen av dem → ingen action.
  const headerAction =
    handicapChip || streakChip ? (
      <div className="flex items-center gap-2">
        {handicapChip}
        {streakChip}
      </div>
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
          <HomeDiscoverySection
            data={discoveryData}
            socialProof={discoverySocialProof}
          />
        )}
      </>
    );
  }

  // #878: per-active-game card data — display state, «rett inn i runden»-href,
  // and peer-approval count. Bounded to the viewer's handful of active games.
  // #1449: computed for BOTH halves of an in-progress split-day pair so the
  // merged card can fold them together.
  const inProgressHostGames = inProgressEntries.flatMap(entryGames);
  const activeCardData: Map<string, ActiveCardExtras> =
    inProgressHostGames.length > 0
      ? await getActiveGameCardData(
          supabase,
          userId!,
          inProgressHostGames.map((g) => ({
            id: g.id,
            game_mode: g.game_mode,
            require_peer_approval: g.require_peer_approval,
            submitted_at: g.submitted_at,
            withdrawn_at: g.withdrawn_at,
            approved_at: g.approved_at,
            hole_segment: g.hole_segment,
          })),
        )
      : new Map();

  const defaultExtras = (id: string): ActiveCardExtras => ({
    state: 'continue',
    href: `/games/${id}`,
    pendingApprovalsForMe: 0,
    nextHole: null,
  });

  const stateLabelFor = (state: ActiveCardState): string =>
    state === 'continue'
      ? t('cardStateContinue')
      : state === 'submitted'
        ? t('cardStateSubmitted')
        : state === 'pending_approval'
          ? t('cardStatePendingApproval')
          : t('cardStateWithdrawn');

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
  const renderActiveGameCard = (g: ActiveGame) => {
    const extras: ActiveCardExtras = activeCardData.get(g.id) ?? defaultExtras(g.id);
    const stateLabel = stateLabelFor(extras.state);
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
            className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-2.5 transition-colors hover:bg-accent/10"
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

  // #1449: ETT «Pågår nå»-kort for en splittet cup-dag. Tittel = cup-navnet,
  // state + href foldet på tvers av begge halvdelene (front9 → back9 → levering
  // på inne-spillet). Spilleren starter uansett på hull 1.
  type ActivePair = Extract<SplitDayEntry<ActiveGame>, { kind: 'pair' }>;
  const renderActivePairCard = (e: ActivePair) => {
    const front9 = e.front9.data;
    const back9 = e.back9.data;
    const extras = mergePairExtras(
      { id: front9.id, extras: activeCardData.get(front9.id) ?? defaultExtras(front9.id) },
      { id: back9.id, extras: activeCardData.get(back9.id) ?? defaultExtras(back9.id) },
    );
    const stateLabel = stateLabelFor(extras.state);
    const courseName = front9.courses?.name ?? back9.courses?.name ?? null;
    return (
      <div key={`${e.tournamentId}:${e.dayKey}`} className="space-y-2">
        <GameRowCard
          href={extras.href}
          highlighted={extras.state === 'continue'}
          title={front9.cupName ?? localizeGameName(front9.name, courseName, locale)}
          meta={
            <>
              <GameRowMetaLine>
                {[t('cupDayMarking'), courseName].filter(Boolean).join(' · ')}
              </GameRowMetaLine>
              <GameRowMetaLine>
                {t('teamFlight', {
                  teamNumber: front9.teamNumber,
                  flightNumber: front9.flightNumber,
                })}
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
            // Peer approval happens per host; cup games default to it OFF, so
            // this nudge is effectively dead here — land on the back9 host where
            // the round's delivery + review live. #1466 Builder B: one-delivery.
            href={`/games/${back9.id}/approve`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-2.5 transition-colors hover:bg-accent/10"
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

  // #1449: ETT «Mine spill»-kort for en planlagt splittet cup-dag — cup-navn +
  // status-pille, lenker inn til front9-hosten (runden starter på hull 1).
  const renderUpcomingPairCard = (e: ActivePair) => {
    const front9 = e.front9.data;
    const back9 = e.back9.data;
    const courseName = front9.courses?.name ?? back9.courses?.name ?? null;
    const teeOff = front9.scheduled_tee_off_at
      ? new Date(front9.scheduled_tee_off_at)
      : null;
    const prox = teeOffProximity(front9.scheduled_tee_off_at, now);
    const teeParts = teeOff ? formatTeeOffParts(teeOff, locale) : null;
    return (
      <GameRowCard
        key={`${e.tournamentId}:${e.dayKey}`}
        href={`/games/${front9.id}`}
        title={front9.cupName ?? localizeGameName(front9.name, courseName, locale)}
        meta={
          <>
            <GameRowMetaLine>
              {[t('cupDayMarking'), courseName].filter(Boolean).join(' · ')}
            </GameRowMetaLine>
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
              {t('teamFlight', {
                teamNumber: front9.teamNumber,
                flightNumber: front9.flightNumber,
              })}
            </GameRowMetaLine>
          </>
        }
        trailing={
          <div className="flex items-center gap-3 shrink-0">
            <StatusPill status={front9.status} label={tStatus(front9.status)} />
            <span aria-hidden className="text-muted">
              →
            </span>
          </div>
        }
      />
    );
  };

  return (
    <>
      <PageHeader
        title={t('greeting', { name: firstNameValue })}
        action={headerAction}
      />

      {/* #882: not a nav landmark — these are links to data, not site/app
          navigation. The real global nav is the bottom-nav in the layout. */}
      <div className="space-y-6">
        {inProgressEntries.length > 0 && (
          <Section label={t('sectionInProgress')} accent>
            {inProgressEntries.map((e) =>
              e.kind === 'pair'
                ? renderActivePairCard(e)
                : renderActiveGameCard(e.game.data),
            )}
          </Section>
        )}

        {upcomingEntries.length > 0 && (
          <Section label={t('sectionMyGames')}>
            {upcomingEntries.map((e) =>
              e.kind === 'pair'
                ? renderUpcomingPairCard(e)
                : renderGameCard(e.game.data),
            )}
          </Section>
        )}

        {/* Vedvarende funn-inngang (#357, #392, #500, #879). Hjem er play +
            discover-navet (arrangering bor i Klubbhuset), så alle innloggede
            kan oppdage turneringer herfra — rett under egne spill, over de
            avsluttede. Med innhold: kappet forhåndsvisning (klubb/venner/åpne
            + egne forespørsler) + «Se alle»-hale. Uten: ett lenkekort som
            persistent inngang. Ingen create-dører her (#392). */}
        {hasDiscoveryContent ? (
          <HomeDiscoverySection
            data={discoveryData}
            socialProof={discoverySocialProof}
            preview
          />
        ) : (
          <Section label={t('sectionFindTournaments')}>
            <SmartLink
              href="/finn-turneringer"
              className="block rounded-2xl"
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
            className="block rounded-2xl"
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

        {finishedEntries.length > 0 && (
          <Section label={t('sectionFinished')}>
            {/* #571 + #865 + #986: hjem er play + discover-navet, ikke et arkiv.
                Vis de siste 3 som tette «Runder»-rader (brutto/netto), så du ser
                hvordan du gjorde det rett fra Hjem; lenk til /spill-arkiv for
                resten når det finnes flere. #1449: en splittet cup-dag vises som
                ett cup-merket kort. */}
            <FinishedRoundsSection
              entries={finishedEntries}
              userId={userId!}
              locale={locale}
            />
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
          'bg-warning/10 text-warning-text border-warning/30';
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
        ? 'bg-success/10 text-success-text border-success/30'
        : state === 'pending_approval'
          ? 'bg-warning/10 text-warning-text border-warning/30'
          : 'bg-border/40 text-muted border-border';
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  );
}
