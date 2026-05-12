'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

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
  const [pending, setPending] = useState(false);

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
          return;
        }
        setPending(true);
      }}
    >
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Leverer…' : 'Lever ✓'}
      </Button>
    </form>
  );
}
