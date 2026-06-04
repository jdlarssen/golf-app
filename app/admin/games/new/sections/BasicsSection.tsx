'use client';

/**
 * BasicsSection — første kort/seksjon i opprett-spill-flyten.
 *
 * Ansvar: spillnavn (valgfritt), bane- og tee-select, tee-off-datetime,
 * og — når brukt av GameForm — også «Synlighet under runden»-radios og
 * «Sideturnering»-fieldset. Wizard-en skjuler navnefeltet i steg 2 og
 * løfter advanced-blokken inn i AdvancedSettingsSection istedenfor.
 */

import type { CourseOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Input } from '@/components/ui/Input';
import { SmartLink } from '@/components/ui/SmartLink';
import { SideCategoriesPicker } from '@/components/admin/SideCategoriesPicker';

type Props = {
  state: GameFormState;
  courses: CourseOption[];
  /**
   * Skjul spillnavn-feltet. Wizard-en flytter navnet til steg 4 (summary).
   * GameForm beholder navn øverst i seksjonen.
   */
  showName?: boolean;
  /**
   * Rendrer «Synlighet under runden»-radios + sideturnering-fieldset inline
   * i seksjonen. Wizard-en setter denne til `false` og rendrer dem heller
   * inne i AdvancedSettingsSection.
   */
  showAdvancedInline?: boolean;
};

function formatRatingBadge(tee: {
  has_mens: boolean;
  has_ladies: boolean;
  has_juniors: boolean;
}): string {
  const parts: string[] = [];
  if (tee.has_mens) parts.push('herre');
  if (tee.has_ladies) parts.push('dame');
  if (tee.has_juniors) parts.push('junior');
  return parts.join(' · ');
}

export function BasicsSection({
  state,
  courses,
  showName = true,
  showAdvancedInline = true,
}: Props) {
  const {
    name,
    setName,
    courseId,
    setCourseId,
    teeBoxId,
    setTeeBoxId,
    setPlayerGenders,
    scheduledTeeOffAt,
    setScheduledTeeOffAt,
    selectedCourse,
    availableTees,
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
      <h2 className="text-sm font-medium text-text">1. Spillet</h2>
      {showName && (
        <Input
          id="name"
          name="name"
          type="text"
          label="Spillnavn"
          placeholder="f.eks. Stiklestad 17. mai"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      )}

      <div>
        <label
          htmlFor="course_id"
          className="block text-sm font-medium text-text mb-1.5"
        >
          Bane
        </label>
        <select
          id="course_id"
          name="course_id"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          required
          className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
        >
          <option value="">Velg bane…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">
          Finner du ikke banen?{' '}
          <SmartLink
            href="/opprett-bane"
            className="underline underline-offset-2 hover:text-text"
          >
            Opprett ny bane
          </SmartLink>
        </p>
      </div>

      <div>
        <label htmlFor="tee_box_id" className="block text-sm font-medium text-text mb-1.5">
          Tee
        </label>
        <select
          id="tee_box_id"
          name="tee_box_id"
          value={teeBoxId}
          onChange={(e) => {
            setTeeBoxId(e.target.value);
            setPlayerGenders({});
          }}
          disabled={!selectedCourse}
          required
          className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
        >
          <option value="">{selectedCourse ? 'Velg tee-boks…' : 'Velg bane først'}</option>
          {availableTees.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({formatRatingBadge(t)})
            </option>
          ))}
        </select>
      </div>

      {/* `datetime-local` emits 'YYYY-MM-DDTHH:mm' in browser local time (no
          offset). Server interprets in Europe/Oslo before persisting as
          timestamptz. See actions.ts. */}
      <Input
        id="scheduled_tee_off_at"
        name="scheduled_tee_off_at"
        type="datetime-local"
        label="Tee-off"
        value={scheduledTeeOffAt}
        onChange={(e) => setScheduledTeeOffAt(e.target.value)}
        hint="Påkrevd ved publisering. Valgfritt for utkast."
      />

      {showAdvancedInline && (
        <>
          {/* Score visibility — radios, not a checkbox, so the two modes read
              as exclusive choices. defaultChecked (uncontrolled) is fine here
              because the field's value is read straight from FormData on
              submit; no other UI state needs to react to it. */}
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

          {/* Section 1c: Side tournament */}
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

                  {/* v1.2.0: kategori-velger. Lever sin egne hidden inputs for
                      `side_disabled_categories`; LD/CTP-tellerne under er
                      separate fordi de styrer antall-slots, ikke ja/nei. */}
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
