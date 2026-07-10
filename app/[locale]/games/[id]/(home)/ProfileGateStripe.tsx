import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';

/**
 * #1176: soft profile gate on game-home. A fresh invitee now lands on the game
 * before setting name/HCP (the hard gate lives at scoring). This warm stripe
 * tells them what's still missing and links to the profile form, carrying the
 * game as `next` so they come straight back.
 *
 * Rendered only for members whose profile is incomplete, on non-finished games,
 * excluding guests — the call-site decides that; this component is presentation.
 */
export async function ProfileGateStripe({ gameId }: { gameId: string }) {
  const t = await getTranslations('game.home.profileGate');
  return (
    <div className="mb-4">
      <Banner tone="warning" testId="profile-gate-stripe">
        <div className="flex flex-col gap-2">
          <span className="font-serif text-base font-medium">{t('heading')}</span>
          <span className="font-sans font-normal">{t('body')}</span>
          <LinkButton
            href={`/complete-profile?next=/games/${gameId}`}
            variant="primary"
            className="mt-1 self-start"
          >
            {t('cta')}
          </LinkButton>
        </div>
      </Banner>
    </div>
  );
}
