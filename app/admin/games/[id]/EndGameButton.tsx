'use client';

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
      <button
        type="submit"
        className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
      >
        Avslutt spillet
      </button>
    </form>
  );
}
