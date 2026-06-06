'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  remindAction: () => void | Promise<void>;
  count: number;
};

/**
 * To-trinns purre-knapp (#376). Speiler ApprovePlayerButton-mønstret: bound
 * server-action + window.confirm før send. `count` = antall ferdige-men-ikke-
 * leverte spillere som vil få påminnelse.
 */
export function RemindButton({ remindAction, count }: Props) {
  const label =
    count === 1
      ? 'Send påminnelse til 1 spiller'
      : `Send påminnelse til ${count} spillere`;
  const confirmText =
    count === 1
      ? 'Sende leverings-påminnelse til 1 spiller?'
      : `Sende leverings-påminnelse til ${count} spillere?`;

  return (
    <form
      action={remindAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="w-full" pendingLabel="Sender …">
        {label}
      </SubmitButton>
    </form>
  );
}
