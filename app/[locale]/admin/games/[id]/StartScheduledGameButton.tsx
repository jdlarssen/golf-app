'use client';

type Props = {
  // Pre-bound server action; submitting the form is enough to invoke it.
  startAction: () => void | Promise<void>;
};

/**
 * "Start runden nå" button for scheduled games. Confirms with the admin
 * before submitting because the flip is one-way: once status='active',
 * the roster is frozen, course handicaps are locked, and players can
 * begin entering strokes.
 */
export function StartScheduledGameButton({ startAction }: Props) {
  return (
    <form
      action={startAction}
      onSubmit={(e) => {
        // onSubmit is more robust than onClick — catches keyboard Enter
        // and programmatic submit, matching the sibling StartGameButton.
        if (
          !confirm(
            'Starter du runden nå? Spillere kan begynne å taste slag. Redigering låses.',
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-white dark:text-bg font-medium rounded-xl px-4 py-3 transition-colors"
      >
        Start runden nå
      </button>
    </form>
  );
}
