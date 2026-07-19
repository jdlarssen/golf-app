import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrandHero } from '@/components/ui/BrandHero';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { SmartLink } from '@/components/ui/SmartLink';
import { SendCodeForm } from './_components/SendCodeForm';
import { VerifyCodeForm } from './_components/VerifyCodeForm';
import { InviteContextCard } from './_components/InviteContextCard';
import { PasskeyLoginButton } from '@/components/passkey/PasskeyLoginButton';
import { resolvePasskeyAccess } from '@/lib/auth/passkeyFlag';
import {
  getInviteLoginContext,
  isInviteToken,
} from '@/lib/auth/getInviteLoginContext';
import { getGameSocialProof } from '@/lib/games/getGameSocialProof';
import { inviteExpiryTier } from '@/lib/auth/inviteExpiry';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDate, formatTime } from '@/lib/i18n/format';
import { first, resolveErrorCode } from '@/lib/url/searchParams';

type SearchParams = Promise<{
  step?: string | string[];
  email?: string | string[];
  error?: string | string[];
  next?: string | string[];
  invite?: string | string[];
}>;

// The set of valid error codes that map to a catalog key.
// An unrecognised ?error= value falls back to 'unknown'.
const KNOWN_ERROR_CODES = new Set([
  'rate_limited',
  'user_not_found',
  'invite_expired',
  'disposable_email',
  'code_invalid',
  'code_expired',
  'link_expired',
  'unknown',
] as const);

// #1264: /login must stay OUT of the index. Every unknown URL soft-404s here
// with a 200, so without noindex Google sees endless indexable ?next=… login
// variants. The description is benefit-led (what Tørny is) so the one login
// result that does surface reads well.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t('loginMetaTitle'),
    description: t('loginMetaDescription'),
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalPath(locale, '/login') },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('auth');

  const params = await searchParams;
  const step = first(params.step) === 'verify' ? 'verify' : 'email';
  const email = first(params.email) ?? '';
  const next = first(params.next) ?? '';
  const errorCode = resolveErrorCode(first(params.error), KNOWN_ERROR_CODES, 'unknown');
  const errorMessage = errorCode ? t(`errors.${errorCode}`) : undefined;

  // #1169: game-scoped invitasjonsmail lenker hit med ?invite=<token>.
  // Gyldig token → kontekstkort over kodeskjemaet. Alt annet (ugyldig,
  // utløpt, akseptert, game-løs) → null, og siden er nøyaktig som uten param.
  const inviteRaw = first(params.invite) ?? '';
  const invite = isInviteToken(inviteRaw) ? inviteRaw : '';
  const inviteCtx = invite ? await getInviteLoginContext(invite) : null;

  let inviteCard: ReactNode = null;
  if (inviteCtx) {
    const locale = (await getLocale()) as AppLocale;
    const tModes = await getTranslations('modes');
    const tCard = await getTranslations('auth.inviteCard');
    const modeKey = inviteCtx.gameMode as Parameters<typeof tModes>[0];
    // #1179: vennlig, forward-pekende frist. Kortet rendres per request, så en
    // relativ nedtelling holder seg fersk. getInviteLoginContext viser bare
    // ikke-utløpte invitasjoner, så tier er alltid i dag/i morgen/om N dager.
    const expiryTier = inviteExpiryTier(inviteCtx.expiresAt);
    const expiresLine =
      expiryTier === null
        ? null
        : expiryTier.kind === 'today'
          ? tCard('expiresToday')
          : expiryTier.kind === 'tomorrow'
            ? tCard('expiresTomorrow')
            : tCard('expiresInDays', { n: expiryTier.days });
    // #1193: aggregert sosialt bevis på kortet. Den besøkende er anonym
    // (viewerUserId = null) → helperen gir kun et ekte antall, aldri venne-navn.
    const { joinedCount } = await getGameSocialProof(inviteCtx.gameId, null);
    inviteCard = (
      <InviteContextCard
        inviterName={inviteCtx.inviterName}
        gameName={localizeGameName(
          inviteCtx.gameName,
          inviteCtx.courseName,
          locale,
        )}
        modeLabel={tModes.has(modeKey) ? tModes(modeKey) : null}
        courseName={inviteCtx.courseName}
        teeOff={
          inviteCtx.teeOffAt ? formatTeeOff(inviteCtx.teeOffAt, locale) : null
        }
        expiresLine={expiresLine}
        joinedCount={joinedCount}
      />
    );
  }

  const resendQs = new URLSearchParams();
  if (email) resendQs.set('email', email);
  if (next) resendQs.set('next', next);
  if (invite) resendQs.set('invite', invite);
  const resendHref = `/login${resendQs.toString() ? '?' + resendQs.toString() : ''}`;

  return (
    <AppShell>
      <div className="mt-10">
        <BrandHero className="mb-10" />
        <div className="flex justify-center mb-4">
          <LocaleSwitcher />
        </div>
        {inviteCard}
        <Card>
          {errorMessage && (
            <div role="alert" className="mb-4">
              <Banner tone="error">{errorMessage}</Banner>
            </div>
          )}

          {step === 'email' ? (
            <>
              {resolvePasskeyAccess(process.env.NEXT_PUBLIC_PASSKEYS, false)
                .showLoginButton && <PasskeyLoginButton next={next} />}
              <SendCodeForm
                defaultEmail={email}
                next={next}
                invite={invite}
                allowSelfRegistration={
                  process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true'
                }
              />
              <div className="mt-6 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  {t('tryDemoDivider')}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <SmartLink
                href="/demo"
                data-testid="try-demo-link"
                className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-primary"
              >
                {t('tryDemo')} <span aria-hidden="true">→</span>
              </SmartLink>
            </>
          ) : (
            <VerifyCodeForm
              email={email}
              next={next}
              invite={invite}
              resendHref={resendHref}
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}

/**
 * Format ISO-timestamp som «8. mai 2026, 14:30» i aktiv locale, med europeisk
 * 24-timers klokke — samme mønster som `/signup/[shortId]`. Faller tilbake til
 * rå-strengen hvis Intl kaster (skal aldri skje for gyldige ISO-strenger).
 */
function formatTeeOff(iso: string, locale: AppLocale): string {
  try {
    const datePart = formatDate(iso, locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timePart = formatTime(iso, locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return iso;
  }
}
