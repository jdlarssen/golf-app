'use client';

/**
 * The guest card's fields as the artboards draw them (`Nyttspill-4-tee-gjest`,
 * #2321): the hint, name, handicap and the Herre/Dame/Junior pills. Shared by
 * the wizard's «Legg til gjest» (`GuestPlayerFields`) and the player's «Ta med
 * en gjest» (#2607), so the two cards cannot drift apart.
 *
 * Controlled and without `name` attributes: the wizard is one big `<form>`,
 * and a field with a name would ride along in its publish POST. Each caller
 * builds its own FormData.
 */

import type { KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FormSectionText } from '@/components/ui/FormSection';
import { Input } from '@/components/ui/Input';
import { SegmentedField } from '@/components/ui/SegmentedField';
import type { TeeGenderAvailability } from '@/lib/games/clampGenderToTee';

export type GuestTeeChoice = 'M' | 'D' | 'J';

export function GuestProfileFields({
  idPrefix,
  name,
  onNameChange,
  hcp,
  onHcpChange,
  tee,
  onTeeChange,
  avail,
  disabled,
  onEnter,
}: {
  idPrefix: string;
  name: string;
  onNameChange: (v: string) => void;
  hcp: string;
  onHcpChange: (v: string) => void;
  /** Already clamped to the tee (`clampGenderToTee`). */
  tee: GuestTeeChoice;
  onTeeChange: (v: GuestTeeChoice) => void;
  avail: TeeGenderAvailability;
  disabled: boolean;
  onEnter?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations('game.players');
  const tTeams = useTranslations('wizard.sections.teams');
  return (
    <>
      <FormSectionText>{t('guestForm.hint')}</FormSectionText>
      <Input
        variant="card"
        id={`${idPrefix}-name`}
        label={t('guestForm.nameLabel')}
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={onEnter}
        maxLength={80}
        placeholder={t('guestForm.namePlaceholder')}
        disabled={disabled}
        autoComplete="off"
      />
      <Input
        variant="card"
        id={`${idPrefix}-hcp`}
        label={t('guestForm.hcpLabel')}
        type="text"
        value={hcp}
        onChange={(e) => onHcpChange(e.target.value)}
        onKeyDown={onEnter}
        inputMode="decimal"
        placeholder={t('guestForm.hcpPlaceholder')}
        disabled={disabled}
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
        value={tee}
        onChange={(v) => onTeeChange(v as GuestTeeChoice)}
        disabled={disabled}
      />
    </>
  );
}
