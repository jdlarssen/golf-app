import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getServerClient } from '@/lib/supabase/server';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';

type Params = Promise<{ id: string }>;

function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}

export default async function PublicCupPage({ params }: { params: Params }) {
  const { id } = await params;
  const [userId, t] = await Promise.all([
    getProxyVerifiedUserId(),
    getTranslations('cup'),
  ]);
  const snapshot = await getCupSnapshot(id);
  if (!snapshot) notFound();

  const { tournament, leaderboard, roster } = snapshot;

  // #524: en klubb-scopet cup er kun synlig for klubbens medlemmer, deltakerne
  // og global admin. Snapshot-en bruker admin-client (RLS-bypass), så denne
  // gaten — ikke RLS — er det som skjuler klubb-cuper på den lenke-delbare siden.
  if (tournament.group_id) {
    let currentUserId = userId;
    if (!currentUserId) {
      const supabase = await getServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      currentUserId = user?.id ?? null;
    }
    const isParticipant =
      currentUserId !== null &&
      [...roster.team1, ...roster.team2].some((p) => p.userId === currentUserId);
    let allowed = isParticipant;
    if (!allowed && currentUserId) {
      const supabase = await getServerClient();
      const [{ data: membership }, { data: profile }] = await Promise.all([
        supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', tournament.group_id)
          .eq('user_id', currentUserId)
          .maybeSingle(),
        supabase
          .from('users')
          .select('is_admin')
          .eq('id', currentUserId)
          .maybeSingle(),
      ]);
      allowed = membership !== null || profile?.is_admin === true;
    }
    if (!allowed) notFound();
  }

  const winnerName =
    leaderboard.winner === 1
      ? tournament.team_1_name
      : leaderboard.winner === 2
        ? tournament.team_2_name
        : null;

  return (
    <AppShell>
      <TopBar backHref="/" back="history" kicker="Cup" />

      <header className="mb-6 text-center">
        <h1 className="font-serif text-3xl text-text leading-tight tracking-[-0.015em]">
          {tournament.name}
        </h1>
        {tournament.status === 'finished' && winnerName && (
          <p className="mt-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>
            {winnerName} vant
          </p>
        )}
        {tournament.status === 'finished' && !winnerName && (
          <p className="mt-2 text-sm text-muted">Uavgjort</p>
        )}
        {tournament.status !== 'finished' && (
          <p className="mt-2 text-sm text-muted">
            Først til {formatPoints(tournament.points_to_win)} point vinner
          </p>
        )}
      </header>

      {/* Lag-points stort + sentralt */}
      <section className="mb-8">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div
            className={
              leaderboard.winner === 1
                ? 'rounded-2xl p-5'
                : 'rounded-2xl border border-border bg-surface p-5'
            }
            style={
              leaderboard.winner === 1
                ? {
                    background:
                      'linear-gradient(180deg, rgba(201, 169, 97, 0.12), rgba(201, 169, 97, 0.04))',
                    borderColor: 'rgba(201, 169, 97, 0.45)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }
                : undefined
            }
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {tournament.team_1_name}
            </p>
            <p className="font-serif text-5xl tabular-nums text-primary mt-2">
              {formatPoints(leaderboard.team1Points)}
            </p>
          </div>
          <div
            className={
              leaderboard.winner === 2
                ? 'rounded-2xl p-5'
                : 'rounded-2xl border border-border bg-surface p-5'
            }
            style={
              leaderboard.winner === 2
                ? {
                    background:
                      'linear-gradient(180deg, rgba(201, 169, 97, 0.12), rgba(201, 169, 97, 0.04))',
                    borderColor: 'rgba(201, 169, 97, 0.45)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }
                : undefined
            }
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {tournament.team_2_name}
            </p>
            <p className="font-serif text-5xl tabular-nums text-primary mt-2">
              {formatPoints(leaderboard.team2Points)}
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-muted mt-3">
          {t('public.matchesSummary', {
            finished: leaderboard.finishedMatches,
            total: leaderboard.matches.length,
          })}
        </p>
      </section>

      {/* Matches-liste */}
      <section>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
          {t('manage.matchesHeading')}
        </h2>
        {leaderboard.matches.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              {t('public.noMatches')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {leaderboard.matches.map((m) => {
              const isFinished = m.status === 'finished';
              const isActive = m.status === 'active';
              const scoreLabel = isFinished
                ? `${formatPoints(m.pointsTeam1)}–${formatPoints(m.pointsTeam2)}`
                : isActive
                  ? 'Spilles'
                  : 'Utkast';
              return (
                <li key={m.gameId}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {m.matchLabel ?? 'Match'}
                        </p>
                        <p className="font-serif text-base text-text mt-1">
                          {m.team1PlayerName}{' '}
                          <span className="text-muted">mot</span>{' '}
                          {m.team2PlayerName}
                        </p>
                        {m.result && (
                          <p className="text-xs text-muted mt-1">
                            {m.result.winnerSide === 'tied'
                              ? 'Halvert (AS)'
                              : m.result.winnerSide === 1
                                ? `${m.result.formatted} til ${
                                    m.gameMode === 'fourball_matchplay' ||
                                    m.gameMode === 'foursomes_matchplay' ||
                                    m.gameMode === 'greensome_matchplay' ||
                                    m.gameMode === 'chapman_matchplay' ||
                                    m.gameMode === 'gruesome_matchplay'
                                      ? tournament.team_1_name
                                      : m.team1PlayerName
                                  }`
                                : `${m.result.formatted} til ${
                                    m.gameMode === 'fourball_matchplay' ||
                                    m.gameMode === 'foursomes_matchplay' ||
                                    m.gameMode === 'greensome_matchplay' ||
                                    m.gameMode === 'chapman_matchplay' ||
                                    m.gameMode === 'gruesome_matchplay'
                                      ? tournament.team_2_name
                                      : m.team2PlayerName
                                  }`}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-serif text-lg tabular-nums text-primary">
                          {scoreLabel}
                        </p>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
