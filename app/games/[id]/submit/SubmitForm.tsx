'use client';

import { useState } from 'react';

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
      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-wait text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base"
      >
        {pending ? 'Leverer…' : 'Lever ✓'}
      </button>
    </form>
  );
}
