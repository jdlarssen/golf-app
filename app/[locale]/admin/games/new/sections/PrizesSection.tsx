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

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { isMatchplayFamily } from '@/lib/scoring/modes/types';
import {
  PRIZE_DESCRIPTION_MAX,
  PRIZE_SPONSOR_MAX,
  type PrizeSlotKey,
} from '@/lib/games/prizes';
import {
  processAndUploadSponsorLogo,
  removeSponsorLogo,
} from '@/lib/storage/sponsorLogos';
import { sponsorLogoUrl } from '@/lib/storage/sponsorLogoUrl';
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
        {slots.map((slot) => {
          // #1141: vis sponsor-feltene (navn + logo) først når slotet har en
          // premie-beskrivelse. Serveren (parsePrizesFromFormData/prunePrizes)
          // dropper hele slotet uten beskrivelse, så et tomt slot skal ikke
          // tilby felt som stille kastes ved lagring. Samme disclosure-mønster
          // som Vipps-feltet (RegistrationSection hasEntryFee). Ingen state
          // nulles ved skjuling — forelderen serialiserer feltene uansett
          // (#1011), så verdiene overlever at beskrivelsen tømmes og refylles.
          const hasDescription =
            prizeDraft[slot.key].description.trim().length > 0;
          return (
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
              {hasDescription && (
                <>
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
                  <SponsorLogoField
                    slotKey={slot.key}
                    slotLabel={slot.label}
                    sponsorName={prizeDraft[slot.key].sponsor}
                    path={prizeDraft[slot.key].sponsorLogoPath}
                    onChange={(path) =>
                      setPrizeField(slot.key, 'sponsorLogoPath', path)
                    }
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Feilkode fra upload-pipelinen → i18n-nøkkel (wizard.sections.prizes). */
const LOGO_ERROR_KEY = {
  too_large: 'logoErrorTooLarge',
  decode_failed: 'logoErrorDecode',
  upload_failed: 'logoErrorUpload',
} as const;

/**
 * #1052: sponsorlogo per slott. Fila lastes opp UMIDDELBART ved valg (klient-
 * pipeline: rasteriser/nedskaler → bucket) — kun object-pathen går inn i
 * prizeDraft og serialiseres via forelderens hidden input (#1011-mønsteret;
 * selve fila kan ikke leve i FormData siden opprett-INSERT-en er atomisk).
 * Bytte av logo rydder forrige object best-effort.
 */
function SponsorLogoField({
  slotKey,
  slotLabel,
  sponsorName,
  path,
  onChange,
}: {
  slotKey: PrizeSlotKey;
  slotLabel: string;
  sponsorName: string;
  path: string;
  onChange: (path: string) => void;
}) {
  const t = useTranslations('wizard.sections.prizes');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<keyof typeof LOGO_ERROR_KEY | null>(null);

  async function handleFileChosen(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    const result = await processAndUploadSponsorLogo(file);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (path) void removeSponsorLogo(path);
    onChange(result.path);
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        data-testid={`prize-${slotKey}-logo-file`}
        aria-label={t('logoUploadAria', { slot: slotLabel })}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Nullstill så samme fil kan velges på nytt etter en feil.
          e.target.value = '';
          void handleFileChosen(file);
        }}
      />
      {path ? (
        <div className="flex min-h-11 items-center gap-3">
          <Image
            src={sponsorLogoUrl(path)}
            alt={sponsorName.trim() || t('logoAlt')}
            width={80}
            height={40}
            unoptimized
            className="h-10 w-auto max-w-[10rem] rounded-sm bg-surface-2 object-contain px-1"
            data-testid={`prize-${slotKey}-logo-thumb`}
          />
          <button
            type="button"
            data-testid={`prize-${slotKey}-logo-remove`}
            aria-label={t('logoRemoveAria', { slot: slotLabel })}
            onClick={() => {
              void removeSponsorLogo(path);
              onChange('');
              setError(null);
            }}
            className="min-h-11 rounded-md px-3 text-sm text-muted underline-offset-2 hover:underline"
          >
            {t('logoRemove')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid={`prize-${slotKey}-logo-upload`}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="min-h-11 w-full rounded-md border border-dashed border-border bg-surface-2 px-3 py-2 text-left text-sm text-muted hover:border-primary disabled:opacity-60"
        >
          {uploading ? t('logoUploading') : t('logoUpload')}
        </button>
      )}
      {error && (
        <p
          className="text-xs text-danger"
          data-testid={`prize-${slotKey}-logo-error`}
        >
          {t(LOGO_ERROR_KEY[error])}
        </p>
      )}
    </div>
  );
}
