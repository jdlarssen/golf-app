import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { COURSE_HOLES_SELECT } from '@/lib/supabase/queryFragments';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { parForPlayer, type HoleParByGender } from '@/lib/games/parDisplay';
import { PutterForm, type PutterHoleRow } from './PutterForm';

type Params = Promise<{ id: string }>;

type HoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
};

type ScoreRow = {
  hole_number: number;
  strokes: number | null;
  putts: number | null;
};

/**
 * Post-round putt back-fill surface (#1290 del B). Reachable only for a FINISHED
 * game the viewer played (non-withdrawn): active games still take putts through
 * the live hole pages. Lists every played hole with its par + strokes as a
 * memory anchor, and a chip row to fill in forgotten putts. Writing goes through
 * the `backfillPutts` server action, gated in the DB by migration 0148.
 */
export default async function PutterPage({ params }: { params: Params }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations('game.putter');

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect({ href: '/login', locale });

  const result = await getGameWithPlayers(id);
  if (!result) notFound();
  const { game, players } = result;

  const me = players.find((p) => p.user_id === userId);
  if (!me) notFound();

  // Active games use the live hole pages; withdrawn players have no scorecard
  // to back-fill. Both bounce to the leaderboard/game-home like the scorecard.
  if (game.status !== 'finished') {
    redirect({ href: `/games/${id}/leaderboard` as string, locale });
  }
  if (me.withdrawn_at) {
    redirect({ href: `/games/${id}` as string, locale });
  }

  const supabase = await getServerClient();
  const [holesRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<HoleRow[]>(),
    supabase
      .from('scores')
      .select('hole_number, strokes, putts')
      .eq('game_id', id)
      .eq('user_id', userId as string)
      .returns<ScoreRow[]>(),
  ]);

  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const scoreByHole = new Map<number, ScoreRow>();
  for (const s of scoresRes.data ?? []) scoreByHole.set(s.hole_number, s);

  // Only played holes (a scores row with strokes) can carry a putt back-fill —
  // there is no row to update for a hole that was never scored.
  const rows: PutterHoleRow[] = (holesRes.data ?? [])
    .map((h) => {
      const s = scoreByHole.get(h.hole_number);
      if (!s || s.strokes == null) return null;
      const parByGender: HoleParByGender = {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      };
      return {
        holeNumber: h.hole_number,
        par: parForPlayer(parByGender, me.tee_gender),
        strokes: s.strokes,
        putts: s.putts,
      };
    })
    .filter((r): r is PutterHoleRow => r !== null);

  const missingCount = rows.filter((r) => r.putts == null).length;

  return (
    <AppShell showVersion={false}>
      <TopBar backHref={`/games/${id}/leaderboard`} kicker={t('kicker')} />
      <div className="space-y-4">
        <Card>
          <p className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {t('title')}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {missingCount > 0 ? t('intro', { count: missingCount }) : t('introComplete')}
          </p>
        </Card>

        {rows.length === 0 ? (
          <Card>
            <p className="font-sans text-sm text-muted">{t('noHoles')}</p>
          </Card>
        ) : (
          <PutterForm gameId={id} rows={rows} />
        )}
      </div>
    </AppShell>
  );
}
