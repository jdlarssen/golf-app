import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { localizeGameName } from '@/lib/games/autoGameName';
import { ceremonySupported, type CeremonyPlace } from '@/lib/games/ceremony';
import { canonicalPath } from '@/lib/seo/canonical';
import { requestOrigin } from '@/lib/url/requestOrigin';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { ShareLinkField } from '@/components/ui/ShareLinkField';
import { loadCeremonyData } from './ceremonyData';
import { afterColon, placeText, sidePrizeLabel, type PlaceWords } from './ceremonyText';
import { BigScreenSwitch, CeremonyRemote, type RemoteStep } from './CeremonyRemote';

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ceremony');
  return { title: t('metaTitle') };
}

/**
 * The organiser's prize-giving (#2298): the big screen's link, and the remote
 * that turns the podium's cards one at a time. Organiser or admin only, on a
 * finished game in a podium format; anyone else goes to `/`, and a game that
 * is not finished back to its page.
 */
export default async function CeremonyPage({ params }: { params: Params }) {
  const { id } = await params;
  const locale = (await getLocale()) as AppLocale;
  const supabase = await getServerClient();
  await requireAdminOrCreator(supabase, id);

  const gwp = await getGameWithPlayers(id);
  if (!gwp) notFound();
  const { game } = gwp;
  if (game.status !== 'finished' || !ceremonySupported(game.game_mode)) {
    redirect({ href: `/games/${id}`, locale });
  }

  const admin = getAdminClient();
  // Fresh, not from the game cache: the token and the step change under it.
  const [stateRes, courseRes, data, origin, t, tc, tp] = await Promise.all([
    admin
      .from('games')
      .select('spectate_token, ceremony_step')
      .eq('id', id)
      .single<{ spectate_token: string | null; ceremony_step: number | null }>(),
    game.course_id
      ? admin.from('courses').select('name').eq('id', game.course_id).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
    loadCeremonyData(gwp),
    requestOrigin(),
    getTranslations('ceremony'),
    getTranslations('leaderboard.common'),
    getTranslations('prizes'),
  ]);
  if (stateRes.error) throw stateRes.error;
  const { spectate_token: token, ceremony_step: step } = stateRes.data;

  const words: PlaceWords = {
    placeTitle: (place: CeremonyPlace) =>
      place.lines.length > 1 ? tc('tiedRank', { rank: place.rank }) : t('placeTitle', { rank: place.rank }),
    teamLabel: (number) => tc('teamLabel', { number }),
    units: { points: tc('poengLabel'), net: tc('slagLabel'), toPar: tc('vsParLabel') },
    names: data.names,
    unknown: tc('unknownPlayer'),
  };
  // The phone's lines read «Vises nå: delt 2. plass», lower case after the colon.
  const inline: PlaceWords = { ...words, placeTitle: (place) => afterColon(words.placeTitle(place)) };
  const sideText = data.sidePrizes
    .map((p) => `${sidePrizeLabel(p, { ld: tp('ldLabel'), ctp: tp('ctpLabel') })}: ${data.names[p.winnerUserId] ?? words.unknown}`)
    .join(' · ');

  const steps: RemoteStep[] = data.steps.map((s) => {
    if (s === 'side') {
      return {
        button: t('showSide'),
        next: t('next', { text: `${afterColon(t('sideTitle'))} · ${sideText}` }),
        now: t('nowShowing', { text: afterColon(t('sideTitle')) }),
      };
    }
    return {
      button: s.rank === 1 ? t('revealWinner') : t('showPlace', { rank: s.rank }),
      next: t('next', { text: placeText(s, inline) }),
      now: t('nowShowing', { text: inline.placeTitle(s) }),
    };
  });

  const gameName = localizeGameName(game.name, courseRes.data?.name ?? null, locale);
  const tvUrl = token ? `${origin}${canonicalPath(locale, `/spectate/${token}/tv`)}` : null;

  return (
    <AppShell>
      <TopBar backHref={`/games/${id}`} kicker={gameName} />
      <PageHeader title={t('title')} subtitle={t('intro')} />

      <div className="space-y-4">
        <section className="space-y-2">
          <Kicker tone="muted">{t('tvTitle')}</Kicker>
          <Card>
            <div className="space-y-3">
              {tvUrl ? (
                <>
                  <p className="text-sm text-muted">{t('tvBody')}</p>
                  <ShareLinkField
                    url={tvUrl}
                    ariaLabel={t('tvLinkAria')}
                    copyLabel={t('copy')}
                    copiedLabel={t('copied')}
                    errorText={t('copyError')}
                    testId="ceremony-tv-link"
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">{t('tvOffBody')}</p>
                  <BigScreenSwitch gameId={id} label={t('tvTurnOn')} errorText={t('error')} />
                </>
              )}
            </div>
          </Card>
        </section>

        {steps.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t('empty')}</p>
          </Card>
        ) : (
          <CeremonyRemote
            gameId={id}
            initialStep={step}
            steps={steps}
            labels={{
              start: t('start'),
              back: t('back'),
              restart: t('restart'),
              close: t('close'),
              nowHidden: t('nowHidden'),
              notStarted: t('notStarted'),
              allShown: t('allShown'),
              error: t('error'),
            }}
          />
        )}

        <p className="text-sm text-muted" data-testid="ceremony-players-note">
          {t('playersHaveResult')}
        </p>
      </div>
    </AppShell>
  );
}
