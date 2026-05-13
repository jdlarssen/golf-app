import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import type { GameStatus } from '@/lib/games/status';

type Params = Promise<{ id: string }>;

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
};

type MyPlayerRow = {
  user_id: string;
  course_handicap: number | null;
  submitted_at: string | null;
};

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
  const { supabase, userId } = await getScorecardContext();
  if (!userId) redirect('/login');

  // Gating: game + my player row in parallel.
  const [gameRes, meRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, name, status, course_id')
      .eq('id', id)
      .single<GameRow>(),
    supabase
      .from('game_players')
      .select('user_id, course_handicap, submitted_at')
      .eq('game_id', id)
      .eq('user_id', userId)
      .maybeSingle<MyPlayerRow>(),
  ]);

  if (gameRes.error || !gameRes.data) notFound();
  const game = gameRes.data;

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

  if (meRes.error) throw meRes.error;
  const me = meRes.data;
  if (!me) notFound();

  return (
    <AppShell showVersion={false}>
      <TopBar backHref={`/games/${id}`} backLabel={`Tilbake til ${game.name}`} />
      <PageHeader title="Mitt scorekort" />

      <div className="space-y-4">
        <Suspense fallback={<ScorecardTableSkeleton />}>
          <ScorecardTable
            gameId={id}
            courseId={game.course_id}
            currentUserId={userId}
            courseHandicap={me.course_handicap ?? 0}
            submittedAt={me.submitted_at}
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
}: {
  gameId: string;
  courseId: string;
  currentUserId: string;
  courseHandicap: number;
  submittedAt: string | null;
}) {
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
              <th className="px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                Hull
              </th>
              <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                Par
              </th>
              <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                SI
              </th>
              <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                Slag
              </th>
              <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                +slag
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.hole_number}
                className="border-t border-border"
              >
                <td className="score-num px-4 py-2.5 text-text">
                  {r.hole_number}
                </td>
                <td className="score-num px-4 py-2.5 text-right text-muted">
                  {r.par}
                </td>
                <td className="score-num px-4 py-2.5 text-right text-muted">
                  {r.stroke_index}
                </td>
                <td className="score-num px-4 py-2.5 text-right text-text">
                  {r.strokes ?? '—'}
                </td>
                <td className="score-num px-4 py-2.5 text-right text-muted">
                  {r.extra > 0 ? `+${r.extra}` : r.extra < 0 ? r.extra : '0'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-primary-soft">
              <td
                colSpan={5}
                className="px-4 py-3 text-sm text-muted"
              >
                Spilte hull:{' '}
                <span className="inline-num">
                  {playedHoles.length}/18
                </span>
                {' · '}Brutto totalt:{' '}
                <span className="score-num text-text">
                  {totalBrutto}
                </span>
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
