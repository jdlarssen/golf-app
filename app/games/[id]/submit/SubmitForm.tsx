'use client';

import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  submitAction: () => void | Promise<void>;
  missingHoles: number;
};

/**
 * Wraps the final «Lever ✓» button in a confirm() guard. If the player has
 * unplayed holes, the confirm message warns that those will be recorded as
 * not played.
 */
export function SubmitForm({ submitAction, missingHoles }: Props) {
  return (
    <form
      action={submitAction}
      onSubmit={(event) => {
        const base = 'Levere scorekortet? Dette kan ikke angres uten admin.';
        const msg =
          missingHoles > 0
            ? `${base}\n\n${missingHoles} hull mangler og blir lagret som ikke spilt.`
            : base;
        if (!window.confirm(msg)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="w-full" pendingLabel="Leverer …">
        Lever ✓
      </SubmitButton>
    </form>
  );
}
