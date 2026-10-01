import { useTranslations } from 'next-intl';
import { BrandHero } from '@/components/ui/BrandHero';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { AppShell } from '@/components/ui/AppShell';
import { LinkButton } from '@/components/ui/Button';
import { InvitationCard } from '@/components/games/InvitationCard';
import { SmartLink } from '@/components/ui/SmartLink';
import { PaymentInfo } from '@/components/PaymentInfo';
import { PremiebordCard } from '@/components/PremiebordCard';
import type { GamePrize } from '@/lib/games/prizes';
import type { PublicSignupRoster } from '@/lib/games/getPublicSignupRoster';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Offentlig landingsside for et delbart spill (#1022) — det en UINNLOGGET
 * besøkende ser på `/signup/[shortId]` når spillet er offentlig synlig
 * (`isPubliclyViewable`). Ren presentasjons-komponent: all data kommer
 * ferdig formatert som props, så Type C-testen slipper Supabase/route-mocks.
 *
 * #2266: spillet står på invitasjonskortet (`variant="public"`). Betaling,
 * premier, navnene og «Bli med» ligger inne i papiret; antallet står på
 * kortet, så egen «{n} påmeldte»-linje trengs ikke.
 */
export function PublicLandingView({
  gameName,
  gameMode,
  modeConfig,
  courseName,
  teeName,
  teeOffAt,
  roster,
  joinHref,
  posterHref,
  entryFeeKr,
  paymentLink,
  potKr,
  prizes = [],
}: {
  gameName: string;
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  courseName: string | null;
  teeName: string | null;
  teeOffAt: string | null;
  roster: PublicSignupRoster;
  joinHref: string;
  posterHref: string;
  entryFeeKr: number;
  paymentLink: string | null;
  /** #1175: aggregert innbetalt pott (kr) → ankerlinjen i PaymentInfo. */
  potKr?: number;
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

        <InvitationCard
          variant="public"
          gameName={gameName}
          gameMode={gameMode}
          modeConfig={modeConfig}
          teeOffAt={teeOffAt}
          courseName={courseName}
          teeName={teeName}
          socialProof={{
            joinedCount: roster.count,
            knownFriendNames: [],
            knownFriendOverflow: 0,
          }}
          expiresLine={null}
        >
          <div className="text-left">
            <PaymentInfo
              entryFeeKr={entryFeeKr}
              paymentLink={paymentLink}
              potKr={potKr}
            />

            {prizes.length > 0 && (
              <div className="mt-4">
                <PremiebordCard prizes={prizes} variant="compact" />
              </div>
            )}
          </div>

          {/* #1193: 0 påmeldte → ingenting (negativt sosialt bevis er verre
              enn stillhet). Den anonyme siden viser bare offentlig-formaterte
              navn når noen faktisk har meldt seg på; antallet står på kortet. */}
          {roster.count > 0 && (
            <p
              data-testid="public-landing-roster"
              className="mt-2 font-sans text-sm leading-relaxed text-text"
            >
              {roster.names.join(', ')}
              {roster.overflow > 0 && (
                <span className="text-muted">
                  {' '}
                  {t('registeredOverflow', { count: roster.overflow })}
                </span>
              )}
            </p>
          )}

          <div className="mt-4">
            <LinkButton href={joinHref} full data-testid="public-landing-join">
              {t('joinButton')}
            </LinkButton>
            <p className="mt-3 text-center font-sans text-xs leading-relaxed text-muted">
              {t('joinHint')}
            </p>
          </div>
        </InvitationCard>

        <p className="mt-4 text-center">
          <SmartLink
            href={posterHref}
            className="tap-extend font-sans text-xs text-muted underline underline-offset-2 [--tap-extend:-14px_-8px]"
            data-testid="public-landing-poster-link"
          >
            {t('posterLink')}
          </SmartLink>
        </p>
      </div>
    </AppShell>
  );
}
