'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { nameInitials } from '@/lib/names/initials';
import { displayNameForOthers } from '@/lib/users/displayName';
import { OnboardingHcpField } from './OnboardingHcpField';
import { OnboardingNameField } from './OnboardingNameField';
import { previewHcp } from './profilePreview';

/**
 * The two fields on «Fullfør profilen» and «Slik ser de andre deg» under them
 * (#2350, artboard «Profilstart-forslag»). Holds what the player has typed so
 * the preview follows along; the fields still post themselves (`name`,
 * `hcp_index`, `hcp_plus`) to `completeProfile`, unchanged.
 *
 * Start values are the echo after a validation bounce (#748). The demo name
 * (#1173) arrives through `onNameChange` once the name field has prefilled it.
 */
export function OnboardingFields({
  initialName,
  initialMagnitude,
  initialPlus,
}: {
  initialName: string;
  initialMagnitude: string;
  initialPlus: boolean;
}) {
  const t = useTranslations('onboarding');
  const locale = useLocale() as AppLocale;
  const [name, setName] = useState(initialName);
  const [hcp, setHcp] = useState({ magnitude: initialMagnitude, isPlus: initialPlus });

  const shownName = displayNameForOthers({ name, nickname: null, email: null });
  const shownHcp = previewHcp(hcp.magnitude, hcp.isPlus, locale);

  return (
    <>
      <div className="flex flex-col gap-[18px] px-5 pt-5">
        <OnboardingNameField initialName={initialName} onNameChange={setName} />
        <OnboardingHcpField
          initialMagnitude={initialMagnitude}
          initialPlus={initialPlus}
          onChange={setHcp}
        />
      </div>

      <figure className="m-0 px-5 pt-[22px]">
        <figcaption className="font-sans text-[10px] leading-[normal] font-semibold tracking-[0.2em] text-muted uppercase">
          {t('preview.kicker')}
        </figcaption>
        <div className="mt-2 flex items-center gap-3 rounded-[14px] border border-border bg-surface px-3 py-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] leading-[normal] font-semibold text-primary"
          >
            {shownName ? nameInitials(shownName) : ''}
          </span>
          <span
            data-testid="onboarding-preview-name"
            className="min-w-0 flex-1 truncate text-[15px] leading-[normal] font-semibold text-text"
          >
            {shownName ?? t('preview.namePlaceholder')}
          </span>
          <span
            data-testid="onboarding-preview-hcp"
            className="shrink-0 text-[13px] leading-[normal] text-muted tabular-nums"
          >
            {shownHcp === null ? t('preview.hcpMissing') : t('preview.hcp', { value: shownHcp })}
          </span>
        </div>
      </figure>
    </>
  );
}
