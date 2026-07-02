'use client';

/**
 * «Legg til gjest» i veiviserens spillersteg (#1009). Skygge-brukeren
 * opprettes umiddelbart via `createGuestForWizard`; roster-raden skrives først
 * ved publish (createGameInternal ruter gjeste-rader via service-role).
 *
 * VIKTIG form-kontekst: hele wizard-en er ETT `<form>` (GameWizard), så denne
 * komponenten kan ikke rendre et nested skjema — og feltene kan ikke bære
 * `name`/`required`-attributter (de ville blitt med i publish-POST-en og
 * tomme `required`-felter ville blokkert submit). Derfor kontrollerte felter
 * + en `type="button"`-knapp som bygger FormData selv.
 */

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { createGuestForWizard } from '@/app/[locale]/games/guestPlayerActions';
import { Disclosure } from '@/components/ui/Disclosure';
import type { GameFormState } from '../useGameFormState';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50';

export function GuestPlayerAdd({
  state,
  disabled = false,
}: {
  state: GameFormState;
  disabled?: boolean;
}) {
  const t = useTranslations('game.players');
  const [name, setName] = useState('');
  const [hcp, setHcp] = useState('');
  const [tee, setTee] = useState<'M' | 'D' | 'J'>('M');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    setError(null);
    const fd = new FormData();
    fd.set('guest_name', name);
    fd.set('guest_hcp', hcp);
    fd.set('guest_tee', tee);
    startTransition(async () => {
      const res = await createGuestForWizard(fd);
      if (res.ok) {
        state.addGuestPlayer(res.player, res.tee);
        setName('');
        setHcp('');
        setTee('M');
      } else {
        setError(res.error);
      }
    });
  }

  const errorKey = `errorMessages.${error}` as Parameters<typeof t>[0];
  const errorText =
    error === null
      ? null
      : t.has(errorKey)
        ? t(errorKey)
        : t('errorMessages.guest_auth_create_failed');

  return (
    <Disclosure title={t('guestForm.sectionHeading')} className="mt-1">
      <div data-testid="wizard-guest-add" className="space-y-3">
        <p className="text-xs text-muted">{t('guestForm.hint')}</p>
        <div>
          <label htmlFor="wizard_guest_name" className="sr-only">
            {t('guestForm.nameLabel')}
          </label>
          <input
            id="wizard_guest_name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={t('guestForm.namePlaceholder')}
            aria-label={t('guestForm.nameLabel')}
            disabled={disabled || isPending}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="wizard_guest_hcp" className="sr-only">
              {t('guestForm.hcpLabel')}
            </label>
            <input
              id="wizard_guest_hcp"
              type="text"
              value={hcp}
              onChange={(e) => setHcp(e.target.value)}
              inputMode="decimal"
              placeholder={t('guestForm.hcpPlaceholder')}
              aria-label={t('guestForm.hcpLabel')}
              disabled={disabled || isPending}
              autoComplete="off"
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="wizard_guest_tee" className="sr-only">
              {t('guestForm.teeLabel')}
            </label>
            <select
              id="wizard_guest_tee"
              value={tee}
              onChange={(e) => setTee(e.target.value as 'M' | 'D' | 'J')}
              aria-label={t('guestForm.teeLabel')}
              disabled={disabled || isPending}
              className={inputClass}
            >
              <option value="M">{t('guestForm.teeMens')}</option>
              <option value="D">{t('guestForm.teeLadies')}</option>
              <option value="J">{t('guestForm.teeJuniors')}</option>
            </select>
          </div>
        </div>
        {errorText && (
          <p role="alert" className="text-sm text-danger">
            {errorText}
          </p>
        )}
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || isPending || name.trim() === '' || hcp.trim() === ''}
          className="min-h-[44px] rounded-full bg-primary px-4 py-2.5 text-sm font-medium tracking-tight text-white transition-colors hover:bg-primary-hover disabled:opacity-50 dark:text-bg"
        >
          {isPending ? t('guestForm.submitPending') : t('guestForm.submitButton')}
        </button>
      </div>
    </Disclosure>
  );
}
