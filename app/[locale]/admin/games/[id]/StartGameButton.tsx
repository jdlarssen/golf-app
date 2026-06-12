'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  // The start action arrives pre-bound with the game id; submitting empty
  // FormData is enough to trigger it.
  startAction: () => void | Promise<void>;
  gameName: string;
};

export function StartGameButton({ startAction, gameName }: Props) {
  const t = useTranslations('admin.game.buttons');
  return (
    <form
      action={startAction}
      onSubmit={(event) => {
        const ok = window.confirm(t('startGameConfirm', { name: gameName }));
        if (!ok) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton className="w-full" pendingLabel={t('startingGame')}>
        {t('startGame')}
      </SubmitButton>
    </form>
  );
}
