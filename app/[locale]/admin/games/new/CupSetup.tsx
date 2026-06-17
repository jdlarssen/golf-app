'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AllowanceField } from '@/components/admin/AllowanceField';
import type { CupEligibleFormat } from '@/lib/formats/getFormatsForIntent';
import { formatIconFor } from '@/lib/formats/icons';
import { createTournamentDraft } from '@/lib/cup/actions';

type Props = {
  cupEligibleFormats: CupEligibleFormat[];
  // #524: når satt rendres formen klubb-bevisst — et skjult group_id-felt binder
  // cupen til klubben, og en banner forklarer at bare medlemmer kan delta. Tom
  // (default) = frittstående cup, uendret admin-flyt.
  groupId?: string;
  clubName?: string;
  // #526: maks antall matcher for en personlig cup (ikke-admin). Når satt
  // justeres point-mål-default + hint til den mindre cupen. undefined =
  // uncapped (admin/klubb).
  matchCap?: number;
};

/**
 * CupSetup — wizard step 2 cup-variant. Erstatter dagens
 * `/admin/cup/new/page.tsx` med en in-wizard form for å opprette cup
 * (tournament-rad). Felt-keys speiler `createTournamentDraft` så vi gjenbruker
 * eksisterende server-action uten endring der.
 *
 * Multi-select av tillatte match-formats persisteres ikke i F2 — kolonnen
 * `tournaments.allowed_match_formats` lander i et follow-up issue. UI-en er
 * med fordi det er en del av F2 kontrakt-en (signalisere intent + sette
 * forventninger), men cup-detalj-sidens «+ Match»-knapper viser alle
 * cup-eligible formats inntil filtering legges på i Wave-2.
 */
export function CupSetup({
  cupEligibleFormats,
  groupId,
  clubName,
  matchCap,
}: Props) {
  const t = useTranslations('wizard.cupSetup');
  const tModes = useTranslations('modes');
  const tContent = useTranslations('formatGuide');
  // Point-mål: vanlig regel = halvparten av tilgjengelige point + 0,5. For en
  // capped personlig cup (maks `matchCap` matcher) blir det en lavere default
  // enn admin/klubb-cupens 8-match-antagelse.
  const pointsDefault =
    matchCap !== undefined
      ? String(matchCap / 2 + 0.5).replace('.', ',')
      : '4,5';
  const pointsHint =
    matchCap !== undefined
      ? t('pointsHintCapped', { matchCap, pointsDefault })
      : t('pointsHintDefault');
  // Multi-select state — initialiserer med alle cup-eligible formats valgt
  // (default-all) så admin ikke trenger å klikke for å bekrefte standard-
  // oppsettet. Endring av valgene har ingen runtime-effekt i F2 (se docstring).
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    () => new Set(cupEligibleFormats.map((f) => f.slug)),
  );

  function toggleFormat(slug: string) {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  if (cupEligibleFormats.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted"
      >
        {t('noCupFormats')}
      </p>
    );
  }

  return (
    <form action={createTournamentDraft} className="space-y-5">
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

      <Input
        label={t('pointsToWinLabel')}
        id="points_to_win"
        name="points_to_win"
        required
        type="text"
        inputMode="decimal"
        pattern="[0-9]+([,.][0-9]+)?"
        defaultValue={pointsDefault}
        hint={pointsHint}
      />

      <AllowanceField
        fieldName="fourball_allowance_pct"
        defaultPct={85}
        legend={t('fourballAllowanceLegend')}
        description={t('fourballAllowanceDescription')}
        nettoHelperText={t('fourballAllowanceNettoHelper')}
        bruttoHelperText={t('fourballAllowanceBruttoHelper')}
      />

      <AllowanceField
        fieldName="foursomes_allowance_pct"
        defaultPct={50}
        legend={t('foursomesAllowanceLegend')}
        description={t('foursomesAllowanceDescription')}
        nettoHelperText={t('foursomesAllowanceNettoHelper')}
        bruttoHelperText={t('foursomesAllowanceBruttoHelper')}
      />

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
          {t('allowedFormatsLegend')}
        </legend>
        <p className="text-xs text-muted mb-3">
          {t('allowedFormatsHint')}
        </p>
        <ul className="space-y-2">
          {cupEligibleFormats.map((f) => {
            const checked = selectedFormats.has(f.slug);
            const id = `cup_format_${f.slug}`;
            return (
              <li key={f.slug}>
                <label
                  htmlFor={id}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    checked
                      ? 'border-primary bg-primary-soft text-text'
                      : 'border-border bg-surface text-text hover:bg-primary-soft/60'
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFormat(f.slug)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span
                    className={`flex h-6 w-6 items-center justify-center ${
                      checked ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    {formatIconFor(f.icon_key, 22)}
                  </span>
                  <span className="flex-1">
                    <span className="block font-serif text-sm text-text">
                      {tModes(f.slug as Parameters<typeof tModes>[0])}
                    </span>
                    <span className="block text-xs text-muted">
                      {
                        tContent.raw(
                          `content.${f.slug}.shortDescription` as Parameters<
                            typeof tContent.raw
                          >[0],
                        ) as string
                      }
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

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
