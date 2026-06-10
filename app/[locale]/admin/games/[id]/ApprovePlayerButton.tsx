'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  approveAction: () => void | Promise<void>;
  playerName: string;
};

export function ApprovePlayerButton({ approveAction, playerName }: Props) {
  return (
    <form
      action={approveAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Godkjenne scorekortet til ${playerName} på vegne av flighten?`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="whitespace-nowrap text-sm" pendingLabel="Godkjenner …">
        Godkjenn på vegne av flight
      </SubmitButton>
    </form>
  );
}
