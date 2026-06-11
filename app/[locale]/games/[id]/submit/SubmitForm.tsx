'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

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
  const t = useTranslations('game.submit');
  return (
    <form
      action={submitAction}
      onSubmit={(event) => {
        const base = t('confirmBase');
        const msg =
          missingHoles > 0
            ? `${base}\n\n${t('confirmMissing', { count: missingHoles })}`
            : base;
        if (!window.confirm(msg)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="w-full" pendingLabel={t('submitPending')}>
        {t('submitButton')}
      </SubmitButton>
    </form>
  );
}
