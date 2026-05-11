'use client';

import { useState } from 'react';

type Props = {
  playerUserId: string;
  playerName: string;
  approveAction: () => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
};

/**
 * Renders the «Godkjenn» and «Avvis» buttons. «Avvis» expands into a small
 * textarea + confirm flow so the reviewer must give a reason before rejecting.
 */
export function ReviewActions({
  playerUserId,
  playerName,
  approveAction,
  rejectAction,
}: Props) {
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="space-y-3">
      {!showReject ? (
        <div className="grid grid-cols-2 gap-2">
          <form action={approveAction}>
            <button
              type="submit"
              className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
            >
              Godkjenn ✓
            </button>
          </form>
          <button
            type="button"
            onClick={() => setShowReject(true)}
            className="w-full min-h-[44px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            Avvis
          </button>
        </div>
      ) : (
        <form
          action={rejectAction}
          onSubmit={(event) => {
            const fd = new FormData(event.currentTarget);
            const reason = String(fd.get('reason') ?? '').trim();
            if (!reason) {
              if (
                !window.confirm(
                  `Avvise ${playerName} uten å gi en grunn? Du kan også skrive en kort begrunnelse først.`,
                )
              ) {
                event.preventDefault();
              }
            }
          }}
          className="space-y-2"
        >
          <input type="hidden" name="player_user_id" value={playerUserId} />
          <label className="block text-xs text-zinc-500">
            Grunn til avvisning (kort)
          </label>
          <textarea
            name="reason"
            rows={2}
            maxLength={500}
            placeholder="F.eks. «Hull 7 var 5 slag, ikke 4.»"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm bg-white dark:bg-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowReject(false)}
              className="w-full min-h-[44px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="w-full min-h-[44px] bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm"
            >
              Send avvisning
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
