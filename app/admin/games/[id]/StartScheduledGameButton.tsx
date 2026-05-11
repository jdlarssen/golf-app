'use client';

type Props = {
  // Pre-bound server action; submitting the form is enough to invoke it.
  action: () => void | Promise<void>;
};

/**
 * "Start runden nå" button for scheduled games. Confirms with the admin
 * before submitting because the flip is one-way: once status='active',
 * the roster is frozen, course handicaps are locked, and players can
 * begin entering strokes.
 */
export function StartScheduledGameButton({ action }: Props) {
  return (
    <form action={action}>
      <button
        type="submit"
        onClick={(e) => {
          if (
            !confirm(
              'Starter du runden nå? Spillere kan begynne å taste slag. Redigering låses.',
            )
          ) {
            e.preventDefault();
          }
        }}
        className="w-full min-h-[44px] bg-primary text-white dark:text-bg font-medium rounded-xl px-4 py-3"
      >
        Start runden nå
      </button>
    </form>
  );
}
