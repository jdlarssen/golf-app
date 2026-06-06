'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  reopenAction: () => void | Promise<void>;
};

export function ReopenGameButton({ reopenAction }: Props) {
  return (
    <form
      action={reopenAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          'Gjenåpne spillet? Leaderboard skjules igjen og spillerne kan redigere scorekortene sine.',
        );
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton variant="secondary" className="w-full" pendingLabel="Gjenåpner …">
        Gjenåpne spillet
      </SubmitButton>
    </form>
  );
}
