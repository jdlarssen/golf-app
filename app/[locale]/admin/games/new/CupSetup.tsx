'use client';

import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { createTournamentDraft, type CupActionError } from '@/lib/cup/actions';

type Props = {
  // #524: når satt rendres formen klubb-bevisst — et skjult group_id-felt binder
  // cupen til klubben, og en banner forklarer at bare medlemmer kan delta. Tom
  // (default) = frittstående cup, uendret admin-flyt.
  groupId?: string;
  clubName?: string;
};

/**
 * CupSetup — wizard step 2 cup-variant. Erstatter dagens
 * `/admin/cup/new/page.tsx` med en in-wizard form for å opprette cup
 * (tournament-rad). Felt-keys speiler `createTournamentDraft` så vi gjenbruker
 * eksisterende server-action uten endring der.
 *
 * Formen er ren opprettelse: navn + lag-navn + poeng-vekter. Bane, tee og
 * format velges ETTER opprettelse, i Oppsett-rommet (#1472) — den gamle
 * format-multiselecten (som aldri ble persistert) er fjernet herfra.
 */
const INITIAL_STATE: CupActionError = { error: '' };

export function CupSetup({
  groupId,
  clubName,
}: Props) {
  const t = useTranslations('wizard.cupSetup');
  // #1397: feilmeldinger bor i `cup.create.errors.*` (ett hjem, jf. trap 4).
  const tErrors = useTranslations('cup.create');

  // #1397: server-action-en gis via en klient-closure så dens signatur forblir
  // `(formData)` — en action gitt direkte til useActionState må ta
  // `(prevState, formData)` (samme mønster som CreateLigaForm/ReadyStep).
  const [state, formAction] = useActionState(
    async (_prev: CupActionError, formData: FormData) =>
      createTournamentDraft(formData),
    INITIAL_STATE,
  );

  // Kode → melding med `t.has`-guard: en umappet kode (f.eks. de unåelige
  // allowance-kodene) faller til `unexpected` med rå kode i stedet for tom banner.
  const errorMessage = (() => {
    if (!state.error) return null;
    const key = `errors.${state.error}` as Parameters<typeof tErrors>[0];
    return tErrors.has(key)
      ? tErrors(key)
      : tErrors('errors.unexpected', { code: state.error });
  })();

  return (
    <form
      action={formAction}
      // #1397 (staging-funn): React 19 auto-resetter formen når en
      // `action`-innsending fullfører — native reset tømmer de ukontrollerte
      // feltene. preventDefault + manuell dispatch i en transition hopper over
      // auto-reset-en; `action`-attributtet står igjen som fallback før
      // hydrering (da med reset, uunngåelig uten JS).
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="space-y-5"
    >
      {groupId && (
        <input type="hidden" name="group_id" value={groupId} />
      )}
      {clubName && (
        <p className="rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-text">
          {t.rich('clubBanner', {
            clubName,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}
      <Input
        label={t('cupNameLabel')}
        id="name"
        name="name"
        required
        maxLength={80}
        placeholder={t('cupNamePlaceholder')}
      />

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
          {t('teamNamesLegend')}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('team1Label')}
            id="team_1_name"
            name="team_1_name"
            required
            maxLength={40}
            placeholder={t('team1Placeholder')}
          />
          <Input
            label={t('team2Label')}
            id="team_2_name"
            name="team_2_name"
            required
            maxLength={40}
            placeholder={t('team2Placeholder')}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
          {t('pointsWeightLegend')}
        </legend>
        <p className="text-xs text-muted mb-3">{t('pointsWeightHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('winPointsLabel')}
            id="win_points"
            name="win_points"
            type="number"
            step="0.5"
            min="0.5"
            inputMode="decimal"
            placeholder="1"
          />
          <Input
            label={t('tiePointsLabel')}
            id="tie_points"
            name="tie_points"
            type="number"
            step="0.5"
            min="0"
            inputMode="decimal"
            placeholder="0,5"
          />
        </div>
      </fieldset>

      {errorMessage && <Banner tone="error" testId="cup-create-error">{errorMessage}</Banner>}

      <div className="pt-2">
        <Button
          type="submit"
          className="w-full"
        >
          {t('submitButton')}
        </Button>
      </div>
    </form>
  );
}
