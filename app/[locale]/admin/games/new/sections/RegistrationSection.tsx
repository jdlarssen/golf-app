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
};

type ModeOption = {
  value: RegistrationMode;
  title: string;
  hint: string;
};

type TypeOption = {
  value: RegistrationType;
  title: string;
  hint?: string;
};

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    value: 'invite_only',
    title: 'Bare de jeg inviterer',
    hint: 'Privat. Vises ikke i Finn turneringer. Du sender invitasjoner selv fra Spillere-fanen.',
  },
  {
    value: 'manual_approval',
    title: 'Forespørsel — jeg godkjenner',
    hint: 'Dukker opp i Finn turneringer. Folk ber om plass, og du godkjenner hver enkelt.',
  },
  {
    value: 'open',
    title: 'Åpen påmelding',
    hint: 'Dukker opp i Finn turneringer så hvem som helst med lenken kan melde seg på.',
  },
] as const;

const TYPE_OPTIONS: readonly TypeOption[] = [
  { value: 'solo', title: 'Individuelt' },
  { value: 'team', title: 'Lag' },
  { value: 'both', title: 'Begge' },
] as const;

export function RegistrationSection({ state, hideHeading = false }: Props) {
  const {
    registrationMode,
    setRegistrationMode,
    registrationType,
    setRegistrationType,
    registrationModeSupportsTeams,
    lockGameMode,
    letFriendsSkipGate,
    setLetFriendsSkipGate,
  } = state;

  // Disable team/both når modus ikke støtter lag. Lock-flagget (edit-flyt på
  // publisert spill) deaktiverer hele seksjonen — payloaden er allerede
  // persistert og kan ikke endres tilbake til en annen modell uten å rote
  // til eksisterende påmeldinger.
  const teamRadioDisabled = !registrationModeSupportsTeams || lockGameMode;
  const teamDisabledReason = !registrationModeSupportsTeams
    ? 'Valgt spillmodus støtter ikke lag-påmelding.'
    : null;

  return (
    <section className="space-y-4">
      {!hideHeading && (
        <h2 className="text-sm font-medium text-text">Påmelding</h2>
      )}

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Hvem kan melde seg på?
        </legend>
        <div className="mt-2 space-y-3">
          {MODE_OPTIONS.map((opt) => {
            const discoverable = isDiscoverableRegistrationMode(opt.value);
            return (
              <div key={opt.value}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="registration_mode_input"
                    value={opt.value}
                    checked={registrationMode === opt.value}
                    onChange={() => setRegistrationMode(opt.value)}
                    disabled={lockGameMode}
                    className="mt-1 h-5 w-5"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-base text-text">
                        {opt.title}
                      </span>
                      <VisibilityBadge discoverable={discoverable} />
                    </div>
                    <div className="text-xs text-muted">{opt.hint}</div>
                  </div>
                </label>
                {opt.value === 'manual_approval' &&
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
                          className="mt-0.5 h-4 w-4 flex-shrink-0"
                        />
                        <div>
                          <span className="font-sans text-sm text-text">
                            Slipp venner direkte inn
                          </span>
                          <p className="mt-0.5 text-xs text-muted">
                            Venner av deg slipper rett inn uten å be om plass.
                            Andre må fortsatt be om å bli med.
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

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Hva melder man på?
        </legend>
        <div className="mt-2 space-y-3">
          {TYPE_OPTIONS.map((opt) => {
            const isTeamOption = opt.value === 'team' || opt.value === 'both';
            const disabled = isTeamOption ? teamRadioDisabled : lockGameMode;
            return (
              <label
                key={opt.value}
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
                  value={opt.value}
                  checked={registrationType === opt.value}
                  onChange={() => setRegistrationType(opt.value)}
                  disabled={disabled}
                  className="mt-1 h-5 w-5"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    {opt.title}
                  </div>
                  {opt.hint && (
                    <div className="text-xs text-muted">{opt.hint}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
        {!registrationModeSupportsTeams && (
          <p className="mt-2 text-xs text-muted">
            Lag-påmelding er kun tilgjengelig for best ball og Texas
            scramble. Bytt spillmodus først hvis du vil ta imot lag.
          </p>
        )}
      </fieldset>

      {registrationMode !== 'invite_only' && (
        <p className="text-xs text-muted">
          Du kan også la spillerne melde seg på selv. Lenken får du etter at
          spillet er opprettet.
        </p>
      )}
    </section>
  );
}

/**
 * Synlighets-merke (#367): viser om valgt påmeldingsmåte gjør spillet
 * oppdagbart i «Finn turneringer» eller holder det privat. Oppdagbar = soft
 * primær (positivt/synlig), privat = muted (stille). Klassifiseringen kommer
 * fra `isDiscoverableRegistrationMode` så den ikke kan drifte fra discovery.
 */
function VisibilityBadge({ discoverable }: { discoverable: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] ${
        discoverable
          ? 'bg-primary-soft text-primary'
          : 'bg-surface-2 text-muted'
      }`}
    >
      {discoverable ? 'Oppdagbar' : 'Privat'}
    </span>
  );
}
