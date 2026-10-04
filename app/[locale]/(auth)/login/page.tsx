import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { canonicalPath } from '@/lib/seo/canonical';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { SmartLink } from '@/components/ui/SmartLink';
import { SendCodeForm } from './_components/SendCodeForm';
import { VerifyCodeForm } from './_components/VerifyCodeForm';
import { LoginBand, type LoginBandInvite } from './_components/LoginBand';
import { InvitationCard } from '@/components/games/InvitationCard';
import { PasskeyLoginButton } from '@/components/passkey/PasskeyLoginButton';
import { resolvePasskeyAccess } from '@/lib/auth/passkeyFlag';
import { selfRegistrationOpen } from '@/lib/auth/sendLoginCode';
import {
  getInviteLoginContext,
  isInviteToken,
  type InviteLoginContext,
} from '@/lib/auth/getInviteLoginContext';
import { getGameSocialProof } from '@/lib/games/getGameSocialProof';
import {
  effectiveInviteDeadline,
  inviteExpiryTier,
} from '@/lib/auth/inviteExpiry';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { GameMode } from '@/lib/scoring/modes/types';
import { parseSentAt, resendWaitSeconds } from '@/lib/auth/otpResend';
import { formatTeeOffParts } from '@/lib/i18n/format';
import { firstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import { first, resolveErrorCode } from '@/lib/url/searchParams';
import { safeInternalPath } from '@/lib/url/safeInternalPath';

type SearchParams = Promise<{
  step?: string | string[];
  email?: string | string[];
  error?: string | string[];
  next?: string | string[];
  invite?: string | string[];
  /** #2349: when `sendCode` sent the code, in unix seconds — drives the countdown. */
  sent?: string | string[];
}>;

// The set of valid error codes that map to a catalog key.
// An unrecognised ?error= value falls back to 'unknown'.
const KNOWN_ERROR_CODES = new Set([
  'rate_limited',
  // #1347: our own 15-minute bucket vs Supabase's 60-second OTP throttle —
  // two very different waits, so they carry two codes and two messages.
  'rate_limited_minute',
  // #1434: the project-wide mail quota — no mail was sent, so the copy
  // promises nothing about a code being on its way.
  'rate_limited_quota',
  'user_not_found',
  'invite_expired',
  'disposable_email',
  'code_invalid',
  'code_expired',
  'link_expired',
  'unknown',
] as const);

type Params = Promise<{ locale: string }>;

/**
 * #2349: the invitation on the code step, as one line in the band: who invited
 * you (first name), and the round with its Oslo date and tee-off — «Marte har
 * invitert deg», «Lørdagsrunden · lør. 4. okt kl. 09:20». Without a name, the
 * fallback and no initials; without a tee-off, just the round.
 */
async function verifyStepInvite(ctx: InviteLoginContext): Promise<LoginBandInvite> {
  const locale = (await getLocale()) as AppLocale;
  const tBand = await getTranslations('auth.band');
  const inviter = firstName(ctx.inviterName);
  const game = localizeGameName(ctx.gameName, ctx.courseName, locale);
  const teeOff = ctx.teeOffAt ? new Date(ctx.teeOffAt) : null;
  const when =
    teeOff && !Number.isNaN(teeOff.getTime()) ? formatTeeOffParts(teeOff, locale) : null;
  return {
    initials: inviter ? nameInitials(ctx.inviterName) : null,
    title: inviter ? tBand('invitedBy', { name: inviter }) : tBand('invitedFallback'),
    line: when ? tBand('gameLine', { game, date: when.date, time: when.time }) : game,
  };
}

// #1264: noindex — the soft-404 fix. Every `/login?next=…`/`?invite=…`
// variant is otherwise indexable under its own querystring, which is pure
// crawl noise for a page that's never the intended landing target.
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
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
  const next = safeInternalPath(first(params.next)) ?? '';
  const errorCode = resolveErrorCode(first(params.error), KNOWN_ERROR_CODES, 'unknown');
  const errorMessage = errorCode ? t(`errors.${errorCode}`) : undefined;

  // #1169: game-scoped invitasjonsmail lenker hit med ?invite=<token>.
  // Gyldig token → kontekstkort over kodeskjemaet. Alt annet (ugyldig,
  // utløpt, akseptert, game-løs, runde som har startet eller er ferdig — #2212)
  // → null, og siden er nøyaktig som uten param.
  const inviteRaw = first(params.invite) ?? '';
  const invite = isInviteToken(inviteRaw) ? inviteRaw : '';
  const inviteCtx = invite ? await getInviteLoginContext(invite) : null;

  // #2349: the paper card is step 1's. On the code step the invitation is a
  // line in the band instead, and the social proof is not fetched.
  let inviteCard: ReactNode = null;
  if (inviteCtx && step === 'email') {
    const locale = (await getLocale()) as AppLocale;
    const tCard = await getTranslations('invitationCard');
    // #1179: vennlig, forward-pekende frist. Kortet rendres per request, så en
    // relativ nedtelling holder seg fersk. #2266: fristen har tak ved tee-off —
    // invitasjonen gir ikke plass etter at runden har startet (#2212).
    const expiryTier = inviteExpiryTier(
      effectiveInviteDeadline(inviteCtx.expiresAt, inviteCtx.teeOffAt),
    );
    const expiresLine =
      expiryTier === null
        ? null
        : expiryTier.kind === 'today'
          ? tCard('expiresToday')
          : expiryTier.kind === 'tomorrow'
            ? tCard('expiresTomorrow')
            : tCard('expiresInDays', { n: expiryTier.days });
    // #1193: den besøkende er anonym (viewerUserId = null) → helperen gir kun
    // et ekte antall, aldri venne-navn.
    const socialProof = await getGameSocialProof(inviteCtx.gameId, null);
    inviteCard = (
      <InvitationCard
        variant="invite"
        inviterName={inviteCtx.inviterName}
        gameName={localizeGameName(
          inviteCtx.gameName,
          inviteCtx.courseName,
          locale,
        )}
        gameMode={inviteCtx.gameMode as GameMode}
        modeConfig={inviteCtx.modeConfig}
        teeOffAt={inviteCtx.teeOffAt}
        courseName={inviteCtx.courseName}
        teeName={inviteCtx.teeName}
        socialProof={socialProof}
        expiresLine={expiresLine}
      />
    );
  }

  // #1346: veien tilbake til steg 1 fra verify-steget. `email` prefyller
  // feltet, `next` og `invite` overlever turen (invite holder kontekstkortet
  // #1169 i live). URLSearchParams gjør encodingen — aldri streng-konkatenering,
  // e-poster kan inneholde `+`.
  const changeEmailQs = new URLSearchParams();
  if (email) changeEmailQs.set('email', email);
  if (next) changeEmailQs.set('next', next);
  if (invite) changeEmailQs.set('invite', invite);
  const changeEmailHref = `/login${
    changeEmailQs.toString() ? `?${changeEmailQs.toString()}` : ''
  }`;

  const errorBanner = errorMessage ? (
    <div data-testid={`login-error-${errorCode}`}>
      <Banner tone="error">{errorMessage}</Banner>
    </div>
  ) : null;

  // #2349: the code step (with or without an invitation), artboard
  // «Innlogging-forslag». The server works out how long «Send ny kode» still
  // waits from `sent`, so a reload after the minute gives an active button even
  // without JS. One `nowMs` per request.
  if (step === 'verify') {
    // The react-hooks/purity lint rule flags Date.now() as impure regardless
    // of context, but this IS a server component that runs once per request —
    // the snapshot is semantically equivalent to a server-side "now()" call.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const sentAtMs = parseSentAt(first(params.sent), nowMs);
    const sent = sentAtMs === null ? '' : String(sentAtMs / 1000);

    const bandInvite = inviteCtx ? await verifyStepInvite(inviteCtx) : null;

    // The artboard ends with the «Kom ikke mailen?» card. The column fills the
    // screen, so the version footer, and with it the only link to the privacy
    // page on /login, lands just below the fold instead of on the artboard.
    return (
      <AppShell flush>
        <div className="flex min-h-dvh flex-col">
          <LoginBand wordmarkAs="p" invite={bandInvite} />
          <VerifyCodeForm
            email={email}
            next={next}
            invite={invite}
            changeEmailHref={changeEmailHref}
            notice={errorBanner}
            resendWaitSeconds={resendWaitSeconds(sentAtMs, nowMs)}
            sent={sent}
          />
        </div>
      </AppShell>
    );
  }

  // #2266: fra en invitasjon står siden på lin, med ordmerket uten slagord,
  // papirkortet og «Bli med på runden» som på artboardet. Demo-lenka og
  // passkey-knappen hører til den vanlige innloggingen.
  if (inviteCard) {
    return (
      <AppShell bgClassName="bg-[var(--invitation-page-bg)]">
        <div className="-mt-3.5" data-page-bg="invitation">
          <h1 className="m-0 text-center font-serif text-[22px] leading-[normal] font-semibold text-primary">
            Tørny
          </h1>
          <div className="mt-4 mb-4 flex justify-center">
            <LocaleSwitcher />
          </div>
          {inviteCard}
          <section
            aria-labelledby="join-card-title"
            className="-mx-1 mt-4 flex flex-col gap-2.5 rounded-[18px] border border-border bg-surface p-4"
          >
            {errorBanner}
            <h2
              id="join-card-title"
              className="font-serif text-[20px] leading-[normal] font-medium"
            >
              {t('joinCard.title')}
            </h2>
            <SendCodeForm
              defaultEmail={email}
              next={next}
              invite={invite}
              variant="invite"
              hint={t('sendCode.inviteHint')}
            />
          </section>
        </div>
      </AppShell>
    );
  }

  // #2349: step 1 without an invitation has no artboard of its own. It gets
  // the band (wordmark, tagline, language switch) and «Steg 1 av 2» at the top
  // of the card, as the app does (PR #2421); the rest stands as before. As on
  // the code step, the column fills the screen and the version footer (the
  // privacy link) follows below the fold.
  const tCommon = await getTranslations('common');
  return (
    <AppShell flush>
      <div className="flex min-h-dvh flex-col">
        <LoginBand
          wordmarkAs="h1"
          aside={<LocaleSwitcher variant="onStrong" />}
          tagline={tCommon.rich('brandTagline', {
            par: (chunks) => (
              <span className="font-semibold text-accent-on-strong">{chunks}</span>
            ),
          })}
        />
        <div className="mx-4 mt-5">
          <Card>
            <Kicker className="mb-3 leading-[normal]">{t('sendCode.kicker')}</Kicker>
            {errorBanner && <div className="mb-4">{errorBanner}</div>}
            {resolvePasskeyAccess(process.env.NEXT_PUBLIC_PASSKEYS, false)
              .showLoginButton && <PasskeyLoginButton next={next} />}
            <SendCodeForm
              defaultEmail={email}
              next={next}
              invite={invite}
              allowSelfRegistration={selfRegistrationOpen()}
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
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
