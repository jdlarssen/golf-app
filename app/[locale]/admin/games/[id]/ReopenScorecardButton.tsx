'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  reopenAction: () => void | Promise<void>;
  playerName: string;
};

export function ReopenScorecardButton({ reopenAction, playerName }: Props) {
  const t = useTranslations('admin.game.buttons');
  return (
    <form
      action={reopenAction}
      onSubmit={(event) => {
        if (!window.confirm(t('reopenScorecardConfirm', { name: playerName }))) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton
        variant="secondary"
        className="whitespace-nowrap text-sm"
        pendingLabel={t('reopeningScorecardBusy')}
      >
        {t('reopenScorecard')}
      </SubmitButton>
    </form>
  );
}
