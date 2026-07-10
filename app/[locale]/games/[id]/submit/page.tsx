import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { COURSE_HOLES_SELECT } from '@/lib/supabase/queryFragments';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { isProfileIncomplete } from '@/lib/auth/profileGate';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { submitScorecard } from './actions';
import { SubmitForm } from './SubmitForm';
import { ParAsideInline } from '../_components/ParAsideInline';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { parForPlayer, type HoleParByGender } from '@/lib/games/parDisplay';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';
import { isStablefordFamily, type ScoringGender } from '@/lib/scoring/modes/types';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
}>;


type CourseTeeRow = {
  courses: { name: string } | null;
  tee_boxes: (TeeBoxRatings & { name: string }) | null;
};

type HoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
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
  const t = await getTranslations('game.submit');
  const locale = await getLocale();
  const errorKey = first(sp.error);
  const errorMessage = errorKey ? t(`errors.${errorKey}` as Parameters<typeof t>[0]) : undefined;

  const { supabase, userId: userIdOrNull } = await getSubmitContext();
  if (!userIdOrNull) redirect({ href: '/login', locale });
  const userId = userIdOrNull as string;

  // games + game_players from the tag-cached helper, course/tee_box joins
  // direct (kept out of the cache since invalidating on course edits would
  // require fan-out across every game using that course). Run them in
  // parallel — the joins are independent of the game row.
  const [result, courseTeeRes] = await Promise.all([
    getGameWithPlayers(id),
    supabase
      .from('games')
      .select(
        'courses(name), tee_boxes(name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
      )
      .eq('id', id)
      .single<CourseTeeRow>(),
  ]);

  if (!result) notFound();
  const { game, players } = result;

  // Only active games can be submitted to. Anything else: bounce home.
  if (game.status !== 'active') {
    redirect({ href: `/games/${id}` as string, locale });
  }

  const me = players.find((p) => p.user_id === userId);
  if (!me) notFound();

  // #1176: hard profil-gate — en profil-løs spiller kan se spillet, men å
  // levere scorekortet krever navn + handicap.
  if (await isProfileIncomplete(supabase, userId)) {
    redirect({
      href: `/complete-profile?next=${encodeURIComponent(`/games/${id}/submit`)}`,
      locale,
    });
  }

  // Withdrawn (#387): a trukket spiller can't deliver. Bounce to game-home,
  // which renders the «Du har trukket deg»-banner + Angre. Defense-in-depth —
  // the submitScorecard action refuses a direct POST too.
  if (me.withdrawn_at) {
    redirect({ href: `/games/${id}` as string, locale });
  }

  // Already submitted: nothing more to do here.
  if (me.submitted_at) {
    redirect({ href: `/games/${id}` as string, locale });
  }

  if (courseTeeRes.error || !courseTeeRes.data) notFound();
  const courseTee = courseTeeRes.data;
  const playerRating = courseTee.tee_boxes
    ? getRatingForGender(courseTee.tee_boxes, me.tee_gender)
    : null;

  const submitAction = submitScorecard.bind(null, id);

  // Solo-modus (stableford) har null team/flight, og kopien skifter fra
  // lag-rettet til personlig: «Lever ditt scorekort» i topp-baren og en
  // CH-only-info-linje i stedet for «Lag X · Flight Y».
  const isStableford = isStablefordFamily(game.game_mode);
  const kicker = isStableford ? t('kickerSolo') : t('kicker');

  return (
    <AppShell showVersion={false}>
      <TopBar backHref={`/games/${id}`} kicker={kicker} />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <p className="font-serif text-[19px] font-medium tracking-[-0.01em] text-text">
            {localizeGameName(game.name, courseTee.courses?.name ?? null, locale as AppLocale)}
          </p>
          <p className="text-xs text-muted mt-1.5">
            {courseTee.courses?.name ?? t('unknownCourse')}
            {courseTee.tee_boxes
              ? ` · ${t('teePrefix')}${courseTee.tee_boxes.name}${playerRating ? `${t('parPrefix')}${playerRating.par}` : ''}`
              : ''}
          </p>
          {isStableford ? (
            <p className="text-xs text-muted mt-1">
              {t('soloInfo')}
              <span className="score-num">{me.course_handicap ?? '—'}</span>
            </p>
          ) : (
            <p className="text-xs text-muted mt-1">
              {t('teamInfo')}<span className="score-num">{me.team_number}</span>{t('flightInfo')}
              <span className="score-num">{me.flight_number}</span>{t('chInfo')}
              <span className="score-num">{me.course_handicap ?? '—'}</span>
            </p>
          )}
        </Card>

        <Suspense fallback={<ReviewBodySkeleton />}>
          <ReviewBody
            gameId={id}
            courseId={game.course_id}
            currentUserId={userId}
            meTeeGender={me.tee_gender}
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
  meTeeGender,
  submitAction,
}: {
  gameId: string;
  courseId: string;
  currentUserId: string;
  meTeeGender: ScoringGender;
  submitAction: () => void | Promise<void>;
}) {
  const t = await getTranslations('game.submit');
  const { supabase } = await getSubmitContext();

  const [holesRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
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
      const name = u.name ?? t('unknownPlayer');
      namesById.set(u.id, u.nickname ? `${name} «${u.nickname}»` : name);
    }
  }

  const rows = (holesRes.data ?? []).map((h) => {
    const s = scoreByHole.get(h.hole_number);
    const strokes = s?.strokes ?? null;
    const enteredByName = s?.entered_by ? namesById.get(s.entered_by) : null;
    const parByGender: HoleParByGender = {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    };
    return {
      ...h,
      par: parForPlayer(parByGender, meTeeGender),
      parByGender,
      strokes,
      enteredByName,
    };
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
          <Kicker tone="muted">{t('myCard')}</Kicker>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-bg/40">
                <th className="px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                  {t('colHole')}
                </th>
                <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                  {t('colPar')}
                </th>
                <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                  {t('colSi')}
                </th>
                <th className="px-4 py-2.5 text-right text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                  {t('colStrokes')}
                </th>
                <th className="px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">
                  {t('colEnteredBy')}
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
                    <ParAsideInline
                      parByGender={r.parByGender}
                      playerGender={meTeeGender}
                    />
                  </td>
                  <td className="score-num px-4 py-2.5 text-right text-muted">
                    {r.stroke_index}
                  </td>
                  <td className="score-num px-4 py-2.5 text-right text-text">
                    <ScoreShape
                      shape={scoreShape(r.strokes, r.par)}
                      tone={scoreTone(r.strokes, r.par)}
                      size="sm"
                    >
                      {r.strokes ?? '—'}
                    </ScoreShape>
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
          {t('summaryBrutto')}{' '}
          <span className="score-num text-text">{totalBrutto}</span>
          {' · '}
          {t('summaryHoles')}{' '}
          <span className="score-num text-text">{playedHoles.length}</span>
          <span className="inline-num">/18</span>
        </p>
      </Card>

      {missingHoles > 0 && (
        <Banner tone="info">
          {t('missingHolesBanner', { count: missingHoles })}
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3">
        <SmartLink
          href={`/games/${gameId}/holes/1`}
          className="inline-flex items-center justify-center min-h-[44px] rounded-full border border-border px-[18px] py-2.5 text-sm font-medium text-text hover:bg-primary-soft transition-colors"
        >
          {t('editButton')}
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
