'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  approveAction: () => void | Promise<void>;
};

/**
 * #1067: approval is not destructive per the house taxonomy (destructive =
 * dedicated /slett page; this action is reversible via "Åpne igjen" on the
 * scorecard). The confirm dialog cost every approval an extra tap for no
 * safety benefit — dropped for both surfaces that render this button
 * (Sekretariatet + `/games/[id]/spillere`), since both are the same
 * non-destructive action under the same taxonomy. `playerName` was only used
 * to interpolate the confirm copy, so it's dropped along with the dialog.
 */
export function ApprovePlayerButton({ approveAction }: Props) {
  const t = useTranslations('admin.game.buttons');
  return (
    <form action={approveAction}>
      <SubmitButton className="whitespace-nowrap text-sm" pendingLabel={t('approvingBusy')}>
        {t('approveOnBehalf')}
      </SubmitButton>
    </form>
  );
}
