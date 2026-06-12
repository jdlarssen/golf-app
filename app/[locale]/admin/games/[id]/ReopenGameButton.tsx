'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  reopenAction: () => void | Promise<void>;
};

export function ReopenGameButton({ reopenAction }: Props) {
  const t = useTranslations('admin.game.buttons');
  return (
    <form
      action={reopenAction}
      onSubmit={(event) => {
        const ok = window.confirm(t('reopenGameConfirm'));
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton variant="secondary" className="w-full" pendingLabel={t('reopeningGame')}>
        {t('reopenGame')}
      </SubmitButton>
    </form>
  );
}
