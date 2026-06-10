import { Suspense, cache } from 'react';
import { getLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/i18n/format';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton, Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Kicker } from '@/components/ui/Kicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { type GameStatus, STATUS_LABELS } from '@/lib/games/status';
import { isSoloFormat, supportsWithdrawal } from '@/lib/scoring/modes/types';
import { MailEnvelope } from '@/components/icons/MailEnvelope';
import { firstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import { formatTeeOffTime, formatTeeOffDate } from '@/lib/format/teeOff';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import {
  getGameWithPlayers,
  type GameForHole,
} from '@/lib/games/getGameWithPlayers';
import { scorecardTitle } from '@/lib/games/scorecardTitle';
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import { maybeSendDeliveryReminder } from '@/lib/notifications/deliveryReminder';
import { maybeAutoConfirmParticipation } from '@/lib/games/confirmParticipation';
import { isHandicapStale } from '@/lib/handicap/staleness';
import { HandicapConfirmCard } from '@/components/handicap/HandicapConfirmCard';
import { ModeGuideCard } from '@/components/ModeGuideCard';
import { ScheduledWaitingRoom } from '../ScheduledWaitingRoom';
import { getModeContentMap, mergeModeContent } from '@/lib/formats/getModeContent';
import { formatDisplayLabel } from '@/lib/games/formatLabel';
import { submitUndoWithdraw } from '../trekk-fra/actions';
import { UnconfirmedBadge } from '@/components/ui/UnconfirmedBadge';
import {
  isMatchplayMode,
  computeSideShortfall,
} from '@/lib/games/matchplaySides';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
}>;

// Map player-facing game lifecycle onto StatusChip's admin tone palette —
// each tone's hue happens to fit the player meaning too:
//  · aktiv (sage)      → Pågående
//  · påmelding (amber) → Planlagt (waiting for tee-off)
//  · signert (muted)   → Avsluttet (round closed)
//  · utkast (brick)    → Utkast (admin only — players never see this state)
const STATUS_TONES: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

const STATUS_BANNERS: Record<string, string> = {
  submitted: '✓ Scorekortet er levert.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  scheduled_tee_off_at: string | null;
  require_peer_approval: boolean;
  /**
   * Game-mode discriminator — leses fra cache-rad eller re-fetch ved auto-
   * start. Bestemmer hvilken view-variant av spill-hjem som rendres (solo
   * stableford dropper team-strip, best-ball viser Lag/Flight/CH).
   *
   * Speilet `GameMode` fra `lib/scoring/modes/types.ts` — utvides når nye
   * moduser landes. Holdt som lokal alias for å unngå dyptkoblet import i en
   * server-component som allerede leser status-unionen lokalt.
   */
  game_mode:
    | 'best_ball'
    | 'stableford'
    | 'modified_stableford'
    | 'singles_matchplay'
    | 'solo_strokeplay'
    | 'texas_scramble'
    | 'ambrose'
    | 'florida_scramble'
    | 'fourball_matchplay'
    | 'foursomes_matchplay'
    | 'greensome_matchplay'
    | 'chapman_matchplay'
    | 'gruesome_matchplay'
    | 'wolf'
    | 'nassau'
    | 'skins'
    | 'bingo_bango_bongo'
    | 'nines'
    | 'round_robin'
    | 'acey_deucey'
    | 'shamble'
    | 'patsome';
  /**
   * Mode-spesifikk config fra `games.mode_config` (JSONB). Type-en speilet
   * fra `GameForHole` slik at scorecardTitle() kan resolve riktig tittel/
   * label per modus (best-ball + 4BBB + texas → «Lagets scorekort»,
   * matchplay → «Match-scorekort», solo → «Mitt scorekort»). Settes fra
   * `gwp.game` via spread.
   */
  mode_config: GameForHole['mode_config'];
  courses: { name: string } | null;
  tee_boxes:
    | (TeeBoxRatings & { name: string; length_meters: number | null })
    | null;
};

const GAME_SELECT =
  'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, require_peer_approval, game_mode, courses(name), tee_boxes(name, length_meters, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)';

type FlightRosterRow = {
  user_id: string;
  flight_number: number;
  accepted_at: string | null;
  users: {
    // `name` is null for pending invitees per migration 0014. The flight
    // roster only renders for active games, and the publish-gate (Task 7)
    // prevents a game from leaving 'draft' with pending players on the
    // roster — so in practice this is always set here. Kept nullable to
    // match the DB column and stay safe against future flows.
    name: string | null;
    nickname: string | null;
    hcp_index: number | string | null;
  } | null;
};

/** Locale-aware thousands-separator. 6124 → "6 124" (no) / "6,124" (en). */
function formatLengthMeters(n: number, locale: AppLocale): string {
  return formatNumber(n, locale);
}

type FlightMatePlayerRow = {
  user_id: string;
  flight_number: number;
  submitted_at: string | null;
  approved_at: string | null;
};

type UiState =
  | 'not_started'
  | 'in_progress'
  | 'ready_to_submit'
  | 'submitted_pending_approval'
  | 'submitted_approved';

function computeState(opts: {
  strokesCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}): UiState {
  const { strokesCount, submittedAt, approvedAt, requirePeerApproval } = opts;
  if (submittedAt) {
    if (requirePeerApproval && !approvedAt) {
      return 'submitted_pending_approval';
    }
    return 'submitted_approved';
  }
  if (strokesCount === 0) return 'not_started';
  if (strokesCount >= 18) return 'ready_to_submit';
  return 'in_progress';
}

// Request-scoped Supabase client + verified user id. Sharing the same client
// across suspended siblings means we don't pay the cookie-auth round-trip
// per section.
const getGameContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function GameHomePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const sp = await searchParams;
  const statusBanner = STATUS_BANNERS[first(sp.status) ?? ''] ?? undefined;

  // Snapshot "now" once per request for the E1 auto-start guard below.
  // The react-hooks/purity lint rule flags Date.now() as impure regardless
  // of context, but this IS a server component that runs once per request —
  // the snapshot is semantically equivalent to a server-side "now()" call.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const { supabase, userId } = await getGameContext();
  // Proxy redirects unauthenticated users, but be defensive.
  if (!userId) redirect('/login');

  // Initial gating data — game + game_players come from the tag-cached
  // helper (per-hole-bytte cache hit; see lib/games/getGameWithPlayers.ts).
  // The `courses(...)` / `tee_boxes(...)` joins are NOT cached (would
  // require cross-game fan-out on course-edits), so they ride a slim
  // direct fetch in parallel. Authorization stays at the call-site via
  // `me = players.find(...)` notFound() below.
  const [gwp, joinsRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('games')
      .select(
        'courses(name), tee_boxes(name, length_meters, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
      )
      .eq('id', id)
      .single<Pick<GameRow, 'courses' | 'tee_boxes'>>(),
  ]);

  if (!gwp) notFound();
  if (joinsRes.error || !joinsRes.data) notFound();
  const me = gwp.players.find((p) => p.user_id === userId);
  if (!me) notFound();

  // #427: the game's creator gets an «Avslutt spill»-affordance on game-home
  // (admins finish from Sekretariatet). Read from the immutable created_by on
  // the cached game row so it survives the auto-start refetch below, which uses
  // a slimmer GAME_SELECT without created_by.
  const isCreator = gwp.game.created_by === userId;

  // Mark related inbox notifications as read on visit. Best-effort: helperen
  // svelger feil internt, så vi blokkerer aldri sida på dette. Vi markerer
  // både `invite`- og `scorecard_approved`-varsler for dette spillet siden
  // begge kindene deeplinker hit. (Phase 3 — wires Task 3.1 + 3.4.)
  //
  // Wrap i `after()` så DB-mutasjon + revalidateTag deferes til etter render.
  // Direkte-call inni render-fasen ville kastet på `revalidateTag` (Next.js 16
  // sperrer det). Samme mønster som auto-start-fallbacken lenger ned i fila.
  // Best-effort: feil i markRead skal aldri blokkere sida.
  after(async () => {
    await Promise.allSettled([
      markNotificationsRead({ userId, kind: 'invite', entityId: id }),
      markNotificationsRead({
        userId,
        kind: 'scorecard_approved',
        entityId: id,
      }),
      // #463: å åpne spillet er en aktivitet = implisitt bekreftelse. Rydder
      // «Ikke bekreftet»-badgen for aktive spillere uten et eksplisitt trykk.
      ...(me.accepted_at == null
        ? [maybeAutoConfirmParticipation({ gameId: id, userId })]
        : []),
    ]);
  });

  let game: GameRow = {
    ...gwp.game,
    courses: joinsRes.data.courses,
    tee_boxes: joinsRes.data.tee_boxes,
  };

  // Drafts are visible to invited players as a venterom — see the draft
  // branch in the default return below for progressive disclosure.

  // #544: track whether the auto-start was blocked by incomplete matchplay sides.
  // Used below to render a waiting banner in the scheduled fallback view.
  let autoStartBlockedByIncompleteSides = false;

  // E1: server-side auto-start fallback. When the admin scheduled a tee-off
  // time but didn't manually click "Start runden nå", any player loading
  // this page after tee-off has passed triggers the same freeze-handicaps
  // + flip-to-active transition the admin button would have done. The
  // helper is idempotent and optimistic-locked, so concurrent loads (or a
  // race with the admin button) converge on the same active state.
  if (
    game.status === 'scheduled' &&
    game.scheduled_tee_off_at &&
    new Date(game.scheduled_tee_off_at).getTime() <= nowMs
  ) {
    // #427: run the start-transition on the service-role client. Any player
    // (not just the admin/creator) can be the first to open the page after
    // tee-off, and the transition writes ALL players' course_handicap + flips
    // games.status — both gated to is_admin()/creator under RLS. On the
    // request-scoped client a non-owner's writes silently no-op (0 rows), so
    // the game would stay stuck in 'scheduled'. The transition is system-level,
    // idempotent and optimistic-locked; authorization is already settled by the
    // fact that this player could load the game at all.
    const result = await startScheduledGame(getAdminClient(), id);
    if (!result.ok) {
      if (result.reason === 'incomplete_sides') {
        autoStartBlockedByIncompleteSides = true;
      }
      // Log to Vercel server logs so a "stuck in scheduled" report has a
      // trail. Don't crash — fall through to the existing scheduled fallback.
      console.error(
        `[auto-start] game ${id} could not flip to active: ${result.reason}`,
      );
    } else {
      // Invalidate the getGameWithPlayers cache for this game so the hull-page
      // (which reads from that tag) doesn't keep serving the pre-flip
      // `status='scheduled'` snapshot. Scheduled via `after()` because
      // `revalidateTag` throws when called during render — `after()` defers
      // the call until the response has been sent. `{ expire: 0 }` forces
      // the next read to wait for fresh data instead of stale-while-revalidate
      // bouncing the player back through the `status='scheduled'` redirect.
      after(() => {
        revalidateTag(`game-${id}`, { expire: 0 });
      });
    }
    // Re-fetch so the rest of this render sees the post-flip state.
    const { data: refreshed, error: refreshError } = await supabase
      .from('games')
      .select(GAME_SELECT)
      .eq('id', id)
      .single<GameRow>();
    if (refreshError) {
      console.error(`[auto-start] game ${id} refetch failed`, refreshError);
    } else if (refreshed) {
      game = refreshed;
    }
  }

  // Auto-nudge (#376): har spilleren registrert alle 18 hull uten å levere,
  // fyr én «husk å levere»-påminnelse. Pre-gate billig her (aktivt spill +
  // ikke levert + ikke trukket); maybeSendDeliveryReminder self-gater på
  // hull-telling + atomisk idempotens-guard, så den er trygg på hvert besøk.
  // Wrap i `after()` fordi notify() kaller revalidateTag som kaster i
  // render-fasen (samme mønster som markNotificationsRead + auto-start over).
  if (game.status === 'active' && !me.submitted_at && !me.withdrawn_at) {
    after(() =>
      maybeSendDeliveryReminder({
        gameId: id,
        userId,
        gameName: game.name,
      }),
    );
  }

  // Resolve this player's rating-set from the game's tee. Drives Par/Slope/CR
  // surfacing in both the scheduled-state hero and the active-state info-card.
  const playerRating = game.tee_boxes
    ? getRatingForGender(game.tee_boxes, me.tee_gender)
    : null;

  // Fetch mode content (cached on 'format-mapping' tag). One call shared by
  // both ModeGuideCard call sites in scheduled + active branches below.
  const modeContentMap = await getModeContentMap();
  const modeTeamSize =
    (gwp.game.mode_config as { team_size?: number } | null)?.team_size ?? 1;
  const mergedModeContent = mergeModeContent(
    modeContentMap[game.game_mode] ?? null,
    game.game_mode,
    modeTeamSize,
  );
  const modeLabel = formatDisplayLabel(game.game_mode, game.mode_config);
  const modeDetailHref = `/spillformater/${game.game_mode}`;

  // State #2 — Scorekort venter. Shell renders synchronously; the flight
  // roster query streams in behind Suspense.
  if (game.status === 'scheduled') {
    const teeBox = game.tee_boxes;
    const teeOffDate = game.scheduled_tee_off_at
      ? new Date(game.scheduled_tee_off_at)
      : null;

    // Slim fetch (not cached) for the player's master handicap + last-
    // confirmed timestamp. Lives outside getGameWithPlayers because
    // cross-game cache fan-out on profile edits would be expensive — same
    // trade-off as for the courses(...)/tee_boxes(...) joins above.
    const { data: meUser } = await supabase
      .from('users')
      .select('hcp_index, handicap_updated_at')
      .eq('id', userId)
      .single<{ hcp_index: number; handicap_updated_at: string }>();
    const showHandicapCard = meUser
      ? isHandicapStale(meUser.handicap_updated_at)
      : false;

    // #544: beregn mangel per side for venter-banneret. Bruker den allerede
    // lastede gwp.players-listen (team_number + withdrawn_at er inkludert).
    // Vises bare når autostart ble blokkert av incomplete_sides — unngår å
    // forvirre spillere i normale spill som venter på tee-off.
    const incompleteSidesShortfall =
      autoStartBlockedByIncompleteSides &&
      isMatchplayMode(game.game_mode)
        ? computeSideShortfall(gwp.players, modeTeamSize)
        : null;

    return (
      <AppShell>
        <header className="mb-6 flex items-center justify-between gap-4">
          <BackLink href="/">← Hjem</BackLink>
          <Kicker tone="accent">{game.name.toUpperCase()}</Kicker>
          <span className="w-12" aria-hidden />
        </header>

        {showHandicapCard && meUser && (
          <HandicapConfirmCard
            gameId={id}
            hcpIndex={Number(meUser.hcp_index)}
            handicapUpdatedAt={meUser.handicap_updated_at}
          />
        )}

        {/* Hero */}
        <section className="flex flex-col items-center text-center px-6 pt-6 pb-7">
          <MailEnvelope size={56} className="text-primary" />
          <Kicker tone="muted" className="mt-4">
            DU ER PÅMELDT
          </Kicker>
          <h1 className="mt-1.5 font-serif text-[26px] font-medium tracking-[-0.015em] leading-tight text-text">
            Scorekortet åpner ved tee-off.
          </h1>
        </section>

        {/* Course card */}
        <Card className="mx-4 p-[18px]">
          <div className="flex justify-between items-baseline gap-4">
            <div className="min-w-0">
              <Kicker tone="muted">BANE</Kicker>
              <p className="mt-1 font-serif text-[19px] font-medium tracking-[-0.01em] text-text truncate">
                {game.courses?.name ?? '(ukjent bane)'}
              </p>
              {teeBox && (
                <p className="mt-1 text-xs text-muted">
                  18 hull
                  {playerRating ? ` · Par ${playerRating.par}` : ''}
                  {teeBox.length_meters
                    ? ` · ${formatLengthMeters(teeBox.length_meters, locale)} m`
                    : ''}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <Kicker tone="muted">TEE-OFF</Kicker>
              {teeOffDate ? (
                <>
                  <p className="mt-1 font-serif text-[22px] font-semibold tracking-[-0.02em] text-text tabular-nums">
                    {formatTeeOffTime(teeOffDate)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {formatTeeOffDate(teeOffDate)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-muted">Ikke satt</p>
              )}
            </div>
          </div>

          <div className="h-px bg-border my-3.5" />

          {isSoloFormat(game.game_mode, modeTeamSize) ? (
            // Solo-modus har ingen flight-gruppering — vis hele deltaker-
            // listen i stedet for FlightRoster.
            <>
              <Kicker tone="muted">DELTAKERE</Kicker>
              <Suspense fallback={<FlightRosterSkeleton />}>
                <SoloRoster gameId={id} currentUserId={userId} />
              </Suspense>
            </>
          ) : (
            <>
              <Kicker tone="muted">DIN FLIGHT</Kicker>
              <Suspense fallback={<FlightRosterSkeleton />}>
                <FlightRoster
                  gameId={id}
                  flightNumber={me.flight_number}
                  currentUserId={userId}
                />
              </Suspense>
            </>
          )}
        </Card>

        {/* Spillform — gir spilleren en rask forklaring av modusen før start
            (#299). Synlig uavhengig av om de kjenner formatet fra før. */}
        <div className="mx-4 mt-4">
          <Kicker tone="muted" className="mb-2 px-1">
            SPILLFORM
          </Kicker>
          <ModeGuideCard
            label={modeLabel}
            summary={mergedModeContent.summary}
            points={mergedModeContent.points}
            detailHref={modeDetailHref}
          />
        </div>

        {/* Cup-stilling — synlig allerede i venterommet hvis match-en
            tilhører en cup (#347). */}
        <div className="mx-4 mt-4">
          <Suspense fallback={null}>
            <CupStandingsLink gameId={id} />
          </Suspense>
        </div>

        {/* Countdown banner */}
        {teeOffDate && (
          <div className="mx-4 mt-4">
            <ScheduledWaitingRoom
              gameId={id}
              teeOffAt={game.scheduled_tee_off_at!}
            />
          </div>
        )}

        {/* #544: venter-banner etter tee-tid når sidene ikke er fulltallige */}
        {incompleteSidesShortfall && (
          <div className="mx-4 mt-3">
            <Banner tone="warning">
              {(() => {
                const part = (side: number, needs: number) =>
                  `side ${side} mangler ${needs} ${needs === 1 ? 'spiller' : 'spillere'}`;
                const { side1Needs, side2Needs } = incompleteSidesShortfall;
                const parts = [
                  ...(side1Needs > 0 ? [part(1, side1Needs)] : []),
                  ...(side2Needs > 0 ? [part(2, side2Needs)] : []),
                ];
                return `Venter på spillere — ${parts.join(' og ')}.`;
              })()}
            </Banner>
          </div>
        )}

        {/* Footer caption */}
        <p className="mt-2 px-6 pt-4 pb-2 text-center font-serif italic text-[11.5px] text-muted">
          Vær på 1. tee 10 minutter før start.
        </p>

        {/* #428: rediger/slett for oppretter, også i venterommet (scheduled). */}
        {isCreator && (
          <div className="mx-4 mt-4">
            <CreatorControls gameId={id} status={game.status} />
          </div>
        )}

        {/* Self-withdraw — kun pre-active (#199 chunk 11). Trekker brukeren
            ut av game_players + sender team_member_withdrew-varsel til
            kapteinen hvis bruker var team-medlem. */}
        <div className="pt-2 pb-4">
          <SmartLink
            href={`/games/${id}/trekk-fra`}
            className="block text-center text-xs text-muted hover:text-text transition-colors underline underline-offset-2 decoration-muted/40"
          >
            Trekk deg fra spillet
          </SmartLink>
        </div>
      </AppShell>
    );
  }

  const isActive = game.status === 'active';
  const isDraft = game.status === 'draft';
  const isFinished = game.status === 'finished';
  const draftTeeOffDate =
    isDraft && game.scheduled_tee_off_at
      ? new Date(game.scheduled_tee_off_at)
      : null;

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel="Tilbake til hjem"
        kicker="Turnering"
      />
      <PageHeader title={game.name} />

      <div className="mb-4">
        <StatusChip
          tone={STATUS_TONES[game.status]}
          label={STATUS_LABELS[game.status]}
        />
      </div>

      {isDraft && (
        <div className="mb-4">
          <Banner tone="warning">
            Utkast — admin planlegger fortsatt. Detaljer kan endre seg.
          </Banner>
        </div>
      )}

      {statusBanner && (
        <div className="mb-4">
          <Banner tone="success">{statusBanner}</Banner>
        </div>
      )}

      {me.rejection_reason && (
        <div className="mb-4">
          <Banner tone="info">
            Scorekortet ditt ble avvist: «{me.rejection_reason}». Rediger
            hullene og lever på nytt.
          </Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PendingApprovalsBanner
          gameId={id}
          flightNumber={me.flight_number}
          currentUserId={userId}
          requirePeerApproval={game.require_peer_approval}
          isActive={isActive}
        />
      </Suspense>

      <div className="space-y-4">
        {game.courses?.name && (
          <Card>
            <Kicker tone="muted" className="mb-2">
              BANE
            </Kicker>
            <p className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
              {game.courses.name}
            </p>
            {game.tee_boxes && (
              <p className="text-xs text-muted mt-1.5 tabular-nums">
                Tee: {game.tee_boxes.name}
                {playerRating
                  ? ` · Slope ${playerRating.slope} · CR ${playerRating.courseRating.toFixed(1)} · Par ${playerRating.par}`
                  : ''}
              </p>
            )}
          </Card>
        )}

        {/* Spillform — modus-forklaring tilgjengelig fra spill-siden (#299). */}
        <div>
          <Kicker tone="muted" className="mb-2">
            SPILLFORM
          </Kicker>
          <ModeGuideCard
            label={modeLabel}
            summary={mergedModeContent.summary}
            points={mergedModeContent.points}
            detailHref={modeDetailHref}
          />
        </div>

        {isDraft && (
          <Card>
            <Kicker tone="muted" className="mb-2">
              TEE-OFF
            </Kicker>
            {draftTeeOffDate ? (
              <p className="text-sm text-text tabular-nums">
                Tee-off planlagt:{' '}
                <span className="font-medium">
                  {formatTeeOffDate(draftTeeOffDate)} kl.{' '}
                  {formatTeeOffTime(draftTeeOffDate)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted">
                Tidspunkt ikke avklart enda.
              </p>
            )}
          </Card>
        )}

        {isDraft ? (
          <Card>
            <Kicker tone="muted" className="mb-2">
              LAG
            </Kicker>
            <Suspense
              fallback={
                <p className="text-sm text-muted text-center py-4">
                  Laster…
                </p>
              }
            >
              <DraftTeamsOverview gameId={id} currentUserId={userId} />
            </Suspense>
          </Card>
        ) : (
          <Card>
            <Kicker tone="muted" className="mb-2">
              DIN INFO
            </Kicker>
            {isSoloFormat(game.game_mode, modeTeamSize) ? (
              // Solo-modus har ingen lag- eller flight-tilordning, så den
              // klassiske dl-listen leser tomt («Lag —, Flight —»). Vi
              // erstatter med en kort modus-undertittel + CH-only-rad slik
              // at brukeren skjønner formatet med ett blikk. Gjelder hele
              // solo-familien (stableford solo, Wolf, Nassau, Skins, BBB,
              // Nines, Round Robin, Acey Deucey, solo slagspill).
              <>
                <p className="text-sm text-text font-serif">{modeLabel}</p>
                <p className="text-xs text-muted mt-1">
                  Individuelt format. Du spiller for deg selv, uten lag.
                </p>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm mt-2">
                  <dt className="text-muted">Course handicap</dt>
                  <dd className="score-num text-text text-right">
                    {me.course_handicap ?? '—'}
                  </dd>
                </dl>
              </>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
                <dt className="text-muted">Lag</dt>
                <dd className="text-text text-right">
                  Lag <span className="score-num">{me.team_number}</span>
                </dd>
                <dt className="text-muted">Flight</dt>
                <dd className="text-text text-right">
                  Flight <span className="score-num">{me.flight_number}</span>
                </dd>
                <dt className="text-muted">Course handicap</dt>
                <dd className="score-num text-text text-right">
                  {me.course_handicap ?? '—'}
                </dd>
              </dl>
            )}
          </Card>
        )}

        {isActive && me.withdrawn_at ? (
          // WD — viser angre-banner i stedet for scorekort-CTA (#386).
          <div className="rounded-2xl border border-danger/40 bg-danger/5 px-4 py-4">
            <p className="mb-3 font-sans text-[14px] font-medium text-text">
              Du har trukket deg fra spillet
            </p>
            <p className="mb-4 font-sans text-[12px] leading-relaxed text-muted">
              Scorene dine teller ikke i rangeringen. Du kan angre så lenge
              spillet er aktivt.
            </p>
            <form action={submitUndoWithdraw}>
              <input type="hidden" name="gameId" value={id} />
              <SubmitButton className="w-full" pendingLabel="Angrer …">
                Angre
              </SubmitButton>
            </form>
          </div>
        ) : isActive ? (
          <Suspense fallback={<PrimaryCtaSkeleton />}>
            <PrimaryCtaSection
              gameId={id}
              currentUserId={userId}
              submittedAt={me.submitted_at}
              approvedAt={me.approved_at}
              requirePeerApproval={game.require_peer_approval}
            />
          </Suspense>
        ) : isFinished ? (
          <LinkButton href={`/games/${id}/leaderboard`} full>
            🏆 Se leaderboard →
          </LinkButton>
        ) : isDraft ? null : (
          <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
            Spillet er ikke startet ennå.
          </div>
        )}

        {game.status === 'finished' && (
          <SmartLink href={`/games/${id}/leaderboard/holes`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                Hull for hull
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}

        {!isDraft && (
          <SmartLink href={`/games/${id}/scorecard`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                {scorecardTitle(game.game_mode, game.mode_config).cardLabel}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}

        {isActive && (
          <SmartLink href={`/games/${id}/leaderboard`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                Leaderboard
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}

        {/* #427: arrangør-kontroll — kun synlig for den som opprettet spillet.
            Understated (under score-CTA + leaderboard), egen forklaring så det
            er tydelig hvorfor nettopp du ser den. */}
        {isActive && isCreator && (
          <SmartLink href={`/games/${id}/avslutt`} className="block">
            <Card className="min-h-[44px] transition-colors hover:border-primary/30">
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-text">
                  Avslutt spillet
                </span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Du arrangerer spillet. Lås det og åpne leaderboardet for alle.
              </p>
            </Card>
          </SmartLink>
        )}

        {/* #428: rediger/slett for oppretter — vises kun ved draft/scheduled
            (CreatorControls self-gater på status). */}
        {isCreator && <CreatorControls gameId={id} status={game.status} />}

        {/* Cup-stilling — for spill som tilhører en cup (#347). Self-gated:
            renderer null for ikke-cup-spill. */}
        <Suspense fallback={null}>
          <CupStandingsLink gameId={id} />
        </Suspense>

        {isDraft && (
          <div className="pt-2">
            <SmartLink
              href={`/games/${id}/trekk-fra`}
              className="block text-center text-xs text-muted hover:text-text transition-colors underline underline-offset-2 decoration-muted/40"
            >
              Trekk deg fra spillet
            </SmartLink>
          </div>
        )}

        {/* Aktive spill med WD-støtte: la spilleren trekke seg (#386). Vises
            kun til spillere som ikke allerede er trukket — trukne ser angre-
            banneret ovenfor i stedet. Diskret lenke-stil, ikke et prominent
            kall-til-handling. */}
        {isActive &&
          !me.withdrawn_at &&
          supportsWithdrawal(game.game_mode) && (
            <div className="pt-1">
              <SmartLink
                href={`/games/${id}/trekk-fra`}
                className="block text-center text-xs text-muted hover:text-text transition-colors underline underline-offset-2 decoration-muted/40"
              >
                Trekk deg fra spillet
              </SmartLink>
            </div>
          )}

        <div className="pt-2">
          <SmartLink
            href="/"
            className="block text-center text-sm text-muted hover:text-text transition-colors"
          >
            Tilbake til hjem
          </SmartLink>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Scheduled-state flight roster ───────────────────────────────────────

async function FlightRoster({
  gameId,
  flightNumber,
  currentUserId,
}: {
  gameId: string;
  flightNumber: number;
  currentUserId: string;
}) {
  const { supabase } = await getGameContext();
  const { data: flightRows } = await supabase
    .from('game_players')
    .select(
      'user_id, flight_number, accepted_at, users!game_players_user_id_fkey(name, nickname, hcp_index)',
    )
    .eq('game_id', gameId)
    .eq('flight_number', flightNumber)
    .order('user_id')
    .returns<FlightRosterRow[]>();

  const flight = (flightRows ?? []).map((row) => ({
    userId: row.user_id,
    isCurrentUser: row.user_id === currentUserId,
    name: row.users?.name ?? '(ukjent)',
    hcpIndex:
      row.users?.hcp_index == null ? null : Number(row.users.hcp_index),
    acceptedAt: row.accepted_at,
  }));

  return (
    <ul className="mt-2 flex flex-col gap-2">
      {flight.map((p) => (
        <li key={p.userId} className="flex items-center gap-3">
          {/*
            E5 dark-mode pass: inactive avatar uses bg-surface (not
            bg-bg). In dark mode bg-bg matches the page bg
            (--bg #0f1612), so the avatar would disappear into the
            layout with only the border visible — a hole punched in
            the page. bg-surface (--surface #1a2e1f in dark) sits as a
            slightly lighter forest disc against the page bg. Light
            mode is unchanged in feel: bg-surface (#ffffff) on the
            --bg linen still reads as a paper-on-paper subtle disc.
          */}
          <span
            className={`shrink-0 w-7 h-7 rounded-full grid place-items-center font-serif text-[12px] font-medium ${
              p.isCurrentUser
                ? 'bg-primary text-white dark:text-bg'
                : 'bg-surface text-text border border-border'
            }`}
          >
            {nameInitials(p.name)}
          </span>
          <span
            className={`flex-1 truncate text-[13.5px] ${p.isCurrentUser ? 'font-semibold' : ''}`}
          >
            {firstName(p.name) ?? p.name}
            {p.isCurrentUser && (
              <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent ml-2">
                DEG
              </span>
            )}
          </span>
          {p.acceptedAt == null && !p.isCurrentUser && (
            <UnconfirmedBadge className="shrink-0" />
          )}
          <span className="shrink-0 text-xs text-muted tabular-nums">
            HCP {p.hcpIndex != null ? p.hcpIndex.toFixed(1) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Solo-modus-variant av FlightRoster: lister hele game_players-tabellen,
 * ikke filtrert på flight_number (som er null for stableford solo). Samme
 * visuelle behandling som FlightRoster — gjenbruk for konsistens.
 */
async function SoloRoster({
  gameId,
  currentUserId,
}: {
  gameId: string;
  currentUserId: string;
}) {
  const { supabase } = await getGameContext();
  const { data: rows } = await supabase
    .from('game_players')
    .select(
      'user_id, accepted_at, users!game_players_user_id_fkey(name, nickname, hcp_index)',
    )
    .eq('game_id', gameId)
    .order('user_id')
    .returns<
      {
        user_id: string;
        accepted_at: string | null;
        users: {
          name: string | null;
          nickname: string | null;
          hcp_index: number | string | null;
        } | null;
      }[]
    >();

  const players = (rows ?? []).map((row) => ({
    userId: row.user_id,
    isCurrentUser: row.user_id === currentUserId,
    name: row.users?.name ?? '(ukjent)',
    hcpIndex:
      row.users?.hcp_index == null ? null : Number(row.users.hcp_index),
    acceptedAt: row.accepted_at,
  }));

  return (
    <ul className="mt-2 flex flex-col gap-2">
      {players.map((p) => (
        <li key={p.userId} className="flex items-center gap-3">
          <span
            className={`shrink-0 w-7 h-7 rounded-full grid place-items-center font-serif text-[12px] font-medium ${
              p.isCurrentUser
                ? 'bg-primary text-white dark:text-bg'
                : 'bg-surface text-text border border-border'
            }`}
          >
            {nameInitials(p.name)}
          </span>
          <span
            className={`flex-1 truncate text-[13.5px] ${p.isCurrentUser ? 'font-semibold' : ''}`}
          >
            {firstName(p.name) ?? p.name}
            {p.isCurrentUser && (
              <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent ml-2">
                DEG
              </span>
            )}
          </span>
          {p.acceptedAt == null && !p.isCurrentUser && (
            <UnconfirmedBadge className="shrink-0" />
          )}
          <span className="shrink-0 text-xs text-muted tabular-nums">
            HCP {p.hcpIndex != null ? p.hcpIndex.toFixed(1) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FlightRosterSkeleton() {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="shrink-0 h-7 w-7 rounded-full" delay={i * 90} />
          <Skeleton className="flex-1 h-4" delay={i * 90 + 30} />
          <Skeleton className="shrink-0 h-3 w-14" delay={i * 90 + 60} />
        </li>
      ))}
    </ul>
  );
}

// ─── Draft-state teams overview ──────────────────────────────────────────

type DraftRosterRow = {
  user_id: string;
  team_number: number;
  users: {
    // name is null until the invitee completes their profile — see
    // migration 0014. Draft games can carry pending placeholders, so
    // fall back to email when rendering.
    name: string | null;
    email: string;
  } | null;
};

async function DraftTeamsOverview({
  gameId,
  currentUserId,
}: {
  gameId: string;
  currentUserId: string;
}) {
  const { supabase } = await getGameContext();
  const { data: rows } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, users!game_players_user_id_fkey(name, email)',
    )
    .eq('game_id', gameId)
    .order('team_number')
    .order('user_id')
    .returns<DraftRosterRow[]>();

  const players = rows ?? [];

  if (players.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-4">Spillere kommer.</p>
    );
  }

  const teamsWithPlayers = [1, 2, 3, 4].filter((teamNum) =>
    players.some((p) => p.team_number === teamNum),
  );

  return (
    <ul className="flex flex-col gap-3">
      {teamsWithPlayers.map((teamNum) => {
        const teamPlayers = players.filter((p) => p.team_number === teamNum);
        return (
          <li key={teamNum}>
            <p className="text-xs text-muted uppercase tracking-[0.14em] font-semibold mb-1.5">
              Lag {teamNum}
            </p>
            <ul className="flex flex-col gap-1">
              {teamPlayers.map((p) => {
                const isCurrent = p.user_id === currentUserId;
                // Pending invitees (no profile yet) have null name — show
                // their email instead so the team layout reads usefully.
                const fullName = p.users?.name ?? p.users?.email ?? null;
                const displayName =
                  (fullName && firstName(fullName)) ??
                  fullName ??
                  '(ukjent)';
                return (
                  <li
                    key={p.user_id}
                    className={`flex items-center gap-2 text-[13.5px] ${
                      isCurrent ? 'font-semibold' : ''
                    }`}
                  >
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full grid place-items-center font-serif text-[11px] font-medium ${
                        isCurrent
                          ? 'bg-primary text-white dark:text-bg'
                          : 'bg-surface text-text border border-border'
                      }`}
                    >
                      {nameInitials(fullName)}
                    </span>
                    <span className="truncate">
                      {displayName}
                      {isCurrent && (
                        <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent ml-2">
                          DEG
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Pending-approvals info banner (active state) ────────────────────────

async function PendingApprovalsBanner({
  gameId,
  flightNumber,
  currentUserId,
  requirePeerApproval,
  isActive,
}: {
  gameId: string;
  flightNumber: number;
  currentUserId: string;
  requirePeerApproval: boolean;
  isActive: boolean;
}) {
  if (!requirePeerApproval || !isActive) return null;

  const { supabase } = await getGameContext();
  const { data: mates } = await supabase
    .from('game_players')
    .select('user_id, flight_number, submitted_at, approved_at')
    .eq('game_id', gameId)
    .eq('flight_number', flightNumber)
    .returns<FlightMatePlayerRow[]>();
  const pendingApprovalsForMe = (mates ?? []).filter(
    (m) =>
      m.user_id !== currentUserId &&
      m.submitted_at != null &&
      m.approved_at == null,
  ).length;

  if (pendingApprovalsForMe === 0) return null;

  return (
    <div className="mb-4">
      <Banner tone="info">
        <div className="flex items-center justify-between gap-3">
          <span>
            {pendingApprovalsForMe} spillere i flighten din venter på
            godkjenning
          </span>
          <SmartLink
            href={`/games/${gameId}/approve`}
            className="text-sm font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary whitespace-nowrap"
          >
            Gjennomgå →
          </SmartLink>
        </div>
      </Banner>
    </div>
  );
}

// ─── Cup-standings link (#347) ───────────────────────────────────────────

/**
 * When a game belongs to a cup (`games.tournament_id` set), surface a link to
 * the public cup leaderboard so a participating player can reach the cup
 * standing straight from the match — not only via a direct URL (#347, part of
 * the «én vei til rom»-umbrella #344). Self-fetches like the other sections
 * here, so it streams behind Suspense and the shared `getGameWithPlayers`
 * cache helper stays untouched. Returns null for non-cup games and for cups
 * that no longer exist (so we never link to a deleted cup → 404).
 */
async function CupStandingsLink({ gameId }: { gameId: string }) {
  const { supabase } = await getGameContext();
  const { data: row } = await supabase
    .from('games')
    .select('tournament_id')
    .eq('id', gameId)
    .maybeSingle<{ tournament_id: string | null }>();
  const tournamentId = row?.tournament_id ?? null;
  if (!tournamentId) return null;

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id')
    .eq('id', tournamentId)
    .maybeSingle<{ id: string }>();
  if (!cup) return null;

  return (
    <SmartLink href={`/cup/${tournamentId}`} className="block">
      <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
        <span className="text-base font-medium text-text">
          Se cup-stillingen
        </span>
        <span aria-hidden className="text-muted">
          →
        </span>
      </Card>
    </SmartLink>
  );
}

// ─── Creator controls (#428) ─────────────────────────────────────────────

/**
 * Arrangør-kontroll for spillets oppretter: rediger + slett. Kun draft/scheduled
 * — når runden har startet er handicaps frosset og scores finnes, så spillet er
 * effektivt låst (sletting av active/finished er admin-only, eier-beslutning
 * #428). Returnerer null for active/finished, så den kan rendres ubetinget
 * (gated på isCreator av kalleren) i både venterom- og hovedvisningen.
 */
function CreatorControls({
  gameId,
  status,
}: {
  gameId: string;
  status: GameStatus;
}) {
  // Pre-start: edit + delete the whole game. Roster management («Styr spillere»)
  // opens once registration is live and stays available through active play
  // (where it becomes withdraw + approval-override). Finished → nothing.
  const preStart = status === 'draft' || status === 'scheduled';
  const showRoster = status === 'scheduled' || status === 'active';
  if (!preStart && !showRoster) return null;
  return (
    <div className="pt-2">
      <Kicker tone="muted" className="mb-2">
        ARRANGØR
      </Kicker>
      <div className="space-y-2">
        {showRoster && (
          <SmartLink href={`/games/${gameId}/spillere`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                Styr spillere
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}
        {preStart && (
          <SmartLink href={`/games/${gameId}/rediger`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
              <span className="text-base font-medium text-text">
                Rediger spill
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}
        {preStart && (
          <SmartLink href={`/games/${gameId}/slett`} className="block">
            <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-danger/40">
              <span className="text-base font-medium text-danger">
                Slett spill
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        )}
      </div>
    </div>
  );
}

// ─── Primary CTA (active state) ──────────────────────────────────────────

async function PrimaryCtaSection({
  gameId,
  currentUserId,
  submittedAt,
  approvedAt,
  requirePeerApproval,
}: {
  gameId: string;
  currentUserId: string;
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}) {
  const { supabase } = await getGameContext();

  const { data: filledRows } = await supabase
    .from('scores')
    .select('hole_number')
    .eq('game_id', gameId)
    .eq('user_id', currentUserId)
    .not('strokes', 'is', null);
  const filledHoles = (filledRows ?? []).map((r) => r.hole_number);
  const strokesCount = filledHoles.length;

  // Issue #164: «Fortsett runden»-knappen skal peke på første tomme hull,
  // ikke hardkodet hull 1. Sekvensiell scan 1→18 returnerer det første hullet
  // uten score; ved full runde havner vi i ready_to_submit-state og denne
  // verdien brukes ikke (CTA-en routes til /submit i stedet).
  const filledSet = new Set(filledHoles);
  let nextHole = 1;
  for (let h = 1; h <= 18; h++) {
    if (!filledSet.has(h)) {
      nextHole = h;
      break;
    }
  }

  const state = computeState({
    strokesCount,
    submittedAt,
    approvedAt,
    requirePeerApproval,
  });

  return (
    <PrimaryCta
      gameId={gameId}
      state={state}
      strokesCount={strokesCount}
      nextHole={nextHole}
    />
  );
}

function PrimaryCtaSkeleton() {
  return <Skeleton className="h-12 w-full rounded-full" />;
}

function PrimaryCta({
  gameId,
  state,
  strokesCount,
  nextHole,
}: {
  gameId: string;
  state: UiState;
  strokesCount: number;
  nextHole: number;
}) {
  const subtext =
    state === 'in_progress' || state === 'ready_to_submit'
      ? `${strokesCount} av 18 hull tastet inn`
      : null;

  if (state === 'not_started') {
    return (
      <LinkButton href={`/games/${gameId}/holes/${nextHole}`} full>
        Start runden →
      </LinkButton>
    );
  }

  if (state === 'in_progress') {
    return (
      <div className="space-y-1.5">
        <LinkButton href={`/games/${gameId}/holes/${nextHole}`} full>
          Fortsett runden →
        </LinkButton>
        {subtext && (
          <p className="text-center text-xs text-muted tabular-nums">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  if (state === 'ready_to_submit') {
    return (
      <div className="space-y-1.5">
        <LinkButton href={`/games/${gameId}/submit`} full>
          Gjennomgå og lever →
        </LinkButton>
        {subtext && (
          <p className="text-center text-xs text-muted tabular-nums">
            {subtext}
          </p>
        )}
      </div>
    );
  }

  if (state === 'submitted_pending_approval') {
    return (
      <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
        Scorekort levert — venter på godkjenning fra en i flighten din.
      </div>
    );
  }

  // submitted_approved
  return (
    <div className="rounded-2xl border border-border px-4 py-3 text-sm text-muted text-center">
      Scorekort levert og godkjent. Venter på at admin avslutter spillet.
    </div>
  );
}
