'use client';

/**
 * RegistrationSection — «Påmelding»-felt-gruppe i opprett-spill-flyten (#199).
 *
 * To akser:
 *   1. Registreringsmodus: hvem kan melde seg på (invite_only / manual_approval / open)
 *   2. Type påmelding: hva man melder på (solo / team / both)
 *
 * Type-radioene disables når valgt game_mode ikke har lag-konsept — i praksis
 * når modus er stableford / singles_matchplay / solo_strokeplay. State-
 * hooken (`useGameFormState`) force-reseter dessuten registrationType til
 * 'solo' når admin bytter til en slik modus, så payloaden alltid er
 * konsistent uten å avhenge av at admin klikker en gyldig kombinasjon manuelt.
 *
 * #1065: GameWizard (steg 5/ReadyStep) mounter seksjonen i to deler —
 * `onlyModeChoice` alene i klartekst (utenfor «Vis avanserte innstillinger»,
 * #367-mandatet: registrerings-VALGET skal alltid være synlig), og
 * `hideModeChoice` for resten (type + kontingent) inne i disclosuren.
 * GameForm (edit-flyten) fortsetter å mounte hele seksjonen samlet ett sted.
 *
 * #2282: kortstilen fra Nyttspill-5-*: «Hvem kan melde seg på?» som tre
 * valgkort med valgsirkel og synlighets-pille, «Hva melder man på?» som to
 * valgkort og startkontingenten som kortfelt. Delt med GameForm, så «Rediger
 * spill» får samme stil.
 */

import { Fragment, useId } from 'react';
import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { isDiscoverableRegistrationMode } from '@/lib/games/registration';
import type {
  RegistrationMode,
  RegistrationType,
} from '@/lib/games/registration';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import {
  ChoiceCardGrid,
  RadioChoiceCard,
  RadioOptionCard,
} from '@/components/ui/ChoiceCard';
import { CheckRow } from '@/components/ui/CheckRow';
import { Input } from '@/components/ui/Input';

type Props = {
  state: GameFormState;
  /**
   * Skjul kickeren «PÅMELDING». GameForm mounter seksjonen inne i
   * Disclosure-panelet «Påmelding», og ReadyStep mounter resten av seksjonen
   * (`hideModeChoice`) under «Vis avanserte innstillinger» — begge steder ville
   * kickeren gjentatt en tittel som alt står der.
   */
  hideHeading?: boolean;
  /**
   * #643: skjul «Hvem kan melde seg på?»-valget (registreringsmodus) for klubb-
   * turneringer. Medlemskap = invitasjon, så modus er låst til invite_only og
   * valget er irrelevant/villedende («Vises ikke i Finn turneringer» stemmer
   * ikke for medlemmer). Type-valget (solo/lag) beholdes — det gjelder fortsatt.
   */
  hideModeChoice?: boolean;
  /**
   * #1065: rendrer KUN «Hvem kan melde seg på?»-valget — ingen type-valg
   * (solo/lag), ingen kontingent. Wizard-en bruker denne for den synlige
   * registrerings-kontrollen på steg 5 (#367-mandatet: valget skal stå i
   * klartekst, ikke gjemt i «Vis avanserte innstillinger»). Resten av seksjonen
   * (type + kontingent) rendres separat under avanserte innstillinger via
   * `hideModeChoice`.
   */
  onlyModeChoice?: boolean;
};

const REGISTRATION_MODES: readonly RegistrationMode[] = [
  'invite_only',
  'manual_approval',
  'open',
] as const;

// #1792: 'both' er ikke lenger valgbart — DB-enumen står, men nye/redigerte
// spill velger solo ELLER lag. Eksisterende both-spill behandles som lag
// (edit-flyten coercer 'both' → 'team' i useGameFormState).
const REGISTRATION_TYPES: readonly RegistrationType[] = [
  'solo',
  'team',
] as const;

export function RegistrationSection({
  state,
  hideHeading = false,
  hideModeChoice = false,
  onlyModeChoice = false,
}: Props) {
  const t = useTranslations('wizard.sections.registration');
  const whoId = useId();
  const {
    registrationMode,
    setRegistrationMode,
    registrationType,
    setRegistrationType,
    registrationModeSupportsTeams,
    lockGameMode,
    letFriendsSkipGate,
    setLetFriendsSkipGate,
    entryFeeKr,
    setEntryFeeKr,
    paymentLink,
    setPaymentLink,
  } = state;

  // #1049: Vipps-feltet avdekkes først når det er satt et beløp — et betalings-
  // felt uten en kontingent er meningsløst. Parsen tvinger uansett payment_link
  // til null når beløpet er 0, så en stale lenke aldri lekker.
  const hasEntryFee = Number(entryFeeKr) > 0;

  // Lag er av når modus ikke støtter lag. Lock-flagget (edit-flyt på
  // publisert spill) deaktiverer hele seksjonen — payloaden er allerede
  // persistert og kan ikke endres tilbake til en annen modell uten å rote
  // til eksisterende påmeldinger.
  const teamRadioDisabled = !registrationModeSupportsTeams || lockGameMode;

  function modeTitle(mode: RegistrationMode): string {
    if (mode === 'invite_only') return t('modeInviteTitle');
    if (mode === 'manual_approval') return t('modeApprovalTitle');
    return t('modeOpenTitle');
  }

  function modeHint(mode: RegistrationMode): string {
    if (mode === 'invite_only') return t('modeInviteHint');
    if (mode === 'manual_approval') return t('modeApprovalHint');
    return t('modeOpenHint');
  }

  function typeTitle(type: RegistrationType): string {
    if (type === 'solo') return t('typeSoloTitle');
    return t('typeTeamTitle');
  }

  // «Hvem kan melde seg på?»: tre valgkort, og under «Forespørsel» (når den er
  // valgt) avkrysningen for venner, innrykket til kortets tekst.
  const modeChoice = !hideModeChoice && (
    <>
      <p
        id={whoId}
        className="px-1 pb-2 font-sans text-sm leading-[normal] font-semibold text-text"
      >
        {t('whoLegend')}
      </p>
      <div role="radiogroup" aria-labelledby={whoId} className="flex flex-col gap-2">
        {REGISTRATION_MODES.map((mode) => {
          const checked = registrationMode === mode;
          return (
            <Fragment key={mode}>
              <RadioOptionCard
                name="registration_mode_input"
                value={mode}
                checked={checked}
                onChange={() => setRegistrationMode(mode)}
                disabled={lockGameMode}
                title={modeTitle(mode)}
                badge={
                  <VisibilityBadge
                    discoverable={isDiscoverableRegistrationMode(mode)}
                    onSelectedCard={checked}
                    labelDiscoverable={t('badgeDiscoverable')}
                    labelPrivate={t('badgePrivate')}
                  />
                }
                description={modeHint(mode)}
              />
              {mode === 'manual_approval' && checked && (
                <CheckRow
                  className="ml-7"
                  title={t('friendsSkipTitle')}
                  description={t('friendsSkipHint')}
                  checked={letFriendsSkipGate}
                  onChange={(e) => setLetFriendsSkipGate(e.target.checked)}
                  disabled={lockGameMode}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </>
  );

  // Kickeren «PÅMELDING» er fieldset-legenden; med `hideHeading` rendres den
  // ikke i det hele tatt (GameForm-panelet har alt tittelen).
  const modeChoiceBlock = modeChoice && (
    hideHeading ? (
      <div>{modeChoice}</div>
    ) : (
      <FormSection variant="bare" legend={t('heading')}>
        {modeChoice}
      </FormSection>
    )
  );

  if (onlyModeChoice) return modeChoiceBlock || null;

  return (
    <div>
      {modeChoiceBlock}

      <FormSection variant="bare" legend={t('whatLegend')}>
        <ChoiceCardGrid columns={2} label={t('whatLegend')}>
          {REGISTRATION_TYPES.map((type) => (
            <RadioChoiceCard
              key={type}
              name="registration_type_input"
              value={type}
              checked={registrationType === type}
              onChange={() => setRegistrationType(type)}
              disabled={type === 'team' ? teamRadioDisabled : lockGameMode}
              height={52}
              title={typeTitle(type)}
            />
          ))}
        </ChoiceCardGrid>
      </FormSection>

      {/* #1049: startkontingent (valgfritt). Vises for alle formater og også for
          klubbspill — en klubbkveld kan ha avgift på toppen av medlemskap. Ikke
          disabled ved lockGameMode: beløpet er informativt, ikke strukturelt.
          Feltene har ikke `name`: GameForm og veiviserens FormDataInputs
          sender verdiene fra state. */}
      <FormSection legend={t('paymentLegend')}>
        <FormSectionText>{t('paymentHint')}</FormSectionText>
        <Input
          variant="card"
          id="registration-entry-fee"
          label={t('entryFeeLabel')}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={entryFeeKr}
          onChange={(e) => setEntryFeeKr(e.target.value)}
          placeholder={t('entryFeePlaceholder')}
          inputClassName="tabular-nums"
        />
        {hasEntryFee && (
          <Input
            variant="card"
            id="registration-payment-link"
            label={t('paymentLinkLabel')}
            type="text"
            inputMode="text"
            value={paymentLink}
            onChange={(e) => setPaymentLink(e.target.value)}
            placeholder={t('paymentLinkPlaceholder')}
            hint={t('paymentLinkHint')}
            maxLength={200}
          />
        )}
      </FormSection>
    </div>
  );
}

/**
 * Synlighets-pillen (#367): viser om påmeldingsmåten gjør spillet oppdagbart
 * i «Finn turneringer» eller holder det privat. Klassifiseringen kommer fra
 * `isDiscoverableRegistrationMode`, så den ikke kan drifte fra discovery.
 *
 * OPPDAGBAR: lys grønn med forest-tekst, og hvit på et valgt kort (det
 * valgte kortet er selv lys grønt). PRIVAT: --surface-2 med dempet tekst; om
 * natta er dempet tekst 4,21:1 der, så den bruker --text (10,45:1).
 */
function VisibilityBadge({
  discoverable,
  onSelectedCard,
  labelDiscoverable,
  labelPrivate,
}: {
  discoverable: boolean;
  onSelectedCard: boolean;
  labelDiscoverable: string;
  labelPrivate: string;
}) {
  const tone = !discoverable
    ? 'bg-surface-2 text-muted dark:text-text'
    : onSelectedCard
      ? 'bg-surface text-primary'
      : 'bg-primary-soft text-primary';
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 font-sans text-[10px] font-semibold tracking-[0.12em] uppercase ${tone}`}
    >
      {discoverable ? labelDiscoverable : labelPrivate}
    </span>
  );
}
