'use client';

import { Button } from '@/components/ui/Button';

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
      <Button type="submit" variant="secondary" className="w-full">
        Gjenåpne spillet
      </Button>
    </form>
  );
}
