import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import {
  parseMode,
  type LeaderboardMode,
} from '@/lib/leaderboard';
import { parseLeaderboardNavContext } from '@/lib/leaderboard/navContext';
import {
  getGameWithPlayers,
} from '@/lib/games/getGameWithPlayers';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import {
  getLeaderboardContext,
} from './leaderboardContext';
import { renderLeaderboardContent } from './leaderboardContent';
import { RevansjeCtaProvider } from './RevansjeCta';
import { MyScorecardCtaProvider } from './MyScorecardCta';
import { PuttsBackfillCtaProvider } from './PuttsBackfillCta';
import { SponsorStrip } from '@/components/SponsorStrip';
import { safeParsePrizes } from '@/lib/games/prizes';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  return?: string | string[];
  n?: string | string[];
  from?: string | string[];
}>;

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode: LeaderboardMode = parseMode(sp.mode);

  // Back-navigation context, parsed and validated once per request (#1517):
  //   - `?from=`: explicit back-destination. Entry-points that want the
  //     chevron to land somewhere other than the game-home pass it here.
  //     Issue #117: replaces a referrer-heuristic that was unreliable in
  //     iOS PWA standalone (cf. v1.8.3/v1.8.4 history).
  //   - `?return=hole&n=N`: points the back-arrow at a specific hole on the
  //     round screen (used by the leaderboard icon in the hole-skjerm header).
  // `from` wins over the `?return=hole`-fallback when both are present, since
  // callers that pass `from` know exactly where they want to go. The whole
  // context travels onward into every leaderboard-internal link.
  const navContext = parseLeaderboardNavContext(sp);
  const defaultBackHref =
    navContext.returnTo === 'hole' && navContext.holeNumber !== null
      ? `/games/${id}/holes/${navContext.holeNumber}`
      : `/games/${id}`;

  const locale = await getLocale();
  const { supabase, userId: userIdRaw } = await getLeaderboardContext();
  if (!userIdRaw) redirect({ href: '/login', locale });
  const userId = userIdRaw as string; // guarded non-null above (redirect isn't typed `never`)

  // Game + players come from the tag-cached helper. Profile lookup
  // (is_admin) stays direct since it isn't game-scoped.
  const [gwp, profileRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single<{ is_admin: boolean }>(),
  ]);

  if (!gwp) notFound();
  const game = gwp.game;

  // Draft games have no leaderboard view — bounce to game home.
  if (game.status === 'draft') {
    redirect({ href: `/games/${id}` as string, locale });
  }

  const isAdmin = profileRes.data?.is_admin === true;
  const isParticipant = gwp.players.some((p) => p.user_id === userId);
  // Non-admin, non-participants may open FINISHED games — RLS gjør alle scores
  // lesbare etter finish, og cup-matchkortene lenker hele cup-publikummet hit
  // (#1456/#1468). Under spill er leaderboardet fortsatt kun for deltakere.
  if (!isAdmin && !isParticipant && game.status !== 'finished') {
    notFound();
  }

  // Ikke-deltakere har ingen adgang til game-home — default-returen går Hjem
  // i stedet, så tilbake-pilen aldri er en død flate (#752). Eksplisitt
  // `?from=` (cup-flatene sender den) vinner uansett.
  const backHref =
    navContext.from ?? (isParticipant || isAdmin ? defaultBackHref : '/');

  // Mark `game_finished`-varsler for dette spillet som lest når brukeren
  // åpner leaderboardet. Wrap i `after()` så DB-mutasjon + revalidateTag
  // deferes til etter render (Next.js 16 sperrer revalidateTag i render-fase).
  // Harmless å kalle selv på aktivt spill — ingen game_finished-rader eksisterer
  // før admin avslutter.
  after(() =>
    markNotificationsRead({
      userId: userId as string,
      kind: 'game_finished',
      entityId: id,
    }),
  );

  // No inner Suspense boundary here: the route-level loading.tsx
  // (LeaderboardSkeleton) covers the whole wait. An inner boundary would
  // only swap one skeleton for another mid-wait (#539).
  const content = await renderLeaderboardContent({
    gameId: id,
    game,
    mode,
    backHref,
    navContext,
    supabase,
    includeReactions: true,
    viewerUserId: userId,
    // #1488 (K11): non-participants can open finished-game leaderboards, but the
    // reaction write is RLS-gated to participants — mount the provider inert so
    // their taps do nothing instead of failing silently.
    reactionsDisabled: !isParticipant,
  });

  // #1020: «Revansje?» in the leaderboard footer area. Same gate as the
  // game-home button (#1007) — finished, standalone (not cup/liga) — plus a
  // participant requirement: the `?fra=` loader ignores the param for
  // non-participants, so the CTA must never promise them a prefill. The
  // spectate route renders the same content without this provider, so the
  // CTA cannot leak there.
  const showRevansje =
    game.status === 'finished' &&
    !game.tournament_id &&
    !game.league_round_id &&
    gwp.players.some((p) => p.user_id === userId);

  // #1289: «Mitt scorekort» — every finished-game entry point (Hjem,
  // Spill-arkiv, Historikk) lands on this leaderboard, so it must offer the
  // path onward to the viewer's own scorecard (e.g. hole-by-hole strokes for
  // Golfbox). Unlike Revansje there is NO standalone gate — cup/liga rounds
  // have scorecards too. Withdrawn viewers are excluded: the scorecard page
  // bounces them to game-home anyway (#387).
  const showMyScorecard =
    game.status === 'finished' &&
    gwp.players.some((p) => p.user_id === userId && !p.withdrawn_at);

  // #1290 del B: «Putte-statistikken venter på N hull» — only when the viewer
  // opted into putt-keeping this round (≥1 putt recorded) but left some played
  // holes blank. A player who never recorded a putt is never nagged. Gated on
  // showMyScorecard so the extra query only runs for a finished-game
  // participant, and mounted via a provider so it can't leak to spectate/demo.
  let puttsBackfillMissing = 0;
  if (showMyScorecard) {
    const { data: myScores } = await supabase
      .from('scores')
      .select('strokes, putts')
      .eq('game_id', id)
      .eq('user_id', userId)
      .returns<{ strokes: number | null; putts: number | null }[]>();
    const played = (myScores ?? []).filter((s) => s.strokes != null).length;
    const putted = (myScores ?? []).filter((s) => s.putts != null).length;
    if (putted >= 1 && putted < played) puttsBackfillMissing = played - putted;
  }

  // #1051: sponsorstripe på live-tavla (self-hider uten sponsor).
  const withSponsors = (
    <>
      <SponsorStrip prizes={safeParsePrizes(game.prizes)} />
      {content}
    </>
  );
  const withBackfillCta =
    puttsBackfillMissing > 0 ? (
      <PuttsBackfillCtaProvider
        href={`/games/${id}/putter`}
        missingCount={puttsBackfillMissing}
      >
        {withSponsors}
      </PuttsBackfillCtaProvider>
    ) : (
      withSponsors
    );
  const withScorecardCta = showMyScorecard ? (
    <MyScorecardCtaProvider href={`/games/${id}/scorecard`}>
      {withBackfillCta}
    </MyScorecardCtaProvider>
  ) : (
    withBackfillCta
  );
  if (!showRevansje) return withScorecardCta;
  return (
    <RevansjeCtaProvider href={`/opprett-spill?fra=${id}`}>
      {withScorecardCta}
    </RevansjeCtaProvider>
  );
}
