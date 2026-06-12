'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

export type PlayerOption = {
  user_id: string;
  display_name: string;
};

type Props = {
  gameId: string;
  ldCount: number;
  ctpCount: number;
  players: PlayerOption[];
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  /** Where «Avbryt» links back to. Defaults to the admin game-detail page;
   *  the creator finish flow (#427) passes the player game-home instead. */
  cancelHref?: string;
};

export function SideWinnersForm({
  gameId,
  ldCount,
  ctpCount,
  players,
  action,
  error,
  cancelHref,
}: Props) {
  const t = useTranslations('admin.game.sideWinners');

  return (
    <form action={action} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {t('validationError')}
        </div>
      )}

      {ldCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('longestDriveLabel')}
          </legend>
          {Array.from({ length: ldCount }, (_, i) => i + 1).map((pos) => (
            <label key={`ld-${pos}`} className="block">
              <span className="font-serif text-base text-text">
                {t('longestDriveSlot', { pos })}
              </span>
              <select
                name={`ld_winner_${pos}`}
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2"
              >
                <option value="" disabled>
                  {t('selectWinner')}
                </option>
                {players.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
                <option value="none">{t('noQualified')}</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {ctpCount > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('closestToPinLabel')}
          </legend>
          {Array.from({ length: ctpCount }, (_, i) => i + 1).map((pos) => (
            <label key={`ctp-${pos}`} className="block">
              <span className="font-serif text-base text-text">
                {t('closestToPinSlot', { pos })}
              </span>
              <select
                name={`ctp_winner_${pos}`}
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2"
              >
                <option value="" disabled>
                  {t('selectWinner')}
                </option>
                {players.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
                <option value="none">{t('noQualified')}</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex gap-3">
        <SubmitButton variant="primary" pendingLabel={t('submittingBusy')}>
          {t('submitButton')}
        </SubmitButton>
        <Link
          href={cancelHref ?? `/admin/games/${gameId}`}
          className="self-center text-sm text-muted underline"
        >
          {t('cancel')}
        </Link>
      </div>
    </form>
  );
}
