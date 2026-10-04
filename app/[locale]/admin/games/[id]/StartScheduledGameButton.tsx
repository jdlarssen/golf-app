'use client';

type Props = {
  // Pre-bound server action; submitting the form is enough to invoke it.
  startAction: () => void | Promise<void>;
  // #2202: the texts arrive resolved from the server. The game page has no
  // `admin` namespace on the client (#2227), so the button cannot read
  // `admin.game.buttons` itself there.
  label: string;
  confirmText: string;
};

/**
 * "Start runden nå" button for scheduled games. Confirms with the organiser
 * before submitting because the flip is one-way: once status='active',
 * the roster is frozen, course handicaps are locked, and players can
 * begin entering strokes.
 */
export function StartScheduledGameButton({ startAction, label, confirmText }: Props) {
  return (
    <form
      action={startAction}
      onSubmit={(e) => {
        // onSubmit is more robust than onClick — catches keyboard Enter
        // and programmatic submit.
        if (!confirm(confirmText)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        data-testid="start-scheduled-game"
        className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-white dark:text-bg font-medium rounded-xl px-4 py-3 transition-colors"
      >
        {label}
      </button>
    </form>
  );
}
