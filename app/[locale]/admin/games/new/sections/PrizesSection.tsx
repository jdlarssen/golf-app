'use client';

/**
 * PrizesSection — premiebord (#1051). Faste slott, ingen add/remove-rader:
 * 1.–3. plass (skjult for matchplay-familien — intet podium) + ett felt per
 * aktivt LD-/CTP-slott (følger sideturnering-gatingen). Per slott: «Premie» +
 * valgfri «Sponsor».
 *
 * Ren visnings-UI: kontrollerte inputs uten name-attributter. Serialiseringen
 * eies av den alltid-monterte forelderen (GameWizards FormDataInputs i wizard-
 * pathen, GameForms hidden-cluster i edit-pathen) — samme #1011-mønster som
 * sideturnering-feltene, så et lukket disclosure-panel aldri dropper verdier.
 * Tomt premie-felt = slottet lagres ikke (beskjæres server-side).
 */

import { useTranslations } from 'next-intl';
import { isMatchplayFamily } from '@/lib/scoring/modes/types';
import {
  PRIZE_DESCRIPTION_MAX,
  PRIZE_SPONSOR_MAX,
  type PrizeSlotKey,
} from '@/lib/games/prizes';
import type { GameFormState } from '../useGameFormState';

type Props = {
  state: GameFormState;
};

export function PrizesSection({ state }: Props) {
  const t = useTranslations('wizard.sections.prizes');
  const { gameMode, sideEnabled, sideLdCount, sideCtpCount, prizeDraft, setPrizeField } =
    state;

  const hasPodium = !isMatchplayFamily(gameMode);
  const ldCount = sideEnabled ? sideLdCount : 0;
  const ctpCount = sideEnabled ? sideCtpCount : 0;

  // Bygg de synlige slottene i visnings-rekkefølge. Tomt = ingenting å vise
  // (f.eks. matchplay uten sideturnering) → seksjonen forsvinner helt.
  const slots: Array<{ key: PrizeSlotKey; label: string }> = [];
  if (hasPodium) {
    slots.push(
      { key: 'placement_1', label: t('placementLabel', { position: 1 }) },
      { key: 'placement_2', label: t('placementLabel', { position: 2 }) },
      { key: 'placement_3', label: t('placementLabel', { position: 3 }) },
    );
  }
  if (ldCount >= 1) {
    slots.push({
      key: 'ld_1',
      label: ldCount > 1 ? `${t('ldLabel')} 1` : t('ldLabel'),
    });
  }
  if (ldCount >= 2) slots.push({ key: 'ld_2', label: `${t('ldLabel')} 2` });
  if (ctpCount >= 1) {
    slots.push({
      key: 'ctp_1',
      label: ctpCount > 1 ? `${t('ctpLabel')} 1` : t('ctpLabel'),
    });
  }
  if (ctpCount >= 2) slots.push({ key: 'ctp_2', label: `${t('ctpLabel')} 2` });

  if (slots.length === 0) return null;

  return (
    <fieldset
      data-testid="prizes-section"
      className="space-y-3 rounded-md border border-border bg-surface px-4 py-4"
    >
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('legend')}
      </legend>
      <p className="text-xs text-muted/80">{t('hint')}</p>

      <div className="space-y-4">
        {slots.map((slot) => (
          <div key={slot.key} className="space-y-1.5">
            <span className="block font-serif text-base text-text">
              {slot.label}
            </span>
            <input
              type="text"
              inputMode="text"
              data-testid={`prize-${slot.key}-desc`}
              value={prizeDraft[slot.key].description}
              onChange={(e) =>
                setPrizeField(slot.key, 'description', e.target.value)
              }
              placeholder={t('prizePlaceholder')}
              aria-label={t('prizeAriaLabel', { slot: slot.label })}
              maxLength={PRIZE_DESCRIPTION_MAX}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              inputMode="text"
              data-testid={`prize-${slot.key}-sponsor`}
              value={prizeDraft[slot.key].sponsor}
              onChange={(e) =>
                setPrizeField(slot.key, 'sponsor', e.target.value)
              }
              placeholder={t('sponsorPlaceholder')}
              aria-label={t('sponsorAriaLabel', { slot: slot.label })}
              maxLength={PRIZE_SPONSOR_MAX}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted focus:border-primary focus:outline-none"
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
