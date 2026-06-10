'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

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
      <SubmitButton className="w-full" pendingLabel="Starter …">
        Start spillet
      </SubmitButton>
    </form>
  );
}
