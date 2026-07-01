'use client';

/**
 * AdvancedSettingsSection — siste innstillinger før submit-knappene.
 *
 * Ansvar: peer-approval-checkbox, og — når wizard-en ber om det via
 * `includeVisibility` — også «Synlighet under runden»-radios +
 * sideturnering-fieldset (som ellers lever i BasicsSection). All
 * allowance-UI (HCP-allowance, Texas-lag-handicap, fourball-allowance)
 * bor i Section 3 (Format) som `AllowanceField`-toggles — flyttet i #266.
 *
 * #1011: LD-/CTP-count og disabled-categories er controlled state eid av
 * `useGameFormState` (ikke uncontrolled defaultChecked/lokal state). Denne
 * seksjonen monteres kun mens ReadyStep sin advanced-disclosure er åpen —
 * GameWizard sin FormDataInputs (montert på alle steg) speiler samme state
 * som hidden inputs, så et lukket panel ikke lenger dropper sideturnering-
 * config ved publish.
 */

import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { SideCategoriesPicker } from '@/components/admin/SideCategoriesPicker';

type Props = {
  state: GameFormState;
  /**
   * Når true (wizard-pathen), løftes score-visibility-radios og sideturnering-
   * fieldset inn i denne seksjonen i tillegg. Default false — i GameForm-pathen
   * lever de inne i BasicsSection.
   */
  includeVisibility?: boolean;
  /**
   * Skjul «6. Innstillinger»-headingen. Wizard-en monter denne seksjonen inne
   * i ReadyStep sin avanserte disclosure som allerede har sin egen label, så
   * dobbel-merking unngås ved å droppe headingen.
   */
  hideHeading?: boolean;
  /**
   * Når true eier forelderen serialiseringen av side_*-feltene (wizard-pathen:
   * FormDataInputs speiler dem uansett disclosure-tilstand, #1011) — denne
   * seksjonen dropper da name-attributter/hidden inputs så FormData ikke får
   * duplikat-entries. Default false: GameForm-pathen (edit-flytene + full-form-
   * escape-hatch) har INGEN speiling og trenger inline-serialiseringen.
   */
  serializedExternally?: boolean;
};

export function AdvancedSettingsSection({
  state,
  includeVisibility = false,
  hideHeading = false,
  serializedExternally = false,
}: Props) {
  const tAdv = useTranslations('wizard.sections.advanced');
  const tBasics = useTranslations('wizard.sections.basics');
  const {
    requirePeerApproval,
    setRequirePeerApproval,
    // Visibility-blokk (kun når includeVisibility=true)
    initialScoreVisibility,
    lockScoreVisibility,
    sideEnabled,
    setSideEnabled,
    sideLdCount,
    setSideLdCount,
    sideCtpCount,
    setSideCtpCount,
    sideDisabledCategories,
    setSideDisabledCategories,
    sideTournamentSupported,
    lockSideTournament,
  } = state;

  return (
    <section className="space-y-4">
      {!hideHeading && (
        <h2 className="text-sm font-medium text-text">{tAdv('heading')}</h2>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="require_peer_approval"
          checked={requirePeerApproval}
          onChange={(e) => setRequirePeerApproval(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-accent/40 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium text-text">
            {tAdv('peerApprovalTitle')}
          </span>
          <span className="block text-xs text-muted mt-0.5">
            {tAdv('peerApprovalDesc')}
          </span>
        </span>
      </label>

      {includeVisibility && (
        <>
          {/* Score visibility — wizard-løftet kopi av samme fieldset som
              GameForm rendrer i BasicsSection. */}
          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {tBasics('visibilityLegend')}
            </legend>
            <div className="mt-2 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="score_visibility"
                  value="live"
                  defaultChecked={initialScoreVisibility !== 'reveal'}
                  disabled={lockScoreVisibility}
                  className="mt-1 accent-primary"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    {tBasics('visibilityLiveTitle')}
                  </div>
                  <div className="text-xs text-muted">
                    {tBasics('visibilityLiveDesc')}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="score_visibility"
                  value="reveal"
                  defaultChecked={initialScoreVisibility === 'reveal'}
                  disabled={lockScoreVisibility}
                  className="mt-1 accent-primary"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    {tBasics('visibilityRevealTitle')}
                  </div>
                  <div className="text-xs text-muted">
                    {tBasics('visibilityRevealDesc')}
                  </div>
                </div>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              {tBasics('visibilityRevealHint')}
              {lockScoreVisibility && (
                <span className="block mt-1">
                  <strong>{tBasics('visibilityLockedNote')}</strong>
                </span>
              )}
            </p>
          </fieldset>

          {/* Sideturnering — tilbys for alle formater. Matchplay viser LD/CTP
              kompakt under duell-kortet (#585). */}
          {sideTournamentSupported && (
          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {tBasics('sideTournamentLegend')}
            </legend>
            <div className="mt-2 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                {/* I wizard-pathen (serializedExternally) eier FormDataInputs
                    serialiseringen av side_tournament_enabled (#1011) — name
                    droppes da så FormData ikke får duplikat. */}
                <input
                  type="checkbox"
                  {...(serializedExternally
                    ? {}
                    : { name: 'side_tournament_enabled', value: 'true' })}
                  checked={sideEnabled}
                  onChange={(e) => setSideEnabled(e.target.checked)}
                  disabled={lockSideTournament}
                  className="mt-1 accent-primary"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    {tBasics('sideTournamentTitle')}
                  </div>
                  <div className="text-xs text-muted">
                    {tBasics('sideTournamentDesc')}
                  </div>
                </div>
              </label>

              {sideEnabled && (
                <div className="space-y-4 rounded-md border border-border bg-surface-2 p-3">
                  <p className="text-xs text-muted">
                    {tBasics('sideTournamentPointsHint')}
                  </p>

                  <SideCategoriesPicker
                    disabledCategories={sideDisabledCategories}
                    onDisabledCategoriesChange={setSideDisabledCategories}
                    emitHiddenInputs={!serializedExternally}
                    locked={lockSideTournament}
                  />

                  <fieldset>
                    <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                      {tBasics('sideLdLegend')}
                    </legend>
                    <div className="mt-2 flex gap-2">
                      {[0, 1, 2].map((n) => (
                        <label key={n} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            {...(serializedExternally
                              ? {}
                              : { name: 'side_ld_count', value: String(n) })}
                            checked={sideLdCount === n}
                            onChange={() => setSideLdCount(n as 0 | 1 | 2)}
                            disabled={lockSideTournament}
                            className="accent-primary"
                          />
                          <span className="font-serif text-base text-text tabular-nums">{n}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                      {tBasics('sideCtpLegend')}
                    </legend>
                    <div className="mt-2 flex gap-2">
                      {[0, 1, 2].map((n) => (
                        <label key={n} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            {...(serializedExternally
                              ? {}
                              : { name: 'side_ctp_count', value: String(n) })}
                            checked={sideCtpCount === n}
                            onChange={() => setSideCtpCount(n as 0 | 1 | 2)}
                            disabled={lockSideTournament}
                            className="accent-primary"
                          />
                          <span className="font-serif text-base text-text tabular-nums">{n}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {lockSideTournament && (
                    <p className="text-xs text-muted">
                      <strong>{tBasics('sideLockedNote')}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>
          )}
        </>
      )}
    </section>
  );
}
