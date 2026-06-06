'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

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
      <SubmitButton
        variant="secondary"
        className="whitespace-nowrap text-sm"
        pendingLabel="Gjenåpner …"
      >
        Åpne for redigering
      </SubmitButton>
    </form>
  );
}
