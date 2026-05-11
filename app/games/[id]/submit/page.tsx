import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { submitScorecard } from './actions';
import { SubmitForm } from './SubmitForm';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
}>;

type GameStatus = 'draft' | 'active' | 'finished';

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

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, tee_box_id, courses(name), tee_boxes(name, par_total)',
    )
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  // Only active games can be submitted to. Anything else: bounce home.
  if (game.status !== 'active') {
    redirect(`/games/${id}`);
  }

  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, submitted_at',
    )
    .eq('game_id', id)
    .eq('user_id', user.id)
    .maybeSingle<MyPlayerRow>();
  if (meError) throw meError;
  if (!me) notFound();

  // Already submitted: nothing more to do here.
  if (me.submitted_at) {
    redirect(`/games/${id}`);
  }

  const { data: holes, error: holesError } = await supabase
    .from('course_holes')
    .select('hole_number, par, stroke_index')
    .eq('course_id', game.course_id)
    .order('hole_number', { ascending: true })
    .returns<HoleRow[]>();
  if (holesError) throw holesError;

  const { data: scores, error: scoresError } = await supabase
    .from('scores')
    .select('hole_number, strokes, entered_by')
    .eq('game_id', id)
    .eq('user_id', user.id)
    .returns<ScoreRow[]>();
  if (scoresError) throw scoresError;

  const scoreByHole = new Map<number, ScoreRow>();
  for (const s of scores ?? []) scoreByHole.set(s.hole_number, s);

  // Fetch the names of every distinct `entered_by` user that appears on the
  // scorecard. The list is small (typically just the player themselves and
  // maybe one flight-mate) so a single IN query is cheap.
  const enteredByIds = Array.from(
    new Set(
      (scores ?? [])
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
      .returns<{ id: string; name: string; nickname: string | null }[]>();
    for (const u of nameRows ?? []) {
      namesById.set(u.id, u.nickname ? `${u.name} «${u.nickname}»` : u.name);
    }
  }

  const rows = (holes ?? []).map((h) => {
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

  const submitAction = submitScorecard.bind(null, id);

  return (
    <AppShell>
      <PageHeader
        title="Gjennomgå før levering"
        action={
          <Link
            href={`/games/${id}`}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Tilbake
          </Link>
        }
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            {game.name}
          </h2>
          <p className="text-xs text-zinc-500">
            {game.courses?.name ?? '(ukjent bane)'}
            {game.tee_boxes
              ? ` · Tee: ${game.tee_boxes.name} · Par ${game.tee_boxes.par_total}`
              : ''}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Lag {me.team_number} · Flight {me.flight_number} · CH{' '}
            {me.course_handicap ?? '—'}
          </p>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ditt kort
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-3 py-2 font-medium">Hull</th>
                  <th className="px-3 py-2 font-medium text-right">Par</th>
                  <th className="px-3 py-2 font-medium text-right">SI</th>
                  <th className="px-3 py-2 font-medium text-right">Slag</th>
                  <th className="px-3 py-2 font-medium">Ført av</th>
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
                    <td className="px-3 py-2 text-zinc-500 truncate max-w-[10rem]">
                      {r.enteredByName ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Brutto totalt:{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {totalBrutto}
            </span>
            <span className="text-zinc-500"> · </span>
            Spilte hull:{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {playedHoles.length}/18
            </span>
          </p>
        </Card>

        {missingHoles > 0 && (
          <Banner tone="info">
            {missingHoles} hull mangler. Hvis du leverer nå, går disse som
            ikke spilt.
          </Banner>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/games/${id}/holes/1`}
            className="min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ← Rediger
          </Link>
          <SubmitForm
            submitAction={submitAction}
            missingHoles={missingHoles}
          />
        </div>
      </div>
    </AppShell>
  );
}
