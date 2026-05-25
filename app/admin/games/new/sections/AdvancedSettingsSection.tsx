'use client';

/**
 * AdvancedSettingsSection — siste innstillinger før submit-knappene.
 *
 * Ansvar: HCP-allowance (eller Texas-team-handicap), peer-approval-checkbox,
 * og — når wizard-en ber om det via `includeVisibility` — også
 * «Synlighet under runden»-radios + sideturnering-fieldset (som ellers
 * lever i BasicsSection).
 */

import type { GameFormState } from '../useGameFormState';
import { Input } from '@/components/ui/Input';
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
};

export function AdvancedSettingsSection({
  state,
  includeVisibility = false,
  hideHeading = false,
}: Props) {
  const {
    isTexas,
    texasHandicapPct,
    setTexasHandicapPct,
    teamSize,
    hcpAllowance,
    setHcpAllowance,
    requirePeerApproval,
    setRequirePeerApproval,
    // Visibility-blokk (kun når includeVisibility=true)
    initialScoreVisibility,
    lockScoreVisibility,
    sideEnabled,
    setSideEnabled,
    lockSideTournament,
    initialDisabledCategories,
    initialLdCount,
    initialCtpCount,
  } = state;

  return (
    <section className="space-y-4">
      {!hideHeading && (
        <h2 className="text-sm font-medium text-text">6. Innstillinger</h2>
      )}
      {isTexas ? (
        <Input
          id="texas_team_handicap_pct_input"
          name="texas_team_handicap_pct_input"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          label="Lag-handicap %"
          value={texasHandicapPct}
          onChange={(e) => setTexasHandicapPct(e.target.value)}
          hint={
            teamSize === 2
              ? 'NGF-standard: 25 % av summen av spillernes spille-HCP for 2-mannslag.'
              : 'NGF-standard: 10 % av summen av spillernes spille-HCP for 4-mannslag.'
          }
          required
        />
      ) : (
        <Input
          id="hcp_allowance_pct"
          name="hcp_allowance_pct"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          label="HCP-allowance %"
          value={hcpAllowance}
          onChange={(e) => setHcpAllowance(e.target.value)}
          hint="100 = fullt course handicap (standard). 85 = WHS fourball-tillegg."
          required
        />
      )}
      {/* Texas trenger fortsatt en hcp_allowance_pct-verdi i payloaden siden
          DB-kolonnen er NOT NULL. Vi sender 100 (no-op) som hidden input
          slik at server-action ikke får null-verdi. Lag-HCP-prosenten
          persisterer i mode_config istedenfor. */}
      {isTexas && (
        <input type="hidden" name="hcp_allowance_pct" value="100" />
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="require_peer_approval"
          checked={requirePeerApproval}
          onChange={(e) => setRequirePeerApproval(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
        />
        <span>
          <span className="block text-sm font-medium text-text">
            Krev peer-godkjenning
          </span>
          <span className="block text-xs text-muted mt-0.5">
            Hvis på, må en annen i flighten godkjenne scorekortet før
            innsending.
          </span>
        </span>
      </label>

      {includeVisibility && (
        <>
          {/* Score visibility — wizard-løftet kopi av samme fieldset som
              GameForm rendrer i BasicsSection. */}
          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Synlighet under runden
            </legend>
            <div className="mt-2 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="score_visibility"
                  value="live"
                  defaultChecked={initialScoreVisibility !== 'reveal'}
                  disabled={lockScoreVisibility}
                  className="mt-1"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    Vis alt under runden
                  </div>
                  <div className="text-xs text-muted">
                    Netto-tall synlige fra hull 1 (standard)
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
                  className="mt-1"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    Avslør på slutten
                  </div>
                  <div className="text-xs text-muted">
                    Brutto under runden, netto avsløres når spillet avsluttes
                  </div>
                </div>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              Reveal-modus skjuler handicap-slag og netto-rangering under runden.
              Lag med høyere handicap kan slå brutto-lederen, så avsløringen blir
              et spenningsmoment når du trykker avslutt.
              {lockScoreVisibility && (
                <span className="block mt-1">
                  <strong>Kan ikke endres etter spill-start.</strong>
                </span>
              )}
            </p>
          </fieldset>

          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Sideturnering
            </legend>
            <div className="mt-2 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="side_tournament_enabled"
                  value="true"
                  checked={sideEnabled}
                  onChange={(e) => setSideEnabled(e.target.checked)}
                  disabled={lockSideTournament}
                  className="mt-1"
                />
                <div>
                  <div className="font-serif text-base text-text">
                    Legg til sideturnering
                  </div>
                  <div className="text-xs text-muted">
                    Parallell lag-konkurranse med poeng. Vises etter at spillet er avsluttet.
                  </div>
                </div>
              </label>

              {sideEnabled && (
                <div className="space-y-4 rounded-md border border-border bg-surface-2 p-3">
                  <p className="text-xs text-muted">
                    Poengfordeling: best netto 18 = 10p, front 9 + back 9 = 5p hver,
                    hole-win = 2p per hull (kun alene-vinner), longest drive + closest to pin = 2p per vinner.
                  </p>

                  <SideCategoriesPicker
                    defaultDisabledCategories={initialDisabledCategories}
                    locked={lockSideTournament}
                  />

                  <fieldset>
                    <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                      Antall longest-drive-vinnere
                    </legend>
                    <div className="mt-2 flex gap-2">
                      {[0, 1, 2].map((n) => (
                        <label key={n} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="side_ld_count"
                            value={n}
                            defaultChecked={initialLdCount === n}
                            disabled={lockSideTournament}
                          />
                          <span className="font-serif text-base text-text tabular-nums">{n}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                      Antall closest-to-pin-vinnere
                    </legend>
                    <div className="mt-2 flex gap-2">
                      {[0, 1, 2].map((n) => (
                        <label key={n} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="side_ctp_count"
                            value={n}
                            defaultChecked={initialCtpCount === n}
                            disabled={lockSideTournament}
                          />
                          <span className="font-serif text-base text-text tabular-nums">{n}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {lockSideTournament && (
                    <p className="text-xs text-muted">
                      <strong>Kan ikke endres etter spill-start.</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        </>
      )}
    </section>
  );
}
