import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { submitScorecard } from './actions';
import { SubmitForm } from './SubmitForm';
import type { GameStatus } from '@/lib/games/status';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  db: 'Klarte ikke å lagre leveringen. Prøv igjen.',
  not_active: 'Spillet er ikke aktivt — du kan ikke levere nå.',
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
  courses: { name: string } | null;
  tee_boxes: { name: string; par_total: number } | null;
};

type MyPlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
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
  entered_by: string | null;
};

const getSubmitContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = ERROR_MESSAGES[first(sp.error) ?? ''] ?? undefined;

  const { supabase, userId } = await getSubmitContext();
  if (!userId) redirect('/login');

  // Gating: game + my player row in parallel.
  const [gameRes, meRes] = await Promise.all([
    supabase
      .from('games')
      .select(
        'id, name, status, course_id, tee_box_id, courses(name), tee_boxes(name, par_total)',
      )
      .eq('id', id)
      .single<GameRow>(),
    supabase
      .from('game_players')
      .select(
        'user_id, team_number, flight_number, course_handicap, submitted_at',
      )
      .eq('game_id', id)
      .eq('user_id', userId)
      .maybeSingle<MyPlayerRow>(),
  ]);

  if (gameRes.error || !gameRes.data) notFound();
  const game = gameRes.data;

  // Only active games can be submitted to. Anything else: bounce home.
  if (game.status !== 'active') {
    redirect(`/games/${id}`);
  }

  if (meRes.error) throw meRes.error;
  const me = meRes.data;
  if (!me) notFound();

  // Already submitted: nothing more to do here.
  if (me.submitted_at) {
    redirect(`/games/${id}`);
  }

  const submitAction = submitScorecard.bind(null, id);

  return (
    <AppShell showVersion={false}>
      <TopBar backHref={`/games/${id}`} kicker="Lever scorekort" />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <p className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {game.name}
          </p>
          <p className="text-xs text-muted mt-1.5">
            {game.courses?.name ?? '(ukjent bane)'}
            {game.tee_boxes
              ? ` · Tee: ${game.tee_boxes.name} · Par ${game.tee_boxes.par_total}`
              : ''}
          </p>
          <p className="text-xs text-muted mt-1">
            Lag <span className="score-num">{me.team_number}</span> · Flight{' '}
            <span className="score-num">{me.flight_number}</span> · CH{' '}
            <span className="score-num">{me.course_handicap ?? '—'}</span>
          </p>
        </Card>

        <Suspense fallback={<ReviewBodySkeleton />}>
          <ReviewBody
            gameId={id}
            courseId={game.course_id}
            currentUserId={userId}
            submitAction={submitAction}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function ReviewBody({
  gameId,
  courseId,
  currentUserId,
  submitAction,
}: {
  gameId: string;
  courseId: string;
  currentUserId: string;
  submitAction: () => void | Promise<void>;
}) {
  const { supabase } = await getSubmitContext();

  const [holesRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<HoleRow[]>(),
    supabase
      .from('scores')
      .select('hole_number, strokes, entered_by')
      .eq('game_id', gameId)
      .eq('user_id', currentUserId)
      .returns<ScoreRow[]>(),
  ]);

  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const scoreByHole = new Map<number, ScoreRow>();
  for (const s of scoresRes.data ?? []) scoreByHole.set(s.hole_number, s);

  // Fetch the names of every distinct `entered_by` user that appears on the
  // scorecard. The list is small (typically just the player themselves and
  // maybe one flight-mate) so a single IN query is cheap.
  const enteredByIds = Array.from(
    new Set(
      (scoresRes.data ?? [])
        .map((s) => s.entered_by)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const namesById = new Map<string, string>();
  if (enteredByIds.length > 0) {
    const { data: nameRows } = await supabase
      .from('users')
      .select('id, name, nickname')
      .in('id', enteredByIds)
      .returns<{ id: string; name: string | null; nickname: string | null }[]>();
    // Active-game invariant: publish-gate guarantees no pending players in roster,
    // so name is non-null in practice. Coalesce defensively.
    for (const u of nameRows ?? []) {
      const name = u.name ?? '(ukjent spiller)';
      namesById.set(u.id, u.nickname ? `${name} «${u.nickname}»` : name);
    }
  }

  const rows = (holesRes.data ?? []).map((h) => {
    const s = scoreByHole.get(h.hole_number);
    const strokes = s?.strokes ?? null;
    const enteredByName = s?.entered_by ? namesById.get(s.entered_by) : null;
    return { ...h, strokes, enteredByName };
  });

  const playedHoles = rows.filter((r) => r.strokes != null);
  const missingHoles = rows.length - playedHoles.length;
  const totalBrutto = playedHoles.reduce(
    (sum, r) => sum + (r.strokes ?? 0),
    0,
  );

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <Kicker tone="muted">DITT KORT</Kicker>
        </div>
        <div className="overflow-x-auto">
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
                <th className="px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                  Ført av
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
                  <td className="px-4 py-2.5 text-muted truncate max-w-[10rem]">
                    {r.enteredByName ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <p className="text-sm text-muted">
          Brutto totalt:{' '}
          <span className="score-num text-text">{totalBrutto}</span>
          {' · '}
          Spilte hull:{' '}
          <span className="score-num text-text">{playedHoles.length}</span>
          <span className="inline-num">/18</span>
        </p>
      </Card>

      {missingHoles > 0 && (
        <Banner tone="info">
          {missingHoles} hull mangler. Hvis du leverer nå, går disse som
          ikke spilt.
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3">
        <SmartLink
          href={`/games/${gameId}/holes/1`}
          className="inline-flex items-center justify-center min-h-[44px] rounded-full border border-border px-[18px] py-2.5 text-sm font-medium text-text hover:bg-primary-soft transition-colors"
        >
          ← Rediger
        </SmartLink>
        <SubmitForm
          submitAction={submitAction}
          missingHoles={missingHoles}
        />
      </div>
    </>
  );
}

function ReviewBodySkeleton() {
  return (
    <>
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <Skeleton className="h-2.5 w-20" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="px-4 py-2.5 border-t border-border flex gap-2"
            style={{ borderTop: i === 0 ? 'none' : undefined }}
          >
            <Skeleton className="h-3.5 w-6" delay={i * 60} />
            <Skeleton className="h-3.5 w-6 ml-auto" delay={i * 60 + 20} />
            <Skeleton className="h-3.5 w-6" delay={i * 60 + 40} />
            <Skeleton className="h-3.5 w-8" delay={i * 60 + 60} />
            <Skeleton className="h-3.5 w-20" delay={i * 60 + 80} />
          </div>
        ))}
      </Card>
      <Card>
        <Skeleton className="h-3 w-3/5" />
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-11 rounded-full" />
        <Skeleton className="h-11 rounded-full" delay={60} />
      </div>
    </>
  );
}
