'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  remindAction: () => void | Promise<void>;
  count: number;
  /** i18n key under admin.game.status for the button label (ICU plural). */
  labelKey: 'remindButton' | 'purreUnconfirmedButton';
  /** i18n key under admin.game.status for the window.confirm text (ICU plural). */
  confirmKey: 'remindConfirm' | 'purreUnconfirmedConfirm';
  /** Stable E2E hook on the button; the page renders two of these, so it is per usage. */
  testId: string;
};

/**
 * To-trinns purre-knapp (#376, utvidet #463). Speiler ApprovePlayerButton-
 * mønstret: bound server-action + window.confirm før send.
 * `count` = antall spillere som vil motta påminnelse.
 * `labelKey` / `confirmKey` velger riktig ICU-streng for konteksten.
 */
export function RemindButton({
  remindAction,
  count,
  labelKey,
  confirmKey,
  testId,
}: Props) {
  const t = useTranslations('admin.game.status');
  const buttonLabel = t(labelKey, { count });
  const confirmMessage = t(confirmKey, { count });

  return (
    <form
      action={remindAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton
        className="w-full"
        pendingLabel={t('sendingBusy')}
        data-testid={testId}
        data-count={count}
      >
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}
