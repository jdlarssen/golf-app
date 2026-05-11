import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';

type Params = Promise<{ id: string }>;

type GameStatus = 'draft' | 'active' | 'finished';

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

export default async function ScorecardPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, course_id')
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  if (game.status === 'draft') {
    redirect('/');
  }

  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select('user_id, course_handicap, submitted_at')
    .eq('game_id', id)
    .eq('user_id', user.id)
    .maybeSingle<MyPlayerRow>();
  if (meError) throw meError;
  if (!me) notFound();

  const { data: holes, error: holesError } = await supabase
    .from('course_holes')
    .select('hole_number, par, stroke_index')
    .eq('course_id', game.course_id)
    .order('hole_number', { ascending: true })
    .returns<HoleRow[]>();
  if (holesError) throw holesError;

  const { data: scores, error: scoresError } = await supabase
    .from('scores')
    .select('hole_number, strokes')
    .eq('game_id', id)
    .eq('user_id', user.id)
    .returns<ScoreRow[]>();
  if (scoresError) throw scoresError;

  const scoreByHole = new Map<number, number | null>();
  for (const s of scores ?? []) scoreByHole.set(s.hole_number, s.strokes);

  const ch = me.course_handicap ?? 0;
  const rows = (holes ?? []).map((h) => {
    const strokes = scoreByHole.get(h.hole_number) ?? null;
    const extra = strokesForHole(ch, h.stroke_index);
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
    <AppShell>
      <PageHeader
        title="Mitt scorekort"
        action={
          <Link
            href={`/games/${id}`}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← {game.name}
          </Link>
        }
      />

      <div className="space-y-4">
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-3 py-2 font-medium">Hull</th>
                <th className="px-3 py-2 font-medium text-right">Par</th>
                <th className="px-3 py-2 font-medium text-right">SI</th>
                <th className="px-3 py-2 font-medium text-right">Slag</th>
                <th className="px-3 py-2 font-medium text-right">+slag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.hole_number}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100 font-medium">
                    {r.hole_number}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                    {r.par}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                    {r.stroke_index}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-100">
                    {r.strokes ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                    {r.extra > 0 ? `+${r.extra}` : r.extra < 0 ? r.extra : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                <td
                  colSpan={5}
                  className="px-3 py-2.5 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  Spilte hull: {playedHoles.length}/18 · Brutto totalt:{' '}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {totalBrutto}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>

        {me.submitted_at ? (
          <Link href={`/games/${id}`} className="block">
            <div className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
              Tilbake til spillet →
            </div>
          </Link>
        ) : (
          <>
            <Link href={`/games/${id}/holes/${continueHole}`} className="block">
              <div className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
                Tilbake til hull {continueHole} →
              </div>
            </Link>

            <div className="pt-2">
              <Link
                href={`/games/${id}`}
                className="block text-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Til spilloversikt
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
