'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';

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
            <SubmitButton className="w-full" pendingLabel="Godkjenner …">
              Godkjenn ✓
            </SubmitButton>
          </form>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowReject(true)}
            className="w-full"
          >
            Avvis
          </Button>
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
                  `Avvise ${playerName} uten begrunnelse? Skriv gjerne en kort grunn først.`,
                )
              ) {
                event.preventDefault();
              }
            }
          }}
          className="space-y-2"
        >
          <input type="hidden" name="player_user_id" value={playerUserId} />
          <label className="block text-xs text-muted">
            Grunn til avvisning (kort)
          </label>
          <textarea
            name="reason"
            rows={2}
            maxLength={500}
            placeholder="F.eks. «Hull 7 var 5 slag, ikke 4.»"
            className="w-full rounded-xl border border-border bg-surface text-text px-3 py-2 text-sm placeholder-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowReject(false)}
              className="w-full"
            >
              Avbryt
            </Button>
            <SubmitButton variant="danger" className="w-full" pendingLabel="Avviser …">
              Send avvisning
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
