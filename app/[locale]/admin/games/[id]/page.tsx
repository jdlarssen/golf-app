import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatDateTime, formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import { osloYearWindow } from '@/lib/format/osloCalendar';
import type { AppLocale } from '@/i18n/routing';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { ModeChip } from '@/components/ui/ModeChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
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
import { StartGameButton } from './StartGameButton';
import { StartScheduledGameButton } from './StartScheduledGameButton';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { EndGameButton } from './EndGameButton';
import { ApprovePlayerButton } from './ApprovePlayerButton';
import { ReopenScorecardButton } from './ReopenScorecardButton';
import { ReopenGameButton } from './ReopenGameButton';
import { RegistrationOverviewSection } from './RegistrationOverviewSection';
import {
  startGame,
  startScheduledGameAction,
  adminApproveScorecard,
  endGame,
  reopenScorecard,
  reopenGame,
  adminUndoWithdraw,
} from './actions';
import {
  getRatingForGender,
  type TeeBoxRatings,
} from '@/lib/games/teeRating';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import { InviteToGameSection } from './InviteToGameSection';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';
import { FlighterSeksjon } from './FlighterSeksjon';
import {
  eligibleForFlightAssignment,
  type FlightPlayer,
} from '@/lib/games/flightScope';
import { localizeGameName } from '@/lib/games/autoGameName';
import { toggleSignupsClosed } from './flightActions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
  emails?: string | string[];
}>;

const STATUS_TO_TONE: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

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
  courses: { name: string } | null;
  tee_boxes: (TeeBoxRatings & { name: string }) | null;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: {
    // name is null until the invitee completes their profile — see
    // migration 0014. Pre-created placeholder rows can still appear on a
    // draft roster, so consumers must fall back to email below.
    name: string | null;
    nickname: string | null;
    hcp_index: number | string;
    email: string;
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
  const statusBanner =
    statusCode && tBanners.has(statusCode as Parameters<typeof tBanners>[0])
      ? tBanners(statusCode as Parameters<typeof tBanners>[0])
      : undefined;
  const errorCode = first(sp.error);
  const emails = first(sp.emails);
  function buildErrorMessage(): string | undefined {
    if (!errorCode) return undefined;
    const key = `${errorCode}` as Parameters<typeof tErrors>[0];
    if (!tErrors.has(key)) return undefined;
    return tErrors(key, { list: emails ? `: ${emails}` : '' });
  }
  const errorMessage = buildErrorMessage();

  const { supabase } = await getAdminGameContext();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Runs before the
  // game-row fetch so trusted-non-admin (and unauthenticated) callers never
  // see the row even if RLS would have allowed the select.
  await requireAdmin(supabase);

  // Gating: fetch the game row first so we can render the title bar
  // synchronously. The rest of the page (players, progress, sak-number,
  // cards, CTAs) streams behind Suspense boundaries below.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, game_mode, mode_config, hcp_allowance_pct, require_peer_approval, course_id, tee_box_id, started_at, ended_at, scheduled_tee_off_at, created_at, side_tournament_enabled, side_ld_count, side_ctp_count, registration_mode, registration_type, short_id, signups_closed_at, courses(name), tee_boxes(name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) {
    notFound();
  }

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

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/games"
        kicker={tDetail('brassRibbon')}
      />

      <BrassRibbon kicker={tDetail('brassRibbon')} />

      {/* Title block */}
      <div className="px-1">
        <div className="mb-1.5 flex items-center gap-2">
          <StatusChip tone={STATUS_TO_TONE[game.status]} />
          <ModeChip mode={game.game_mode} modeConfig={game.mode_config} />
          <Suspense fallback={<Skeleton className="h-3 w-20" />}>
            <SakNumber createdAt={game.created_at} />
          </Suspense>
        </div>
        <h1 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
          {localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale)}
        </h1>
        <p className="mt-1 font-sans text-xs tabular-nums text-muted">
          {[game.courses?.name, subtitleDate].filter(Boolean).join(' · ')}
        </p>
      </div>

      {(statusBanner || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusBanner && <Banner tone="success">{statusBanner}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <Suspense fallback={<PlayersSectionsSkeleton />}>
        <PlayersSections gameId={id} game={game} locale={locale} />
      </Suspense>

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        <Suspense fallback={<Skeleton className="inline-block h-3 w-32" />}>
          <CreatedAtFooter createdAt={game.created_at} />
        </Suspense>
      </p>

      {/* Danger zone — permanent delete */}
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
              href={`/admin/games/${id}/slett`}
              className="font-sans text-[13px] font-medium"
              style={{ color: 'var(--danger-deep)' }}
            >
              {tDetail('deleteGame')}
            </SmartLink>
          </div>
        </div>
      </section>
    </AdminShell>
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

async function PlayersSections({
  gameId,
  game,
  locale,
}: {
  gameId: string;
  game: GameRow;
  locale: string;
}) {
  const { supabase } = await getAdminGameContext();
  const tDetail = await getTranslations('admin.game.detail');
  const tSections = await getTranslations('admin.game.sections');
  const tRows = await getTranslations('admin.game.rows');
  const tCta = await getTranslations('admin.game.cta');
  const tModes = await getTranslations('modes');

  // game_players has two FKs to users (user_id and approved_by_user_id), so
  // we must disambiguate via the named constraint.
  const playersPromise = supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at, approved_at, withdrawn_at, accepted_at, users!game_players_user_id_fkey(name, nickname, hcp_index, email)',
    )
    .eq('game_id', gameId)
    .returns<GamePlayerRow[]>();

  // Live progress: hole_number and user_id only (NO strokes — avoid spoilers).
  // Admin sees how far each flight has come without seeing the values. Only
  // queried for active games — for everything else, skip the round-trip.
  type ProgressRow = { user_id: string; hole_number: number };
  const progressPromise =
    game.status === 'active'
      ? supabase
          .from('scores')
          .select('user_id, hole_number')
          .eq('game_id', gameId)
          .not('strokes', 'is', null)
          .returns<ProgressRow[]>()
      : Promise.resolve({ data: [] as ProgressRow[], error: null });

  const [playersRes, progressRes] = await Promise.all([
    playersPromise,
    progressPromise,
  ]);

  if (playersRes.error) throw playersRes.error;
  if (progressRes.error) throw progressRes.error;

  const players = playersRes.data ?? [];

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
  //  - isBestBall: 4 lag à 2 spillere; flight kan avvike fra team. Full
  //    Lag-grid (4 hardkodet) + Lag+Flight-kolonner.
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

  // Lag-terminologi: matchplay bruker «Side» i stedet for «Lag» (golf-standard
  // for 1v1-format). Holdt som lokale strings slik at vi ikke trenger å fyre
  // ternary på hver call-site i markup.
  const teamLabel = isMatchplay ? tDetail('teamLabel') : tDetail('teamLabelDefault');
  // Maks-antall lag/sider for «X / Y»-disply i Påmelding-cardet. Best-ball er
  // alltid 4, par-stableford skalerer 1-4 men UX-en viser fortsatt mot 4 for
  // konsistens, matchplay er alltid 2.
  const teamsMax = isMatchplay ? 2 : 4;

  // Group by team (1..4). Each team has up to 2 players.
  const byTeam: Record<number, GamePlayerRow[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) {
    if (byTeam[p.team_number]) byTeam[p.team_number].push(p);
  }

  // Group by flight (1..4) for the flight overview.
  const byFlight: Record<number, GamePlayerRow[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) {
    if (byFlight[p.flight_number]) byFlight[p.flight_number].push(p);
  }

  const progressByFlight: Record<
    number,
    { maxHole: number; filledCells: number; totalCells: number }
  > = {};
  if (game.status === 'active') {
    const rows = progressRes.data ?? [];
    for (const f of [1, 2, 3, 4]) {
      const flightPlayers = byFlight[f];
      if (flightPlayers.length === 0) continue;
      const userIds = new Set(flightPlayers.map((p) => p.user_id));
      const flightRows = rows.filter((r) => userIds.has(r.user_id));
      const maxHole = flightRows.reduce(
        (m, r) => Math.max(m, r.hole_number),
        0,
      );
      progressByFlight[f] = {
        maxHole,
        filledCells: flightRows.length,
        totalCells: flightPlayers.length * 18,
      };
    }
  }

  function displayName(p: GamePlayerRow): string {
    if (!p.users) return tDetail('unknownPlayer');
    // Pending invitee — show email until they complete their profile.
    const name = p.users.name ?? p.users.email;
    return p.users.nickname ? `${name} «${p.users.nickname}»` : name;
  }

  const startAction = startGame.bind(null, gameId);
  const startScheduledAction = startScheduledGameAction.bind(null, gameId);
  const endAction = endGame.bind(null, gameId);
  const reopenGameAction = reopenGame.bind(null, gameId);

  // Withdrawn players (#386): excluded from readiness counts and the
  // «Levert X/Y» denominator. The total «Spillere»-row still uses players.length.
  const rankablePlayers = players.filter((p) => !p.withdrawn_at);

  // Readiness preview for the end-game button (only meaningful when active).
  const notSubmittedCount = rankablePlayers.filter((p) => !p.submitted_at).length;
  const pendingApprovalCount = game.require_peer_approval
    ? rankablePlayers.filter((p) => p.submitted_at != null && p.approved_at == null)
        .length
    : 0;
  const everyPlayerReady =
    rankablePlayers.length > 0 &&
    notSubmittedCount === 0 &&
    pendingApprovalCount === 0;

  // «Avslutt likevel» (#375): når levering er ENESTE blokker (ingen scorekort
  // venter på godkjenning — det er #360s domene), tilby en escape i stedet for
  // en blindvei. Sideturnering må innom vinnervalg-wizarden, som selv håndterer
  // de manglende; ellers går vi til den dedikerte bekreftelses-siden.
  const onlyMissingBlocks =
    rankablePlayers.length > 0 && notSubmittedCount > 0 && pendingApprovalCount === 0;
  const needsSideWizard =
    game.side_tournament_enabled &&
    game.side_ld_count + game.side_ctp_count > 0;
  const avsluttLikevelHref = needsSideWizard
    ? `/admin/games/${gameId}/avslutt`
    : `/admin/games/${gameId}/avslutt-likevel`;

  const teamCount = [1, 2, 3, 4].filter((t) => byTeam[t].length > 0).length;
  const submittedCount = rankablePlayers.filter((p) => p.submitted_at != null).length;

  return (
    <>
      {/* Card 1 — Registration */}
      <SectionCard ribbon={tSections('registration')}>
        <Row
          label={tRows('players')}
          value={`${players.length}`}
          tone={players.length > 0 ? 'full' : undefined}
        />
        <Row
          label={tRows('submittedScorecard')}
          value={`${submittedCount} / ${rankablePlayers.length}`}
          sub={
            notSubmittedCount > 0
              ? game.status === 'finished'
                ? tRows('notSubmittedFinished', { count: notSubmittedCount })
                : game.status === 'active'
                  ? tRows('notSubmittedWaiting', { count: notSubmittedCount })
                  : undefined
              : undefined
          }
        />
        {!isSolo && (
          <Row label={isMatchplay ? tRows('teamCount') : tRows('teamCountDefault')} value={`${teamCount} / ${teamsMax}`} />
        )}
      </SectionCard>

      {/* Påmelding-oversikt (#199, utvidet #368) — vises for alle modi;
          invite_only tar nå imot «be om å bli med»-forespørsler. */}
      <RegistrationOverviewSection
        gameId={gameId}
        registrationMode={game.registration_mode}
        shortId={game.short_id}
        selfRegisteredCount={players.length}
      />

      {/* #543: Steng påmelding — kun scheduled + open/manual_approval. */}
      {game.status === 'scheduled' &&
        (game.registration_mode === 'open' ||
          game.registration_mode === 'manual_approval') && (
          <SectionCard ribbon={tSections('manageSignups')}>
            <div className="px-3.5 pb-3.5 pt-3">
              {game.signups_closed_at ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    {tCta('signupsClosedBody')}
                  </p>
                  <form action={toggleSignupsClosed.bind(null, gameId, false)}>
                    <button
                      type="submit"
                      className="block w-full min-h-[44px] rounded-full border border-border bg-surface px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
                    >
                      {tCta('reopenSignupsButton')}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    {tCta('closeSignupsBody')}
                  </p>
                  <form action={toggleSignupsClosed.bind(null, gameId, true)}>
                    <button
                      type="submit"
                      className="block w-full min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
                    >
                      {tCta('closeSignupsButton')}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </SectionCard>
        )}

      {/* Card 2 — Format */}
      <SectionCard ribbon={tSections('format')}>
        <Row label={tRows('gameMode')} value={modeLabel} />
        <Row
          label={tRows('hcpAllowance')}
          value={`${game.hcp_allowance_pct} %`}
        />
        <Row
          label={tRows('peerApproval')}
          value={game.require_peer_approval ? tRows('peerApprovalOn') : tRows('peerApprovalOff')}
        />
        {game.scheduled_tee_off_at && (
          <Row
            label={tRows('teeOff')}
            value={formatDateTime(game.scheduled_tee_off_at, locale as AppLocale, {
              // Pin to Oslo (#637) — without timeZone, toLocaleString renders in
              // the server TZ (UTC on Vercel), showing 08:00 for a 10:00 tee-off.
              timeZone: 'Europe/Oslo',
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
        )}
      </SectionCard>

      {/* Card 3 — Course */}
      <SectionCard ribbon={tSections('course')}>
        <Row
          label={tRows('course')}
          value={game.courses?.name ?? tRows('unknownCourse')}
        />
        {game.tee_boxes && (
          <>
            <Row label={tRows('tee')} value={game.tee_boxes.name} />
            {(['mens', 'ladies', 'juniors'] as const).map((g) => {
              const rating = getRatingForGender(game.tee_boxes!, g);
              if (!rating) return null;
              const label =
                g === 'mens' ? tRows('genderMens') : g === 'ladies' ? tRows('genderLadies') : tRows('genderJuniors');
              return (
                <Row
                  key={g}
                  label={label}
                  value={`slope ${rating.slope} / CR ${rating.courseRating.toFixed(1)} / par ${rating.par}`}
                />
              );
            })}
          </>
        )}
      </SectionCard>

      {/* Operational sections — kept full-fidelity ────────────────────── */}

      {game.status === 'active' && (
        <SectionCard ribbon={tSections('progress')}>
          <div className="px-3.5 pt-3 pb-3.5">
            <p className="mb-3 text-xs text-muted">
              {isMatchplay
                ? tDetail('progressMatchDesc')
                : tDetail('progressFlightDesc')}
            </p>
            <ul className="space-y-3.5">
              {[1, 2, 3, 4]
                .filter((f) => byFlight[f].length > 0)
                .map((f) => {
                  const p = progressByFlight[f];
                  const pct = p
                    ? Math.round((p.filledCells / p.totalCells) * 100)
                    : 0;
                  // Matchplay: flight = side mekanisk, så vi viser «Side N» her
                  // i stedet for «Flight N» for å matche resten av detail-pagen.
                  const groupLabel = isMatchplay
                    ? tDetail('sideN', { n: f })
                    : tDetail('flightN', { n: f });
                  return (
                    <li key={f}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium tracking-tight text-text">
                          {groupLabel}
                        </span>
                        <span className="text-xs tabular-nums text-muted">
                          {p && p.maxHole > 0
                            ? tDetail('hullN', { n: p.maxHole })
                            : tDetail('notStarted')}
                          {' · '}
                          {p ? `${p.filledCells}/${p.totalCells}` : '0/0'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        </SectionCard>
      )}

      {!isSolo && (
        <SectionCard ribbon={isMatchplay ? tSections('sides') : tSections('teams')}>
          <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-3.5 pt-3 sm:grid-cols-2">
            {/* Par-stableford skalerer 1-4 lag — vis kun lag med spillere, ellers
                blir gridet dominert av «(tom)»-placeholdere. Best-ball er fast
                4 lag à 2 og bør beholde tomme-slots så admin ser om lag mangler.
                Matchplay er fast 2 sider à 1 spiller — vis kun Side 1 og Side 2,
                aldri 3/4 (validatoren håndhever 1+1). Texas scramble skalerer
                1-4 lag (avhengig av lagstørrelse) — speilar par-stableford. */}
            {[1, 2, 3, 4]
              .filter((team) => {
                if (isMatchplay) return team <= 2;
                if (isParStableford || isScramble) return byTeam[team].length > 0;
                return true;
              })
              .map((team) => (
                <div
                  key={team}
                  className="rounded-xl border border-border px-3 py-2.5"
                >
                  <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {teamLabel} {team}
                  </p>
                  {byTeam[team].length === 0 ? (
                    <p className="text-sm text-muted">{tDetail('teamEmpty')}</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {byTeam[team].map((p) => (
                        <li key={p.user_id} className="text-sm text-text">
                          {displayName(p)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        </SectionCard>
      )}

      {/* Par-stableford har flight = team mekanisk — Flights-seksjonen ville
          duplisert Lag-seksjonen rett over. Matchplay har samme mekanikk
          (flight = side via payload-laget). Texas scramble har samme regel
          (validatoren setter flight = team). Skip for solo (ingen flights),
          par-stableford, matchplay og Texas. */}
      {!isSolo && !isParStableford && !isMatchplay && !isScramble &&
        [1, 2, 3, 4].some((f) => byFlight[f].length > 0) && (
        <SectionCard ribbon={tSections('flights')}>
          <ul className="space-y-2 px-3.5 pb-3.5 pt-3">
            {[1, 2, 3, 4]
              .filter((f) => byFlight[f].length > 0)
              .map((f) => (
                <li
                  key={f}
                  className="rounded-xl border border-border px-3 py-2.5"
                >
                  <p className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {tDetail('flightN', { n: f })}
                  </p>
                  <p className="text-sm text-text">
                    {byFlight[f].map(displayName).join(', ')}
                  </p>
                </li>
              ))}
          </ul>
        </SectionCard>
      )}

      {/* #543: Flighter-seksjon for solo-spill >4 aktive — scheduled og active.
          eligibleForFlightAssignment er den delte sannhetskilden for om seksjonen
          vises, slik at admin-UI og start-vakten holder seg i sync. */}
      {(() => {
        if (game.status !== 'scheduled' && game.status !== 'active') return null;
        const flightPlayers: FlightPlayer[] = players.map((p) => ({
          user_id: p.user_id,
          flight_number: p.flight_number,
          withdrawn_at: p.withdrawn_at,
        }));
        if (!eligibleForFlightAssignment(game.game_mode, flightPlayers)) return null;
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
            }))}
          />
        );
      })()}

      {players.length > 0 && (
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
                  <th className="px-2 py-1.5 text-right font-semibold">{tDetail('colCH')}</th>
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
                    statusClass = 'text-warning';
                  } else {
                    statusLabel = tDetail('statusSubmitted');
                    statusClass = 'text-success';
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
                        <td className="px-2 py-2 text-text">{p.team_number}</td>
                      )}
                      {isBestBall && (
                        <td className="px-2 py-2 text-text">{p.flight_number}</td>
                      )}
                      <td className="px-2 py-2 text-right text-text">
                        {p.course_handicap ?? '—'}
                      </td>
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
      )}

      {(game.status === 'draft' || game.status === 'scheduled') && (
        <InviteToGameSection
          gameId={gameId}
          status={game.status}
          gameMode={game.game_mode}
          currentPlayerIds={players.map((p) => p.user_id)}
        />
      )}

      {game.status === 'active' && (() => {
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
                      className="flex flex-col gap-2.5 px-2 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                              ? tDetail('sideLagSuffix', { n: p.team_number })
                              : isParStableford
                                ? tDetail('lagSuffix', { n: p.team_number })
                                : tDetail('flightLagN', { flight: p.flight_number, team: p.team_number })}
                          {needsApproval
                            ? tDetail('pendingApproval')
                            : tDetail('approved')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {needsApproval && (
                          <ApprovePlayerButton
                            approveAction={approve}
                            playerName={displayName(p)}
                          />
                        )}
                        <ReopenScorecardButton
                          reopenAction={reopen}
                          playerName={displayName(p)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </SectionCard>
        );
      })()}

      {/* Status-specific CTA cards ─────────────────────────────────────── */}

      {game.status === 'draft' && (
        <>
          <SectionCard ribbon={tSections('continuePlanning')}>
            <div className="px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-sm text-muted">
                {tCta('draftBody')}
              </p>
              <SmartLink
                href={`/admin/games/${gameId}/edit`}
                className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
              >
                {tCta('draftEditButton')}
              </SmartLink>
            </div>
          </SectionCard>

          <div className="mt-4">
            <StartGameButton
              startAction={startAction}
              gameName={localizeGameName(game.name, game.courses?.name ?? null, locale as AppLocale)}
            />
          </div>
        </>
      )}

      {game.status === 'scheduled' && (
        <>
          <SectionCard ribbon={tSections('startRound')}>
            <div className="px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-sm text-muted">
                {tCta('scheduledStartBody')}
              </p>
              <StartScheduledGameButton startAction={startScheduledAction} />
            </div>
          </SectionCard>

          <SectionCard ribbon={tSections('editGame')}>
            <div className="px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-sm text-muted">
                {tCta('scheduledEditBody')}
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
      )}

      {game.status === 'active' && (
        <SectionCard ribbon={tSections('endGame')}>
          <div className="px-3.5 pb-3.5 pt-3">
            {everyPlayerReady ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  {tCta('allReadyBody', {
                    andApproved: game.require_peer_approval ? tCta('allReadyAndApproved') : '',
                  })}
                </p>
                <EndGameButton
                  endAction={endAction}
                  gameId={game.id}
                  disabled={!everyPlayerReady}
                  sideTournament={{
                    enabled: game.side_tournament_enabled,
                    ldCount: game.side_ld_count,
                    ctpCount: game.side_ctp_count,
                  }}
                />
              </div>
            ) : onlyMissingBlocks ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
                  <p>
                    {tCta('missingWarning', {
                      notSubmitted: notSubmittedCount,
                      total: rankablePlayers.length,
                    })}
                  </p>
                </div>
                <SmartLink
                  href={avsluttLikevelHref}
                  className="block min-h-[44px] rounded-full bg-primary px-4 py-3 text-center font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
                >
                  {tCta('forceEndButton')}
                </SmartLink>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
                  {notSubmittedCount > 0 && (
                    <p>
                      {tCta('notSubmittedWarning', {
                        notSubmitted: notSubmittedCount,
                        total: rankablePlayers.length,
                      })}
                    </p>
                  )}
                  {pendingApprovalCount > 0 && (
                    <p className={notSubmittedCount > 0 ? 'mt-1.5' : undefined}>
                      {tCta('pendingApprovalWarning', { count: pendingApprovalCount })}
                    </p>
                  )}
                </div>
                {pendingApprovalCount > 0 && (
                  <a
                    href="#leverte-scorekort"
                    className="block min-h-[44px] rounded-full border border-border px-4 py-3 text-center font-medium tracking-tight text-text transition-colors hover:bg-surface-2"
                  >
                    {tCta('scrollToScorecardsButton')}
                  </a>
                )}
              </div>
            )}

            <div className="mt-3 border-t border-border pt-3 text-center">
              <SmartLink
                href={`/admin/games/${gameId}/status`}
                className="font-sans text-[13px] font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary"
              >
                {notSubmittedCount > 0
                  ? tCta('viewStatusWithReminderLink')
                  : tCta('viewStatusLink')}
              </SmartLink>
            </div>
          </div>
        </SectionCard>
      )}

      {game.status === 'finished' && (
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
      )}
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
