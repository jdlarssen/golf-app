'use client';

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
      <button
        type="submit"
        className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
      >
        Start spillet
      </button>
    </form>
  );
}
