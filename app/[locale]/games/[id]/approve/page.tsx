import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { useTranslations } from 'next-intl';
import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { TopBar } from '@/components/ui/TopBar';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { approveScorecard, rejectScorecard } from './actions';
import { ReviewActions } from './ReviewActions';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import {
  getGameWithPlayers,
  type PlayerForHole,
} from '@/lib/games/getGameWithPlayers';
import { markNotificationsRead } from '@/lib/notifications/markRead';
import {
  hasParDifference,
  parForPlayer,
  type HoleParByGender,
} from '@/lib/games/parDisplay';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import type { AppLocale } from '@/i18n/routing';
import { localizeGameName } from '@/lib/games/autoGameName';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

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

const getApproveContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function ApprovePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tApprove = await getTranslations('game.approve');
  const statusKey = first(sp.status);
  const errorKey = first(sp.error);
  const statusBanner = statusKey ? tApprove(`banners.${statusKey}` as Parameters<typeof tApprove>[0]) : undefined;
  const errorMessage = errorKey ? tApprove(`errors.${errorKey}` as Parameters<typeof tApprove>[0]) : undefined;

  const locale = await getLocale();
  const { userId: userIdOrNull } = await getApproveContext();
  if (!userIdOrNull) redirect({ href: '/login', locale });
  const userId = userIdOrNull as string;

  // games + game_players from the tag-cached helper. See
  // lib/games/getGameWithPlayers.ts for cache + authz rationale.
  const result = await getGameWithPlayers(id);
  if (!result) notFound();
  const { game, players } = result;

  if (game.status !== 'active') {
    redirect({ href: `/games/${id}` as string, locale });
  }

  const me = players.find((p) => p.user_id === userId);
  if (!me) notFound();

  const { supabase: approveSupabase } = await getApproveContext();
  const courseRes = game.course_id
    ? await approveSupabase.from('courses').select('name').eq('id', game.course_id).maybeSingle<{ name: string }>()
    : { data: null as { name: string } | null };
  const courseName = courseRes.data?.name ?? null;

  // Mark `peer_approval_request`-varsler for dette spillet som lest. Når
  // brukeren først åpner /approve, regnes alle ventende godkjennings-
  // varsler for spillet som «sett», uavhengig av om hen rekker å klikke
  // gjennom alle radene. Wrap i `after()` så DB-mutasjon + revalidateTag
  // deferes til etter render (Next.js 16 sperrer revalidateTag i render-fase).
  after(() =>
    markNotificationsRead({
      userId,
      kind: 'peer_approval_request',
      entityId: id,
    }),
  );

  const tScorecard = await getTranslations('scorecard');
  return (
    <AppShell showVersion={false}>
      <TopBar
        backHref={`/games/${id}`}
        backLabel={tScorecard('backLabel', { name: localizeGameName(game.name, courseName, locale as AppLocale) })}
        kicker={tApprove('kicker')}
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
        <Suspense fallback={<PendingApprovalsSkeleton />}>
          <PendingApprovals
            gameId={id}
            courseId={game.course_id}
            currentUserId={userId}
            flightNumber={me.flight_number}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

async function PendingApprovals({
  gameId,
  courseId,
  currentUserId,
  flightNumber,
}: {
  gameId: string;
  courseId: string;
  currentUserId: string;
  flightNumber: number;
}) {
  const t = await getTranslations('game.approve');
  const { supabase } = await getApproveContext();

  // Flight-mates come from the tag-cached helper (already warm from the
  // outer page render — typically a ~1ms cache hit). Course holes (static)
  // stay a direct fetch.
  const [gwp, holesRes] = await Promise.all([
    getGameWithPlayers(gameId),
    supabase
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<HoleRow[]>(),
  ]);

  if (!gwp) notFound();
  if (holesRes.error) throw holesRes.error;

  const pending = gwp.players.filter(
    (m) =>
      m.flight_number === flightNumber &&
      m.user_id !== currentUserId &&
      m.submitted_at != null &&
      m.approved_at == null,
  );

  // For each pending mate, fetch their 18 scores so we can show the table
  // inline. With at most 3 flight-mates and 18 rows each this is tiny.
  const pendingIds = pending.map((p) => p.user_id);
  const { data: scoresData, error: scoresError } = pendingIds.length
    ? await supabase
        .from('scores')
        .select('user_id, hole_number, strokes')
        .eq('game_id', gameId)
        .in('user_id', pendingIds)
        .returns<ScoreRow[]>()
    : { data: [] as ScoreRow[], error: null };
  if (scoresError) throw scoresError;

  const holes = holesRes.data ?? [];
  const scoresByUserHole = new Map<string, Map<number, number | null>>();
  for (const s of scoresData ?? []) {
    let inner = scoresByUserHole.get(s.user_id);
    if (!inner) {
      inner = new Map();
      scoresByUserHole.set(s.user_id, inner);
    }
    inner.set(s.hole_number, s.strokes);
  }

  function displayName(p: PlayerForHole): string {
    if (!p.users) return t('unknownPlayer');
    // Should be non-null here per the invariant above, but coalesce so TS
    // (and any future flow that loosens the invariant) stays honest.
    const name = p.users.name ?? t('unknownPlayer');
    return p.users.nickname ? `${name} «${p.users.nickname}»` : name;
  }

  if (pending.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          {t('noPending')}
        </p>
      </Card>
    );
  }

  return (
    <>
      {pending.map((p) => {
        const inner = scoresByUserHole.get(p.user_id);
        const played = holes
          .map((h) => inner?.get(h.hole_number) ?? null)
          .filter((v): v is number => v != null);
        const total = played.reduce((s, n) => s + n, 0);
        const approveAction = approveScorecard.bind(null, gameId, p.user_id);
        const rejectAction = rejectScorecard.bind(null, gameId);
        const name = displayName(p);

        return (
          <Card key={p.user_id} className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-base font-medium text-text truncate">
                  {name}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {t('brutto')} <span className="score-num">{total}</span> ·{' '}
                  {t('playedHoles')}{' '}
                  <span className="score-num">{played.length}</span>
                  <span className="inline-num">/18</span>
                </p>
              </div>
            </div>

            <details className="px-4 py-3 border-b border-border">
              <summary className="text-sm text-muted cursor-pointer hover:text-text transition-colors">
                {t('showCard')}
              </summary>
              <div className="overflow-x-auto mt-3 -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                        {t('colHole')}
                      </th>
                      <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                        {t('colPar')}
                      </th>
                      <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                        {t('colSi')}
                      </th>
                      <th className="px-2 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                        {t('colStrokes')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((h) => {
                      const s = inner?.get(h.hole_number) ?? null;
                      // Eierens (`p`) egen par — ikke seerens. På avvikshull
                      // ser admin/flight-mate dermed dame-/junior-par der det
                      // gjelder, og slag rendres mot riktig referanse. #252.
                      const parByGender: HoleParByGender = {
                        mens: h.par_mens,
                        ladies: h.par_ladies,
                        juniors: h.par_juniors,
                      };
                      const ownerPar = parForPlayer(parByGender, p.tee_gender);
                      return (
                        <tr
                          key={h.hole_number}
                          className="border-t border-border"
                        >
                          <td className="score-num px-2 py-1.5 text-text">
                            {h.hole_number}
                          </td>
                          <td className="score-num px-2 py-1.5 text-right text-muted">
                            {ownerPar}
                            <ParAsideInline
                              parByGender={parByGender}
                              playerGender={p.tee_gender}
                            />
                          </td>
                          <td className="score-num px-2 py-1.5 text-right text-muted">
                            {h.stroke_index}
                          </td>
                          <td className="score-num px-2 py-1.5 text-right text-text">
                            <ScoreShape
                              shape={scoreShape(s, ownerPar)}
                              tone={scoreTone(s, ownerPar)}
                              size="sm"
                            >
                              {s ?? '—'}
                            </ScoreShape>
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
      })}
    </>
  );
}

/**
 * Liten avvik-indikator vist etter par-tallet i godkjennings-tabellen. Vises
 * bare når `parByGender` har avvik mellom kjønn. `playerGender` er scorekort-
 * eierens kjønn (ikke seerens) — eierens eget kjønn ekskluderes fra tooltipen,
 * konsistent med scorecard/submit. #252.
 */
function ParAsideInline({
  parByGender,
  playerGender,
}: {
  parByGender: HoleParByGender;
  playerGender: ScoringGender;
}) {
  const t = useTranslations('scorecard');
  if (!hasParDifference(parByGender)) return null;
  const parts: string[] = [];
  if (playerGender !== 'mens') parts.push(t('parGenderMens', { par: parByGender.mens }));
  if (playerGender !== 'ladies') parts.push(t('parGenderLadies', { par: parByGender.ladies }));
  if (playerGender !== 'juniors') parts.push(t('parGenderJuniors', { par: parByGender.juniors }));
  const tooltip = t('parAsideTooltip', { genders: parts.join(', ') });
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

function PendingApprovalsSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <Card key={i} className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-3/5" delay={i * 120} />
              <Skeleton className="mt-1 h-3 w-2/5" delay={i * 120 + 30} />
            </div>
          </div>
          <div className="px-4 py-3 border-b border-border">
            <Skeleton className="h-3 w-32" delay={i * 120 + 60} />
          </div>
          <div className="px-4 py-3">
            <Skeleton className="h-11 w-full rounded-full" delay={i * 120 + 90} />
          </div>
        </Card>
      ))}
    </>
  );
}
