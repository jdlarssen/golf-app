import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  formatDateTime,
  formatListLocale,
  formatShortOsloDayMonthLocale,
} from '@/lib/i18n/format';
import { osloYearWindow } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import { formatWholeHcpDisplay } from '@/lib/handicap/signFormat';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { pendingPlayerList } from '@/lib/admin/pendingPlayerEmails';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { ScrollToAnchorOnStatus } from '@/components/ui/ScrollToAnchorOnStatus';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { ModeChip } from '@/components/ui/ModeChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import type { GameStatus } from '@/lib/games/status';
import {
  isStablefordFamily,
  isScrambleFamily,
  isSoloFormat,
  supportsWithdrawal,
  type GameMode,
  type GameModeConfig,
} from '@/lib/scoring';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { StartScheduledGameButton } from './StartScheduledGameButton';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { ApprovePlayerButton } from './ApprovePlayerButton';
import { ReopenScorecardButton } from './ReopenScorecardButton';
import { ScorecardTable } from '@/app/[locale]/games/[id]/_components/ScorecardTable';
import { fetchScorecardReviewData } from '@/lib/games/scorecardReviewData';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import { ReopenGameButton } from './ReopenGameButton';
import { RegistrationOverviewSection } from './RegistrationOverviewSection';
import { BetalingOverviewSection } from './BetalingOverviewSection';
import {
  startScheduledGameAction,
  adminApproveScorecard,
  endGame,
  reopenScorecard,
  reopenGame,
  adminUndoWithdraw,
} from './actions';
import { remindUnsubmittedPlayers } from './status/actions';
import { remindMissingScore } from './pultActions';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import { InviteToGameSection } from './InviteToGameSection';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';
import { FlighterSeksjon } from './FlighterSeksjon';
import { LagSeksjon } from './LagSeksjon';
import {
  eligibleForFlightAssignment,
  flightBuckets,
  type FlightPlayer,
} from '@/lib/games/flightScope';
import {
  modeRequiresTeamNumber,
  expectedTeamSize,
  teamBuckets,
} from '@/lib/games/teamScope';
import { localizeGameName } from '@/lib/games/autoGameName';
import { startBlockMessage, startErrorMessageArgs } from '@/lib/games/startErrorMessage';
import { readStartBlock } from '@/lib/games/startScheduledGameCore';
import { isStructuralBlockReason } from '@/lib/notifications/autoStartBlocked';
import { splitFinishRoster, stampsFromRow } from '@/lib/games/finishGate';
import type { StartType } from '@/lib/games/startType';
import {
  deliveryCounts,
  endGameReadiness,
  findScoreGaps,
  flightProgress,
  gapLocation,
  missingScoreTargets,
  pultInitialTab,
  type ProgressLabel,
} from '@/lib/games/organizerDesk';
import { previewReminder } from '@/lib/games/remindUnsubmitted';
import { firstName } from '@/lib/firstName';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { effectiveHcpAllowancePct } from '@/lib/games/hcpAllowance';
import { getAdminClient } from '@/lib/supabase/admin';
import { PultHeader } from './_pult/PultHeader';
import { PultSkeleton } from './_pult/PultSkeleton';
import { PultTabs } from './_pult/PultTabs';
import { NeedsYouList, type NeedsYouGap } from './_pult/NeedsYouList';
import { FlightProgressList } from './_pult/FlightProgressList';
import { EndGameBar } from './_pult/EndGameBar';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
  pending?: string | string[];
  // #969: format + active count for the rotation_player_count error banner.
  mode?: string | string[];
  count?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  // Epic #41 — modus per spill. Bestemmer både hvilken Spillform-tekst som
  // vises i Format-kortet og hvilken ModeChip-variant subtittelen får.
  game_mode: GameMode;
  // Epic #43 — diskriminator for stableford-varianter (solo vs par/4BBB).
  // Lar Spillform-cardet skille «Stableford» fra «Par-stableford» og lar
  // lag/flight-flatene tilpasse seg for par-stableford (flight = team mekanisk).
  mode_config: GameModeConfig;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  course_id: string;
  tee_box_id: string;
  // #1586: segment-filter for review-kortene (front9/back9-spill, #1441).
  hole_segment: HoleSegment;
  // #2268: a shotgun round has no hole gaps on the desk, and its groups count
  // holes played instead of the furthest hole (0200, `lib/games/startType.ts`).
  start_type: StartType;
  started_at: string | null;
  ended_at: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  // #199 selv-påmelding — vises i Påmelding-oversikten med delbar lenke.
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
  registration_type: 'solo' | 'team' | 'both';
  short_id: string;
  // #543: arrangøren kan stenge påmeldingen manuelt.
  signups_closed_at: string | null;
  // #1049: startkontingent — driver betaling-telle-kortet (vises kun når > 0).
  entry_fee_kr: number;
  courses: { name: string } | null;
  // #1795: kun navnet leses her. Rating-radene (slope/CR/par per kjønn) er ute
  // av protokoll-kortet, så selecten henter ikke lenger de ni rating-kolonnene.
  tee_boxes: { name: string } | null;
};

type GamePlayerRow = {
  user_id: string;
  // #1669: begge er nullable i DB, og solo-selvpåmelding i et lag-format lar
  // dem stå null helt til arrangøren fordeler lag.
  team_number: number | null;
  flight_number: number | null;
  course_handicap: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
  accepted_at: string | null;
  // #1586: kortets eier-par styres av spillerens tee-kjønn i review-tabellen.
  tee_gender: ScoringGender;
  // #1049: betalt-tidsstempel — non-null = arrangøren har huket av betalt.
  paid_at: string | null;
  users: {
    // name is null until the invitee completes their profile — see
    // migration 0014. Pre-created placeholder rows can still appear on a
    // draft roster, so consumers must fall back to email below.
    name: string | null;
    nickname: string | null;
    hcp_index: number | string;
    email: string;
    // #2268: guests get no hole reminder, so a guest-only gap row has no button.
    is_guest: boolean;
  } | null;
};

// Request-scoped Supabase client. Each Suspense body that needs it pulls
// from this cached helper so we don't pay the cookie-auth cost per section.
const getAdminGameContext = cache(async () => {
  const supabase = await getServerClient();
  return { supabase };
});

// Memoised "Sak {YYYY}-{NNN}" computation. No DB column for the sak number;
// it's derived from the position of this game within its creation year.
// Both the title-bar pill and the footer footnote read this, so we cache
// to avoid two identical count queries per request.
const getSakNumber = cache(
  async (
    createdAt: string,
  ): Promise<{ year: number; positionInYear: number }> => {
    const { supabase } = await getAdminGameContext();
    // #651: the year label and the count window both follow Oslo wall-clock,
    // not the UTC Vercel server — otherwise a game created in the New Year
    // straddle hour (1 Jan 00:30 Oslo = 31 Dec 23:30 UTC) lands in the wrong
    // year and sequence bucket.
    const { year, startIso, endIso } = osloYearWindow(new Date(createdAt));
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .lte('created_at', createdAt);
    return { year, positionInYear: count ?? 1 };
  },
);

// #2204: why a scheduled round would not start right now, read without
// starting it. Read only, as the global admin `requireAdmin` let in. Shared by
// the start card and the ?error= banner, so a request reads it once.
const getStartBlock = cache(async (gameId: string) => {
  const { supabase } = await getAdminGameContext();
  return readStartBlock(supabase, gameId);
});

export default async function GameDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const tErrors = await getTranslations('admin.game.errors');
  const tBanners = await getTranslations('admin.game.banners');
  const tDetail = await getTranslations('admin.game.detail');
  const statusCode = first(sp.status) ?? '';
  // #1067: admin_approved skips the top banner. The redirect now lands (or,
  // via ScrollToAnchorOnStatus, scrolls) straight to «Leverte scorekort»
  // further down the page — a banner up here would force a scroll-to-top
  // that undoes the whole point of the anchor jump.
  const statusBanner =
    statusCode &&
    statusCode !== 'admin_approved' &&
    tBanners.has(statusCode as Parameters<typeof tBanners>[0])
      ? tBanners(statusCode as Parameters<typeof tBanners>[0])
      : undefined;
  const errorCode = first(sp.error);
  const errorMode = first(sp.mode);
  // #2207: the start gate sends ids (`pending=`), never addresses; they are
  // turned back into addresses only after requireAdmin below.
  async function buildErrorMessage(): Promise<string | undefined> {
    if (!errorCode) return undefined;
    // #969 / #2071: rotation_player_count picks a format-specific message and
    // passes the live active count. The rule's home is startErrorMessageArgs
    // (#2202), shared with the game page.
    const args = startErrorMessageArgs({
      code: errorCode,
      mode: errorMode,
      count: first(sp.count),
    });
    const key = args.key as Parameters<typeof tErrors>[0];
    if (!tErrors.has(key)) return undefined;
    const list =
      errorCode === 'pending_players' ? await pendingPlayerList(first(sp.pending)) : '';
    return tErrors(key, { ...args.values, list });
  }

  const { supabase } = await getAdminGameContext();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Runs before the
  // game-row fetch so trusted-non-admin (and unauthenticated) callers never
  // see the row even if RLS would have allowed the select.
  await requireAdmin(supabase);
  const errorMessage = await buildErrorMessage();

  // Gating: fetch the game row first so we can render the title bar
  // synchronously. The rest of the page (players, progress, sak-number,
  // cards, CTAs) streams behind Suspense boundaries below.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, game_mode, mode_config, hcp_allowance_pct, require_peer_approval, course_id, tee_box_id, hole_segment, start_type, started_at, ended_at, scheduled_tee_off_at, created_at, side_tournament_enabled, side_ld_count, side_ctp_count, registration_mode, registration_type, short_id, signups_closed_at, entry_fee_kr, courses(name), tee_boxes(name)',
    )
    .eq('id', id)
    .maybeSingle<GameRow>();

  // Error ≠ absence (#1445): a transient query failure must reach the error
  // boundary, not render as «spillet finnes ikke». Only a genuine 0-row result
  // (maybeSingle: data null, error null) means the game is gone.
  if (gameError) {
    console.error('[AdminGameDetailPage] game fetch failed', gameError);
    throw gameError;
  }
  if (!game) {
    notFound();
  }

  // #2204: the start card already gives the reason a scheduled round would not
  // start; a refused «Start runden nå» with the same reason would say it twice.
  // Read only when there is an ?error=, so the top never waits otherwise.
  const errorBlock = errorCode && game.status === 'scheduled' ? await getStartBlock(id) : null;
  const shownErrorMessage =
    errorBlock && isStructuralBlockReason(errorBlock.reason) && errorCode === errorBlock.reason
      ? undefined
      : errorMessage;

  // Start the sak-number count now (cache()d per request), so the title
  // block and the footer, which both await it behind Suspense, do not wait
  // for it after the rest of the page. The catch only marks the promise as
  // handled; whoever awaits it still sees the error.
  void getSakNumber(game.created_at).catch(() => {});

  const locale = await getLocale();

  function shortDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    // Oslo-pinned (#637): the protocol subtitle must show the same wall-clock
    // date the organiser sees everywhere else, not the UTC server date.
    return formatShortOsloDayMonthLocale(iso, locale as AppLocale);
  }

  // Date subtitle: best timestamp available for the lifecycle stage.
  const subtitleDate =
    shortDate(game.ended_at) ??
    shortDate(game.started_at) ??
    shortDate(game.scheduled_tee_off_at) ??
    shortDate(game.created_at);
  const subtitle = [game.courses?.name, subtitleDate].filter(Boolean).join(' · ');
  const gameName = localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale);

  const userId = await getProxyVerifiedUserId();

  // Mark notifikasjoner for dette spillet som lest når admin åpner
  // protokoll-sida. Dekker både `scorecard_submitted` og `invite` slik at
  // bell-prikken forsvinner så snart admin (eller invitee) lander her.
  // Wrap i `after()` så DB-mutasjon + revalidateTag deferes til etter render
  // (Next.js 16 sperrer revalidateTag i render-fase).
  if (userId) {
    after(() => {
      void markNotificationsRead({
        userId,
        kind: 'scorecard_submitted',
        entityId: id,
      });
      void markNotificationsRead({
        userId,
        kind: 'invite',
        entityId: id,
      });
    });
  }

  // #1067: server-action redirects drop URL hash fragments, so this fallback
  // scrolls to «Leverte scorekort» client-side whenever the admin_approved
  // redirect lands here. It renders nothing.
  const scrollToScorecards = (
    <ScrollToAnchorOnStatus
      status={statusCode || undefined}
      matchStatus="admin_approved"
      anchorId="leverte-scorekort"
    />
  );

  // #2268: while the round is in progress the page is the organiser's desk.
  // Its header needs the roster's counts, so everything from the header down
  // streams behind one Suspense boundary whose fallback has the header's shape.
  if (game.status === 'active') {
    return (
      <AdminShell>
        {scrollToScorecards}
        <Suspense fallback={<PultSkeleton />}>
          <PultBody
            game={game}
            locale={locale}
            gameName={gameName}
            subtitle={subtitle}
            statusBanner={statusBanner}
            errorMessage={errorMessage}
            errorCode={errorCode}
            statusCode={statusCode}
          />
        </Suspense>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      {scrollToScorecards}
      <TopBar
        backHref="/admin/games"
        kicker={tDetail('brassRibbon')}
      />

      <BrassRibbon kicker={tDetail('brassRibbon')} />

      <TitleBlock game={game} gameName={gameName} subtitle={subtitle} />

      <StatusBanners
        statusBanner={statusBanner}
        errorMessage={shownErrorMessage}
        errorCode={errorCode}
      />

      <Suspense fallback={<PlayersSectionsSkeleton />}>
        <PlayersSections gameId={id} game={game} locale={locale} />
      </Suspense>

      <CreatedAtLine createdAt={game.created_at} />

      <DangerZone gameId={id} />
    </AdminShell>
  );
}

// ─── Blocks both layouts share ───────────────────────────────────────────

/**
 * The title block. On the protocol page (every status but `active`) it has
 * the status chip and the game's name as the page's h1; on the desk's
 * «Oppsett» tab (`heading={false}`) the green header already carries the
 * name, so only the format chip, the sak number and course · date remain.
 */
function TitleBlock({
  game,
  gameName,
  subtitle,
  heading = true,
}: {
  game: GameRow;
  gameName: string;
  subtitle: string;
  heading?: boolean;
}) {
  return (
    <div className="px-1">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 gap-y-1">
        {heading && <StatusChip status={game.status} />}
        <ModeChip mode={game.game_mode} modeConfig={game.mode_config} />
        <Suspense fallback={<Skeleton className="h-3 w-20" />}>
          <SakNumber createdAt={game.created_at} />
        </Suspense>
      </div>
      {heading && (
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          {gameName}
        </h1>
      )}
      <p className="mt-1 font-sans text-xs tabular-nums text-muted">
        {subtitle}
      </p>
    </div>
  );
}

function StatusBanners({
  statusBanner,
  errorMessage,
  errorCode,
}: {
  statusBanner: string | undefined;
  errorMessage: string | undefined;
  errorCode: string | undefined;
}) {
  if (!statusBanner && !errorMessage) return null;
  return (
    <div className="mt-4 space-y-2">
      {statusBanner && <Banner tone="success">{statusBanner}</Banner>}
      {errorMessage && (
        // #2321: a published game whose e-mail invitations did not all
        // go out is a warning under the green «publisert» banner.
        <Banner
          tone={errorCode === 'invites_failed' ? 'warning' : 'error'}
          testId="admin-game-error-banner"
        >
          {errorMessage}
        </Banner>
      )}
    </div>
  );
}

function CreatedAtLine({ createdAt }: { createdAt: string }) {
  return (
    // div, ikke p: Suspense-fallbacken (Skeleton) er en <div>, og <div> i <p>
    // gir hydreringsfeil (#1019).
    <div className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
      <Suspense fallback={<Skeleton className="inline-block h-3 w-32" />}>
        <CreatedAtFooter createdAt={createdAt} />
      </Suspense>
    </div>
  );
}

/** Danger zone — permanent delete. */
async function DangerZone({ gameId }: { gameId: string }) {
  const tDetail = await getTranslations('admin.game.detail');
  return (
    <section className="mt-6">
      <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {tDetail('dangerZoneLabel')}
      </p>
      <div
        className="rounded-xl border bg-surface px-4 py-3.5"
        style={{
          borderColor: 'rgba(180, 60, 60, 0.18)',
          boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
        }}
      >
        <div className="text-center">
          <SmartLink
            href={`/admin/games/${gameId}/slett`}
            className="tap-extend font-sans text-[13px] font-medium [--tap-extend:-12px_-8px]"
            style={{ color: 'var(--danger-deep)' }}
          >
            {tDetail('deleteGame')}
          </SmartLink>
        </div>
      </div>
    </section>
  );
}

// ─── Suspense bodies ─────────────────────────────────────────────────────

async function SakNumber({ createdAt }: { createdAt: string }) {
  const { year, positionInYear } = await getSakNumber(createdAt);
  const tDetail = await getTranslations('admin.game.detail');
  return (
    <span className="font-sans text-[11px] tabular-nums text-muted">
      {tDetail('sakNumber', {
        year,
        n: String(positionInYear).padStart(3, '0'),
      })}
    </span>
  );
}

async function CreatedAtFooter({ createdAt }: { createdAt: string }) {
  const { year, positionInYear } = await getSakNumber(createdAt);
  const tDetail = await getTranslations('admin.game.detail');
  const locale = await getLocale();
  return (
    <>
      {tDetail('createdAtFooter', {
        date: formatShortOsloDayMonthLocale(createdAt, locale as AppLocale) ?? '',
        n: String(positionInYear).padStart(3, '0'),
        year,
      })}
    </>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────

// game_players has two FKs to users (user_id and approved_by_user_id), so
// we must disambiguate via the named constraint.
function fetchRoster(gameId: string) {
  return getAdminClient()
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, withdrawn_at, accepted_at, paid_at, tee_gender, users!game_players_user_id_fkey(name, nickname, hcp_index, email, is_guest)',
    )
    .eq('game_id', gameId)
    .returns<GamePlayerRow[]>();
}

// Live progress: hole_number and user_id only (NO strokes — avoid spoilers).
// Admin sees how far each flight has come without seeing the values. Only
// queried for active games, by the desk.
type ProgressRow = { user_id: string; hole_number: number };

async function fetchProgress(gameId: string) {
  const { supabase } = await getAdminGameContext();
  return selectAllRowsResult(
    (from, to) =>
      supabase
        .from('scores')
        .select('user_id, hole_number')
        .eq('game_id', gameId)
        .not('strokes', 'is', null)
        .order('id')
        .range(from, to)
        .returns<ProgressRow[]>(),
    'AdminGamePage progress',
  );
}

type ReviewData = Awaited<ReturnType<typeof fetchScorecardReviewData>>;

/**
 * The page's sections as blocks, so the protocol page (`PlayersSections`)
 * and the organiser's desk (`PultBody`) place the same blocks without
 * writing any of them twice (#2268).
 *
 * `review` is the submitted cards' data; only the desk passes it, since
 * «Leverte scorekort» exists only while the round is in progress.
 */
async function buildSections({
  gameId,
  game,
  locale,
  players,
  review,
}: {
  gameId: string;
  game: GameRow;
  locale: string;
  players: GamePlayerRow[];
  review?: ReviewData;
}) {
  const tDetail = await getTranslations('admin.game.detail');
  const tSections = await getTranslations('admin.game.sections');
  const tRows = await getTranslations('admin.game.rows');
  const tCta = await getTranslations('admin.game.cta');
  const tModes = await getTranslations('modes');
  const tRegistration = await getTranslations('admin.game.registration');
  const tApprove = await getTranslations('game.approve');
  const tButtons = await getTranslations('admin.game.buttons');
  const tErrors = await getTranslations('admin.game.errors');

  // Mode-narrowing: skiller solo (en spiller = en deltager, ingen lag/flight)
  // fra par-stableford (lag à 2, flight = team mekanisk), best-ball-netto, og
  // singles matchplay (1v1, side i stedet for lag).
  //  - isSolo: solo-modus uten lag-konstruksjon. Dekker både solo-stableford
  //    (team_size=1) og solo strokeplay. Skjuler Lag-seksjon +
  //    Lag/Flight-kolonner i spillerlista — alle har null/0 på team_number.
  //  - isParStableford: par-stableford (4BBB). Viser Lag-seksjon kun for de
  //    lag som faktisk har spillere, og dropper Flight-kolonnen i tabellen
  //    siden den alltid speiler team_number 1:1.
  //  - isMatchplay: singles matchplay (1v1). Bruker «Side» i stedet for «Lag»
  //    i alle labels — 2 sider à 1 spiller. Flight = side mekanisk, så
  //    Flight-kolonnen skjules.
  //  - isBestBall: lag à 2 spillere, opptil `MAX_TEAM_NUMBER` lag; flight kan
  //    avvike fra team. Full Lag-grid 1..teamsMax (se `teamSlots`) +
  //    Lag+Flight-kolonner.
  // Solo = individuelt format uten lag-/flight-konstruksjon. Kanonisk helper
  // (lib/scoring/modes/types) dekker stableford solo + solo slagspill + alle
  // pott-formatene (Wolf/Nassau/Skins/BBB/Nines/Round Robin/Acey Deucey) — den
  // gamle inline-sjekken glemte pott-formatene, så de viste tomme lag-flater.
  const isSolo = isSoloFormat(game.game_mode, game.mode_config.team_size);
  const isParStableford =
    isStablefordFamily(game.game_mode) && game.mode_config.team_size === 2;
  const isMatchplay = game.game_mode === 'singles_matchplay';
  const isBestBall = game.game_mode === 'best_ball';
  // Scramble-familien (Texas scramble + Ambrose): lag-modus med variabel
  // lagstørrelse (2 eller 4) og variabelt antall lag. Speilar par-stableford
  // visuelt — vi viser kun lag som har spillere, og flight-seksjonen droppes
  // siden flight = team mekanisk (validatoren håndhever det).
  const isScramble = isScrambleFamily(game.game_mode);

  // Spillform-label for Format-cardet. Variant-bevisst via formatDisplayLabelKey:
  // stableford-familien med team_size 2 vises som «4BBB Stableford» (samme navn
  // som chip-en og resten av appen, #282); alt annet faller tilbake til
  // modes.<mode> (f.eks. «Matchplay», «Slagspill»).
  const modeLabelKey = formatDisplayLabelKey(game.game_mode, game.mode_config);
  const modeLabel = tModes(modeLabelKey as Parameters<typeof tModes>[0]);

  // Tee-off label, pinned to Oslo (#637) — without timeZone, toLocaleString
  // renders in the server TZ (UTC on Vercel), showing 08:00 for a 10:00
  // tee-off. Shared by the Format-card row and the scheduled CTA copy, so the
  // auto-start sentence quotes exactly the time the organiser sees above.
  // Null when the game has no tee-off (liga/cup-generated rows): no tee-off
  // means the cron sweep never auto-starts it, so the CTA copy stays silent.
  const teeOffLabel = game.scheduled_tee_off_at
    ? formatDateTime(game.scheduled_tee_off_at, locale as AppLocale, {
        timeZone: 'Europe/Oslo',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Lag-terminologi: matchplay bruker «Side» i stedet for «Lag» (golf-standard
  // for 1v1-format). Holdt som lokale strings slik at vi ikke trenger å fyre
  // ternary på hver call-site i markup.
  const teamLabel = isMatchplay ? tDetail('teamLabel') : tDetail('teamLabelDefault');
  // Bøttene under er avledet av rosteret, ikke av en hardkodet 1..4-liste:
  // lag-påmelding tillater opp til 50 lag (0101), og et spill med lag 5+ eller
  // flight 5+ var usynlig i denne oversikten fram til #1669. Den delte regelen
  // holder trukne spillere utenfor (#2225), som resten av appen: de står bare
  // i spillertabellen lenger ned, med trukket-merkingen. Rader uten lag eller
  // flight havner ikke i noen bøtte; Lag-seksjonen viser dem som «Uten lag».
  const byTeam = teamBuckets(players).assigned;
  const byFlight = flightBuckets(players).assigned;
  const teamNumbers = [...byTeam.keys()].sort((a, b) => a - b);
  const flightNumbers = [...byFlight.keys()].sort((a, b) => a - b);

  // Maks-antall lag/sider for «X / Y»-display i Påmelding-cardet. Matchplay er
  // alltid 2 sider; ellers er `teams_count` fra mode_config fasiten, med det
  // faktiske rosteret som gulv hvis noen står på et høyere lagnummer.
  const configuredTeams = (game.mode_config as { teams_count?: number })
    .teams_count;
  const teamsMax = isMatchplay
    ? 2
    : Math.max(configuredTeams ?? 0, teamNumbers.at(-1) ?? 0, 1);

  // Hvilke lag-slots Lag-cardet rendrer: matchplay har alltid begge sidene,
  // de skalerende formatene viser kun lag som har spillere, og resten (best
  // ball) viser 1..teamsMax så et tomt lag er synlig.
  const teamSlots = isMatchplay
    ? [1, 2]
    : isParStableford || isScramble
      ? teamNumbers
      : Array.from({ length: teamsMax }, (_, i) => i + 1);

  function displayName(p: GamePlayerRow): string {
    if (!p.users) return tDetail('unknownPlayer');
    // Pending invitee — show email until they complete their profile.
    const name = p.users.name ?? p.users.email;
    return p.users.nickname ? `${name} «${p.users.nickname}»` : name;
  }

  const startScheduledAction = startScheduledGameAction.bind(null, gameId);
  const reopenGameAction = reopenGame.bind(null, gameId);

  // The «Levert X/Y» row, from the finish gate's own lists (`finishGate`,
  // #2222). Withdrawn players (#386) are out of them, so out of the «Levert
  // X/Y» denominator. The total «Spillere»-row still uses players.length.
  const finishLists = splitFinishRoster(
    players,
    stampsFromRow,
    game.require_peer_approval,
  );
  const rankablePlayers = finishLists.active;
  const notSubmittedCount = finishLists.missing.length;

  const teamCount = teamNumbers.length;
  const submittedCount = rankablePlayers.filter((p) => p.submitted_at != null).length;
  // Banehandicap fryses + scorekort kan leveres først ved «Start runden nå».
  // Skjul levering/CH og bruk en egen «Påmeldt»-status før det (#905).
  const isPlayPhase = game.status === 'active' || game.status === 'finished';

  // Card 1 — Oversikt (#904): tall-sammendrag (spillere/levering/lag). The
  // desk splits it: «Spillere» takes the players row, «Oppsett» the team row,
  // and the header carries the delivered count.
  const overviewRibbon = tSections('overview');
  const playersRow = (
    <Row
      label={tRows('players')}
      value={`${players.length}`}
      tone={players.length > 0 ? 'full' : undefined}
    />
  );
  // #905: levering gir først mening etter start — skjul på draft/scheduled.
  const submittedRow = isPlayPhase && (
    <Row
      label={tRows('submittedScorecard')}
      value={`${submittedCount} / ${rankablePlayers.length}`}
      sub={
        notSubmittedCount > 0
          ? game.status === 'finished'
            ? tRows('notSubmittedFinished', { count: notSubmittedCount })
            : tRows('notSubmittedWaiting', { count: notSubmittedCount })
          : undefined
      }
    />
  );
  const teamsRow = !isSolo && (
    <Row label={isMatchplay ? tRows('teamCount') : tRows('teamCountDefault')} value={`${teamCount} / ${teamsMax}`} />
  );

  // Påmelding-oversikt (#199, utvidet #368) — vises for draft/scheduled.
  // Etter start (#1060) er kortets tre handlinger blindveier: godkjenn/
  // avslå er hard-låst (signups/actions.ts), og den offentlige
  // påmeldingssiden viser «stengt». Kortet erstattes da av en liten
  // tekstlenke til historikken, som fortsatt er eneste vei til frosne
  // pending-forespørsler på finished.
  // #1795: «Steng påmelding» (#543) bor nå som sekundær rad inne i kortet —
  // status + modus sendes med slik at kortet eier gaten selv.
  const signups = !isPlayPhase ? (
    <RegistrationOverviewSection
      gameId={gameId}
      registrationMode={game.registration_mode}
      gameStatus={game.status}
      signupsClosedAt={game.signups_closed_at}
      shortId={game.short_id}
      selfRegisteredCount={players.length}
    />
  ) : (
    <div className="mt-1.5 px-1 text-center">
      <SmartLink
        href={`/admin/games/${gameId}/signups`}
        className="tap-extend font-sans text-[13px] font-medium text-muted underline underline-offset-2 decoration-muted/30 hover:decoration-muted [--tap-extend:-12px_-8px]"
      >
        {tRegistration('viewSignupsLink')}
      </SmartLink>
    </div>
  );

  // #1049: betaling-telle-kort — kun når spillet har en startkontingent.
  // Tellingen ekskluderer withdrawn, som betaling-undersiden.
  const betaling = game.entry_fee_kr > 0 && (
    <BetalingOverviewSection
      gameId={gameId}
      entryFeeKr={game.entry_fee_kr}
      paidCount={
        players.filter((p) => p.withdrawn_at == null && p.paid_at != null)
          .length
      }
      totalCount={players.filter((p) => p.withdrawn_at == null).length}
    />
  );

  // Card 2 — Format og bane (#1795). Tidligere to kort; slått sammen fordi
  // de til sammen var seks–ni rader oppsett som arrangøren scroller forbi.
  // Rating-radene (slope/CR/par per kjønn) er droppet — de hører hjemme på
  // banesida, ikke i spillprotokollen.
  // Handicap-justering og Peer-godkjenning MÅ bli stående: etter start er
  // dette eneste admin-flata som viser dem (edit/page.tsx redirecter på alt
  // annet enn draft/scheduled).
  const formatCard = (
    <SectionCard ribbon={tSections('formatAndCourse')}>
      <Row label={tRows('gameMode')} value={modeLabel} />
      <Row
        label={tRows('hcpAllowance')}
        value={`${
          // #2210: before start, show the percentage the start will freeze
          // with. Active and finished games were frozen with the stored
          // value (games started before #2210 too), so they show that.
          game.status === 'draft' || game.status === 'scheduled'
            ? effectiveHcpAllowancePct(game.game_mode, game.hcp_allowance_pct)
            : game.hcp_allowance_pct
        } %`}
      />
      <Row
        label={tRows('peerApproval')}
        value={game.require_peer_approval ? tRows('peerApprovalOn') : tRows('peerApprovalOff')}
      />
      {teeOffLabel && <Row label={tRows('teeOff')} value={teeOffLabel} />}
      <Row
        label={tRows('course')}
        value={game.courses?.name ?? tRows('unknownCourse')}
      />
      {game.tee_boxes && (
        <Row label={tRows('tee')} value={game.tee_boxes.name} />
      )}
    </SectionCard>
  );

  const teamsCard = !isSolo && (
    <SectionCard ribbon={isMatchplay ? tSections('sides') : tSections('teams')}>
      <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-3.5 pt-3 sm:grid-cols-2">
        {/* Par-stableford og scramble-familien skalerer — vis kun lag med
            spillere, ellers blir gridet dominert av «(tom)»-placeholdere.
            Best-ball beholder tomme slots opp til teams_count så admin ser
            om et lag mangler. Matchplay er fast 2 sider à 1 spiller —
            aldri 3/4 (validatoren håndhever 1+1). */}
        {teamSlots.map((team) => {
          const members = byTeam.get(team) ?? [];
          return (
            <div
              key={team}
              data-testid={`team-overview-${team}`}
              data-members={members.map((m) => m.user_id).join(',')}
              className="rounded-xl border border-border px-3 py-2.5"
            >
              <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {teamLabel} {team}
              </p>
              {members.length === 0 ? (
                <p className="text-sm text-muted">{tDetail('teamEmpty')}</p>
              ) : (
                <ul className="space-y-0.5">
                  {members.map((p) => (
                    <li key={p.user_id} className="text-sm text-text">
                      {displayName(p)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );

  // Par-stableford har flight = team mekanisk — Flights-seksjonen ville
  // duplisert Lag-seksjonen rett over. Matchplay har samme mekanikk
  // (flight = side via payload-laget). Texas scramble har samme regel
  // (validatoren setter flight = team). Skip for solo (ingen flights),
  // par-stableford, matchplay og Texas.
  const flightsCard = !isSolo && !isParStableford && !isMatchplay && !isScramble &&
    flightNumbers.length > 0 && (
    <SectionCard ribbon={tSections('flights')}>
      <ul className="space-y-2 px-3.5 pb-3.5 pt-3">
        {flightNumbers
          .map((f) => (
            <li
              key={f}
              data-testid={`flight-overview-${f}`}
              data-members={(byFlight.get(f) ?? [])
                .map((m) => m.user_id)
                .join(',')}
              className="rounded-xl border border-border px-3 py-2.5"
            >
              <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {tDetail('flightN', { n: f })}
              </p>
              <p className="text-sm text-text">
                {(byFlight.get(f) ?? []).map(displayName).join(', ')}
              </p>
            </li>
          ))}
      </ul>
    </SectionCard>
  );

  // #1669: Lag-seksjon for lag-formater — scheduled og active. Solo-
  // selvpåmelding gir team_number = null, og uten denne seksjonen fantes
  // det ingen vei til å fordele dem etter publisering.
  // modeRequiresTeamNumber er den delte sannhetskilden med start-vakta.
  const lagSeksjon = (() => {
    if (game.status !== 'scheduled' && game.status !== 'active') return null;
    const teamSize = expectedTeamSize(game.mode_config);
    if (!modeRequiresTeamNumber(game.game_mode, teamSize)) return null;
    const activePlayers = players.filter((p) => !p.withdrawn_at);
    return (
      <LagSeksjon
        gameId={gameId}
        teamSize={teamSize}
        players={activePlayers.map((p) => ({
          user_id: p.user_id,
          displayName: displayName(p),
          team_number: p.team_number,
          withdrawn_at: p.withdrawn_at,
        }))}
      />
    );
  })();

  // #543: Flighter-seksjon for solo-spill >4 aktive — scheduled og active.
  // eligibleForFlightAssignment er den delte sannhetskilden for om seksjonen
  // vises, slik at admin-UI og start-vakten holder seg i sync. I lag-formater
  // er flighten laget, og seksjonen finnes ikke (#2290).
  const flighterSeksjon = (() => {
    if (game.status !== 'scheduled' && game.status !== 'active') return null;
    const flightPlayers: FlightPlayer[] = players.map((p) => ({
      user_id: p.user_id,
      flight_number: p.flight_number,
      withdrawn_at: p.withdrawn_at,
    }));
    if (
      !eligibleForFlightAssignment(
        game.game_mode,
        expectedTeamSize(game.mode_config),
        flightPlayers,
      )
    ) {
      return null;
    }
    const activePlayers = flightPlayers.filter((p) => !p.withdrawn_at);
    return (
      <FlighterSeksjon
        gameId={gameId}
        players={activePlayers.map((p) => ({
          user_id: p.user_id,
          displayName: displayName(
            players.find((r) => r.user_id === p.user_id)!,
          ),
          flight_number: p.flight_number,
          withdrawn_at: p.withdrawn_at,
        }))}
      />
    );
  })();

  const playersTable = players.length > 0 && (
    <SectionCard ribbon={tSections('players')}>
      <div className="overflow-x-auto px-2 pb-3.5 pt-2">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
              <th className="px-2 py-1.5 font-semibold">{tDetail('colName')}</th>
              {/* Par-stableford og matchplay har flight = team mekanisk (gjort i
                  payload-laget). Vis kun Lag/Side-kolonnen — Flight-kolonnen ville
                  gjentatt samme tall. Best-ball kan ha avvik (8 spillere på 4 lag
                  kan settes til 1-2 flights) så begge kolonnene er fortsatt informative.
                  Matchplay bruker «Side»-label i stedet for «Lag». */}
              {!isSolo && (
                <th className="px-2 py-1.5 font-semibold">{teamLabel}</th>
              )}
              {isBestBall && (
                <th className="px-2 py-1.5 font-semibold">{tDetail('colFlight')}</th>
              )}
              {/* #905: banehandicap fryses først ved start — skjul kolonnen
                  til den faktisk har verdier (active/finished). */}
              {isPlayPhase && (
                <th className="px-2 py-1.5 text-right font-semibold">{tDetail('colCH')}</th>
              )}
              {game.status !== 'draft' && (
                <th className="px-2 py-1.5 font-semibold">{tDetail('colStatus')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              let statusLabel: string;
              let statusClass: string;
              // Withdrawn (#386): WD takes precedence over all other states.
              if (p.withdrawn_at) {
                statusLabel = tDetail('statusWithdrawn');
                statusClass = 'text-muted';
              } else if (game.status === 'scheduled') {
                // #905: før start spiller ingen ennå — de er påmeldt og venter
                // på «Start runden nå». «Ikke bekreftet»-badgen dekker
                // ubekreftede separat ved siden av navnet.
                statusLabel = tDetail('statusScheduled');
                statusClass = 'text-muted';
              } else if (!p.submitted_at) {
                // På avsluttet spill leverte spilleren aldri scorekortet
                // («avslutt likevel», #375). «Ikke levert» (ikke «ikke
                // fullført») — scorene deres teller fortsatt i resultatet;
                // det er kun leveringen som mangler.
                if (game.status === 'finished') {
                  statusLabel = tDetail('statusNotSubmitted');
                  statusClass = 'text-muted';
                } else {
                  statusLabel = tDetail('statusPlaying');
                  statusClass = 'text-muted';
                }
              } else if (game.require_peer_approval && !p.approved_at) {
                statusLabel = tDetail('statusWaiting');
                statusClass = 'text-warning-text';
              } else {
                statusLabel = tDetail('statusSubmitted');
                statusClass = 'text-success-text';
              }

              // Per-player trekk/angre for active in-scope games.
              const showWdActions =
                game.status === 'active' &&
                supportsWithdrawal(game.game_mode);
              const undoWithdrawAction = showWdActions && p.withdrawn_at
                ? adminUndoWithdraw.bind(null, gameId, p.user_id)
                : null;

              return (
                <tr
                  key={p.user_id}
                  className="border-t"
                  style={{ borderColor: 'var(--row-divider-warm)' }}
                >
                  <td className="px-2 py-2 text-text">
                    <div className="flex items-center gap-1.5">
                      <span>{displayName(p)}</span>
                      {p.accepted_at == null && !p.withdrawn_at && (
                        <UnconfirmedBadge />
                      )}
                    </div>
                  </td>
                  {!isSolo && (
                    <td className="px-2 py-2 text-text">
                      {p.team_number ?? '—'}
                    </td>
                  )}
                  {isBestBall && (
                    <td className="px-2 py-2 text-text">
                      {p.flight_number ?? '—'}
                    </td>
                  )}
                  {isPlayPhase && (
                    <td className="px-2 py-2 text-right text-text">
                      {p.course_handicap != null
                        ? formatWholeHcpDisplay(p.course_handicap, locale as AppLocale)
                        : '—'}
                    </td>
                  )}
                  {game.status !== 'draft' && (
                    <td className={`px-2 py-2 text-xs ${statusClass}`}>
                      <div className="flex items-center gap-2">
                        <span>{statusLabel}</span>
                        {showWdActions && (
                          p.withdrawn_at ? (
                            // Undo-button: small form-button, subtle style
                            <form action={undoWithdrawAction!}>
                              <button
                                type="submit"
                                className="min-h-[44px] rounded px-2 py-1 font-sans text-[11px] font-medium text-primary underline hover:opacity-70"
                              >
                                {tDetail('undoWithdraw')}
                              </button>
                            </form>
                          ) : (
                            // Withdraw link to confirmation page
                            <a
                              href={`/admin/games/${gameId}/trekk-spiller/${p.user_id}`}
                              className="min-h-[44px] inline-flex items-center rounded px-2 py-1 font-sans text-[11px] font-medium text-muted underline hover:opacity-70"
                            >
                              {tDetail('withdrawLink')}
                            </a>
                          )
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );

  const invite = (game.status === 'draft' || game.status === 'scheduled') && (
    <InviteToGameSection
      gameId={gameId}
      status={game.status}
      gameMode={game.game_mode}
      modeConfig={game.mode_config}
      currentPlayerIds={players.map((p) => p.user_id)}
      activePlayerCount={players.filter((p) => !p.withdrawn_at).length}
    />
  );

  const submittedCard = game.status === 'active' && review && (() => {
    const submitted = players.filter((p) => p.submitted_at != null);
    if (submitted.length === 0) return null;
    return (
      <SectionCard ribbon={tSections('submittedScorecards')} id="leverte-scorekort">
        <div className="px-3.5 pb-3.5 pt-3">
          <ul className="-mx-2 divide-y divide-border">
            {submitted.map((p) => {
              const needsApproval =
                game.require_peer_approval && !p.approved_at;
              const approve = adminApproveScorecard.bind(
                null,
                gameId,
                p.user_id,
              );
              const reopen = reopenScorecard.bind(
                null,
                gameId,
                p.user_id,
              );
              return (
                <li
                  key={p.user_id}
                  className="flex flex-col gap-2.5 px-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tracking-tight text-text">
                      {displayName(p)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {/* Par-stableford og matchplay har Flight = Lag/Side mekanisk,
                          så vi viser kun Lag/Side for å unngå redundans. Solo har
                          null på begge og bør droppe begge. Best-ball kan ha avvik
                          mellom Flight og Lag — vis begge der. Matchplay bruker
                          «Side»-label. */}
                      {isSolo
                        ? null
                        : isMatchplay
                          ? tDetail('sideLagSuffix', { n: p.team_number ?? '—' })
                          : isParStableford
                            ? tDetail('lagSuffix', { n: p.team_number ?? '—' })
                            : tDetail('flightLagN', {
                                flight: p.flight_number ?? '—',
                                team: p.team_number ?? '—',
                              })}
                      {needsApproval
                        ? tDetail('pendingApproval')
                        : tDetail('approved')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {needsApproval && (
                      <ApprovePlayerButton approveAction={approve} />
                    )}
                    <ReopenScorecardButton
                      reopenAction={reopen}
                      playerName={displayName(p)}
                    />
                  </div>
                  {review.holes.length > 0 && (
                    <details
                      data-testid="submitted-scorecard-details"
                      className="sm:basis-full"
                    >
                      <summary className="tap-extend text-sm text-muted cursor-pointer hover:text-text transition-colors [--tap-extend:-10px_0_-14px]">
                        {tApprove('showCard')}
                      </summary>
                      <ScorecardTable
                        holes={review.holes}
                        scores={review.scoresByHolder.get(p.user_id) ?? new Map()}
                        teeGender={p.tee_gender}
                        holeSegment={game.hole_segment}
                      />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </SectionCard>
    );
  })();

  // Status-specific CTA cards ───────────────────────────────────────────

  const draftCta = game.status === 'draft' && (
    <SectionCard ribbon={tSections('continuePlanning')}>
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="mb-3 text-sm text-muted">
          {tCta('draftBody')}
        </p>
        {/* #1385: utkastet gjenopptas i veiviseren, og `?step=5` lander
            arrangøren på oppsummeringen — ikke på steg 1 med valg de
            allerede har tatt. */}
        <SmartLink
          href={`/admin/games/${gameId}/edit?step=5`}
          className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {tCta('draftEditButton')}
        </SmartLink>
      </div>
    </SectionCard>
  );

  // #2204: why the round would not start, read without starting it. A
  // structural reason replaces the start card's text with the sentence a
  // refused start would give; a silent one (a cup match that is never played)
  // only stops both cards from promising the auto-start.
  const startBlock = game.status === 'scheduled' ? await getStartBlock(gameId) : null;
  const startBlockedMessage =
    startBlock && isStructuralBlockReason(startBlock.reason)
      ? startBlockMessage(
          startBlock,
          await pendingPlayerList(startBlock.pendingUserIds?.join(',')),
          tErrors,
        )
      : undefined;

  const scheduledCta = game.status === 'scheduled' && (
    <>
      <SectionCard ribbon={tSections('startRound')}>
        <div className="px-3.5 pb-3.5 pt-3">
          {startBlockedMessage ? (
            <div className="mb-3">
              <Banner tone="warning" testId="scheduled-start-blocked">
                {tCta('scheduledStartBlockedLead')} {startBlockedMessage}
              </Banner>
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted">
              {teeOffLabel && !startBlock
                ? tCta('scheduledStartBodyAutoStart', { time: teeOffLabel })
                : tCta('scheduledStartBody')}
            </p>
          )}
          <StartScheduledGameButton
            startAction={startScheduledAction}
            label={tButtons('startRoundNow')}
            confirmText={tButtons('startRoundConfirm')}
          />
        </div>
      </SectionCard>

      <SectionCard ribbon={tSections('editGame')}>
        <div className="px-3.5 pb-3.5 pt-3">
          <p className="mb-3 text-sm text-muted">
            {teeOffLabel && !startBlock
              ? tCta('scheduledEditBodyAutoStart')
              : tCta('scheduledEditBody')}
          </p>
          <SmartLink
            href={`/admin/games/${gameId}/edit`}
            className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
          >
            {tCta('scheduledEditButton')}
          </SmartLink>
        </div>
      </SectionCard>
    </>
  );

  const finishedCta = game.status === 'finished' && (
    <SectionCard ribbon={tSections('result')}>
      <div className="space-y-3 px-3.5 pb-3.5 pt-3">
        <SmartLink
          href={`/games/${gameId}/leaderboard`}
          className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {tCta('leaderboardButton')}
        </SmartLink>
        <ReopenGameButton reopenAction={reopenGameAction} />
      </div>
    </SectionCard>
  );

  return {
    overviewRibbon,
    playersRow,
    submittedRow,
    teamsRow,
    signups,
    betaling,
    formatCard,
    teamsCard,
    flightsCard,
    lagSeksjon,
    flighterSeksjon,
    playersTable,
    invite,
    submittedCard,
    draftCta,
    scheduledCta,
    finishedCta,
  };
}

/** The protocol page's sections, for every status but `active`. */
async function PlayersSections({
  gameId,
  game,
  locale,
}: {
  gameId: string;
  game: GameRow;
  locale: string;
}) {
  const playersRes = await fetchRoster(gameId);
  if (playersRes.error) throw playersRes.error;
  const s = await buildSections({
    gameId,
    game,
    locale,
    players: playersRes.data ?? [],
  });

  return (
    <>
      <SectionCard ribbon={s.overviewRibbon}>
        {s.playersRow}
        {s.submittedRow}
        {s.teamsRow}
      </SectionCard>
      {s.signups}
      {s.betaling}
      {s.formatCard}
      {s.teamsCard}
      {s.flightsCard}
      {s.lagSeksjon}
      {s.flighterSeksjon}
      {s.playersTable}
      {s.invite}
      {s.draftCta}
      {s.scheduledCta}
      {s.finishedCta}
    </>
  );
}

/**
 * The organiser's desk (arrangørpulten, #2268): the page while the round is
 * in progress. The same sections as the protocol page, sorted into three
 * tabs (the design note s12: teams, flights and format live behind
 * «Oppsett»), with «Trenger deg», «Flightene» and a fixed finish bar on top.
 * The rules come from `lib/games/organizerDesk.ts`.
 */
async function PultBody({
  game,
  locale,
  gameName,
  subtitle,
  statusBanner,
  errorMessage,
  errorCode,
  statusCode,
}: {
  game: GameRow;
  locale: string;
  gameName: string;
  subtitle: string;
  statusBanner: string | undefined;
  errorMessage: string | undefined;
  errorCode: string | undefined;
  statusCode: string;
}) {
  const { supabase } = await getAdminGameContext();
  const rosterP = fetchRoster(game.id);
  // #1586: leverte kort skal kunne åpnes og leses før godkjenning/gjenåpning.
  // The review fetch needs the roster, so it chains on the roster's promise
  // and runs alongside the progress and reminder reads instead of after all
  // of them. Admin-sesjonens klient dekker score-lesingen via is_admin()-
  // grenen i RLS-en. Fremdrifts-queryen (uten slag) består — spoiler-vernet
  // i fremdriftsvisningen røres ikke.
  // #2213: the card follows the row owner, so a teammate in the one-ball
  // formats shows the team's strokes (whole roster, withdrawn included).
  const reviewP = rosterP.then((res) =>
    res.error
      ? null
      : fetchScorecardReviewData(supabase, supabase, game.id, game.course_id, {
          mode: game.game_mode,
          roster: res.data ?? [],
          holderIds: (res.data ?? [])
            .filter((p) => p.submitted_at != null)
            .map((p) => p.user_id),
        }),
  );
  const [playersRes, progressRes, preview, reviewData] = await Promise.all([
    rosterP,
    fetchProgress(game.id),
    // The reminder row is a convenience: if its read fails, the desk (and
    // «Avslutt spillet») still renders, just without «Påminn».
    previewReminder(game.id).catch((e: unknown) => {
      console.error('[AdminGameDetailPage] previewReminder', e);
      return null;
    }),
    reviewP,
  ]);
  if (playersRes.error) throw playersRes.error;
  if (progressRes.error) throw progressRes.error;
  const players = playersRes.data ?? [];
  const progress = progressRes.data ?? [];
  const review = reviewData ?? { holes: [], scoresByHolder: new Map() };

  const s = await buildSections({ gameId: game.id, game, locale, players, review });
  const t = await getTranslations('admin.game.pult');
  const tDetail = await getTranslations('admin.game.detail');
  const appLocale = locale as AppLocale;

  const counts = deliveryCounts(players, game.require_peer_approval);
  const deskInput = {
    players,
    scores: progress,
    mode: game.game_mode,
    holeSegment: game.hole_segment,
    startType: game.start_type,
  };

  // Names in the rows are first names, joined the locale's way.
  const byId = new Map(players.map((p) => [p.user_id, p]));
  const nameOf = (userId: string) =>
    firstName(byId.get(userId)?.users?.name) ?? tDetail('unknownPlayer');
  const names = (userIds: readonly string[]) => formatListLocale(userIds.map(nameOf), appLocale);

  // One label per group, read by both «Flightene» and the gap rows, so the
  // two never name a group differently.
  const labelText = (label: ProgressLabel): string => {
    switch (label.kind) {
      case 'flight':
        return tDetail('flightN', { n: label.n });
      case 'side':
        return tDetail('sideN', { n: label.n });
      case 'all':
        return t('allPlayers');
      case 'none':
        return t('noFlight');
    }
  };
  const groups = flightProgress(deskInput).map((g) => ({ ...g, name: labelText(g.label) }));

  const unapproved = splitFinishRoster(players, stampsFromRow, game.require_peer_approval)
    .unapproved;
  // The reminder's own preview (#2017): the row counts exactly whom «Påminn»
  // reaches. A game that stopped being active between the two reads gives no
  // row, as on the status page.
  const reminderTargets = preview?.ok && preview.targets > 0 ? preview : null;
  const guestFlags = players.map((p) => ({
    user_id: p.user_id,
    is_guest: p.users?.is_guest ?? false,
  }));
  const gaps: NeedsYouGap[] = findScoreGaps(deskInput).map((gap) => {
    const { label, hole } = gapLocation(gap, groups);
    // Who «Påminn» would reach: the same rule the server applies when pressed.
    const remindable = missingScoreTargets([gap], guestFlags, gap.userIds)?.userIds ?? [];
    return {
      key: `${gap.userIds.join('-')}:${gap.holes.join('-')}`,
      names: names(gap.userIds),
      people: gap.userIds.length,
      holes: formatListLocale(gap.holes.map(String), appLocale),
      holeCount: gap.holes.length,
      remind:
        remindable.length > 0
          ? {
              action: remindMissingScore.bind(null, game.id, remindable),
              names: names(remindable),
              people: remindable.length,
            }
          : null,
      where:
        label.kind === 'flight' || label.kind === 'side'
          ? { kind: 'group', group: labelText(label), hole }
          : { kind: 'entered', hole },
    };
  });

  const needsSideWizard =
    game.side_tournament_enabled &&
    game.side_ld_count + game.side_ctp_count > 0;
  // «Avslutt likevel» (#375): the side tournament goes through the winners
  // wizard, which handles the missing itself; otherwise the dedicated
  // confirmation page.
  const forceEndHref = needsSideWizard
    ? `/admin/games/${game.id}/avslutt`
    : `/admin/games/${game.id}/avslutt-likevel`;

  const live = (
    <>
      <NeedsYouList
        pendingApproval={
          unapproved.length > 0
            ? { count: unapproved.length, names: names(unapproved.map((p) => p.user_id)) }
            : null
        }
        finished={
          reminderTargets
            ? {
                count: reminderTargets.targets,
                names: names(
                  players
                    .filter((p) => reminderTargets.targetUserIds.includes(p.user_id))
                    .map((p) => p.user_id),
                ),
                remindAction: remindUnsubmittedPlayers.bind(null, game.id),
              }
            : null
        }
        gaps={gaps}
      />
      <FlightProgressList groups={groups} holeSegment={game.hole_segment} />
      {s.submittedCard}
      <div className="mt-4 px-1 text-center">
        <SmartLink
          href={`/admin/games/${game.id}/status`}
          data-testid="pult-view-status"
          className="tap-extend font-sans text-[13px] font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary [--tap-extend:-12px_-8px]"
        >
          {t('viewStatus')}
        </SmartLink>
      </div>
    </>
  );

  const playersPanel = (
    <>
      <SectionCard ribbon={s.overviewRibbon}>{s.playersRow}</SectionCard>
      {s.signups}
      {s.betaling}
      {s.playersTable}
    </>
  );

  const setup = (
    <>
      <div className="mt-4">
        <TitleBlock game={game} gameName={gameName} subtitle={subtitle} heading={false} />
      </div>
      {s.formatCard}
      {s.teamsRow && <SectionCard ribbon={s.overviewRibbon}>{s.teamsRow}</SectionCard>}
      {s.teamsCard}
      {s.flightsCard}
      {s.lagSeksjon}
      {s.flighterSeksjon}
      <CreatedAtLine createdAt={game.created_at} />
      <DangerZone gameId={game.id} />
    </>
  );

  return (
    <>
      <PultHeader
        gameName={gameName}
        counts={counts}
        startedAt={game.started_at}
        renderedAt={new Date().toISOString()}
      />
      <div className="-mx-1">
        <StatusBanners
          statusBanner={statusBanner}
          errorMessage={errorMessage}
          errorCode={errorCode}
        />
        <PultTabs
          key={`${statusCode}|${errorCode ?? ''}`}
          initialTab={pultInitialTab({ status: statusCode, error: errorCode })}
          live={live}
          players={playersPanel}
          setup={setup}
        />
      </div>
      <EndGameBar
        readiness={endGameReadiness(counts)}
        total={counts.total}
        requirePeerApproval={game.require_peer_approval}
        gameId={game.id}
        endAction={endGame.bind(null, game.id)}
        sideTournament={{
          enabled: game.side_tournament_enabled,
          ldCount: game.side_ld_count,
          ctpCount: game.side_ctp_count,
        }}
        forceEndHref={forceEndHref}
      />
    </>
  );
}

function PlayersSectionsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <section key={i} className="mt-1.5">
          {/* MiniRibbon-shaped placeholder. MiniRibbon types its children
              as `string`, so we render the skeleton inline rather than as
              a ribbon child. */}
          <div className="flex items-center gap-2.5 px-1 pt-2.5 pb-1.5">
            <Skeleton className="h-2.5 w-20" delay={i * 90} />
            <span
              aria-hidden
              className="block h-px flex-1"
              style={{
                background:
                  'linear-gradient(90deg, var(--brass-line-top) 0%, transparent 90%)',
              }}
            />
          </div>
          <div
            className="overflow-hidden rounded-xl border border-border bg-surface"
            style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
          >
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="grid items-baseline gap-3.5 px-3.5 py-2.5"
                style={{
                  gridTemplateColumns: '1fr auto',
                  borderTop:
                    j === 0 ? 'none' : '1px solid var(--row-divider-warm)',
                }}
              >
                <Skeleton className="h-3 w-24" delay={i * 90 + j * 30} />
                <Skeleton className="h-3 w-10" delay={i * 90 + j * 30 + 20} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/**
 * "Section card" — a Card with a MiniRibbon header. Mini-ribbon sits outside
 * the card surface (per spec), the body owns the chrome.
 */
function SectionCard({
  ribbon,
  children,
  id,
}: {
  ribbon: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-1.5">
      <MiniRibbon>{ribbon}</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{
          boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * "Row" — ledger-style label/value pair with optional italic sub-line.
 * Used inside the spec's Påmelding/Format/Banen cards.
 */
function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'full';
}) {
  return (
    <div
      className="grid items-baseline gap-3.5 px-3.5 py-2.5 first:border-t-0"
      style={{
        gridTemplateColumns: '1fr auto',
        borderTop: '1px solid var(--row-divider-warm)',
      }}
    >
      <div>
        <p className="font-sans text-[12.5px] font-medium text-text">{label}</p>
        {sub && (
          <p className="mt-0.5 font-serif text-[11px] italic text-muted">
            {sub}
          </p>
        )}
      </div>
      <p
        className="text-right font-serif text-[15px] font-medium tabular-nums tracking-[-0.005em]"
        style={{
          color: tone === 'full' ? 'var(--score-under-fg)' : 'var(--text)',
        }}
      >
        {value}
      </p>
    </div>
  );
}
