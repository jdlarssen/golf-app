import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { firstName } from '@/lib/firstName';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { isFrontNineOpen } from '@/lib/leaderboard/frontNineGate';
import {
  computeLeaderboard,
  parseMode,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
} from '@/lib/leaderboard';
import { State4View } from './State4View';
import { RevealBruttoView } from './RevealBruttoView';
import { LeaderboardTabs } from './LeaderboardTabs';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import {
  WithdrawnPlayersSection,
  type WithdrawnPlayer,
} from './WithdrawnPlayersSection';
import {
  calculateSideTournament,
  type SideTournamentInput,
} from '@/lib/scoring/sideTournament';
import { buildSideTournamentInput } from '@/lib/scoring/sideTournamentInput';
import { revealState } from '@/lib/games/visibility';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  getGameWithPlayers,
  type GameForHole,
} from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import { isStablefordFamily, isScrambleFamily, isAlternateShotMatchplay } from '@/lib/scoring';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import {
  getLeaderboardContext,
  fetchSideWinners,
} from './leaderboardContext';
import { ReactionsProvider } from './ReactionsProvider';
import { fetchGameReactions } from '@/lib/games/reactions/fetch';
import { renderStableford } from './formats/stableford';
import { renderMatchplay } from './formats/matchplay';
import { renderFourballMatchplay } from './formats/fourballMatchplay';
import { renderFoursomesMatchplay } from './formats/foursomesMatchplay';
import { renderSoloStrokeplay } from './formats/soloStrokeplay';
import { renderTexasScramble } from './formats/texasScramble';
import { renderWolf } from './formats/wolf';
import { renderNassau } from './formats/nassau';
import { renderSkins } from './formats/skins';
import { renderBingoBangoBongo } from './formats/bingoBangoBongo';
import { renderNines } from './formats/nines';
import { renderRoundRobin } from './formats/roundRobin';
import { renderAceyDeucey } from './formats/aceyDeucey';
import { renderShamble } from './formats/shamble';
import { renderPatsome } from './formats/patsome';
import { renderState3, renderState35 } from './formats/state3';
import type {
  SideWinnerRow,
  CourseHoleRow,
  ScoreRow,
} from './leaderboardTypes';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  mode?: string | string[];
  return?: string | string[];
  n?: string | string[];
  from?: string | string[];
}>;

/**
 * Validates the `?from=` query-param that entry-points use to override the
 * default back-target on the leaderboard page (issue #117). Only accepts
 * relative paths under a known Tørny route prefix — anything else is treated
 * as untrusted input and rejected so we don't open up a redirect-style hole.
 *
 * Returns the validated path or `null` when the param is missing or invalid;
 * callers fall back to the existing back-target heuristic in that case.
 */
function validateFromParam(
  raw: string | string[] | undefined,
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  if (value.length > 200) return null;
  if (!value.startsWith('/')) return null;
  // Reject protocol-relative URLs ("//evil.com") — they bypass the
  // startsWith('/') check but resolve to a different origin.
  if (value.startsWith('//')) return null;
  // Reject anything that smells like an absolute URL.
  if (value.includes('://')) return null;
  // Allowlist of known Tørny route prefixes. Root ('/') is allowed as a
  // literal match so a home-page entry-point can use ?from=/.
  const allowedPrefixes = ['/profile/', '/admin/', '/games/', '/'];
  if (
    !allowedPrefixes.some((p) => (p === '/' ? value === '/' : value.startsWith(p)))
  ) {
    return null;
  }
  return value;
}

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

  // Return-to-hole support: ?return=hole&n=N points the back-arrow at a
  // specific hole on the round screen (used by the leaderboard icon in
  // the hole-skjerm header). Validate strictly — out-of-range or
  // non-integer falls back to the game-home back target.
  const returnParam = Array.isArray(sp.return) ? sp.return[0] : sp.return;
  const nParam = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const nNum = nParam != null ? Number(nParam) : null;
  // Explicit back-destination via ?from=. Entry-points that want the
  // chevron to land somewhere other than the game-home pass it here.
  // Issue #117: replaces a referrer-heuristic that was unreliable in
  // iOS PWA standalone (cf. v1.8.3/v1.8.4 history). `from` wins over
  // the `?return=hole`-fallback when both are present, since callers
  // that pass `from` know exactly where they want to go.
  const fromOverride = validateFromParam(sp.from);
  const backHref =
    fromOverride ??
    (returnParam === 'hole' &&
    nNum !== null &&
    Number.isInteger(nNum) &&
    nNum >= 1 &&
    nNum <= 18
      ? `/games/${id}/holes/${nNum}`
      : `/games/${id}`);
  // For the holes-drilldown — preserve the same return-to-hole context.
  const returnQuery =
    returnParam === 'hole' &&
    nNum !== null &&
    Number.isInteger(nNum) &&
    nNum >= 1 &&
    nNum <= 18
      ? `&return=hole&n=${nNum}`
      : '';

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
  // Non-admin players must be a participant. Reads from cached players list.
  if (!isAdmin && !gwp.players.some((p) => p.user_id === userId)) {
    notFound();
  }

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
  return (
    <LeaderboardBody
      gameId={id}
      game={game}
      mode={mode}
      backHref={backHref}
      returnQuery={returnQuery}
    />
  );
}

// ─── Body ────────────────────────────────────────────────────────────────

async function LeaderboardBody({
  gameId,
  game: gameRow,
  mode,
  backHref,
  returnQuery,
}: {
  gameId: string;
  game: GameForHole;
  mode: LeaderboardMode;
  backHref: string;
  returnQuery: string;
}) {
  const [tc, { supabase, userId: bodyUserId }, locale] = await Promise.all([
    getTranslations('leaderboard.common'),
    getLeaderboardContext(),
    getLocale(),
  ]);

  // Players come from the tag-cached helper (cache hit since the outer
  // page already warmed it). Holes + scores stay direct fetches.
  // #624 — banenavnet hentes slankt parallelt (ikke via den cachede
  // getGameWithPlayers, som bevisst ikke joiner courses) for å re-lokalisere
  // det auto-genererte spillnavnet ved visning.
  // #943 — reactions fetch runs in parallel; bodyUserId is non-null here
  // (guarded above by redirect) but may be undefined for team/non-individual
  // formats; we pass it anyway and the provider handles an empty summary.
  const [gwp, rawHolesRes, rawScoresRes, courseRes, reactionSummary] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', gameRow.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    gameRow.course_id
      ? supabase
          .from('courses')
          .select('name')
          .eq('id', gameRow.course_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
    fetchGameReactions(supabase, gameId, bodyUserId ?? ''),
  ]);

  // #943 — wraps the 9 individual-player format returns in ReactionsProvider.
  // Does NOT wrap team/matchplay/scramble formats (they have no per-player rows
  // to wire). The provider's `initial` is the server-fetched summary; live
  // updates are subscribed client-side inside the provider.
  const withReactions = (node: ReactNode) => (
    <ReactionsProvider gameId={gameId} initial={reactionSummary}>
      {node}
    </ReactionsProvider>
  );

  if (!gwp) notFound();
  if (rawHolesRes.error) throw rawHolesRes.error;
  if (rawScoresRes.error) throw rawScoresRes.error;

  // #624 — lokaliser det frosne spillnavnet én gang ved kilden. Den lokaliserte
  // kopien flyter ut til alle gameName/kicker-props i view- og podium-grenene,
  // så ingen rå `game.name` når en rendret tittel. Norsk visning er byte-
  // identisk (helperen returnerer tidlig for 'no').
  const game: GameForHole = {
    ...gameRow,
    name: localizeGameName(
      gameRow.name,
      courseRes.data?.name ?? null,
      locale as AppLocale,
    ),
  };

  // Stableford-grenen: solo-modus har null team_number, så best-ball-LbPlayer-
  // shapen (krever teamNumber: number) passer ikke. Rens stableford-data inn
  // i mode-router-format og rendre SoloStablefordView med én gang — vi har
  // ingen state #3/#3.5/reveal-active for stableford ennå (fase 6 håndterer
  // reveal-flow). Midt-runde og post-finished bruker samme visning.
  if (isStablefordFamily(game.game_mode)) {
    return withReactions(await renderStableford({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Matchplay-grenen (epic #45 Phase 3): 1v1 hull-for-hull. MatchplayMatchView
  // dekker både live-state og finished-state (mat-em eller AS) — komponenten
  // velger banner-form basert på `result.result` uavhengig av game.status.
  // State #3/#3.5-«venterom» er bevisst skipped: matchplay-spillere ser hverandre
  // umiddelbart (RLS slipper begge sider gjennom under aktivt spill).
  if (game.game_mode === 'singles_matchplay') {
    return renderMatchplay({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Fourball matchplay (issue #217): 2v2 lag-best matchplay. Speiler
  // singles_matchplay-grenen tett — FourballMatchplayView håndterer både
  // live-state og finished-state internt basert på `result.result`.
  // Lag-labels hentes fra `tournaments.team_1_name`/`team_2_name` når matchen
  // har `tournament_id` (cup-koblet); ellers brukes generisk «Lag 1»/«Lag 2».
  if (game.game_mode === 'fourball_matchplay') {
    return renderFourballMatchplay({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Foursomes-familien (foursomes_matchplay, greensome_matchplay,
  // chapman_matchplay, gruesome_matchplay — issue #291): vekselslag-format
  // der begge sider spiller én ball per hull. Alle fire returnerer
  // kind:'foursomes_matchplay' fra scoring-laget. FoursomesMatchplayView
  // viser lag-HCP, netto per side og matchplay-resultat. formatLabel skiller
  // variant-navnene visuelt («Foursomes», «Greensome», «Chapman», «Gruesome»).
  if (isAlternateShotMatchplay(game.game_mode)) {
    return renderFoursomesMatchplay({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Solo strokeplay (epic #46 Phase 3): klassisk slagspill — flat liste
  // sortert på laveste netto-total. Live-view og finished-podium speiler solo-
  // stableford-pattern (en view, en podium, status-router velger). Ingen
  // state #3/#3.5-«venterom» — solo-spillere ser hverandre umiddelbart, samme
  // RLS-policy som stableford og matchplay.
  if (game.game_mode === 'solo_strokeplay') {
    return withReactions(await renderSoloStrokeplay({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Texas scramble (issue #44) og Ambrose (issue #284): lag-aggregert
  // leaderboard, lavest totalNet vinner. Ambrose gjenbruker Texas-view og -podium
  // siden `ambrose.compute()` returnerer `kind: 'texas_scramble'` (Modified-
  // Stableford-mønsteret). Live-view og finished-podium speiler solo-strokeplay-
  // pattern. State #3/#3.5-«venterom» skipped på samme måte som de andre modi.
  if (isScrambleFamily(game.game_mode)) {
    return renderTexasScramble({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
      formatLabel: MODE_LABELS[game.game_mode],
    });
  }

  // Wolf (issue #274; #465): 3-5-spiller rotating partner-format. Per-hull-valg
  // lagres i `wolf_hole_choices` (egen tabell) og injectes i ScoringContext via
  // `wolfChoices`-feltet. Live-view + finished-podium speiler solo-strokeplay-
  // pattern, men view-en håndterer reveal-modus internt (skjuler poeng-totaler
  // når score_visibility='reveal' og status='active').
  if (game.game_mode === 'wolf') {
    return withReactions(await renderWolf({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Nassau (issue #276): tre stacked strokeplay-rangeringer (Front 9, Back 9,
  // Totalt 18) + aggregert unit-podium. Bruker eksisterende scores-tabell —
  // ingen per-hull-tabell som Wolf. Live-view håndterer reveal-modus internt
  // (skjuler totaler når score_visibility='reveal' og status='active').
  if (game.game_mode === 'nassau') {
    return withReactions(await renderNassau({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Skins med carryover (issue #275): hull-basert point-game med akkumulerende
  // pott. Per-hull-carryover-kjeden er ren funksjon av scores — ingen ny DB-
  // tabell. Live-view håndterer reveal-modus internt (skjuler totaler når
  // score_visibility='reveal' og status='active').
  if (game.game_mode === 'skins') {
    return withReactions(await renderSkins({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Bingo Bango Bongo (issue #277): tre prestasjons-poeng per hull (bingo/
  // bango/bongo). Per-hull-data lagres i `bingo_bango_bongo_holes`-tabellen og
  // injectes i ScoringContext via `bingoBangoBongoHoles`-feltet — nøyaktig
  // Wolf-mønstret. Live-view håndterer reveal-modus internt (skjuler totaler
  // når score_visibility='reveal' og status='active').
  if (game.game_mode === 'bingo_bango_bongo') {
    return withReactions(await renderBingoBangoBongo({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Nines / Split Sixes (issue #278): individuelt 3-spiller-format der poeng
  // fordeles per hull etter effective-score-rangering. Ingen ny DB-tabell —
  // ren funksjon av scores (speiler Skins-pattern). Live-view håndterer
  // reveal-modus internt (skjuler totaler når score_visibility='reveal' og
  // status='active').
  if (game.game_mode === 'nines') {
    return withReactions(await renderNines({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Round Robin (issue #280): 4-spiller rotating partner-format, 3 segmenter
  // à 6 hull. Rotasjonen er ren deterministisk funksjon av slot-nummer + hull-
  // nummer — ingen per-hull-tabell (forskjell fra Wolf og BBB). Scorer hentes
  // fra eksisterende scores-tabell. Live-view + finished-podium speiler Wolf-
  // pattern. View-en håndterer reveal-modus internt.
  if (game.game_mode === 'round_robin') {
    return withReactions(await renderRoundRobin({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Acey Deucey (issue #279): rent slag-derivert poeng-spill for 4 spillere.
  // Per-hull: lavest unique → +3 (ace), høyest unique → −3 (deuce), midten 0.
  // Ingen per-hull-tabell i DB — poengene regnes direkte fra slagene. Live-
  // view håndterer reveal-modus internt (skjuler totaler når
  // score_visibility='reveal' og status='active').
  if (game.game_mode === 'acey_deucey') {
    return withReactions(await renderAceyDeucey({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    }));
  }

  // Shamble / Champagne Scramble (issue #285): lag-format. Delt drive, så
  // egen ball til hull. Lagets hull-score = sum av de N laveste effective-
  // scorene. Ingen ny DB-tabell — ren funksjon av scores (speiler Nines-
  // datasti). Live-view håndterer reveal-modus internt (skjuler totaler
  // når score_visibility='reveal' og status='active').
  if (game.game_mode === 'shamble') {
    return renderShamble({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Patsome (issue #286): rotasjons-lag-format med tre 6-hulls-segmenter
  // (4BBB → greensome → foursomes). Ranking på stableford-poeng per lag.
  // Segment-delsummer er formatets signatur-element og vises alltid.
  if (game.game_mode === 'patsome') {
    return renderPatsome({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // WD (#386): build the withdrawn list BEFORE the active-players map.
  // Only for best_ball (this default branch); stableford + solo_strokeplay
  // handle their own filtering inside their render functions.
  const unknownPlayer = tc('unknownPlayer');

  const bestBallWithdrawn: WithdrawnPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at != null)
    .map((p) => ({
      user_id: p.user_id,
      display_name: p.users!.name ?? unknownPlayer,
    }));
  const bestBallWithdrawnIds = new Set(bestBallWithdrawn.map((p) => p.user_id));

  const players: LbPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at == null)
    .map((p) => ({
      userId: p.user_id,
      // Defensive fallback: pending invitees can't reach an active/finished
      // leaderboard per Task 7's publish-gate, but the DB column is nullable
      // so we coalesce to keep TS honest.
      name: p.users!.name ?? unknownPlayer,
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
      teeGender: p.tee_gender,
    }));

  const holes: LbHole[] = (rawHolesRes.data ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = (rawScoresRes.data ?? [])
    .filter((s) => !bestBallWithdrawnIds.has(s.user_id))
    .map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));

  // F1: view branching. State #3 (timeglass) when game hasn't progressed far
  // enough to show anything meaningful — either still scheduled, or active
  // but no team has finished front 9 yet. State #3.5 (front 9 visible, back
  // 9 locked) when at least one team has completed front 9 but game isn't
  // finished. Full leaderboard once status flips to finished.
  const frontNineOpen = isFrontNineOpen({
    players: gwp.players.map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
    })),
    scores: (rawScoresRes.data ?? []).map((s) => ({
      user_id: s.user_id,
      hole_number: s.hole_number,
      strokes: s.strokes,
    })),
  });

  type View =
    | 'state3'
    | 'state3.5'
    | 'full'
    | 'reveal-active'
    | 'reveal-finished';

  // Reveal-modus changes the leaderboard storytelling: while the game is
  // still active, no netto rankings (the climax stays hidden until admin
  // avslutter). Once finished, both modes converge on the State4View — but
  // reveal-finished surfaces players via formatRevealName for the dramatic
  // nickname reveal.
  const state = revealState(game.score_visibility, game.status);
  let view: View;
  if (state === 'live-always') {
    view =
      game.status === 'finished'
        ? 'full'
        : !frontNineOpen
          ? 'state3'
          : 'state3.5';
  } else if (state === 'reveal-active') {
    view = 'reveal-active';
  } else {
    view = 'reveal-finished';
  }

  if (view === 'state3') {
    return renderState3({
      gameId,
      teeOffAt: game.scheduled_tee_off_at,
      players,
      backHref,
    });
  }

  if (view === 'state3.5') {
    return renderState35({
      gameId,
      mode,
      players,
      holes,
      scores,
      backHref,
    });
  }

  if (view === 'reveal-active') {
    // Brutto best-ball, no medals, no champagne — the netto ranking stays
    // hidden until admin avslutter (which flips us into 'reveal-finished').
    const bruttoLines = computeLeaderboard({
      mode: 'brutto',
      players,
      holes,
      scores,
    });
    const orderedBrutto = [...bruttoLines].sort((a, b) => a.rank - b.rank);
    const holesPlayed = new Set(scores.map((s) => s.holeNumber)).size;
    return (
      <RevealBruttoView
        gameId={gameId}
        gameName={game.name}
        teams={orderedBrutto}
        holesPlayed={holesPlayed}
        backHref={backHref}
      />
    );
  }

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);
  const coursePar = holes.reduce((sum, h) => sum + h.par, 0);
  // #638: game-wide holes played for the State4View subtitle («Etter X hull»),
  // same count as the reveal-active branch above — not a hardcoded 18.
  const holesPlayed = new Set(scores.map((s) => s.holeNumber)).size;

  // State #4 — full reveal. Designed in quick-win-5; lives in its own client
  // view so the Replay pill and confetti can share state. Used for both
  // live-mode-finished ('full') and reveal-mode-finished ('reveal-finished')
  // — both paths render the same celebratory layout with formatRevealName
  // applied to player surfaces.
  void returnQuery; // reserved for future drilldown forwarding (no-op today)

  // Sideturnering: kun synlig når status=finished AND side_tournament_enabled.
  // Vi er allerede inne i finished-grenen her ('full' eller 'reveal-finished'),
  // så det eneste ekstra-sjekket er enable-flagget.
  const showSideTournament = game.side_tournament_enabled;

  if (!showSideTournament) {
    // Solo-view: State4View renders its own Shell + Header (back-arrow lives
    // inside the view itself).
    return (
      <>
        <State4View
          gameId={gameId}
          gameName={game.name}
          teams={orderedLines}
          mode={mode}
          coursePar={coursePar}
          holesPlayed={holesPlayed}
          backHref={backHref}
        />
        <WithdrawnPlayersSection players={bestBallWithdrawn} />
      </>
    );
  }

  // Hent LD/CTP-vinnere. RLS slipper kun spillere gjennom når status=finished,
  // som vi allerede har bekreftet via view-branching ovenfor. Delt
  // `fetchSideWinners`-helper (#682) — samme query som format-stien bruker.
  const sideWinnerRows: SideWinnerRow[] = await fetchSideWinners(supabase, gameId);

  // Bygg SideTournamentInput. Vi gjenbruker `orderedLines` (allerede beregnet
  // i netto-mode via computeLeaderboard ovenfor) — hver TeamLine.holes[i].teamNet
  // er nøyaktig den best-ball-netto-en sideTournament-scoring trenger.
  //
  // Viktig: `mode` kan være 'brutto' (om brukeren har bytta til brutto i hovedfanen
  // før hen åpnet leaderboarden), men sideturneringen skal alltid skåres på netto.
  // Vi beregner derfor et eget netto-pass spesifikt for sidescoringen.
  const nettoLines =
    mode === 'netto'
      ? orderedLines
      : computeLeaderboard({ mode: 'netto', players, holes, scores });

  // Sortér teams etter teamNumber for stabilt UI (matcher Lag-labels).
  const sortedNettoLines = [...nettoLines].sort(
    (a, b) => a.teamNumber - b.teamNumber,
  );

  const sideTeams: SideTournamentTeam[] = sortedNettoLines.map((line) => ({
    teamId: line.teamNumber,
    label: tc('teamLabel', { number: line.teamNumber }),
    members: line.players.map((p) => ({
      userId: p.userId,
      displayName: formatRevealName(p.name ?? '', p.nickname),
      // First name only for compact display in the side-tournament tab.
      // Falls back to nickname-decorated displayName if no parseable name.
      firstName:
        firstName(p.name) ??
        formatRevealName(p.name ?? '', p.nickname) ??
        '?',
    })),
  }));

  // Build SideTournamentInput via the shared pure helper (#942). The inline
  // construction that used to live here has been moved to
  // `lib/scoring/sideTournamentInput.ts` so the share-card route can reuse
  // it without duplicating ~80 lines of dense data-wiring.
  const sideInput: SideTournamentInput = buildSideTournamentInput({
    nettoLines,
    holes: holes.map((h) => ({
      holeNumber: h.holeNumber,
      par: h.par,
      strokeIndex: h.strokeIndex,
    })),
    ldCount: game.side_ld_count as 0 | 1 | 2,
    ctpCount: game.side_ctp_count as 0 | 1 | 2,
    disabledCategories: game.side_disabled_categories ?? [],
    sideWinnerRows,
  });

  const sideResult = calculateSideTournament(sideInput);

  // Tab-view: the outer AppShell + TopBar own the back-arrow and kicker so the
  // page chrome is consistent across both tabs. State4View renders chromeless
  // (no inner Shell/Header) — its in-page replay control surfaces inline. The
  // SideTournamentView was always chromeless; it sits inside the same shell
  // alongside the main view.
  return (
    <AppShell>
      <TopBar backHref={backHref} kicker={game.name} />
      <LeaderboardTabs
        mainContent={
          <>
            <State4View
              gameId={gameId}
              gameName={game.name}
              teams={orderedLines}
              mode={mode}
              coursePar={coursePar}
              holesPlayed={holesPlayed}
              backHref={backHref}
              chromeless
            />
            <WithdrawnPlayersSection players={bestBallWithdrawn} />
          </>
        }
        sideContent={
          <SideTournamentView
            teams={sideTeams}
            result={sideResult}
            ldCount={sideInput.config.ldCount}
            ctpCount={sideInput.config.ctpCount}
            sideWinners={sideInput.sideWinners}
            coursePars={sideInput.coursePars}
            disabledCategories={game.side_disabled_categories ?? []}
          />
        }
      />
    </AppShell>
  );
}

