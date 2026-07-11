import { useTranslations } from 'next-intl';
import { BrandHero } from '@/components/ui/BrandHero';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { PaymentInfo } from '@/components/PaymentInfo';
import { PremiebordCard } from '@/components/PremiebordCard';
import type { GamePrize } from '@/lib/games/prizes';
import type { PublicSignupRoster } from '@/lib/games/getPublicSignupRoster';

/**
 * Offentlig landingsside for et delbart spill (#1022) — det en UINNLOGGET
 * besøkende ser på `/signup/[shortId]` når spillet er offentlig synlig
 * (`isPubliclyViewable`). Ren presentasjons-komponent: all data kommer
 * ferdig formatert som props, så Type C-testen slipper Supabase/route-mocks.
 */
export function PublicLandingView({
  gameName,
  modeLabel,
  courseName,
  teeOff,
  roster,
  joinHref,
  posterHref,
  entryFeeKr,
  paymentLink,
  prizes = [],
}: {
  gameName: string;
  modeLabel: string;
  courseName: string | null;
  teeOff: string | null;
  roster: PublicSignupRoster;
  joinHref: string;
  posterHref: string;
  entryFeeKr: number;
  paymentLink: string | null;
  prizes?: GamePrize[];
}) {
  const t = useTranslations('signup.public');

  return (
    <AppShell>
      <div className="mt-10" data-testid="public-landing">
        <BrandHero className="mb-8" />
        <div className="mb-4 flex justify-center">
          <LocaleSwitcher />
        </div>

        <Card>
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
            {modeLabel}
          </p>
          <h2 className="mt-1 font-serif text-[26px] font-medium leading-snug tracking-[-0.015em] text-text">
            {gameName}
          </h2>

          <dl className="mt-3 space-y-1 font-sans text-sm text-text">
            {courseName && (
              <div className="flex gap-2">
                <dt className="text-muted">{t('courseLabel')}</dt>
                <dd>{courseName}</dd>
              </div>
            )}
            {teeOff && (
              <div className="flex gap-2">
                <dt className="text-muted">{t('teeOffLabel')}</dt>
                <dd>{teeOff}</dd>
              </div>
            )}
          </dl>

          <PaymentInfo
            entryFeeKr={entryFeeKr}
            paymentLink={paymentLink}
            className="mt-4"
          />

          {prizes.length > 0 && (
            <div className="mt-4">
              <PremiebordCard prizes={prizes} variant="compact" />
            </div>
          )}

          {/* #1193: 0 påmeldte → ingenting (negativt sosialt bevis er verre
              enn stillhet). Den anonyme plakaten viser bare et ekte antall +
              offentlig-formaterte navn når noen faktisk har meldt seg på. */}
          {roster.count > 0 && (
            <div className="mt-4" data-testid="public-landing-roster">
              <p className="font-sans text-sm text-muted">
                {t('registeredCount', { count: roster.count })}
              </p>
              <p className="mt-1 font-sans text-sm leading-relaxed text-text">
                {roster.names.join(', ')}
                {roster.overflow > 0 && (
                  <span className="text-muted">
                    {' '}
                    {t('registeredOverflow', { count: roster.overflow })}
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="mt-6">
            <LinkButton href={joinHref} full data-testid="public-landing-join">
              {t('joinButton')}
            </LinkButton>
            <p className="mt-3 text-center font-sans text-xs leading-relaxed text-muted">
              {t('joinHint')}
            </p>
          </div>
        </Card>

        <p className="mt-4 text-center">
          <SmartLink
            href={posterHref}
            className="font-sans text-xs text-muted underline underline-offset-2"
            data-testid="public-landing-poster-link"
          >
            {t('posterLink')}
          </SmartLink>
        </p>
      </div>
    </AppShell>
  );
}
