'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { GuestProfileFields, type GuestTeeChoice } from '@/components/games/GuestProfileFields';
import { clampGenderToTee, type TeeGenderAvailability } from '@/lib/games/clampGenderToTee';
import type { BringGuestError } from './actions';

/**
 * Screen 2 of the «Ta med en gjest» drawing (#2607): the wizard's guest card
 * (`GuestProfileFields`) with a filled primary button, the page's one action.
 * Success redirects to the page with the guest («Gjesten din»); a refusal is
 * shown in the card.
 */
export function BringGuestForm({
  action,
  avail,
}: {
  action: (formData: FormData) => Promise<{ ok: false; error: BringGuestError }>;
  avail: TeeGenderAvailability;
}) {
  const t = useTranslations('game.bringGuest');
  const tPlayers = useTranslations('game.players');
  const fieldId = useId();
  const [name, setName] = useState('');
  const [hcp, setHcp] = useState('');
  const [tee, setTee] = useState<GuestTeeChoice>('M');
  const [error, setError] = useState<BringGuestError | null>(null);
  const [isPending, startTransition] = useTransition();
  // #2437: the category the tee rates, as the wizard's card does.
  const teeShown = clampGenderToTee(tee, avail);
  const canSubmit = !isPending && name.trim() !== '' && hcp.trim() !== '';

  function submit() {
    if (!canSubmit) return;
    setError(null);
    const fd = new FormData();
    fd.set('guest_name', name);
    fd.set('guest_hcp', hcp);
    fd.set('guest_tee', teeShown);
    startTransition(async () => {
      const res = await action(fd);
      if (res && !res.ok) setError(res.error);
    });
  }

  // The page's own words first, then the guest card's (guest_invalid_*),
  // then the generic one.
  const ownKey = `errors.${error}` as Parameters<typeof t>[0];
  const cardKey = `errorMessages.${error}` as Parameters<typeof tPlayers>[0];
  const errorText =
    error === null
      ? null
      : t.has(ownKey)
        ? t(ownKey)
        : tPlayers.has(cardKey)
          ? tPlayers(cardKey)
          : t('errors.db_error');

  return (
    <form
      data-testid="bring-guest-form"
      className="-mx-1 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <GuestProfileFields
        idPrefix={fieldId}
        name={name}
        onNameChange={setName}
        hcp={hcp}
        onHcpChange={setHcp}
        tee={teeShown}
        onTeeChange={setTee}
        avail={avail}
        disabled={isPending}
      />
      {errorText && (
        <p role="alert" data-testid="bring-guest-error" className="font-sans text-sm text-danger">
          {errorText}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="medium"
        disabled={!canSubmit}
        className="w-full"
        data-testid="bring-guest-submit"
      >
        {isPending ? t('submitPending') : t('submit')}
      </Button>
    </form>
  );
}
