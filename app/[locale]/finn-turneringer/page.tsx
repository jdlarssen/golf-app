import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { BrandHero } from '@/components/ui/BrandHero';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { LinkButton } from '@/components/ui/Button';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { PullQuote } from '@/components/ui/PullQuote';
import { PinFlag } from '@/components/icons/PinFlag';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { getPublicDiscoverableGames } from '@/lib/games/getPublicDiscoverableGames';
import { getGamesSocialProof } from '@/lib/games/getGameSocialProof';
import { HomeDiscoverySection } from '../HomeDiscoverySection';
import { AnonDiscoverySection } from './AnonDiscoverySection';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';

// getDiscoverableGames bruker admin-client (service role) ved request-tid.
// Under cacheComponents (#538) prerendres aldri uncachet IO, så ruta trenger
// ikke force-dynamic for å holdes ute av builden (samme som /spillformater).

type Params = Promise<{ locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  // Narrow to AppLocale — fall back to default if the param is unrecognised.
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'discover' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: canonicalPath(locale, '/finn-turneringer') },
  };
}

/**
 * Vedvarende «Finn turneringer»-side (#357). Nådd via et kort på Hjem, så
 * spillere som alt har spill fortsatt kan oppdage nye — ikke bare i tom-
 * tilstand. Viser open + manual_approval (påmeldingsmåten ER synligheten);
 * invite_only ekskluderes allerede i `getDiscoverableGames`.
 */
export default async function FinnTurneringerPage() {
  const t = await getTranslations('discover');

  // #1185: /finn-turneringer er en auth-optional rute (se proxy.ts
  // AUTH_OPTIONAL_PATH_PATTERN). Proxyen setter x-torny-user-id for innloggede
  // og redirecter IKKE anonyme — de får null her og render-er anon-grenen
  // under. Innloggede får sin personlige funn-liste + bunn-nav som før.
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    // #1185: uinnloggede redirectes ikke lenger — de får en anonym visning av
    // åpne turneringer (isPubliclyViewable) med login-vinklet CTA. Gi verdi
    // før du ber (flyt 2, resiprositet). Innlogget gren under er uendret.
    const anonGames = await getPublicDiscoverableGames();
    return (
      <AppShell>
        <div className="mt-10" data-testid="anon-finn-turneringer">
          <BrandHero className="mb-8" />
          <div className="mb-8 flex justify-center">
            <LocaleSwitcher />
          </div>

          {anonGames.length > 0 ? (
            <section>
              <h2 className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                {t('anon.listHeading')}
              </h2>
              <AnonDiscoverySection games={anonGames} />
              <div className="mt-8">
                <LinkButton
                  href="/login?next=/finn-turneringer"
                  full
                  data-testid="anon-login-cta"
                >
                  {t('anon.loginCta')}
                </LinkButton>
                <p className="mt-3 text-center font-sans text-xs leading-relaxed text-muted">
                  {t('anon.loginHint')}
                </p>
              </div>
            </section>
          ) : (
            <section className="flex flex-col items-center text-center">
              <h2 className="font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
                {t('anon.emptyHeading')}
              </h2>
              <p className="mt-3 max-w-[280px] font-sans text-sm leading-relaxed text-muted">
                {t('anon.emptyBody')}
              </p>
              <div className="mt-8 w-full max-w-[280px]">
                <LinkButton
                  href="/login?next=/finn-turneringer"
                  full
                  data-testid="anon-login-cta"
                >
                  {t('anon.loginCta')}
                </LinkButton>
              </div>
            </section>
          )}
        </div>
      </AppShell>
    );
  }

  const data = await getDiscoverableGames(userId);
  // #1193: sosialt bevis per funn-kort — ett samlet roster- + venne-oppslag for
  // hele lista (klubb/venner/åpne), batchet så det ikke blir per-kort-spørringer.
  const socialProof = await getGamesSocialProof(
    [...data.clubGames, ...data.friendGames, ...data.openGames].map(
      (g) => g.id,
    ),
    userId,
  );
  const isEmpty =
    data.clubGames.length === 0 &&
    data.openGames.length === 0 &&
    data.friendGames.length === 0 &&
    data.pendingRequests.length === 0;

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">{t('backLabel')}</BackLink>
        <Kicker tone="accent">{t('kicker')}</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      {isEmpty ? (
        <section className="mt-4 flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            <PinFlag size={72} className="text-primary dark:text-text" />
          </ChampagneMedallion>
          <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
            {t('emptyHeading')}
          </h1>
          <p className="mt-3 max-w-[280px] font-sans text-sm leading-relaxed text-muted">
            {t('emptyBody')}
          </p>
          <div className="mt-8 w-full max-w-[280px]">
            <LinkButton href="/opprett-spill" full>
              {t('emptyAction')}
            </LinkButton>
          </div>
          <PullQuote className="mt-8">
            {t('emptyPullQuote')}
          </PullQuote>
        </section>
      ) : (
        <>
          <PageHeader
            title={t('pageTitle')}
            subtitle={t('pageSubtitle')}
          />
          <HomeDiscoverySection data={data} socialProof={socialProof} />
        </>
      )}
    </AppShell>
  );
}
