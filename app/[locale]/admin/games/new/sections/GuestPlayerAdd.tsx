'use client';

/**
 * «Legg til gjest» i spillersteget (#1009). Skygge-brukeren opprettes
 * umiddelbart via `createGuestForWizard`; roster-raden skrives først ved
 * publish (createGameInternal ruter gjeste-rader via service-role).
 *
 * VIKTIG form-kontekst: hele veiviseren og GameForm er ETT `<form>`, så denne
 * komponenten kan ikke rendre et nested skjema — og feltene kan ikke bære
 * `name`/`required`-attributter (de ville blitt med i publish-POST-en og
 * tomme `required`-felter ville blokkert submit). Derfor kontrollerte felter
 * + en `type="button"`-knapp som bygger FormData selv. Uten `name` er det også
 * trygt å fjerne feltene fra DOM-en når skjemaet lukkes.
 *
 * #2321: two pieces. `GuestPlayerFields` is the card the step 4 artboards draw
 * (LEGG TIL GJEST on `Nyttspill-4-tee-gjest`); the wizard opens it from the
 * «+ Gjest» card. `GuestPlayerAdd` is GameForm's «Legg til gjest» row that
 * opens the same card under itself.
 */

import { useId, useState, useTransition, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { createGuestForWizard } from '@/app/[locale]/games/guestPlayerActions';
import { Button } from '@/components/ui/Button';
import { FormSectionText } from '@/components/ui/FormSection';
import { Input } from '@/components/ui/Input';
import { SegmentedField } from '@/components/ui/SegmentedField';
import { clampGenderToTee } from '@/lib/games/clampGenderToTee';
import type { GameFormState } from '../useGameFormState';

type Tee = 'M' | 'D' | 'J';

export function GuestPlayerFields({
  state,
  disabled = false,
  onAdded,
  id,
}: {
  state: GameFormState;
  disabled?: boolean;
  /** Called with the guest's id after the guest is added and selected (the opener closes the form). */
  onAdded?: (guestId: string) => void;
  /** The card's id, for the opener's `aria-controls`. */
  id?: string;
}) {
  const t = useTranslations('game.players');
  const tTeams = useTranslations('wizard.sections.teams');
  const fieldId = useId();
  const [name, setName] = useState('');
  const [hcp, setHcp] = useState('');
  const [tee, setTee] = useState<Tee>('M');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // #2437: clamp on read, not in state, so the card shows and sends a category
  // the current tee rates, also when the tee has no men's rating or is changed
  // while the card is open (GameForm has both on one page). A tee changed
  // while the request runs is caught by the clamp in `addGuestPlayer`.
  const avail = state.teeGenderAvailability;
  const teeShown = clampGenderToTee(tee, avail);

  const blocked = disabled || isPending;
  const canAdd = !blocked && name.trim() !== '' && hcp.trim() !== '';

  function handleAdd() {
    if (!canAdd) return;
    setError(null);
    const fd = new FormData();
    fd.set('guest_name', name);
    fd.set('guest_hcp', hcp);
    fd.set('guest_tee', teeShown);
    startTransition(async () => {
      const res = await createGuestForWizard(fd);
      if (res.ok) {
        state.addGuestPlayer(res.player, res.tee);
        setName('');
        setHcp('');
        setTee('M');
        onAdded?.(res.player.id);
      } else {
        setError(res.error);
      }
    });
  }

  // The whole wizard is one form: Enter in a field must add the guest, not
  // submit the form.
  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleAdd();
  }

  const errorKey = `errorMessages.${error}` as Parameters<typeof t>[0];
  const errorText =
    error === null
      ? null
      : t.has(errorKey)
        ? t(errorKey)
        : t('errorMessages.guest_auth_create_failed');

  return (
    <div
      id={id}
      data-testid="wizard-guest-add"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5"
    >
      <FormSectionText>{t('guestForm.hint')}</FormSectionText>
      <Input
        variant="card"
        id={`${fieldId}-name`}
        label={t('guestForm.nameLabel')}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onEnter}
        maxLength={80}
        placeholder={t('guestForm.namePlaceholder')}
        disabled={blocked}
        autoComplete="off"
      />
      <Input
        variant="card"
        id={`${fieldId}-hcp`}
        label={t('guestForm.hcpLabel')}
        type="text"
        value={hcp}
        onChange={(e) => setHcp(e.target.value)}
        onKeyDown={onEnter}
        inputMode="decimal"
        placeholder={t('guestForm.hcpPlaceholder')}
        disabled={blocked}
        autoComplete="off"
      />
      <SegmentedField
        variant="pills"
        legend={t('guestForm.teeLabel')}
        options={(
          [
            ['M', t('guestForm.teeMens')],
            ['D', t('guestForm.teeLadies')],
            ['J', t('guestForm.teeJuniors')],
          ] as const
        ).map(([g, label]) => ({
          value: g,
          label,
          disabled: !avail[g],
          title: avail[g] ? undefined : tTeams('categoryNotRated'),
        }))}
        value={teeShown}
        onChange={(v) => setTee(v as Tee)}
        disabled={blocked}
      />
      {errorText && (
        <p role="alert" className="font-sans text-sm text-danger">
          {errorText}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="medium"
        onClick={handleAdd}
        disabled={!canAdd}
        className="w-full"
      >
        {isPending ? t('guestForm.submitPending') : t('guestForm.submitButton')}
      </Button>
    </div>
  );
}

/**
 * GameForm's «Legg til gjest» row (#2321, `Nyttspill-4-spillere`): a 52 px card
 * with «+» that opens `GuestPlayerFields` under itself and closes it once the
 * guest is added. Replaces the old `Disclosure`.
 */
export function GuestPlayerAdd({
  state,
  disabled = false,
}: {
  state: GameFormState;
  disabled?: boolean;
}) {
  const t = useTranslations('game.players');
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[54px] w-full items-center justify-between rounded-2xl border border-border bg-surface px-3.5 text-left font-sans text-[15px] font-semibold leading-[normal] text-text"
      >
        <span>{t('guestForm.sectionHeading')}</span>
        <span aria-hidden="true" className="text-xl leading-none text-muted">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <GuestPlayerFields
          id={panelId}
          state={state}
          disabled={disabled}
          onAdded={() => setOpen(false)}
        />
      )}
    </div>
  );
}
