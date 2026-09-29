import { getTranslations } from 'next-intl/server';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { submitUndoWithdraw } from '../trekk-fra/actions';

/**
 * WD-banneret på spill-hjem (#386): står i stedet for scorekort-CTA-en når
 * spilleren er trukket.
 *
 * #2358: angre-skjemaet vises bare til den som trakk seg selv. Et trekk
 * arrangøren eller en admin satte, er deres å angre — kjernen nekter uansett
 * (`withdrawn_by_other`), og en knapp som alltid feiler er en blindvei.
 * Spilleren får i stedet vite hvem som trakk dem, og hvem de kan snakke med.
 */
export async function WithdrawnBanner({
  gameId,
  selfWithdrawn,
}: {
  gameId: string;
  /** `game_players.withdrawn_by_user_id` er spilleren selv. */
  selfWithdrawn: boolean;
}) {
  const t = await getTranslations('game.home');
  return (
    <div
      className="rounded-2xl border border-danger/40 bg-danger/5 px-4 py-4"
      data-testid="withdrawn-banner"
    >
      <p className="mb-3 font-sans text-[14px] font-medium text-text">
        {selfWithdrawn ? t('withdrawnHeading') : t('withdrawnByOrganiserHeading')}
      </p>
      <p
        className={`font-sans text-[12px] leading-relaxed text-muted ${selfWithdrawn ? 'mb-4' : ''}`}
      >
        {selfWithdrawn ? t('withdrawnBody') : t('withdrawnByOrganiserBody')}
      </p>
      {selfWithdrawn && (
        <form action={submitUndoWithdraw}>
          <input type="hidden" name="gameId" value={gameId} />
          <SubmitButton
            className="w-full"
            data-testid="undo-withdraw-submit"
            pendingLabel={t('undoWithdrawPending')}
          >
            {t('undoWithdraw')}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
