import { useTranslations } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { HourGlass } from '@/components/icons/HourGlass';
import { firstName } from '@/lib/firstName';
import {
  expectedFirstScoreTime,
  formatTeeOffTime,
} from '@/lib/format/teeOff';
import { isFrontNineOpen } from '@/lib/leaderboard/frontNineGate';
import {
  computeLeaderboard,
  parseMode,
  teamMembersLabel,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';
import { PreRoundLeaderboardRealtime } from './PreRoundLeaderboard';
import { State4View } from './State4View';
import { RevealBruttoView } from './RevealBruttoView';
import { LeaderboardTabs } from './LeaderboardTabs';
import {
  SoloStrokeplayView,
  type SoloStrokeplayPlayerInfo,
} from './SoloStrokeplayView';
import { SoloStrokeplayPodium } from './SoloStrokeplayPodium';
import {
  TexasScrambleView,
  type TexasScramblePlayerInfo,
} from './TexasScrambleView';
import { TexasScramblePodium } from './TexasScramblePodium';
import { WolfView, type WolfPlayerInfo } from './WolfView';
import { WolfPodium } from './WolfPodium';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { BingoBangoBongoView, type BingoBangoBongoPlayerInfo } from './BingoBangoBongoView';
import { BingoBangoBongoPodium } from './BingoBangoBongoPodium';
import { getBingoBangoBongoHoles } from '@/lib/bbb/getBingoBangoBongoHoles';
import { NassauView, type NassauPlayerInfo } from './NassauView';
import { NassauPodium } from './NassauPodium';
import { SkinsView, type SkinsPlayerInfo } from './SkinsView';
import { HeadToHeadResult, type StripCell } from './HeadToHeadResult';
import { SkinsPodium } from './SkinsPodium';
import { NinesView, type NinesPlayerInfo } from './NinesView';
import { NinesPodium } from './NinesPodium';
import { RoundRobinView, type RoundRobinPlayerInfo } from './RoundRobinView';
import { RoundRobinPodium } from './RoundRobinPodium';
import { AceyDeuceyView, type AceyDeuceyPlayerInfo } from './AceyDeuceyView';
import { AceyDeuceyPodium } from './AceyDeuceyPodium';
import { ShambleView, type ShamblePlayerInfo } from './ShambleView';
import { ShamblePodium } from './ShamblePodium';
import { PatsomeView, type PatsomePlayerInfo } from './PatsomeView';
import { PatsomePodium } from './PatsomePodium';
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
  type SideWinner,
} from '@/lib/scoring/sideTournament';
import { revealState } from '@/lib/games/visibility';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  getGameWithPlayers,
  type GameForHole,
} from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import type { TeeGender } from '@/lib/games/teeRating';
import { markNotificationsRead } from '@/lib/notifications/markRead';
// Mode-router for stableford-stats. Aliaset til `computeModeResult` for å
// unngå navnekollisjon med best-ball-spesifikke `computeLeaderboard` fra
// `lib/leaderboard.ts`.
import { computeLeaderboard as computeModeResult, isStablefordFamily, isScrambleFamily, isAlternateShotMatchplay } from '@/lib/scoring';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { buildSkinsContext } from '@/lib/scoring/context/buildSkinsContext';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { buildNinesContext } from '@/lib/scoring/context/buildNinesContext';
import { buildRoundRobinContext } from '@/lib/scoring/context/buildRoundRobinContext';
import { buildAceyDeuceyContext } from '@/lib/scoring/context/buildAceyDeuceyContext';
import { buildBingoBangoBongoContext } from '@/lib/scoring/context/buildBingoBangoBongoContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import {
  getLeaderboardContext,
  fetchSideWinners,
} from './leaderboardContext';
import {
  renderSideTournamentTabs,
} from './sideTournament';
import { renderStableford } from './formats/stableford';
import { renderMatchplay } from './formats/matchplay';
import { renderFourballMatchplay } from './formats/fourballMatchplay';
import { renderFoursomesMatchplay } from './formats/foursomesMatchplay';
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
  const [tc, { supabase }, locale] = await Promise.all([
    getTranslations('leaderboard.common'),
    getLeaderboardContext(),
    getLocale(),
  ]);

  // Players come from the tag-cached helper (cache hit since the outer
  // page already warmed it). Holes + scores stay direct fetches.
  // #624 — banenavnet hentes slankt parallelt (ikke via den cachede
  // getGameWithPlayers, som bevisst ikke joiner courses) for å re-lokalisere
  // det auto-genererte spillnavnet ved visning.
  const [gwp, rawHolesRes, rawScoresRes, courseRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', gameRow.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .returns<ScoreRow[]>(),
    gameRow.course_id
      ? supabase
          .from('courses')
          .select('name')
          .eq('id', gameRow.course_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);

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
    return renderStableford({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
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
    return renderSoloStrokeplay({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
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
    return renderWolf({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Nassau (issue #276): tre stacked strokeplay-rangeringer (Front 9, Back 9,
  // Totalt 18) + aggregert unit-podium. Bruker eksisterende scores-tabell —
  // ingen per-hull-tabell som Wolf. Live-view håndterer reveal-modus internt
  // (skjuler totaler når score_visibility='reveal' og status='active').
  if (game.game_mode === 'nassau') {
    return renderNassau({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Skins med carryover (issue #275): hull-basert point-game med akkumulerende
  // pott. Per-hull-carryover-kjeden er ren funksjon av scores — ingen ny DB-
  // tabell. Live-view håndterer reveal-modus internt (skjuler totaler når
  // score_visibility='reveal' og status='active').
  if (game.game_mode === 'skins') {
    return renderSkins({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Bingo Bango Bongo (issue #277): tre prestasjons-poeng per hull (bingo/
  // bango/bongo). Per-hull-data lagres i `bingo_bango_bongo_holes`-tabellen og
  // injectes i ScoringContext via `bingoBangoBongoHoles`-feltet — nøyaktig
  // Wolf-mønstret. Live-view håndterer reveal-modus internt (skjuler totaler
  // når score_visibility='reveal' og status='active').
  if (game.game_mode === 'bingo_bango_bongo') {
    return renderBingoBangoBongo({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Nines / Split Sixes (issue #278): individuelt 3-spiller-format der poeng
  // fordeles per hull etter effective-score-rangering. Ingen ny DB-tabell —
  // ren funksjon av scores (speiler Skins-pattern). Live-view håndterer
  // reveal-modus internt (skjuler totaler når score_visibility='reveal' og
  // status='active').
  if (game.game_mode === 'nines') {
    return renderNines({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Round Robin (issue #280): 4-spiller rotating partner-format, 3 segmenter
  // à 6 hull. Rotasjonen er ren deterministisk funksjon av slot-nummer + hull-
  // nummer — ingen per-hull-tabell (forskjell fra Wolf og BBB). Scorer hentes
  // fra eksisterende scores-tabell. Live-view + finished-podium speiler Wolf-
  // pattern. View-en håndterer reveal-modus internt.
  if (game.game_mode === 'round_robin') {
    return renderRoundRobin({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
  }

  // Acey Deucey (issue #279): rent slag-derivert poeng-spill for 4 spillere.
  // Per-hull: lavest unique → +3 (ace), høyest unique → −3 (deuce), midten 0.
  // Ingen per-hull-tabell i DB — poengene regnes direkte fra slagene. Live-
  // view håndterer reveal-modus internt (skjuler totaler når
  // score_visibility='reveal' og status='active').
  if (game.game_mode === 'acey_deucey') {
    return renderAceyDeucey({
      gameId,
      game,
      gwp,
      rawHolesRows: rawHolesRes.data ?? [],
      rawScoresRows: rawScoresRes.data ?? [],
      backHref,
    });
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

  const sideWinnersForInput: SideWinner[] = sideWinnerRows
    .filter(
      (w): w is SideWinnerRow & { position: 1 | 2 } =>
        w.position === 1 || w.position === 2,
    )
    .map((w) => ({
      category: w.category,
      position: w.position,
      winnerUserId: w.winner_user_id,
    }));

  const ldCount = game.side_ld_count as 0 | 1 | 2;
  const ctpCount = game.side_ctp_count as 0 | 1 | 2;

  // coursePars: 18-element par-array indexed by hole-1 (i.e. coursePars[0] is
  // hole 1's par). The course_holes query above is already ordered by
  // hole_number ascending, but we still resolve by hole-number rather than
  // array position so a sparse course (missing rows) leaves `undefined` slots
  // for sideTournament.ts to skip — never silently shifts pars onto the wrong
  // hole.
  const parByHole = new Map<number, number>();
  const siByHole = new Map<number, number>();
  for (const h of holes) {
    parByHole.set(h.holeNumber, h.par);
    siByHole.set(h.holeNumber, h.strokeIndex);
  }
  const coursePars: number[] = [];
  const courseStrokeIndices: number[] = [];
  for (let h = 1; h <= 18; h++) {
    const par = parByHole.get(h);
    // Fall back to 4 only when the row genuinely doesn't exist — keeps
    // the array dense for the `coursePars[h] != null` checks downstream.
    coursePars.push(par ?? 4);
    // Same fallback discipline for stroke-index; hardest_hole_winner gates
    // on the resolved SI=1 hole, so a missing row falling back to its own
    // position is fine.
    courseStrokeIndices.push(siByHole.get(h) ?? h);
  }

  // playerScoresPerHole: per-player 18-element brutto + netto arrays. Source
  // of truth is `sortedNettoLines` — `computeLeaderboard` already ran in netto
  // mode there, so `pc.net` is the canonical strokes-adjusted netto and
  // `pc.gross` is the recorded brutto. Missing holes stay `null` (never `0`).
  type PlayerHoleAccum = {
    userId: string;
    perHoleGross: Array<number | null>;
    perHoleNetto: Array<number | null>;
  };
  const playerAccum = new Map<string, PlayerHoleAccum>();
  for (const line of sortedNettoLines) {
    for (const p of line.players) {
      if (!playerAccum.has(p.userId)) {
        playerAccum.set(p.userId, {
          userId: p.userId,
          perHoleGross: new Array<number | null>(18).fill(null),
          perHoleNetto: new Array<number | null>(18).fill(null),
        });
      }
    }
    for (const hole of line.holes) {
      // Defensive: ignore any hole-rows outside 1..18 (shouldn't happen with
      // valid course data, but guards the array index).
      const idx = hole.holeNumber - 1;
      if (idx < 0 || idx >= 18) continue;
      for (const pc of hole.players) {
        const accum = playerAccum.get(pc.userId);
        if (!accum) continue;
        accum.perHoleGross[idx] = pc.gross;
        accum.perHoleNetto[idx] = pc.net;
      }
    }
  }
  const playerScoresPerHole = Array.from(playerAccum.values());

  const sideInput: SideTournamentInput = {
    config: {
      enabled: true,
      ldCount,
      ctpCount,
      disabledCategories: game.side_disabled_categories ?? [],
    },
    teams: sortedNettoLines.map((line) => ({
      teamId: line.teamNumber,
      userIds: line.players.map((p) => p.userId),
    })),
    coursePars,
    courseStrokeIndices,
    playerScoresPerHole,
    nettoBestBallPerHole: sortedNettoLines.map((line) => {
      // computeLeaderboard returns holes sorted 1..18 already.
      const perHoleNetto: Array<number | null> = [];
      for (let h = 1; h <= 18; h++) {
        const row = line.holes.find((rh) => rh.holeNumber === h);
        perHoleNetto.push(row?.teamNet ?? null);
      }
      return { teamId: line.teamNumber, perHoleNetto };
    }),
    sideWinners: sideWinnersForInput,
  };

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
            ldCount={ldCount}
            ctpCount={ctpCount}
            sideWinners={sideWinnerRows.map((w) => ({
              category: w.category,
              position: w.position,
              winnerUserId: w.winner_user_id,
            }))}
            coursePars={coursePars}
            disabledCategories={game.side_disabled_categories ?? []}
          />
        }
      />
    </AppShell>
  );
}

/**
 * Position badge — rank-aware label + accent colour.
 *
 * Inlined into TeamCard because the visual treatment (gold for 1st, silver
 * for 2nd, bronze for 3rd) is tied to surrounding card styling.
 */
function rankAccent(rank: number): {
  cardClass: string;
  badge: string;
  badgeClass: string;
} {
  if (rank === 1) {
    return {
      cardClass:
        'border-accent bg-accent/[0.06] shadow-[0_2px_12px_rgba(201,169,97,0.15)]',
      badge: '🥇',
      badgeClass: 'text-accent',
    };
  }
  if (rank === 2) {
    return {
      cardClass: 'border-muted/40',
      badge: '🥈',
      badgeClass: 'text-muted',
    };
  }
  if (rank === 3) {
    return {
      cardClass: 'border-warning/40',
      badge: '🥉',
      badgeClass: 'text-warning',
    };
  }
  return { cardClass: '', badge: `${rank}.`, badgeClass: 'text-muted' };
}

function TeamCard({
  line,
  leaderTotal,
}: {
  line: TeamLine;
  leaderTotal: number;
}) {
  const tc = useTranslations('leaderboard.common');
  const accent = rankAccent(line.rank);
  const members = teamMembersLabel(line.players);
  const missing = line.missingHoles.length;
  const isLeader = line.rank === 1;
  const delta = line.total - leaderTotal;

  return (
    <div className={`lb-row ${isLeader ? '' : ''}`}>
      <Card className={accent.cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={`text-lg ${accent.badgeClass}`}>
                {accent.badge}
              </span>
              <p className="font-serif text-xl font-medium tracking-tight text-text">
                {tc('teamLabel', { number: line.teamNumber })}
              </p>
            </div>
            <p className="text-sm text-muted truncate mt-1">
              {members || tc('noPlayers')}
            </p>
            {line.tiedWith.length > 0 && (
              <p className="text-xs text-muted mt-1">
                {tc('tiedWith', {
                  rank: line.rank,
                  teams: line.tiedWith.map((id) => tc('teamLabel', { number: id })).join(', '),
                })}
              </p>
            )}
            {missing > 0 && (
              <p className="text-xs text-warning mt-1">
                ⚠️ {tc('missingHoles', { count: missing })}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p
              className={`score-num text-text leading-none ${
                isLeader ? 'text-4xl' : 'text-3xl'
              }`}
            >
              {line.total}
            </p>
            {!isLeader && delta > 0 && (
              <p className="inline-num text-xs text-muted mt-1.5">
                +{delta}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ModeToggle({
  gameId,
  mode,
  basePath,
}: {
  gameId: string;
  mode: LeaderboardMode;
  // e.g. "/leaderboard" or "/leaderboard/holes"
  basePath: string;
}) {
  const tc = useTranslations('leaderboard.common');
  const base = `/games/${gameId}${basePath}`;
  return (
    <div
      role="tablist"
      aria-label={tc('modeToggleAriaLabel')}
      className="inline-flex rounded-full bg-primary-soft p-1"
    >
      <SmartLink
        role="tab"
        aria-selected={mode === 'netto'}
        href={`${base}?mode=netto`}
        className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-medium tracking-tight transition-all ${
          mode === 'netto'
            ? 'bg-surface text-text shadow-sm'
            : 'text-muted hover:text-text'
        }`}
      >
        {tc('netto')}
      </SmartLink>
      <SmartLink
        role="tab"
        aria-selected={mode === 'brutto'}
        href={`${base}?mode=brutto`}
        className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-medium tracking-tight transition-all ${
          mode === 'brutto'
            ? 'bg-surface text-text shadow-sm'
            : 'text-muted hover:text-text'
        }`}
      >
        {tc('brutto')}
      </SmartLink>
    </div>
  );
}

/**
 * State #3 — "Stille før stormen". Rendered when the game hasn't progressed
 * far enough for a leaderboard to be meaningful: status=scheduled, or
 * status=active with no team yet through front 9. The PreRoundLeaderboardRealtime
 * client component subscribes to scores INSERTs and refreshes the route on
 * the first score so the server re-evaluates the gate and can flip to #3.5.
 *
 * The startliste shows one row per team (sorted by team_number). Tee-off is
 * the same per row for now — per-flight staggered tee times are a future
 * feature. When `teeOffAt` is null (legacy game from before D2 migration),
 * the heading falls back to "Stille før stormen." and the tee column shows
 * an em-dash.
 */


/**
 * Solo strokeplay-grenen — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → SoloStrokeplayPodium: topp 3 podium med konfetti på 1.-plass
 *     og resten av rangeringen collapsed under.
 *   - alt annet (active/scheduled) → SoloStrokeplayView: flat liste sortert
 *     på laveste netto-total, samme view brukes både midt-runde og post-finished.
 *
 * Speilet `renderStableford`-pattern for konsistens. Solo strokeplay har
 * `team_size = 1` i `mode_config` (validatoren håndhever), så `teamNumber`
 * sendes som null for å matche scoring-laget sin solo-narrowing.
 *
 * State #3/#3.5-«venterom» er bevisst skipped — slagspill-spillere ser
 * hverandre umiddelbart (samme RLS-policy som stableford og matchplay).
 */
async function renderSoloStrokeplay(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
      withdrawn_at: string | null;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const th2h = await getTranslations('leaderboard.h2h');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // WD (#386): build withdrawn list for the display section. The ctx-builder
  // does its own WD-filtering of players + scores, so we only need the list
  // for the WithdrawnPlayersSection chrome here.
  const unknownPlayer = tc('unknownPlayer');

  const soloWithdrawn: WithdrawnPlayer[] = gwp.players
    .filter((p) => p.users != null && p.withdrawn_at != null)
    .map((p) => ({
      user_id: p.user_id,
      display_name: p.users!.name ?? unknownPlayer,
    }));

  const holesPlayed = maxHolesPlayed(rawScoresRows);

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (SoloStrokeplayHolesBody), inkl. WD-filtrering, så map-logikken ikke
  // dupliseres.
  const ctx = buildSoloStrokeplayContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'solo_strokeplay') {
    notFound();
  }

  const playersById = new Map<string, SoloStrokeplayPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  const wdSection = <WithdrawnPlayersSection players={soloWithdrawn} />;

  // Finished → champagne-podium med konfetti. Ved nøyaktig 2 (aktive) spillere
  // er det en duell → head-to-head-kort i stedet for podium (epic #496);
  // slagspill er lavest-vinner, så `lowerWins` inverterer baren + dommen.
  // 1 eller 3+ → SoloStrokeplayPodium som før. Active/scheduled → flat live-view.
  // Med sideturnering (#576) mates samme reveal (duell eller podium) inn som
  // mainContent i LeaderboardTabs — duell-kortet beholdes også med sideturnering
  // på (#589).
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // mainContent: duell-kort (2 spillere) eller podium (1/3+). Tar `chromeless`
    // så samme reveal kan rendres frittstående ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean) => React.ReactNode;
    if (result.players.length === 2) {
      // Stabil rekkefølge etter game_players (ikke rank), så fargene følger
      // spiller-identitet — ikke hvem som vant.
      const order = gwp.players.map((p) => p.user_id);
      const [a, b] = [...result.players].sort(
        (x, y) => order.indexOf(x.userId) - order.indexOf(y.userId),
      );
      const sideFor = (pl: typeof a) => {
        const info = playersById.get(pl.userId);
        return {
          userId: pl.userId,
          name: info?.name ?? unknownPlayer,
          nickname: info?.nickname ?? null,
          score: pl.totalNetStrokes,
          subLabel: th2h('subLabelGross', { gross: pl.totalGrossStrokes }),
        };
      };
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        if (h.bestUserIds.length === 1) {
          if (h.bestUserIds[0] === a.userId) return 'a';
          if (h.bestUserIds[0] === b.userId) return 'b';
          return 'unplayed';
        }
        if (h.bestUserIds.length > 1) return 'halved';
        return 'unplayed';
      });
      // Lavest netto vinner; rank fanger tie-break-cascaden. Tie iff begge
      // deler rank.
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      mainContent = (chromeless) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={`Slagspill · ${tc('netto')}`}
          unitLabel="slag"
          lowerWins
          sideA={sideFor(a)}
          sideB={sideFor(b)}
          winnerUserId={winnerUserId}
          strip={strip}
          backHref={backHref}
          chromeless={chromeless}
        />
      );
    } else {
      mainContent = (chromeless) => (
        <SoloStrokeplayPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          backHref={backHref}
          chromeless={chromeless}
        />
      );
    }
    if (showSide) {
      return (
        <>
          {await renderSideTournamentTabs({
            gameId,
            game,
            gwp,
            rawHolesRows,
            rawScoresRows,
            backHref,
            mainContent: mainContent(true),
            teamGrouping: 'solo',
          })}
          {wdSection}
        </>
      );
    }
    return (
      <>
        {mainContent(false)}
        {wdSection}
      </>
    );
  }

  return (
    <>
      <SoloStrokeplayView
        gameId={gameId}
        gameName={game.name}
        result={result}
        playersById={playersById}
        holesPlayed={holesPlayed}
        backHref={backHref}
      />
      {wdSection}
    </>
  );
}

/**
 * Texas scramble-grenen (issue #44) — bygger ScoringContext fra rå-rad-ene,
 * kjører mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → TexasScramblePodium: topp 3 lag på podiet med konfetti
 *     på 1.-plass og resten av rangeringen collapsed under.
 *   - alt annet (active/scheduled) → TexasScrambleView: flat liste sortert
 *     på laveste lag-netto.
 *
 * Speilet `renderSoloStrokeplay`-pattern for konsistens. Texas har
 * `team_size: 2 | 4` i mode_config og `team_number` per spiller — vi
 * videresender team_number til scoring-laget, og scoring-laget grupperer
 * og velger kaptein lex-min.
 *
 * State #3/#3.5-«venterom» bevisst skipped — alle lag-medlemmer ser hverandre
 * umiddelbart (samme RLS-policy som stableford/matchplay/solo-strokeplay).
 */
async function renderTexasScramble(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
  /** Format-label for sub-tittel i view + podium. Gjennomgis fra MODE_LABELS[game.game_mode]. */
  formatLabel?: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, formatLabel } = opts;

  const ctx = {
    game: {
      id: gameId,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        // Texas-validatoren håndhever team_number ≥ 1. Defensive fallback til
        // 0 (som scoring-laget filtrerer bort) hvis kolonnen mot formodning er
        // null — bedre å hoppe over enn å kaste her.
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // #240 — Texas spiller én ball per lag, så par per hull avgjøres av
        // lag-kapteinens tee_gender (lex-min userId). Sender per-spiller
        // teeGender gjennom; texasScramble-modulen velger kaptein-varianten.
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — per-kjønn-par-tabell. Texas-modulen leser parFor(hole, captain.teeGender)
      // for å bestemme hull-par når lag har avvikende kapteins-tee.
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  };

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'texas_scramble') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, TexasScramblePlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Finished → TexasScramblePodium. Med sideturnering (#576): podiet pakkes
  // som chromeless mainContent i en LeaderboardTabs-veksler med side-fanen.
  // Lag-format → 'byTeamNumber' så lag-aggregerte sidekategorier gjelder.
  if (game.status === 'finished') {
    const podium = (chromeless: boolean) => (
      <TexasScramblePodium
        gameId={gameId}
        gameName={game.name}
        result={result}
        playersById={playersById}
        holesPlayed={holesPlayed}
        backHref={backHref}
        formatLabel={formatLabel}
        chromeless={chromeless}
      />
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: podium(true),
        teamGrouping: 'byTeamNumber',
      });
    }
    return podium(false);
  }

  return (
    <TexasScrambleView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      backHref={backHref}
      formatLabel={formatLabel}
    />
  );
}

/**
 * Wolf-grenen (issue #274) — bygger ScoringContext fra rå-rad-ene + per-hull-
 * valg fra `wolf_hole_choices`-tabellen, kjører mode-router-en og velger view
 * per `game.status`:
 *
 *   - `finished` → WolfPodium + WolfView under: feirings-view med Pack-leder-
 *     podium, bragging-stats (Mest Wolf-hull, Blind Wolf-pott) og per-hull-
 *     drilldown under.
 *   - alt annet (active/scheduled) → WolfView alene: live-leaderboard med
 *     spiller-totals + per-hull-tabell. View-en håndterer reveal-modus internt
 *     basert på `scoreVisibility` + `gameStatus` props.
 *
 * Forskjell fra andre modi: vi henter `wolfChoices` separat via `getWolfChoices`
 * (tag-cachet på `game-${id}`) og injecter i ScoringContext. Scoring-laget leser
 * choices for å bestemme outcome per hull; mangler choice → outcome='pending'.
 *
 * Wolf har alltid `team_size: 1` og `teams_count: n` (n=3-5, #465) i mode_config.
 * team_number 1..n er rotation-slot (random permutasjon satt av wizard) — sendes
 * som-er til scoring-laget som bruker det for å bestemme Wolf per hull.
 */
async function renderWolf(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Per-hull-valg fra wolf_hole_choices. Tag-cachet på `game-${id}`, samme
  // cache-tag som getGameWithPlayers — setWolfChoice-mutasjons-action revaliderer
  // den ved hver endring.
  const wolfChoices = await getWolfChoices(gameId);

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (WolfHolesBody), så map-logikken ikke dupliseres.
  const ctx = buildWolfContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
    wolfChoices,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'wolf') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, WolfPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en — DB-
  // kolonnen er en enum av samme to verdier, men vi caster defensivt.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → WolfPodium på toppen + WolfView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): podiet + view-en pakkes som
  // chromeless mainContent i en LeaderboardTabs-veksler med side-fanen.
  // Active/scheduled → WolfView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <WolfPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <WolfView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(true),
        teamGrouping: 'solo',
      });
    }
    return finishedView(false);
  }

  return (
    <WolfView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Nassau-grenen (issue #276) — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → NassauPodium + NassauView (chromeless): aggregert unit-
 *     podium med sweep-feiring + tre stacked seksjon-rangeringer under.
 *   - alt annet (active/scheduled) → NassauView alene: tre stacked seksjon-
 *     rangeringer (Front 9 / Back 9 / Totalt 18 hull) live.
 *
 * I motsetning til Wolf trenger Nassau ingen per-hull-tabell — scoring kjører
 * fra eksisterende `scores`-tabell. Strukturen speiler `renderSoloStrokeplay`-
 * pattern, men view-en håndterer reveal-modus internt (skjuler totaler når
 * score_visibility='reveal' og status='active').
 */
async function renderNassau(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const tn = await getTranslations('leaderboard.nassau');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (NassauHolesBody), så map-logikken ikke dupliseres.
  const ctx = buildNassauContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nassau') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);

  const playersById = new Map<string, NassauPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en — DB-
  // kolonnen er en enum av samme to verdier, men vi caster defensivt.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → resultat-flate på toppen + NassauView under (chromeless, så bare
  // én outer shell). Ved nøyaktig 2 spillere er det en duell → head-to-head-
  // kort i stedet for podium (epic #496). 3+ → NassauPodium som før.
  // Med sideturnering (#576) mates samme reveal (duell eller podium) inn som
  // mainContent i LeaderboardTabs — duell-kortet beholdes også med sideturnering
  // på (#589). Active/scheduled → NassauView alene.
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // mainContent: duell-kort (2 spillere) eller podium (3+), alltid med
    // NassauView under. Tar `chromeless` så samme reveal kan rendres
    // frittstående ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean) => React.ReactNode;
    if (result.players.length === 2) {
      // Stabil rekkefølge etter game_players (ikke rank), så fargene følger
      // spiller-identitet — ikke hvem som vant.
      const order = gwp.players.map((p) => p.user_id);
      const [a, b] = [...result.players].sort(
        (x, y) => order.indexOf(x.userId) - order.indexOf(y.userId),
      );
      const sectionLabel = (line: typeof a): string => {
        const won: string[] = [];
        if (line.unitBreakdown.front9) won.push(tn('front9Label'));
        if (line.unitBreakdown.back9) won.push(tn('back9Label'));
        if (line.unitBreakdown.total18) won.push(tn('totalLabel'));
        return won.length > 0 ? won.join(' · ') : tn('noSections');
      };
      const sideFor = (pl: typeof a) => {
        const info = playersById.get(pl.userId);
        return {
          userId: pl.userId,
          name: info?.name ?? unknownPlayer,
          nickname: info?.nickname ?? null,
          score: pl.units,
          subLabel: sectionLabel(pl),
        };
      };
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        if (h.bestUserIds.length === 1) {
          if (h.bestUserIds[0] === a.userId) return 'a';
          if (h.bestUserIds[0] === b.userId) return 'b';
          return 'unplayed';
        }
        if (h.bestUserIds.length > 1) return 'halved';
        return 'unplayed';
      });
      // Units kan være like (f.eks. 1–1 med én pushet seksjon); da avgjør
      // total18-cascaden, fanget av rank. Tie iff begge deler rank.
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      // Push-note: seksjoner som endte delt (tied 1.-plass) deler ingen unit ut.
      const s = result.sections;
      const pushed: string[] = [];
      if (!s.front9.isPending && s.front9.winnerUserIds.length > 1)
        pushed.push(tn('front9Label'));
      if (!s.back9.isPending && s.back9.winnerUserIds.length > 1)
        pushed.push(tn('back9Label'));
      if (!s.total18.isPending && s.total18.winnerUserIds.length > 1)
        pushed.push(tn('totalLabel'));
      const hangingNote =
        pushed.length > 0 ? tn('pushedNote', { sections: pushed.join(' og ') }) : null;
      // Ved 2 spillere sier duellkortet alt — den fulle NassauView under
      // ville gjenta samme resultat (#600). Vis kun kortet.
      mainContent = (chromeless) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={`Nassau · ${result.scoring === 'net' ? tc('netto') : tc('brutto')}`}
          unitLabel={tn('unitSections')}
          sideA={sideFor(a)}
          sideB={sideFor(b)}
          winnerUserId={winnerUserId}
          strip={strip}
          hangingNote={hangingNote}
          backHref={backHref}
          chromeless={chromeless}
        />
      );
    } else {
      mainContent = (chromeless) => (
        <>
          <NassauPodium
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            backHref={backHref}
            chromeless={chromeless}
          />
          <NassauView
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            holesPlayed={holesPlayed}
            scoreVisibility={scoreVisibility}
            gameStatus={game.status}
            backHref={backHref}
            chromeless
          />
        </>
      );
    }
    if (showSide) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: mainContent(true),
        teamGrouping: 'solo',
      });
    }
    return mainContent(false);
  }

  return (
    <NassauView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Skins-grenen (issue #275) — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → SkinsPodium på toppen + SkinsView under (chromeless): feirings-
 *     podium med skins-vinner + per-hull carryover-drilldown under.
 *   - alt annet (active/scheduled) → SkinsView alene: spiller-totals + per-hull-
 *     tabell live. View-en håndterer reveal-modus internt basert på
 *     `scoreVisibility` + `gameStatus` props.
 *
 * Skins trenger ingen ekstra DB-fetch utover scores (carryover er ren funksjon
 * av scores). Speiler Nassau-pattern uten wolfChoices-injeksjon.
 */
async function renderSkins(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const tsk = await getTranslations('leaderboard.skins');
  const th2h = await getTranslations('leaderboard.h2h');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Delt context-bygging (epic #496) — samme kilde som «Hull for hull»-flaten
  // (SkinsHolesBody), så map-logikken ikke dupliseres.
  const ctx = buildSkinsContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'skins') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);

  const playersById = new Map<string, SkinsPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → resultat-flate på toppen + SkinsView under (chromeless, så bare
  // én outer shell). Ved nøyaktig 2 spillere er det en duell → head-to-head-
  // kort i stedet for podium (epic #496). 3+ → SkinsPodium som før.
  // Med sideturnering (#576) mates samme reveal (duell eller podium) inn som
  // mainContent i LeaderboardTabs — duell-kortet beholdes også med sideturnering
  // på (#589). Active/scheduled → SkinsView alene.
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // mainContent: duell-kort (2 spillere) eller podium (3+), alltid med
    // SkinsView under. Tar `chromeless` så samme reveal kan rendres
    // frittstående ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean) => React.ReactNode;
    if (result.players.length === 2) {
      // Stabil rekkefølge etter game_players (ikke rank), så fargene følger
      // spiller-identitet — ikke hvem som vant.
      const order = gwp.players.map((p) => p.user_id);
      const [a, b] = [...result.players].sort(
        (x, y) => order.indexOf(x.userId) - order.indexOf(y.userId),
      );
      const sideFor = (pl: typeof a) => {
        const info = playersById.get(pl.userId);
        return {
          userId: pl.userId,
          name: info?.name ?? unknownPlayer,
          nickname: info?.nickname ?? null,
          score: pl.totalSkins,
          subLabel: th2h('subLabelHolesWon', { count: pl.holesWon }),
        };
      };
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        if (h.outcome === 'won') {
          if (h.winnerUserId === a.userId) return 'a';
          if (h.winnerUserId === b.userId) return 'b';
          return 'unplayed';
        }
        if (h.outcome === 'carryover') return 'halved';
        return 'unplayed';
      });
      // Tie iff begge deler rank (lik totalSkins OG holesWon); ellers er den
      // rank-1 spilleren vinner — også på holesWon-tiebreak ved lik totalSkins.
      const winnerUserId =
        a.rank === b.rank ? null : (a.rank < b.rank ? a.userId : b.userId);
      const hangingNote =
        result.carriedPot > 0
          ? tsk('carriedNote', { count: result.carriedPot })
          : null;
      // Ved 2 spillere sier duellkortet alt (inkl. carryover-noten) — den fulle
      // SkinsView under ville gjenta samme resultat (#600). Vis kun kortet.
      mainContent = (chromeless) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel={`Skins · ${result.scoring === 'net' ? tc('netto') : tc('brutto')}`}
          unitLabel="skins"
          sideA={sideFor(a)}
          sideB={sideFor(b)}
          winnerUserId={winnerUserId}
          strip={strip}
          hangingNote={hangingNote}
          backHref={backHref}
          chromeless={chromeless}
        />
      );
    } else {
      mainContent = (chromeless) => (
        <>
          <SkinsPodium
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            backHref={backHref}
            chromeless={chromeless}
          />
          <SkinsView
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            holesPlayed={holesPlayed}
            scoreVisibility={scoreVisibility}
            gameStatus={game.status}
            backHref={backHref}
            chromeless
          />
        </>
      );
    }
    if (showSide) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: mainContent(true),
        teamGrouping: 'solo',
      });
    }
    return mainContent(false);
  }

  return (
    <SkinsView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Bingo Bango Bongo-grenen (issue #277) — henter per-hull-data fra
 * `bingo_bango_bongo_holes`-tabellen, bygger ScoringContext, kjører mode-router-
 * en og velger view per `game.status`:
 *
 *   - `finished` → BingoBangoBongoPodium på toppen + BingoBangoBongoView under
 *     (chromeless, så bare én outer shell). Speiler Wolf-finished-pattern.
 *   - alt annet (active/scheduled) → BingoBangoBongoView alene: per-spiller-
 *     tabell med Bingo/Bango/Bongo/Sum. View-en håndterer reveal-modus internt
 *     (skjuler totaler når score_visibility='reveal' og status='active').
 *
 * Slag (`rawScoresRows`) sendes gjennom til scoring-laget selv om BBB-compute
 * ignorerer dem — holder ScoringContext-shapen konsistent og lar fremtidige
 * sekundær-leaderboards gjenbruke slag-dataen uten ny DB-query.
 */
async function renderBingoBangoBongo(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Per-hull-prestasjonsdata fra bingo_bango_bongo_holes. Tag-cachet på
  // `game-${id}`, samme cache-tag som getGameWithPlayers — setBingoBangoBongoHole-
  // mutasjons-action revaliderer den ved hver endring.
  const bingoBangoBongoHoles = await getBingoBangoBongoHoles(gameId);

  // Bygges via den delte `buildBingoBangoBongoContext`-helperen (epic #496) slik
  // at både leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt
  // fra samme kilde — ingen duplisert ctx-map.
  const ctx = buildBingoBangoBongoContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
    bingoBangoBongoHoles,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'bingo_bango_bongo') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, BingoBangoBongoPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → resultat-flate på toppen + BingoBangoBongoView under (chromeless,
  // så bare én outer shell). Ved nøyaktig 2 spillere er det en duell → head-to-
  // head-kort i stedet for podium (epic #496, Stream B). BBB er det siste
  // formatet som kan være 2p, så dette lukker H2H-strømmen. 3+ → BingoBangoBongoPodium
  // som før. Med sideturnering (#576) mates samme reveal (duell eller podium)
  // inn som mainContent i LeaderboardTabs — duell-kortet beholdes også med
  // sideturnering på (#589). Active/scheduled → BingoBangoBongoView alene.
  if (game.status === 'finished') {
    const showSide = game.side_tournament_enabled;
    // mainContent: duell-kort (2 spillere) eller podium (3+), alltid med
    // BingoBangoBongoView under. Tar `chromeless` så samme reveal kan rendres
    // frittstående ELLER inni sideturnerings-fanen.
    let mainContent: (chromeless: boolean) => React.ReactNode;
    if (result.players.length === 2) {
      // Stabil rekkefølge etter game_players (ikke rank), så fargene følger
      // spiller-identitet — ikke hvem som vant.
      const order = gwp.players.map((p) => p.user_id);
      const [a, b] = [...result.players].sort(
        (x, y) => order.indexOf(x.userId) - order.indexOf(y.userId),
      );
      const sideFor = (pl: typeof a) => {
        const info = playersById.get(pl.userId);
        return {
          userId: pl.userId,
          name: info?.name ?? unknownPlayer,
          nickname: info?.nickname ?? null,
          score: pl.totalPoints,
          subLabel: `${pl.bingos} bingo · ${pl.bangos} bango · ${pl.bongos} bongo`,
        };
      };
      // Momentum-strip: hvem fikk flest poeng på hullet. Begge 0 (uregistrert)
      // → unplayed; likt og > 0 → delt.
      const strip: StripCell[] = result.holes.map((h): StripCell => {
        const aPts = h.pointsByPlayer[a.userId] ?? 0;
        const bPts = h.pointsByPlayer[b.userId] ?? 0;
        if (aPts === 0 && bPts === 0) return 'unplayed';
        if (aPts > bPts) return 'a';
        if (bPts > aPts) return 'b';
        return 'halved';
      });
      // Tie iff begge deler rank (lik totalPoints OG cascade); ellers er rank-1
      // vinner.
      const winnerUserId =
        a.rank === b.rank ? null : a.rank < b.rank ? a.userId : b.userId;
      // Ved 2 spillere sier duellkortet alt (vinner, totaler, fordeling,
      // 18-hulls-strip) — den fulle BingoBangoBongoView under ville gjenta
      // nøyaktig samme tall (#600). Vis kun kortet, som Stableford/Slagspill.
      mainContent = (chromeless) => (
        <HeadToHeadResult
          gameId={gameId}
          gameName={game.name}
          formatLabel="Bingo Bango Bongo"
          unitLabel="poeng"
          sideA={sideFor(a)}
          sideB={sideFor(b)}
          winnerUserId={winnerUserId}
          strip={strip}
          backHref={backHref}
          chromeless={chromeless}
        />
      );
    } else {
      mainContent = (chromeless) => (
        <>
          <BingoBangoBongoPodium
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            backHref={backHref}
            chromeless={chromeless}
          />
          <BingoBangoBongoView
            gameId={gameId}
            gameName={game.name}
            result={result}
            playersById={playersById}
            holesPlayed={holesPlayed}
            scoreVisibility={scoreVisibility}
            gameStatus={game.status}
            backHref={backHref}
            chromeless
          />
        </>
      );
    }
    if (showSide) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: mainContent(true),
        teamGrouping: 'solo',
      });
    }
    return mainContent(false);
  }

  return (
    <BingoBangoBongoView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Nines / Split Sixes-grenen (issue #278) — bygger ScoringContext fra rå-rad-ene,
 * kjører mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → NinesPodium på toppen + NinesView under (chromeless): feirings-
 *     podium med poeng-vinner + per-hull-rutenett under.
 *   - alt annet (active/scheduled) → NinesView alene: spiller-totals + per-hull-
 *     tabell live. View-en håndterer reveal-modus internt basert på
 *     `scoreVisibility` + `gameStatus` props.
 *
 * Nines trenger ingen ekstra DB-fetch utover scores (poengfordeling er ren funksjon
 * av scores). Speiler Skins-pattern uten wolfChoices-/bbb-injeksjon.
 */
async function renderNines(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Bygges via den delte `buildNinesContext`-helperen (epic #496) slik at
  // leaderboard-flaten og «Hull for hull»-flaten (`NinesHolesBody`) deler
  // kilde — ingen duplisert ctx-map.
  const ctx = buildNinesContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nines') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, NinesPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → NinesPodium på toppen + NinesView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): pakkes i en LeaderboardTabs-
  // veksler med side-fanen. Active/scheduled → NinesView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <NinesPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <NinesView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(true),
        teamGrouping: 'solo',
      });
    }
    return finishedView(false);
  }

  return (
    <NinesView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Round Robin-grenen (issue #280) — 4-spiller rotating partner-format. Henter
 * scorer fra eksisterende `scores`-tabell (ingen per-hull-ekstratabell — rotasjonen
 * er ren deterministisk funksjon av slot-nummer + hull-nummer). Velger view per
 * `game.status`:
 *
 *   - `finished` → RoundRobinPodium på toppen + RoundRobinView under (chromeless).
 *     Speiler Wolf-finished-pattern.
 *   - alt annet (active/scheduled) → RoundRobinView alene: per-spiller-rangering
 *     på hull-seire + segment-sammendrag (de 3 roterende konstellasjonene).
 *     View-en håndterer reveal-modus internt.
 *
 * Forskjell fra Wolf: ingen `wolfChoices`-fetch. Scorer + spillere er nok.
 * Speiler `renderBingoBangoBongo` uten per-hull-table-injektion.
 */
async function renderRoundRobin(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Bygges via den delte `buildRoundRobinContext`-helperen (epic #496) slik at
  // leaderboard-flaten og «Hull for hull»-flaten (`RoundRobinHolesBody`) deler
  // kilde — ingen duplisert ctx-map. team_number (slot A/B/C/D) sendes som-er
  // til scoring-laget som bruker det til rotasjons-konstellasjon per segment.
  const ctx = buildRoundRobinContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'round_robin') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, RoundRobinPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → RoundRobinPodium på toppen + RoundRobinView under (chromeless,
  // så bare én outer shell). Med sideturnering (#576): pakkes i en
  // LeaderboardTabs-veksler med side-fanen. Active/scheduled → RoundRobinView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <RoundRobinPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <RoundRobinView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(true),
        teamGrouping: 'solo',
      });
    }
    return finishedView(false);
  }

  return (
    <RoundRobinView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Acey Deucey-grenen (issue #279) — bygger ScoringContext fra rå-rad-ene, kjører
 * mode-router-en (`computeModeResult`) og velger view per `game.status`:
 *
 *   - `finished` → AceyDeuceyPodium på toppen + AceyDeuceyView under (chromeless):
 *     feirings-podium med vinner + per-hull ace/deuce-drilldown under.
 *   - alt annet (active/scheduled) → AceyDeuceyView alene: spiller-totaler med
 *     fortegn + per-hull-tabell live. View-en håndterer reveal-modus internt
 *     basert på `scoreVisibility` + `gameStatus` props.
 *
 * Acey Deucey trenger ingen ekstra DB-fetch (rent slag-derivert) — speiler
 * renderSkins-pattern uten carryover-logikk.
 */
async function renderAceyDeucey(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Bygges via den delte `buildAceyDeuceyContext`-helperen (epic #496) slik at
  // leaderboard-flaten og «Hull for hull»-flaten (`AceyDeuceyHolesBody`) deler
  // kilde — ingen duplisert ctx-map.
  const ctx = buildAceyDeuceyContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'acey_deucey') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, AceyDeuceyPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → AceyDeuceyPodium på toppen + AceyDeuceyView under (chromeless,
  // så bare én outer shell). Med sideturnering (#576): pakkes i en
  // LeaderboardTabs-veksler med side-fanen. Active/scheduled → AceyDeuceyView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <AceyDeuceyPodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <AceyDeuceyView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(true),
        teamGrouping: 'solo',
      });
    }
    return finishedView(false);
  }

  return (
    <AceyDeuceyView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

/**
 * Shamble / Champagne Scramble-grenen (issue #285) — bygger ScoringContext fra
 * rå-rad-ene, kjører mode-router-en (`computeModeResult`) og velger view per
 * `game.status`:
 *
 *   - `finished` → ShamblePodium på toppen + ShambleView under (chromeless): feirings-
 *     podium med vinner-laget + per-hull-rutenett under.
 *   - alt annet (active/scheduled) → ShambleView alene: lag-rangering + per-hull-
 *     tabell live. View-en håndterer reveal-modus internt basert på
 *     `scoreVisibility` + `gameStatus` props.
 *
 * Shamble bruker team_number (validatoren håndhever ≥ 1 per spiller) — vi
 * videresender reell `p.team_number` til scoring-laget, nøyaktig som Texas.
 * Ingen ekstra DB-fetch utover scores (best-N-utledning er ren funksjon av
 * scores). Speiler Nines-datasti for ScoringContext-byggingen, men med
 * team_number fra Texas-mønstret.
 */
async function renderShamble(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  const ctx = {
    game: {
      id: gameId,
      game_mode: 'shamble' as const,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        // Shamble-validatoren håndhever team_number ≥ 1 (speiler Texas-
        // validatoren). Defensive fallback til 0 (som scoring-laget filtrerer
        // bort) hvis kolonnen mot formodning er null.
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // Shamble bruker netto (eller gross, per mode_config.shamble_scoring)
        // basert på spillerens egen handicap — egne baller, ikke delt ball.
        // Sender teeGender gjennom for per-kjønn-par-resolvering (#240).
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  };

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'shamble') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, ShamblePlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → ShamblePodium på toppen + ShambleView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): pakkes i en LeaderboardTabs-
  // veksler med side-fanen ('byTeamNumber' — lag-format). Active/scheduled →
  // ShambleView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <ShamblePodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <ShambleView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(true),
        teamGrouping: 'byTeamNumber',
      });
    }
    return finishedView(false);
  }

  return (
    <ShambleView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

async function renderPatsome(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  const ctx = {
    game: {
      id: gameId,
      game_mode: 'patsome' as const,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  };

  const result = computeModeResult(ctx);
  if (result.kind !== 'patsome') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const holesPlayed = maxHolesPlayed(rawScoresRows);
  const playersById = new Map<string, PatsomePlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
    });
  }

  // Score-visibility normaliseres til 'live' | 'reveal' for view-en.
  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';

  // Finished → PatsomePodium på toppen + PatsomeView under (chromeless, så bare
  // én outer shell). Med sideturnering (#576): pakkes i en LeaderboardTabs-
  // veksler med side-fanen ('byTeamNumber' — lag-format). Active/scheduled →
  // PatsomeView alene.
  if (game.status === 'finished') {
    const finishedView = (podiumChromeless: boolean) => (
      <>
        <PatsomePodium
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          backHref={backHref}
          chromeless={podiumChromeless}
        />
        <PatsomeView
          gameId={gameId}
          gameName={game.name}
          result={result}
          playersById={playersById}
          holesPlayed={holesPlayed}
          scoreVisibility={scoreVisibility}
          gameStatus={game.status}
          backHref={backHref}
          chromeless
        />
      </>
    );
    if (game.side_tournament_enabled) {
      return renderSideTournamentTabs({
        gameId,
        game,
        gwp,
        rawHolesRows,
        rawScoresRows,
        backHref,
        mainContent: finishedView(true),
        teamGrouping: 'byTeamNumber',
      });
    }
    return finishedView(false);
  }

  return (
    <PatsomeView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playersById={playersById}
      holesPlayed={holesPlayed}
      scoreVisibility={scoreVisibility}
      gameStatus={game.status}
      backHref={backHref}
    />
  );
}

async function renderState3(opts: {
  gameId: string;
  teeOffAt: string | null;
  players: LbPlayer[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const ts3 = await getTranslations('leaderboard.state3');
  const { gameId, teeOffAt, players, backHref } = opts;
  const teeOffDate = teeOffAt ? new Date(teeOffAt) : null;
  const teeOffLabel = teeOffDate ? formatTeeOffTime(teeOffDate) : '—';

  // Group players by team, sorted by team_number ascending.
  const teamNumbers = Array.from(
    new Set(players.map((p) => p.teamNumber)),
  ).sort((a, b) => a - b);
  const teams = teamNumbers.map((teamNumber) => ({
    teamNumber,
    members: players.filter((p) => p.teamNumber === teamNumber),
  }));
  const teamCount = teams.length;

  return (
    <AppShell>
      <PreRoundLeaderboardRealtime gameId={gameId} />

      <header className="mb-6 flex items-center justify-between gap-4">
        <BackLink href={backHref}>{tc('back')}</BackLink>
        {/* Per design spec § state 3: kicker is the literal "LEADERBOARD"
            section label (not the game name like state #2 uses). */}
        <Kicker tone="accent">{tc('leaderboardKicker')}</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-5 pt-6 pb-2">
        <HourGlass size={48} className="text-primary" />
        <Kicker tone="muted" className="mt-14">
          {ts3('kicker')}
        </Kicker>
        <h1 className="mt-6 font-serif text-[24px] font-medium tracking-[-0.015em] leading-tight text-text">
          {teeOffDate
            ? ts3('firstScoreExpected', { time: expectedFirstScoreTime(teeOffDate) })
            : ts3('headingFallback')}
        </h1>
        <p className="mt-10 max-w-[280px] font-sans text-[13px] leading-[1.5] text-muted">
          {ts3('teamCountText', { count: teamCount })}
        </p>
      </section>

      {/* Startliste header */}
      <section className="px-6 pt-[22px] pb-2 text-center">
        <Kicker tone="muted">{ts3('startlistKicker')}</Kicker>
      </section>

      {/* Team list */}
      <ul className="px-4 pb-4 flex flex-col gap-2">
        {teams.map((team, idx) => (
          <li
            key={team.teamNumber}
            className="px-3.5 py-3 bg-surface border border-border rounded-xl shadow-sm flex items-center gap-3"
          >
            <span className="w-6 shrink-0 text-center font-serif tabular-nums text-[13px] text-muted">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
                {tc('teamLabel', { number: team.teamNumber })}
              </p>
              <p className="mt-0.5 truncate font-sans text-[11.5px] text-muted">
                {team.members
                  .map((m) => firstName(m.name) ?? m.name)
                  .join(' · ') || tc('noPlayers')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <Kicker tone="muted">{tc('teeKicker')}</Kicker>
              <p className="mt-0.5 font-serif text-[15px] font-medium tracking-[-0.01em] tabular-nums text-text">
                {teeOffLabel}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <PullQuote className="px-6 pt-1 pb-4">{tc('goodLuck')}</PullQuote>
    </AppShell>
  );
}

/**
 * State #3.5 — "Front 9 åpen, back 9 låst". Rendered when status='active' and
 * at least one team has fully completed front 9 (both players × all 9 holes).
 *
 * The leaderboard is computed against scores+holes clipped to the front 9,
 * so partial teams naturally get `missingHoles.length > 0` and the existing
 * TeamCard renders "⚠️ N hull mangler" — which reads correctly on a 9-hole
 * view ("3 hull mangler" of the 9). Back 9 stays hidden behind the locked
 * block until status flips to 'finished'.
 */
async function renderState35(opts: {
  gameId: string;
  mode: LeaderboardMode;
  players: LbPlayer[];
  holes: LbHole[];
  scores: LbScore[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const ts35 = await getTranslations('leaderboard.state35');
  const { gameId, mode, players, holes, scores, backHref } = opts;

  const frontNineHoles = holes.filter(
    (h) => h.holeNumber >= 1 && h.holeNumber <= 9,
  );
  const frontNineScores = scores.filter(
    (s) => s.holeNumber >= 1 && s.holeNumber <= 9,
  );

  const lines = computeLeaderboard({
    mode,
    players,
    holes: frontNineHoles,
    scores: frontNineScores,
  });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);
  const leaderTotal = orderedLines.find((l) => l.rank === 1)?.total ?? 0;

  return (
    <AppShell>
      {/* Reuse the pre-round realtime — same scores-INSERT subscription
          works here too. When a new score lands the page refreshes; the
          server re-evaluates view (may stay #3.5 or eventually flip to
          'full' when admin ends the game). */}
      <PreRoundLeaderboardRealtime gameId={gameId} />

      <header className="mb-4 flex items-center justify-between gap-4">
        <BackLink href={backHref}>{tc('back')}</BackLink>
        <Kicker tone="accent">{tc('leaderboardKicker')}</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      {/* FRONT 9 champagne pill — signals this isn't the final standing. */}
      <div className="flex justify-center mb-5">
        <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
          {ts35('front9Label')}
        </span>
      </div>

      <div className="flex justify-center mb-5">
        <ModeToggle gameId={gameId} mode={mode} basePath="/leaderboard" />
      </div>

      <div className="space-y-3 px-4">
        {orderedLines.length === 0 && (
          <Card>
            <p className="text-sm text-muted">{tc('noTeams')}</p>
          </Card>
        )}
        {orderedLines.map((line) => (
          <TeamCard
            key={line.teamNumber}
            line={line}
            leaderTotal={leaderTotal}
          />
        ))}
      </div>

      {/* Locked back 9 block — back-9 scores stay hidden until the game is
          finished so the climax doesn't get spoiled mid-round.
          bg-surface (no opacity) lifts off the page bg in both modes:
          white on linen in light, forest-on-darker-forest in dark. The
          /50 we tried first read too subtle in dark mode. */}
      <div className="mx-4 mt-6 rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-center">
        <p className="font-serif text-[16px] font-medium text-text">
          {ts35('lockedHeading')}
        </p>
        <p className="mt-2 font-sans text-xs text-muted">
          {ts35('lockedSub')}
        </p>
      </div>

      <PullQuote className="px-6 pt-4 pb-4">{tc('goodLuck')}</PullQuote>
    </AppShell>
  );
}
