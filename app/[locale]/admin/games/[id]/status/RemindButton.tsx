'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  remindAction: () => void | Promise<void>;
  count: number;
  /** i18n key under admin.game.status for the button label (ICU plural). */
  labelKey: 'remindButton' | 'purreUnconfirmedButton' | 'remindRowButton' | 'purreRowButton';
  /** i18n key under admin.game.status for the window.confirm text (ICU plural). */
  confirmKey: 'remindConfirm' | 'purreUnconfirmedConfirm' | 'remindHoleConfirm' | 'purreRowConfirm';
  /**
   * Extra values for the label and the confirm text (#2268: names and holes on
   * a gap row; #2483: the first name in «Purr Kari»).
   */
  confirmValues?: Record<string, string | number>;
  /** Stable E2E hook on the button; the page renders two of these, so it is per usage. */
  testId: string;
  /**
   * `block` (default) is the full-width pill the status page draws. `row` is
   * the 44 px outline button at the end of a list row on the organiser's desk
   * (#2268), sized to its label.
   */
  variant?: 'block' | 'row';
  /**
   * `warning` draws the row button in the amber of a row that waits
   * (#2483, «Purr Kari» on «Klar for i morgen?»). Only with `row`.
   */
  tone?: 'warning';
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
  variant = 'block',
  confirmValues,
  tone,
}: Props) {
  const t = useTranslations('admin.game.status');
  const buttonLabel = t(labelKey, { count, ...confirmValues });
  const confirmMessage = t(confirmKey, { count, ...confirmValues });

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
        {...(variant === 'row'
          ? {
              size: 'compact' as const,
              variant: 'outline' as const,
              className:
                tone === 'warning'
                  ? 'px-[14px]! border-warning-text! text-warning-text! hover:bg-warning-soft!'
                  : 'px-[14px]!',
            }
          : { className: 'w-full' })}
        pendingLabel={t('sendingBusy')}
        data-testid={testId}
        data-count={count}
      >
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}
