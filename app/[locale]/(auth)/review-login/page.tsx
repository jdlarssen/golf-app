import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getServerClient } from '@/lib/supabase/server';
import { first, resolveErrorCode } from '@/lib/url/searchParams';
import { signInWithReviewPassword } from './actions';

type SearchParams = Promise<{
  email?: string | string[];
  error?: string | string[];
}>;

// Kun to koder: alt som kan avsløre noe om kontoen kollapser til
// `review_failed` (se actions.ts). Ukjent ?error= faller til samme kode.
const KNOWN_ERROR_CODES = new Set(['review_failed', 'rate_limited'] as const);

// #1284: ruta er ulenket og skal aldri indekseres. Ingen canonical — siden
// finnes bare når eieren har satt env-varen, og har ingen offentlig adresse.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reviewLogin');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
  };
}

/**
 * `/review-login` — passord-innlogging for App Store-review-kontoen (#1284).
 *
 * Apple sine reviewere kan ikke motta OTP-koder på mail, så vanlig innlogging
 * er en blindvei for dem. Denne sida er den eneste passord-inngangen i appen,
 * og den er gatet tre veier:
 *   1. `REVIEW_ACCOUNT_EMAIL` usatt → notFound(). Ruta er inert helt til
 *      eieren setter env-varen i Vercel (samme env-var som actions.ts leser).
 *   2. Kun den adressen kan logges inn (actions.ts).
 *   3. Rate-limit på e-post + IP, som /login.
 *
 * Ingen lenker peker hit, og `robots: noindex` holder den ute av søk.
 */
export default async function ReviewLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // `connection()` MÅ stå før env-lesingen. Uten den kjører env-gaten under
  // prerender-en (`cacheComponents` gir ruta en statisk shell), og siden env-
  // varen ikke er satt i byggemiljøet bakes notFound()-resultatet INN i
  // shellen — verifisert med `next start`: ruta svarte 404-innhold selv med
  // REVIEW_ACCOUNT_EMAIL satt i runtime. Da ville eieren måtte deploye på nytt
  // etter å ha satt env-varen i Vercel, og runbooken ville vært en blindvei.
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md
  await connection();

  if (!(process.env.REVIEW_ACCOUNT_EMAIL ?? '').trim()) {
    notFound();
  }

  // Allerede innlogget → sida har ingen jobb å gjøre. Sender til hjem i
  // stedet for å vise et skjema som ville logget dem inn på nytt.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect('/');
  }

  const t = await getTranslations('auth.reviewLogin');
  const params = await searchParams;
  const email = first(params.email) ?? '';
  const errorCode = resolveErrorCode(
    first(params.error),
    KNOWN_ERROR_CODES,
    'review_failed',
  );
  const errorMessage = errorCode ? t(`errors.${errorCode}`) : undefined;

  return (
    <AppShell>
      <div className="mt-10">
        <Card>
          {errorMessage && (
            <div
              role="alert"
              data-testid={`review-login-error-${errorCode}`}
              className="mb-4"
            >
              <Banner tone="error">{errorMessage}</Banner>
            </div>
          )}

          <h1 className="font-serif text-xl font-medium tracking-tight text-text">
            {t('heading')}
          </h1>
          <p className="mt-2 mb-6 text-sm text-muted">{t('intro')}</p>

          <form action={signInWithReviewPassword} className="space-y-4">
            <Input
              id="review-email"
              name="email"
              type="email"
              label={t('emailLabel')}
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={email}
              required
            />
            <Input
              id="review-password"
              name="password"
              type="password"
              label={t('passwordLabel')}
              autoComplete="current-password"
              required
            />
            <Button type="submit" className="w-full mt-2">
              {t('submit')}
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
