'use client';

import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
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
      // #2426: the column is pulled out 4 px so the cards sit 16 px from the
      // screen edge; each section's kicker takes the 4 px back.
      className="-mx-1"
    >
      {groupId && (
        <input type="hidden" name="group_id" value={groupId} />
      )}
      {clubName && (
        <p className="mx-1 mt-[18px] rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-text">
          {t.rich('clubBanner', {
            clubName,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}
      <FormSection legend={t('cupNameLabel')}>
        <Input
          variant="card"
          label={t('cupNameLabel')}
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder={t('cupNamePlaceholder')}
        />
      </FormSection>

      <FormSection legend={t('teamNamesLegend')}>
        <Input
          variant="card"
          label={t('team1Label')}
          id="team_1_name"
          name="team_1_name"
          required
          maxLength={40}
          placeholder={t('team1Placeholder')}
        />
        <Input
          variant="card"
          label={t('team2Label')}
          id="team_2_name"
          name="team_2_name"
          required
          maxLength={40}
          placeholder={t('team2Placeholder')}
        />
      </FormSection>

      <FormSection legend={t('pointsWeightLegend')}>
        <FormSectionText>{t('pointsWeightHint')}</FormSectionText>
        <div className="grid grid-cols-2 gap-2.5">
          <Input
            variant="card"
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
            variant="card"
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
      </FormSection>

      {errorMessage && (
        <div className="mx-1 mt-[18px]">
          <Banner tone="error" testId="cup-create-error">{errorMessage}</Banner>
        </div>
      )}

      <div className="pt-[18px]">
        <Button type="submit" size="large" className="w-full">
          {t('submitButton')}
        </Button>
      </div>
    </form>
  );
}
