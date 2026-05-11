'use client';

type Props = {
  approveAction: () => void | Promise<void>;
  playerName: string;
};

export function ApprovePlayerButton({ approveAction, playerName }: Props) {
  return (
    <form
      action={approveAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Godkjenne scorekortet til ${playerName} på vegne av flighten?`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
      >
        Godkjenn på vegne av flight
      </button>
    </form>
  );
}
