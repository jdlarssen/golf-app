import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { LeagueIntroSteps } from '@/components/league/LeagueIntroSteps';
import { formatListLocale, formatShortOsloDateWithYearLocale } from '@/lib/i18n/format';
import { getLeagueJoinContext, type LeagueJoinRound } from '@/lib/league/getLeagueJoinContext';
import { closedRoundSequences, evaluateLeagueJoin } from '@/lib/league/joinValidation';
import { isJoinCode } from '@/lib/league/joinCode';
import type { AppLocale } from '@/i18n/routing';
import { LeagueJoinActions } from './LeagueJoinActions';

type Params = Promise<{ locale: string; code: string }>;

const LEAGUE_FORMATS = ['stroke', 'stableford', 'modified_stableford'] as const;
type LeagueFormatKey = (typeof LEAGUE_FORMATS)[number];

/**
 * The link preview in Messenger or SMS says what the link is: the league's
 * name and one sentence. A private code is no page for search engines.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: 'liga.join' });
  const base: Metadata = { title: t('metaTitle'), robots: { index: false } };
  if (!isJoinCode(code)) return base;
  const { data } = await getAdminClient()
    .from('leagues')
    .select('name, group_id')
    .eq('join_code', code)
    .maybeSingle();
  if (!data || data.group_id !== null) return base;
  return {
    ...base,
    description: t('ogDescription'),
    openGraph: { title: data.name, description: t('ogDescription') },
  };
}

/** The rounds whose window has closed, read against the clock at render. */
function playedRounds(rounds: LeagueJoinRound[]): number[] {
  return closedRoundSequences(rounds, Date.now());
}

/**
 * `/liga/bli-med/[code]`: the shareable way into a league without a club
 * (#2662). The organiser shares the link from the league's admin page, and
 * every participant can pass it on from the league page. The link is the gate
 * (as the cup link, #1490): no approval round.
 *
 * Auth-optional (`proxy.ts`): a stranger sees what the league is and the intro
 * before logging in, and «Bli med» takes them through the login and back.
 * Which state renders is decided by `evaluateLeagueJoin`, the same function the
 * server action enforces, so the button never shows on grounds the write does
 * not accept.
 */
export default async function LigaBliMedPage({ params }: { params: Params }) {
  const { code } = await params;

  let userId = await getProxyVerifiedUserId();
  if (!userId) {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  const [ctx, t, locale] = await Promise.all([
    getLeagueJoinContext(code, userId),
    getTranslations('liga'),
    getLocale() as Promise<AppLocale>,
  ]);

  const decision = evaluateLeagueJoin(ctx.facts);
  const league = ctx.league;
  if (decision === 'not_found' || !league) notFound();

  const selfHref = `/liga/bli-med/${code}`;

  const formatKey = LEAGUE_FORMATS.find((f) => f === league.format) as LeagueFormatKey | undefined;
  const formatLabel = formatKey ? t(`manage.formatLabel.${formatKey}`) : league.format;
  const place = league.is_simulator
    ? t('join.placeSimulator')
    : (league.courses?.name ?? t('join.placeAnyCourse'));

  const first = ctx.rounds[0];
  const last = ctx.rounds[ctx.rounds.length - 1];
  const roundsLine = first
    ? t('join.roundsLine', {
        count: ctx.rounds.length,
        from: formatShortOsloDateWithYearLocale(first.opensAt, locale),
        to: formatShortOsloDateWithYearLocale(last.closesAt, locale),
      })
    : t('join.noRounds');

  // Owner, 27.10: only rounds whose window has closed are «spilt». A round
  // that is open now can still be played by someone who joins today.
  const played = playedRounds(ctx.rounds);
  const comingIn =
    decision === 'can_join' || decision === 'sign_in' || decision === 'profile_incomplete';
  const afterStartLine =
    comingIn && played.length > 0
      ? t('join.afterStart', {
          count: played.length,
          rounds: formatListLocale(played.map(String), locale),
        })
      : null;

  return (
    <AppShell>
      <TopBar backHref="/" kicker={t('join.kicker')} />
      <PageHeader title={league.name} subtitle={`${formatLabel} · ${place}`} />

      <Card className="mb-5">
        <div data-testid={`liga-join-state-${decision}`} className="space-y-4">
          <div className="space-y-1">
            <p className="font-sans text-sm text-muted tabular-nums">{roundsLine}</p>
            <p className="font-sans text-sm text-muted tabular-nums" data-testid="liga-join-count">
              {t('join.playersLine', { count: ctx.participantCount })}
            </p>
          </div>

          {afterStartLine && (
            <p className="font-sans text-[15px] text-text" data-testid="liga-join-after-start">
              {afterStartLine}
            </p>
          )}

          {decision === 'can_join' && (
            <>
              <p className="font-sans text-[15px] text-text">{t('join.invite')}</p>
              <LeagueJoinActions code={code} />
            </>
          )}

          {decision === 'sign_in' && (
            <>
              <p className="font-sans text-[15px] text-text">{t('join.invite')}</p>
              <LinkButton
                href={`/login?next=${encodeURIComponent(selfHref)}`}
                full
                data-testid="liga-join-sign-in"
              >
                {t('join.joinButton')}
              </LinkButton>
              <p className="font-sans text-xs text-muted">{t('join.signInHint')}</p>
            </>
          )}

          {decision === 'already_joined' && (
            <>
              <p className="font-sans text-[15px] text-text">{t('join.alreadyJoined')}</p>
              <LinkButton href={`/liga/${league.id}`} variant="secondary" full>
                {t('join.goToLeague')}
              </LinkButton>
            </>
          )}

          {decision === 'closed' && (
            <>
              <p className="font-sans text-[15px] text-text">{t('join.closed')}</p>
              {ctx.facts.signedIn && (
                <LinkButton href={`/liga/${league.id}`} variant="secondary" full>
                  {t('join.seeTable')}
                </LinkButton>
              )}
            </>
          )}

          {decision === 'profile_incomplete' && (
            <>
              <p className="font-sans text-[15px] text-text">{t('join.profileIncomplete')}</p>
              <SmartLink
                href={`/complete-profile?next=${encodeURIComponent(selfHref)}`}
                className="block rounded-full bg-primary px-4 py-3 text-center font-sans text-[15px] font-semibold text-white min-h-[44px] flex items-center justify-center dark:text-bg"
              >
                {t('join.completeProfileButton')}
              </SmartLink>
            </>
          )}
        </div>
      </Card>

      <LeagueIntroSteps isSimulator={league.is_simulator} />
    </AppShell>
  );
}
