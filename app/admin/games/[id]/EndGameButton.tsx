'use client';

import { Button } from '@/components/ui/Button';

type Props = {
  // The end action arrives pre-bound with the game id; submitting empty
  // FormData is enough to trigger it.
  endAction: () => void | Promise<void>;
};

export function EndGameButton({ endAction }: Props) {
  return (
    <form
      action={endAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          'Er du sikker? Alle vil se leaderboard etterpå.',
        );
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <Button type="submit" className="w-full">
        Avslutt spillet
      </Button>
    </form>
  );
}
