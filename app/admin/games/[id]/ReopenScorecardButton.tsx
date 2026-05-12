'use client';

import { Button } from '@/components/ui/Button';

type Props = {
  reopenAction: () => void | Promise<void>;
  playerName: string;
};

export function ReopenScorecardButton({ reopenAction, playerName }: Props) {
  return (
    <form
      action={reopenAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Åpne scorekortet til ${playerName} for redigering? Eventuell godkjenning fjernes, og spilleren må levere på nytt.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <Button
        type="submit"
        variant="secondary"
        className="whitespace-nowrap text-sm"
      >
        Åpne for redigering
      </Button>
    </form>
  );
}
