'use client';

import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  /** `addGuestToGame` bundet med gameId — action-en redirecter selv. */
  action: (formData: FormData) => Promise<void>;
  disabled?: boolean;
};

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50';

/**
 * Selve gjeste-feltene (navn + handicap + tee-kategori) — delt mellom
 * roster-varianten under (server-action med redirect) og veiviser-varianten
 * (`GuestPlayerAdd`, som legger gjesten i klient-state). Feltnavnene matcher
 * `parseGuestProfile` i lib/games/createGuestPlayer.
 */
export function GuestFormFields({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations('game.players.guestForm');
  return (
    <>
      <p className="text-xs text-muted">{t('hint')}</p>
      <div>
        <label htmlFor="guest_name" className="sr-only">
          {t('nameLabel')}
        </label>
        <input
          id="guest_name"
          type="text"
          name="guest_name"
          required
          maxLength={80}
          placeholder={t('namePlaceholder')}
          aria-label={t('nameLabel')}
          disabled={disabled}
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="guest_hcp" className="sr-only">
            {t('hcpLabel')}
          </label>
          <input
            id="guest_hcp"
            type="text"
            name="guest_hcp"
            required
            inputMode="decimal"
            placeholder={t('hcpPlaceholder')}
            aria-label={t('hcpLabel')}
            disabled={disabled}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="guest_tee" className="sr-only">
            {t('teeLabel')}
          </label>
          <select
            id="guest_tee"
            name="guest_tee"
            defaultValue="M"
            aria-label={t('teeLabel')}
            disabled={disabled}
            className={inputClass}
          >
            <option value="M">{t('teeMens')}</option>
            <option value="D">{t('teeLadies')}</option>
            <option value="J">{t('teeJuniors')}</option>
          </select>
        </div>
      </div>
    </>
  );
}

/**
 * «Legg til gjest»-skjemaet (#1009) på roster-cockpitene: navn + handicap +
 * tee-kategori, ingen e-post. Deles av creator-flaten (`/games/[id]/spillere`
 * via CreatorRosterClient) og admin-flaten (InviteToGameClient). Server-
 * action-en oppretter skygge-brukeren og roster-raden og redirecter med
 * status-/error-param som sidenes banner-oppslag viser.
 */
export function AddGuestForm({ action, disabled = false }: Props) {
  const t = useTranslations('game.players.guestForm');
  return (
    <div>
      <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {t('sectionHeading')}
      </h3>
      <form action={action} data-testid="add-guest-form" className="space-y-3">
        <GuestFormFields disabled={disabled} />
        <SubmitButton
          disabled={disabled}
          pendingLabel={t('submitPending')}
          className="min-h-[44px] rounded-full bg-primary px-4 py-3 font-medium tracking-tight text-white transition-colors hover:bg-primary-hover disabled:opacity-50 dark:text-bg"
        >
          {t('submitButton')}
        </SubmitButton>
      </form>
    </div>
  );
}
