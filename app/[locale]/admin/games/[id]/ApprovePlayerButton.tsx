'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  approveAction: () => void | Promise<void>;
  playerName: string;
};

export function ApprovePlayerButton({ approveAction, playerName }: Props) {
  const t = useTranslations('admin.game.buttons');
  return (
    <form
      action={approveAction}
      onSubmit={(event) => {
        if (!window.confirm(t('approveConfirm', { name: playerName }))) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="whitespace-nowrap text-sm" pendingLabel={t('approvingBusy')}>
        {t('approveOnBehalf')}
      </SubmitButton>
    </form>
  );
}
