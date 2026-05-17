import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
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
import {
  revealState,
  shouldHideNetto,
  type RevealState,
} from '@/lib/games/visibility';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';

type Params = Promise<{ id: string }>;

function genderLabelShort(g: 'mens' | 'ladies' | 'juniors'): string {
  return g === 'mens' ? 'herre' : g === 'ladies' ? 'dame' : 'junior';
}

type HoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type ScoreRow = {
  hole_number: number;
  strokes: number | null;
};

const getScorecardContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

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
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

  const me = players.find((p) => p.user_id === userId);
  if (!me) notFound();

  // Per-player override falls back to the game's default tee.
  const playerTee = me.tee_box ?? game.tee_box;

  return (
    <AppShell showVersion={false}>
      <TopBar
        backHref={`/games/${id}`}
        backLabel={`Tilbake til ${game.name}`}
        kicker="Scorekort"
      />

      <div className="space-y-4">
        <Card className="px-4 py-3">
          <div className="text-xs text-muted">Du spiller fra</div>
          <div className="font-serif text-base text-text">
            {playerTee.name}
            <span className="ml-1.5 text-muted text-sm">
              ({genderLabelShort(playerTee.gender)})
            </span>
          </div>
          <div className="text-xs text-muted tabular-nums">
            Slope {playerTee.slope} / CR{' '}
            {Number(playerTee.course_rating).toFixed(1)}
          </div>
        </Card>

        <Suspense fallback={<ScorecardTableSkeleton />}>
          <ScorecardTable
            gameId={id}
            courseId={game.course_id}
            currentUserId={userId}
            courseHandicap={me.course_handicap ?? 0}
            submittedAt={me.submitted_at}
            revealState={revealState(game.score_visibility, game.status)}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ScorecardTable({
  gameId,
  courseId,
  currentUserId,
  courseHandicap,
  submittedAt,
  revealState: state,
}: {
  gameId: string;
  courseId: string;
  currentUserId: string;
  courseHandicap: number;
  submittedAt: string | null;
  revealState: RevealState;
}) {
  // Reveal matrix:
  //   live-always       → Netto column + slag-fått total in footer
  //   reveal-active     → no handicap info at all (no Netto column, slag-fått hidden)
  //   reveal-finished   → Netto column + slag-fått total in footer
  // The Netto column only hides in reveal-active so the climax stays secret;
  // every other state surfaces it (shouldHideNetto encodes exactly that).
  const showHandicapTotal = state !== 'reveal-active';
  const showNetto = !shouldHideNetto(state);
  const { supabase } = await getScorecardContext();

  const [holesRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<HoleRow[]>(),
    supabase
      .from('scores')
      .select('hole_number, strokes')
      .eq('game_id', gameId)
      .eq('user_id', currentUserId)
      .returns<ScoreRow[]>(),
  ]);

  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const scoreByHole = new Map<number, number | null>();
  for (const s of scoresRes.data ?? []) scoreByHole.set(s.hole_number, s.strokes);

  const rows = (holesRes.data ?? []).map((h) => {
    const strokes = scoreByHole.get(h.hole_number) ?? null;
    const extra = strokesForHole(courseHandicap, h.stroke_index);
    return { ...h, strokes, extra };
  });

  const playedHoles = rows.filter((r) => r.strokes != null);
  const totalBrutto = playedHoles.reduce(
    (sum, r) => sum + (r.strokes ?? 0),
    0,
  );
  // Sum of handicap-allocated extra strokes across played holes — surfaced
  // in the footer instead of a per-row +slag column.
  const totalExtraSlag = playedHoles.reduce((sum, r) => sum + r.extra, 0);
  // Netto total over played holes — surfaced in the footer whenever the Netto
  // column is shown (live-always + reveal-finished). Computed unconditionally
  // so the JSX stays branch-light.
  const totalNetto = playedHoles.reduce(
    (sum, r) => sum + ((r.strokes ?? 0) - r.extra),
    0,
  );

  // Last hole with a score, or 1 if none.
  const lastWithScore = playedHoles.length
    ? Math.max(...playedHoles.map((r) => r.hole_number))
    : 1;
  const continueHole = Math.min(18, lastWithScore);

  return (
    <>
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
              <tr
                key={r.hole_number}
                className="border-t border-border"
              >
                <td className="score-num px-3 py-2.5 text-text">
                  {r.hole_number}
                </td>
                <td className="score-num px-3 py-2.5 text-right text-muted">
                  {r.par}
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
                // Base 4 cols (#, Par, SI, Slag) + optional Netto.
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

      {submittedAt ? (
        <LinkButton href={`/games/${gameId}`} full>
          Tilbake til spillet →
        </LinkButton>
      ) : (
        <>
          <LinkButton href={`/games/${gameId}/holes/${continueHole}`} full>
            Tilbake til hull {continueHole} →
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
