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
 */

import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { isDiscoverableRegistrationMode } from '@/lib/games/registration';
import type {
  RegistrationMode,
  RegistrationType,
} from '@/lib/games/registration';

type Props = {
  state: GameFormState;
  /**
   * Skjul «N. Påmelding»-headingen. Wizard-flyten mounter seksjonen inne
   * i steg 1 (Format) som allerede har en stepper-tittel, så dobbel-merking
   * unngås ved å droppe headingen der.
   */
  hideHeading?: boolean;
  /**
   * #643: skjul «Hvem kan melde seg på?»-valget (registreringsmodus) for klubb-
   * turneringer. Medlemskap = invitasjon, så modus er låst til invite_only og
   * valget er irrelevant/villedende («Vises ikke i Finn turneringer» stemmer
   * ikke for medlemmer). Type-valget (solo/lag) beholdes — det gjelder fortsatt.
   */
  hideModeChoice?: boolean;
};

const REGISTRATION_MODES: readonly RegistrationMode[] = [
  'invite_only',
  'manual_approval',
  'open',
] as const;

const REGISTRATION_TYPES: readonly RegistrationType[] = [
  'solo',
  'team',
  'both',
] as const;

export function RegistrationSection({
  state,
  hideHeading = false,
  hideModeChoice = false,
}: Props) {
  const t = useTranslations('wizard.sections.registration');
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

  // Disable team/both når modus ikke støtter lag. Lock-flagget (edit-flyt på
  // publisert spill) deaktiverer hele seksjonen — payloaden er allerede
  // persistert og kan ikke endres tilbake til en annen modell uten å rote
  // til eksisterende påmeldinger.
  const teamRadioDisabled = !registrationModeSupportsTeams || lockGameMode;
  const teamDisabledReason = !registrationModeSupportsTeams
    ? t('teamModeDisabledReason')
    : null;

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
    if (type === 'team') return t('typeTeamTitle');
    return t('typeBothTitle');
  }

  return (
    <section className="space-y-4">
      {!hideHeading && (
        <h2 className="text-sm font-medium text-text">{t('heading')}</h2>
      )}

      {!hideModeChoice && (
      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('whoLegend')}
        </legend>
        <div className="mt-2 space-y-3">
          {REGISTRATION_MODES.map((mode) => {
            const discoverable = isDiscoverableRegistrationMode(mode);
            return (
              <div key={mode}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="registration_mode_input"
                    value={mode}
                    checked={registrationMode === mode}
                    onChange={() => setRegistrationMode(mode)}
                    disabled={lockGameMode}
                    className="mt-1 h-5 w-5 accent-primary"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-base text-text">
                        {modeTitle(mode)}
                      </span>
                      <VisibilityBadge
                        discoverable={discoverable}
                        labelDiscoverable={t('badgeDiscoverable')}
                        labelPrivate={t('badgePrivate')}
                      />
                    </div>
                    <div className="text-xs text-muted">{modeHint(mode)}</div>
                  </div>
                </label>
                {mode === 'manual_approval' &&
                  registrationMode === 'manual_approval' && (
                    <div className="mt-2 ml-8">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={letFriendsSkipGate}
                          onChange={(e) =>
                            setLetFriendsSkipGate(e.target.checked)
                          }
                          disabled={lockGameMode}
                          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
                        />
                        <div>
                          <span className="font-sans text-sm text-text">
                            {t('friendsSkipTitle')}
                          </span>
                          <p className="mt-0.5 text-xs text-muted">
                            {t('friendsSkipHint')}
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </fieldset>
      )}

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('whatLegend')}
        </legend>
        <div className="mt-2 space-y-3">
          {REGISTRATION_TYPES.map((type) => {
            const isTeamOption = type === 'team' || type === 'both';
            const disabled = isTeamOption ? teamRadioDisabled : lockGameMode;
            return (
              <label
                key={type}
                className={`flex items-start gap-3 ${
                  disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
                title={
                  isTeamOption && teamDisabledReason
                    ? teamDisabledReason
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="registration_type_input"
                  value={type}
                  checked={registrationType === type}
                  onChange={() => setRegistrationType(type)}
                  disabled={disabled}
                  className="mt-1 h-5 w-5 accent-primary"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    {typeTitle(type)}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {!registrationModeSupportsTeams && (
          <p className="mt-2 text-xs text-muted">
            {t('teamNotSupportedNote')}
          </p>
        )}
      </fieldset>

      {registrationMode !== 'invite_only' && (
        <p className="text-xs text-muted">
          {t('selfSignupNote')}
        </p>
      )}

      {/* #1049: startkontingent (valgfritt). Vises for alle formater og også for
          klubbspill — en klubbkveld kan ha avgift på toppen av medlemskap. Ikke
          disabled ved lockGameMode: beløpet er informativt, ikke strukturelt. */}
      <fieldset className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          {t('paymentLegend')}
        </legend>
        <p className="text-xs text-muted/80">{t('paymentHint')}</p>
        <label className="block">
          <span className="text-xs font-medium text-muted">
            {t('entryFeeLabel')}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={entryFeeKr}
            onChange={(e) => setEntryFeeKr(e.target.value)}
            placeholder={t('entryFeePlaceholder')}
            aria-label={t('entryFeeLabel')}
            className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        {hasEntryFee && (
          <label className="block">
            <span className="text-xs font-medium text-muted">
              {t('paymentLinkLabel')}
            </span>
            <input
              type="text"
              inputMode="text"
              value={paymentLink}
              onChange={(e) => setPaymentLink(e.target.value)}
              placeholder={t('paymentLinkPlaceholder')}
              aria-label={t('paymentLinkLabel')}
              maxLength={200}
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <span className="mt-1 block text-xs text-muted/80">
              {t('paymentLinkHint')}
            </span>
          </label>
        )}
      </fieldset>
    </section>
  );
}

/**
 * Synlighets-merke (#367): viser om valgt påmeldingsmåte gjør spillet
 * oppdagbart i «Finn turneringer» eller holder det privat. Oppdagbar = soft
 * primær (positivt/synlig), privat = muted (stille). Klassifiseringen kommer
 * fra `isDiscoverableRegistrationMode` så den ikke kan drifte fra discovery.
 */
function VisibilityBadge({
  discoverable,
  labelDiscoverable,
  labelPrivate,
}: {
  discoverable: boolean;
  labelDiscoverable: string;
  labelPrivate: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] ${
        discoverable
          ? 'bg-primary-soft text-primary'
          : 'bg-surface-2 text-muted'
      }`}
    >
      {discoverable ? labelDiscoverable : labelPrivate}
    </span>
  );
}
