'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  remindAction: () => void | Promise<void>;
  count: number;
  /** Valgfri knapp-tekst. Default: «Send påminnelse til N spiller(e)». */
  label?: string;
  /** Valgfri bekreftelsestekst til window.confirm. */
  confirmText?: string;
};

/**
 * To-trinns purre-knapp (#376, utvidet #463). Speiler ApprovePlayerButton-
 * mønstret: bound server-action + window.confirm før send.
 * `count` = antall spillere som vil motta påminnelse.
 * `label` / `confirmText` overstyres for andre kontekster (f.eks. ubekreftet).
 */
export function RemindButton({ remindAction, count, label, confirmText }: Props) {
  const buttonLabel =
    label ??
    (count === 1
      ? 'Send påminnelse til 1 spiller'
      : `Send påminnelse til ${count} spillere`);
  const confirmMessage =
    confirmText ??
    (count === 1
      ? 'Sende leverings-påminnelse til 1 spiller?'
      : `Sende leverings-påminnelse til ${count} spillere?`);

  return (
    <form
      action={remindAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="w-full" pendingLabel="Sender …">
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}
