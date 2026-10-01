import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { BrandHero } from '@/components/ui/BrandHero';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { LinkButton } from '@/components/ui/Button';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { getPublicDiscoverableGames } from '@/lib/games/getPublicDiscoverableGames';
import { getGamesSocialProof } from '@/lib/games/getGameSocialProof';
import { getRegistrationSeats } from '@/lib/games/getRegistrationSeats';
import { parseTerminFilter } from '@/lib/games/terminliste';
import { first } from '@/lib/url/searchParams';
import { AnonDiscoverySection } from './AnonDiscoverySection';
import { Terminliste } from './Terminliste';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';

// getDiscoverableGames bruker admin-client (service role) ved request-tid.
// Under cacheComponents (#538) prerendres aldri uncachet IO, så ruta trenger
// ikke force-dynamic for å holdes ute av builden (samme som /spillformater).

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
 *
 * #2258: innlogget er siden terminlista — dager, filterbrikker (`?vis=`) og
 * kompakte rader med plass-linje. Uinnlogget beholder rammen, bare lista får
 * de samme dagene og radene.
 */
export default async function FinnTurneringerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('discover');

  // #1185: /finn-turneringer er en auth-optional rute (se proxy.ts
  // AUTH_OPTIONAL_PATH_PATTERN). Proxyen setter x-torny-user-id for innloggede
  // og redirecter IKKE anonyme — de får null her og render-er anon-grenen
  // under. Innloggede får terminlista + bunn-nav.
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    // #1185: uinnloggede redirectes ikke lenger — de får en anonym visning av
    // åpne turneringer (isPubliclyViewable) med login-vinklet CTA. Gi verdi
    // før du ber (flyt 2, resiprositet). Innlogget gren under er terminlista.
    const anonGames = await getPublicDiscoverableGames();
    // #2258: plass-linja og «Fullt» er tall, aldri navn — trygt anonymt.
    const anonSeats = await getRegistrationSeats(anonGames);
    const anonNow = new Date();
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
              <AnonDiscoverySection games={anonGames} seats={anonSeats} now={anonNow} />
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

  const [data, sp] = await Promise.all([getDiscoverableGames(userId), searchParams]);
  const listed = [...data.clubGames, ...data.friendGames, ...data.openGames];
  // #1193: sosialt bevis per rad og #2258: seter per rad — hver ett samlet
  // oppslag for hele lista, parallelt.
  const [socialProof, seats] = await Promise.all([
    getGamesSocialProof(
      listed.map((g) => g.id),
      userId,
    ),
    getRegistrationSeats(listed),
  ]);
  // Etter auth- og dataoppslagene: dagsetikettene og «Denne helga» regnes fra nå.
  const now = new Date();

  // #2258 (anbefaling 4, godtatt): bunnmenyen står, versjonslinja er borte.
  return (
    <AppShell showVersion={false}>
      <Terminliste
        data={data}
        socialProof={socialProof}
        seats={seats}
        filter={parseTerminFilter(first(sp.vis))}
        now={now}
      />
    </AppShell>
  );
}
