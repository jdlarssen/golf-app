import { notFound, redirect } from 'next/navigation';
import { BackLink } from '@/components/ui/BackLink';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { approveScorecard, rejectScorecard } from './actions';
import { ReviewActions } from './ReviewActions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

const STATUS_BANNERS: Record<string, string> = {
  approved: '✓ Scorekort godkjent.',
  rejected: 'Scorekortet ble avvist. Spilleren blir varslet.',
};

const ERROR_MESSAGES: Record<string, string> = {
  db: 'Klarte ikke å lagre endringen. Prøv igjen.',
  not_active: 'Spillet er ikke aktivt — godkjenning kreves ikke nå.',
  bad_request: 'Ugyldig forespørsel.',
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
  require_peer_approval: boolean;
};

type MyPlayerRow = {
  user_id: string;
  flight_number: number;
};

type FlightPlayerRow = {
  user_id: string;
  flight_number: number;
  submitted_at: string | null;
  approved_at: string | null;
  users: { name: string; nickname: string | null } | null;
};

type HoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

export default async function ApprovePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const statusBanner = STATUS_BANNERS[first(sp.status) ?? ''] ?? undefined;
  const errorMessage = ERROR_MESSAGES[first(sp.error) ?? ''] ?? undefined;

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');
  const supabase = await getServerClient();

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, course_id, require_peer_approval')
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  if (game.status !== 'active') {
    redirect(`/games/${id}`);
  }

  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select('user_id, flight_number')
    .eq('game_id', id)
    .eq('user_id', userId)
    .maybeSingle<MyPlayerRow>();
  if (meError) throw meError;
  if (!me) notFound();

  // Flight-mates other than me whose card is awaiting approval.
  const { data: mates, error: matesError } = await supabase
    .from('game_players')
    .select(
      'user_id, flight_number, submitted_at, approved_at, users!game_players_user_id_fkey(name, nickname)',
    )
    .eq('game_id', id)
    .eq('flight_number', me.flight_number)
    .returns<FlightPlayerRow[]>();
  if (matesError) throw matesError;

  const pending = (mates ?? []).filter(
    (m) =>
      m.user_id !== userId &&
      m.submitted_at != null &&
      m.approved_at == null,
  );

  // For each pending mate, fetch their 18 scores so we can show the table
  // inline. With at most 3 flight-mates and 18 rows each this is tiny.
  const pendingIds = pending.map((p) => p.user_id);
  const [holesResult, scoresResult] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<HoleRow[]>(),
    pendingIds.length
      ? supabase
          .from('scores')
          .select('user_id, hole_number, strokes')
          .eq('game_id', id)
          .in('user_id', pendingIds)
          .returns<ScoreRow[]>()
      : Promise.resolve({ data: [] as ScoreRow[], error: null }),
  ]);
  if (holesResult.error) throw holesResult.error;
  if (scoresResult.error) throw scoresResult.error;

  const holes = holesResult.data ?? [];
  const scoresByUserHole = new Map<string, Map<number, number | null>>();
  for (const s of scoresResult.data ?? []) {
    let inner = scoresByUserHole.get(s.user_id);
    if (!inner) {
      inner = new Map();
      scoresByUserHole.set(s.user_id, inner);
    }
    inner.set(s.hole_number, s.strokes);
  }

  function displayName(p: FlightPlayerRow): string {
    if (!p.users) return '(ukjent spiller)';
    return p.users.nickname
      ? `${p.users.name} «${p.users.nickname}»`
      : p.users.name;
  }

  return (
    <AppShell>
      <PageHeader
        title="Godkjenn scorekort"
        action={
          <BackLink href={`/games/${id}`}>← {game.name}</BackLink>
        }
      />

      {statusBanner && (
        <div className="mb-4">
          <Banner tone="success">{statusBanner}</Banner>
        </div>
      )}
      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-4">
        {pending.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Ingen scorekort venter på godkjenning i flighten din akkurat nå.
            </p>
          </Card>
        ) : (
          pending.map((p) => {
            const inner = scoresByUserHole.get(p.user_id);
            const played = holes
              .map((h) => inner?.get(h.hole_number) ?? null)
              .filter((v): v is number => v != null);
            const total = played.reduce((s, n) => s + n, 0);
            const approveAction = approveScorecard.bind(null, id, p.user_id);
            const rejectAction = rejectScorecard.bind(null, id);
            const name = displayName(p);

            return (
              <Card key={p.user_id} className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-base font-medium text-text truncate">
                      {name}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      Brutto: <span className="score-num">{total}</span> ·
                      Spilte hull:{' '}
                      <span className="score-num">{played.length}</span>
                      <span className="inline-num">/18</span>
                    </p>
                  </div>
                </div>

                <details className="px-4 py-3 border-b border-border">
                  <summary className="text-sm text-muted cursor-pointer hover:text-text transition-colors">
                    Vis 18-hulls-kort
                  </summary>
                  <div className="overflow-x-auto mt-3 -mx-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                            Hull
                          </th>
                          <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                            Par
                          </th>
                          <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                            SI
                          </th>
                          <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                            Slag
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {holes.map((h) => {
                          const s = inner?.get(h.hole_number) ?? null;
                          return (
                            <tr
                              key={h.hole_number}
                              className="border-t border-border"
                            >
                              <td className="score-num px-2 py-1.5 text-text">
                                {h.hole_number}
                              </td>
                              <td className="score-num px-2 py-1.5 text-right text-muted">
                                {h.par}
                              </td>
                              <td className="score-num px-2 py-1.5 text-right text-muted">
                                {h.stroke_index}
                              </td>
                              <td className="score-num px-2 py-1.5 text-right text-text">
                                {s ?? '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>

                <div className="px-4 py-3">
                  <ReviewActions
                    playerUserId={p.user_id}
                    playerName={name}
                    approveAction={approveAction}
                    rejectAction={rejectAction}
                  />
                </div>
              </Card>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
