'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('game.approve');
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="space-y-3">
      {!showReject ? (
        <div className="grid grid-cols-2 gap-2">
          <form action={approveAction}>
            <SubmitButton
              data-testid="approve-scorecard"
              className="w-full"
              pendingLabel={t('approvePending')}
            >
              {t('approveButton')}
            </SubmitButton>
          </form>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowReject(true)}
            className="w-full"
          >
            {t('rejectButton')}
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
                  t('rejectWithoutReasonConfirm', { name: playerName }),
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
            {t('rejectReasonLabel')}
          </label>
          <textarea
            name="reason"
            rows={2}
            maxLength={500}
            placeholder={t('rejectReasonPlaceholder')}
            className="w-full rounded-xl border border-border bg-surface text-text px-3 py-2 text-sm placeholder-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowReject(false)}
              className="w-full"
            >
              {t('cancelButton')}
            </Button>
            <SubmitButton variant="danger" className="w-full" pendingLabel={t('rejectPending')}>
              {t('sendRejection')}
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
