import { getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import type { EndGameReadiness } from '@/lib/games/organizerDesk';
import { EndGameButton } from '../EndGameButton';

/**
 * «Avslutt spillet», fixed at the bottom of the desk in all three tabs
 * (#2268). It sticks just above the bottom nav: the same `5rem + safe area`
 * reserve `AdminShell` keeps under its content. Opaque, so content scrolling
 * under it never shows through.
 *
 *  - `ready`: today's finish button (confirm and side-tournament wizard as
 *    before), with the «all handed in» line over it.
 *  - `only_missing` / `blocked`: a grey, disabled button and what it waits
 *    for. Only when missing deliveries are the sole blocker does «Avslutt
 *    likevel →» appear, to today's pages.
 *  - `no_active` (everyone withdrew): no bar.
 */
export async function EndGameBar({
  readiness,
  total,
  requirePeerApproval,
  gameId,
  endAction,
  sideTournament,
  forceEndHref,
}: {
  readiness: EndGameReadiness;
  total: number;
  requirePeerApproval: boolean;
  gameId: string;
  endAction: () => void | Promise<void>;
  sideTournament: { enabled: boolean; ldCount: number; ctpCount: number };
  forceEndHref: string;
}) {
  if (readiness === 'no_active') return null;
  const t = await getTranslations('admin.game.pult');
  const tCta = await getTranslations('admin.game.cta');
  const tButtons = await getTranslations('admin.game.buttons');

  return (
    <div
      data-testid="pult-end-bar"
      data-readiness={readiness}
      className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-20 -mx-5 mt-6 flex flex-col gap-1.5 border-t border-border bg-admin-bg px-4 pt-3 pb-5 leading-[normal]"
    >
      {readiness === 'ready' ? (
        <>
          <p className="text-[12px] text-muted">
            {tCta('allReadyBody', {
              andApproved: requirePeerApproval ? tCta('allReadyAndApproved') : '',
            })}
          </p>
          <EndGameButton
            endAction={endAction}
            gameId={gameId}
            sideTournament={sideTournament}
            size="bar"
          />
        </>
      ) : (
        <>
          <button
            type="button"
            disabled
            aria-describedby="pult-end-hint"
            className="h-[52px] w-full rounded-full bg-border text-base font-semibold text-disabled-fg"
          >
            {tButtons('endGame')}
          </button>
          <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
            <span id="pult-end-hint">
              {requirePeerApproval ? t('endHintApproved', { total }) : t('endHint', { total })}
            </span>
            {readiness === 'only_missing' && (
              <SmartLink
                href={forceEndHref}
                data-testid="pult-force-end"
                className="flex min-h-11 shrink-0 items-center font-semibold text-primary"
              >
                {tCta('forceEndButton')}
              </SmartLink>
            )}
          </div>
        </>
      )}
    </div>
  );
}
