'use client';

import { Button } from '@/components/ui/Button';

type Props = {
  // The start action arrives pre-bound with the game id; submitting empty
  // FormData is enough to trigger it.
  startAction: () => void | Promise<void>;
  gameName: string;
};

export function StartGameButton({ startAction, gameName }: Props) {
  return (
    <form
      action={startAction}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Start spillet «${gameName}»? Course handicap blir låst for hver spiller når spillet starter.`,
        );
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <Button type="submit" className="w-full">
        Start spillet
      </Button>
    </form>
  );
}
