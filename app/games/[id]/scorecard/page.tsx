import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import type { StablefordPointsFn } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import {
  revealState,
  shouldHideNetto,
  type RevealState,
} from '@/lib/games/visibility';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getRatingForGender } from '@/lib/games/teeRating';
import { scorecardTitle } from '@/lib/games/scorecardTitle';
import {
  resolveScorecardLayout,
  computeLayoutBTotals,
  type ScorecardColumnPlayer,
  type ScorecardLayout,
} from '@/lib/games/scorecardLayout';
import { nameInitials } from '@/lib/names/initials';
import { firstName } from '@/lib/firstName';
import {
  hasParDifference,
  formatOtherGendersPar,
  parForPlayer,
  type HoleParByGender,
} from '@/lib/games/parDisplay';
import type { ScoringGender } from '@/lib/scoring/modes/types';

type Params = Promise<{ id: string }>;

function genderLabelShort(g: 'mens' | 'ladies' | 'juniors'): string {
  return g === 'mens' ? 'herre' : g === 'ladies' ? 'dame' : 'junior';
}

type HoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

const getScorecardContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

// Column-formatter — bridge fra rå game_players-rad til kolonne-data.
// Holdes her i view-laget fordi det er kun her vi vet hvilken
// name-resolution-strategi som passer presentasjons-laget.
const columnFormatter = {
  initials(p: { users: { name: string | null; nickname: string | null } | null }) {
    return nameInitials(p.users?.nickname ?? p.users?.name ?? null);
  },
  displayName(
    p: { users: { name: string | null; nickname: string | null } | null },
    fallback: string,
  ) {
    return firstName(p.users?.nickname ?? p.users?.name) ?? fallback;
  },
};

export default async function ScorecardPage({ params }: { params: Params }) {
  const { id } = await params;
  const { userId } = await getScorecardContext();
  if (!userId) redirect('/login');

  // games + game_players from the tag-cached helper. See
  // lib/games/getGameWithPlayers.ts for cache + authz rationale.
  const result = await getGameWithPlayers(id);
  if (!result) notFound();
  const { game, players } = result;

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    redirect(`/games/${id}`);
  }

  const me = players.find((p) => p.user_id === userId);
  if (!me) notFound();

  const rating = getRatingForGender(game.tee_box, me.tee_gender);
  const state = revealState(game.score_visibility, game.status);
  const revealActive = state === 'reveal-active';
  const layout = resolveScorecardLayout(
    game,
    players,
    me,
    revealActive,
    columnFormatter,
  );
  const title = scorecardTitle(game.game_mode, game.mode_config);
  // Modified stableford (#281) bruker pro-tabellen for par-scorekortets
  // poeng-celler og footer-total; standard Stableford bruker standard-tabellen.
  const stablefordPointsFn: StablefordPointsFn =
    game.game_mode === 'modified_stableford'
      ? computeModifiedStablefordPoints
      : computeStablefordPoints;

  return (
    <AppShell showVersion={false}>
      <TopBar
        backHref={`/games/${id}`}
        backLabel={`Tilbake til ${game.name}`}
        kicker={title.title}
        userId={userId}
      />

      <div className="space-y-4">
        <Card className="px-4 py-3">
          <div className="text-xs text-muted">Du spiller fra</div>
          <div className="font-serif text-base text-text">
            {game.tee_box.name}
            <span className="ml-1.5 text-muted text-sm">
              ({genderLabelShort(me.tee_gender)})
            </span>
          </div>
          {rating && (
            <div className="text-xs text-muted tabular-nums">
              Slope {rating.slope} / CR {rating.courseRating.toFixed(1)}
            </div>
          )}
        </Card>

        <Suspense fallback={<ScorecardTableSkeleton />}>
          <ScorecardTable
            gameId={id}
            courseId={game.course_id}
            layout={layout}
            submittedAt={me.submitted_at}
            revealState={state}
            myTeeGender={me.tee_gender}
            pointsFn={stablefordPointsFn}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ScorecardTable({
  gameId,
  courseId,
  layout,
  submittedAt,
  revealState: state,
  myTeeGender,
  pointsFn,
}: {
  gameId: string;
  courseId: string;
  layout: ScorecardLayout;
  submittedAt: string | null;
  revealState: RevealState;
  myTeeGender: ScoringGender;
  pointsFn: StablefordPointsFn;
}) {
  const showHandicapTotal = state !== 'reveal-active';
  const showNetto = !shouldHideNetto(state);

  // Course holes via cookie-client (RLS-fine, public read). Scores via
  // admin client when multiple user_ids are involved — RLS may block
  // partners' scores under uvanlig flight-konfig. Authz beholdes call-site
  // via resolveLayout som kun returnerer userIds for me + lag-medlemmer
  // (eller motstander i matchplay) basert på game_players-radene.
  const { supabase } = await getScorecardContext();
  const adminSupabase = getAdminClient();

  const [holesRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<HoleRow[]>(),
    adminSupabase
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .in('user_id', layout.scoreUserIds)
      .returns<ScoreRow[]>(),
  ]);

  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const scoresByUserHole = new Map<string, number | null>();
  for (const s of scoresRes.data ?? []) {
    scoresByUserHole.set(`${s.user_id}#${s.hole_number}`, s.strokes);
  }

  const holes = holesRes.data ?? [];

  const continueHref = `/games/${gameId}/holes/${nextHole(
    holes,
    scoresByUserHole,
    layout.primaryUserId,
  )}`;

  return (
    <>
      {layout.variant === 'a' ? (
        <LayoutATable
          holes={holes}
          scoresByUserHole={scoresByUserHole}
          primaryUserId={layout.primaryUserId}
          primaryHandicap={layout.primaryHandicap}
          showNetto={showNetto}
          showHandicapTotal={showHandicapTotal}
          myTeeGender={myTeeGender}
        />
      ) : (
        <LayoutBTable
          holes={holes}
          scoresByUserHole={scoresByUserHole}
          columns={layout.columns}
          isStableford={layout.isStableford}
          isMatchplay={layout.isMatchplay}
          isFourball={layout.isFourball}
          meTeamNumber={layout.meTeamNumber}
          showNetto={showNetto}
          myTeeGender={myTeeGender}
          pointsFn={pointsFn}
        />
      )}

      {submittedAt ? (
        <LinkButton href={`/games/${gameId}`} full variant="secondary">
          Tilbake til spillet →
        </LinkButton>
      ) : (
        <>
          <LinkButton href={continueHref} full>
            Tilbake til hull {extractHoleFromHref(continueHref)} →
          </LinkButton>

          <div className="pt-2">
            <SmartLink
              href={`/games/${gameId}`}
              className="block text-center text-sm text-muted hover:text-text transition-colors"
            >
              Til spilloversikt
            </SmartLink>
          </div>
        </>
      )}
    </>
  );
}

function nextHole(
  holes: HoleRow[],
  scoresByUserHole: Map<string, number | null>,
  userId: string,
): number {
  const playedHoles = holes
    .filter((h) => scoresByUserHole.get(`${userId}#${h.hole_number}`) != null)
    .map((h) => h.hole_number);
  const lastWithScore = playedHoles.length ? Math.max(...playedHoles) : 1;
  return Math.min(18, lastWithScore);
}

function extractHoleFromHref(href: string): number {
  const match = href.match(/\/holes\/(\d+)/);
  return match ? Number(match[1]) : 1;
}

// ─── Layout A ─────────────────────────────────────────────────────────

function LayoutATable({
  holes,
  scoresByUserHole,
  primaryUserId,
  primaryHandicap,
  showNetto,
  showHandicapTotal,
  myTeeGender,
}: {
  holes: HoleRow[];
  scoresByUserHole: Map<string, number | null>;
  primaryUserId: string;
  primaryHandicap: number;
  showNetto: boolean;
  showHandicapTotal: boolean;
  myTeeGender: ScoringGender;
}) {
  const rows = holes.map((h) => {
    const strokes = scoresByUserHole.get(`${primaryUserId}#${h.hole_number}`) ?? null;
    const extra = strokesForHole(primaryHandicap, h.stroke_index);
    const parByGender: HoleParByGender = {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    };
    return {
      ...h,
      par: parForPlayer(parByGender, myTeeGender),
      parByGender,
      strokes,
      extra,
    };
  });

  const playedHoles = rows.filter((r) => r.strokes != null);
  const totalBrutto = playedHoles.reduce(
    (sum, r) => sum + (r.strokes ?? 0),
    0,
  );
  const totalExtraSlag = playedHoles.reduce((sum, r) => sum + r.extra, 0);
  const totalNetto = playedHoles.reduce(
    (sum, r) => sum + ((r.strokes ?? 0) - r.extra),
    0,
  );

  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left bg-bg/40">
            <th className="px-3 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              #
            </th>
            <th className="px-3 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              Par
            </th>
            <th className="px-3 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              SI
            </th>
            <th className="px-3 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              Slag
            </th>
            {showNetto && (
              <th className="px-3 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                Netto
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.hole_number} className="border-t border-border">
              <td className="score-num px-3 py-2.5 text-text">
                {r.hole_number}
              </td>
              <td className="score-num px-3 py-2.5 text-right text-muted">
                {r.par}
                <ParAsideInline
                  parByGender={r.parByGender}
                  playerGender={myTeeGender}
                />
              </td>
              <td className="score-num px-3 py-2.5 text-right text-muted">
                {r.stroke_index}
              </td>
              <td className="score-num px-3 py-2.5 text-right text-text">
                <ScoreShape
                  shape={scoreShape(r.strokes, r.par)}
                  tone={scoreTone(r.strokes, r.par)}
                  size="sm"
                >
                  {r.strokes ?? '—'}
                </ScoreShape>
              </td>
              {showNetto && (
                <td className="score-num px-3 py-2.5 text-right text-text">
                  {r.strokes !== null ? (
                    <ScoreShape
                      shape={scoreShape(r.strokes - r.extra, r.par)}
                      tone={scoreTone(r.strokes - r.extra, r.par)}
                      size="sm"
                    >
                      {r.strokes - r.extra}
                    </ScoreShape>
                  ) : (
                    '—'
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-primary-soft">
            <td
              colSpan={4 + (showNetto ? 1 : 0)}
              className="px-3 py-3 text-sm text-muted"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span>
                  Spilte hull:{' '}
                  <span className="inline-num">
                    {playedHoles.length}/18
                  </span>
                </span>
                <span>
                  Brutto:{' '}
                  <span className="score-num text-text">{totalBrutto}</span>
                </span>
                {showHandicapTotal && (
                  <span>
                    Slag fått:{' '}
                    <span className="score-num text-text">
                      {totalExtraSlag}
                    </span>
                  </span>
                )}
                {showNetto && (
                  <span>
                    Netto:{' '}
                    <span className="score-num text-text">{totalNetto}</span>
                  </span>
                )}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ─── Layout B ─────────────────────────────────────────────────────────

interface LayoutBPlayerHole {
  strokes: number | null;
  extra: number;
  netto: number | null;
  stablefordPoints: number | null;
}

interface LayoutBHoleRow extends HoleRow {
  par: number;
  parByGender: HoleParByGender;
  perPlayer: LayoutBPlayerHole[];
  /** Team-best netto (laveste netto blant spillerne — for best-ball-footer). */
  bestNetto: number | null;
  /** Team-poeng (MAX av spillernes stableford-poeng — for par-stableford-footer). */
  teamPoints: number;
  /** Matchplay hull-resultat fra me's perspektiv. */
  matchplayResult: 'won' | 'lost' | 'tied' | 'unplayed';
}

function LayoutBTable({
  holes,
  scoresByUserHole,
  columns,
  isStableford,
  isMatchplay,
  isFourball,
  meTeamNumber,
  showNetto,
  myTeeGender,
  pointsFn,
}: {
  holes: HoleRow[];
  scoresByUserHole: Map<string, number | null>;
  columns: ScorecardColumnPlayer[];
  isStableford: boolean;
  isMatchplay: boolean;
  isFourball: boolean;
  meTeamNumber: number | null;
  showNetto: boolean;
  myTeeGender: ScoringGender;
  pointsFn: StablefordPointsFn;
}) {
  const rows: LayoutBHoleRow[] = holes.map((h) => {
    const parByGender: HoleParByGender = {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    };
    const myPar = parForPlayer(parByGender, myTeeGender);
    const perPlayer: LayoutBPlayerHole[] = columns.map((c) => {
      const strokes =
        scoresByUserHole.get(`${c.userId}#${h.hole_number}`) ?? null;
      const extra = strokesForHole(c.courseHandicap, h.stroke_index);
      const netto = strokes !== null ? strokes - extra : null;
      // Stableford-poeng for cellen baseres på spillerens-egen par. Per
      // d.d. mangler LayoutB per-spiller-tee_gender (columns har bare
      // courseHandicap), så vi bruker seerens (me's) par her. Konsekvens:
      // for blandet-kjønn-lag på et hull med per-kjønn-overstyring vil
      // partners stableford-poeng-cell være regnet med me's par. Akseptabel
      // begrensning for v1 — kjernen i #240 er at me's egen scoring blir
      // korrekt (det er det de fleste blir påvirket av), og at avvikene blir
      // synliggjort via asterisk-en. Full per-spiller-par-cell krever utvidet
      // ScorecardColumnPlayer + ny scorecardLayout-test-flytting.
      const stablefordPoints =
        isStableford && netto !== null
          ? pointsFn({ par: myPar, netStrokes: netto })
          : null;
      return { strokes, extra, netto, stablefordPoints };
    });

    const playedNettos = perPlayer
      .map((p) => p.netto)
      .filter((n): n is number => n !== null);
    const bestNetto = playedNettos.length ? Math.min(...playedNettos) : null;
    const teamPoints = perPlayer.reduce(
      (max, p) => Math.max(max, p.stablefordPoints ?? 0),
      0,
    );

    let matchplayResult: LayoutBHoleRow['matchplayResult'] = 'unplayed';
    if (isFourball && perPlayer.length === 4 && meTeamNumber != null) {
      // Fourball-matchplay: 2v2. Lag-best netto per side, så sammenligning.
      const meSideNets: number[] = [];
      const oppSideNets: number[] = [];
      columns.forEach((c, idx) => {
        const n = perPlayer[idx].netto;
        if (n === null) return;
        if (c.teamNumber === meTeamNumber) meSideNets.push(n);
        else oppSideNets.push(n);
      });
      const meBest = meSideNets.length ? Math.min(...meSideNets) : null;
      const oppBest = oppSideNets.length ? Math.min(...oppSideNets) : null;
      if (meBest !== null && oppBest !== null) {
        matchplayResult =
          meBest < oppBest ? 'won' : meBest > oppBest ? 'lost' : 'tied';
      }
    } else if (isMatchplay && perPlayer.length === 2) {
      const meNet = perPlayer[0].netto;
      const oppNet = perPlayer[1].netto;
      if (meNet !== null && oppNet !== null) {
        matchplayResult =
          meNet < oppNet ? 'won' : meNet > oppNet ? 'lost' : 'tied';
      }
    }

    return {
      ...h,
      par: myPar,
      parByGender,
      perPlayer,
      bestNetto,
      teamPoints,
      matchplayResult,
    };
  });

  const totals = computeLayoutBTotals(
    holes.map((h) => ({
      hole_number: h.hole_number,
      par: h.par_mens,
      stroke_index: h.stroke_index,
    })),
    scoresByUserHole,
    columns,
    { isStableford, isMatchplay, isFourball, meTeamNumber, pointsFn },
  );
  const { perPlayer: playerTotals, teamTotalNetto, teamTotalPoints, playedTeamHoles, matchStatus } =
    totals;

  const secondaryLabel = isStableford ? 'P' : 'N';

  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left bg-bg/40">
            <th className="px-2.5 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              #
            </th>
            <th className="px-2 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
              Par
            </th>
            {columns.map((c) => (
              <th
                key={c.userId}
                className="px-2 py-2.5 text-right text-[11px] font-medium uppercase tracking-[0.10em] text-muted"
              >
                <span className="inline-flex items-baseline gap-1 justify-end">
                  <span className="font-serif text-[13px] text-text">
                    {c.initial}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.hole_number} className="border-t border-border">
              <td className="score-num px-2.5 py-2 text-text">
                {r.hole_number}
              </td>
              <td className="score-num px-2 py-2 text-right text-muted">
                {r.par}
                <ParAsideInline
                  parByGender={r.parByGender}
                  playerGender={myTeeGender}
                />
              </td>
              {r.perPlayer.map((cell, idx) => (
                <td
                  key={columns[idx].userId}
                  className="px-2 py-2 text-right"
                >
                  {cell.strokes !== null ? (
                    <div className="inline-flex flex-col items-end leading-tight">
                      <ScoreShape
                        shape={scoreShape(cell.strokes, r.par)}
                        tone={scoreTone(cell.strokes, r.par)}
                        size="sm"
                      >
                        {cell.strokes}
                      </ScoreShape>
                      {showNetto && (
                        <span className="score-num text-[10.5px] text-muted mt-0.5">
                          {isStableford
                            ? (cell.stablefordPoints ?? 0)
                            : (cell.netto ?? '—')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-primary-soft">
            <td
              colSpan={2 + columns.length}
              className="px-3 py-3 text-xs text-muted"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {columns.map((c, idx) => {
                    const t = playerTotals[idx];
                    return (
                      <span key={c.userId}>
                        {c.isCurrentUser ? 'Du' : c.displayName}:{' '}
                        <span className="score-num text-text">{t.brutto}</span>
                        {showNetto && (
                          <>
                            {' / '}
                            <span className="score-num text-text">
                              {isStableford ? t.points : t.netto}
                              <span className="text-muted ml-0.5 text-[10.5px]">
                                {secondaryLabel}
                              </span>
                            </span>
                          </>
                        )}
                      </span>
                    );
                  })}
                </div>
                {showNetto && !isMatchplay && (
                  <div className="text-text">
                    {isStableford ? 'Lagets poeng' : 'Lag-best (netto)'}:{' '}
                    <span className="score-num">
                      {isStableford ? teamTotalPoints : teamTotalNetto}
                    </span>
                    <span className="text-muted ml-2">
                      ({playedTeamHoles}/18 hull)
                    </span>
                  </div>
                )}
                {isMatchplay && matchStatus && (
                  <div className="text-text font-medium">{matchStatus}</div>
                )}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/**
 * Liten avvik-indikator vist etter par-tallet i scorekortets par-kolonne.
 * Vises bare når `parByGender` har avvik mellom kjønn. Title-attributtet
 * gir tooltip på desktop og long-press på iOS. #240.
 */
function ParAsideInline({
  parByGender,
  playerGender,
}: {
  parByGender: HoleParByGender;
  playerGender: ScoringGender;
}) {
  if (!hasParDifference(parByGender)) return null;
  const tooltip = `Dette hullet har annerledes par for andre kjønn. ${formatOtherGendersPar(parByGender, playerGender)}.`;
  return (
    <sup
      data-testid="par-aside-marker"
      title={tooltip}
      aria-label={tooltip}
      className="ml-0.5 cursor-help text-[0.65em] font-semibold text-muted"
    >
      *
    </sup>
  );
}

function ScorecardTableSkeleton() {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex gap-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-8 ml-auto" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-10" />
      </div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="px-4 py-2.5 border-t border-border flex gap-2"
          style={{
            borderTop: i === 0 ? 'none' : undefined,
          }}
        >
          <Skeleton className="h-3.5 w-6" delay={i * 60} />
          <Skeleton className="h-3.5 w-6 ml-auto" delay={i * 60 + 20} />
          <Skeleton className="h-3.5 w-6" delay={i * 60 + 40} />
          <Skeleton className="h-3.5 w-8" delay={i * 60 + 60} />
          <Skeleton className="h-3.5 w-8" delay={i * 60 + 80} />
        </div>
      ))}
    </Card>
  );
}
