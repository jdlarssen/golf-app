'use client';

import { Button } from '@/components/ui/Button';

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
      <Button type="submit" className="whitespace-nowrap text-sm">
        Godkjenn på vegne av flight
      </Button>
    </form>
  );
}
