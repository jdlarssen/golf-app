import { SmartLink } from '@/components/ui/SmartLink';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';

type Params = Promise<{ id: string }>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

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
  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');
  const supabase = await getServerClient();

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, course_id')
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select('user_id, course_handicap, submitted_at')
    .eq('game_id', id)
    .eq('user_id', userId)
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
    .eq('user_id', userId)
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
          <BackLink href={`/games/${id}`}>← {game.name}</BackLink>
        }
      />

      <div className="space-y-4">
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

        {me.submitted_at ? (
          <LinkButton href={`/games/${id}`} full>
            Tilbake til spillet →
          </LinkButton>
        ) : (
          <>
            <LinkButton href={`/games/${id}/holes/${continueHole}`} full>
              Tilbake til hull {continueHole} →
            </LinkButton>

            <div className="pt-2">
              <SmartLink
                href={`/games/${id}`}
                className="block text-center text-sm text-muted hover:text-text transition-colors"
              >
                Til spilloversikt
              </SmartLink>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
