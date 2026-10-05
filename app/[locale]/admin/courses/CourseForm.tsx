'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getTeeLengthWarning } from '@/lib/courses/teeLengthWarning';
import { findStrokeIndexGaps, teeRatingProblem } from '@/lib/courses/coursePayload';
import { formatListLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { MAX_TEE_BOXES } from './constants';
import { HoleGridEditor } from './HoleGridEditor';

export { MAX_TEE_BOXES };

// Numeric fields are stored as strings so React's controlled inputs preserve
// in-progress decimal entry like "72." before the user types the next digit.
// The server action converts them via Number() when reading FormData.
export type HoleData = {
  hole_number: number;
  par_mens: string;
  par_ladies: string;
  par_juniors: string;
  stroke_index: string;
};

export type TeeBoxData = {
  id?: string;
  name: string;
  length_meters: string;
  slope_mens: string;
  course_rating_mens: string;
  slope_ladies: string;
  course_rating_ladies: string;
  slope_juniors: string;
  course_rating_juniors: string;
};

export type CourseFormInitialData = {
  name: string;
  holes: HoleData[];
  teeBoxes: TeeBoxData[];
};

type Props = {
  // The server action receives FormData. Two signatures are supported here:
  // - create: (formData) => void
  // - update: (formData) => void  (bound with the course id ahead of time)
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialData?: CourseFormInitialData;
  // Antall games på banen som har status 'active' eller 'scheduled'. Brukes
  // til å gate en confirm-dialog ved par/SI-endringer som ville påvirke
  // mid-runde-scoring. Default 0 så create-flyten og andre kall uten denne
  // prop-en aldri trigger advarselen. Se issue #237.
  affectedGamesCount?: number;
  // Optional extra footer (e.g. a delete button on the edit page).
  footer?: React.ReactNode;
  // Where createCourse should bounce validation errors / land on success.
  // Admin-flyten lar dem stå udefinert → action-en bruker sine admin-defaults.
  // /opprett-bane setter dem så ikke-admin-brukere holdes på sin egen rute
  // (de har ikke tilgang til /admin/courses). Se createCourse-action.
  redirectBase?: string;
  successRedirect?: string;
  // The page colour under the sticky save bar: `admin` on the AdminShell
  // doors, `app` (default) on /opprett-bane.
  tone?: 'app' | 'admin';
};

const DEFAULT_HOLES: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: '4',
  par_ladies: '4',
  par_juniors: '4',
  stroke_index: '',
}));

const DEFAULT_TEE: TeeBoxData = {
  name: '',
  length_meters: '',
  slope_mens: '',
  course_rating_mens: '',
  slope_ladies: '',
  course_rating_ladies: '',
  slope_juniors: '',
  course_rating_juniors: '',
};

// Sum av hull-par per kjønn. Brukes både i UI (read-only par-total per tee) og
// er kilde-til-sannhet på server-siden — par_total_<gender> regnes ut fra
// hullene istedenfor å tastes per kjønn. Default-gender er `mens` for
// bakoverkompatibel oppførsel.
export function sumHolePars(
  holes: HoleData[],
  gender: 'mens' | 'ladies' | 'juniors' = 'mens',
): number {
  const key = `par_${gender}` as 'par_mens' | 'par_ladies' | 'par_juniors';
  return holes.reduce((sum, h) => {
    const n = Number(h[key]);
    return Number.isInteger(n) ? sum + n : sum;
  }, 0);
}

// Sjekker om par eller stroke-indeks er endret på minst ett hull. Tee-data
// + bane-navn ignoreres bevisst — kun per-hull-felter som leses live av
// scoring-laget kan skape mid-runde-uforutsigbarhet. Returnerer false når
// initial-listen er undefined (create-flyten har ingen baseline). Sammenligner
// alle tre par-felter (mens/ladies/juniors) per #240.
export function hasHoleChanges(
  initial: HoleData[] | undefined,
  current: HoleData[],
): boolean {
  if (!initial) return false;
  return current.some((curr, i) => {
    const init = initial[i];
    if (!init) return true;
    return (
      curr.par_mens !== init.par_mens ||
      curr.par_ladies !== init.par_ladies ||
      curr.par_juniors !== init.par_juniors ||
      curr.stroke_index !== init.stroke_index
    );
  });
}

// Sjekker om en tee har lagrede tall for et gitt kjønn — brukes for å
// avgjøre om dame/junior-blokken skal stå åpen ved mount på edit-flyten.
function hasGenderData(
  tee: TeeBoxData,
  gender: 'ladies' | 'juniors',
): boolean {
  return tee[`slope_${gender}`] !== '' || tee[`course_rating_${gender}`] !== '';
}

const SAVE_BAR_TONE = {
  app: 'bg-bg after:bg-bg',
  admin: 'bg-admin-bg after:bg-admin-bg',
} as const;

// Sjekker om hullene har avvikende par for et gitt kjønn — brukes for å
// avgjøre om per-kjønn-par-seksjonen skal stå åpen ved mount på edit-flyten.
function hasGenderParOverride(
  holes: HoleData[],
  gender: 'ladies' | 'juniors',
): boolean {
  const key = `par_${gender}` as 'par_ladies' | 'par_juniors';
  return holes.some((h) => h[key] !== h.par_mens);
}

export function CourseForm({
  action,
  submitLabel,
  initialData,
  affectedGamesCount = 0,
  footer,
  redirectBase,
  successRedirect,
  tone = 'app',
}: Props) {
  const t = useTranslations('courseForm.form');

  const [holes, setHoles] = useState<HoleData[]>(
    initialData?.holes ?? DEFAULT_HOLES,
  );
  const initialTees =
    initialData?.teeBoxes && initialData.teeBoxes.length > 0
      ? initialData.teeBoxes
      : [DEFAULT_TEE];
  const [teeBoxes, setTeeBoxes] = useState<TeeBoxData[]>(initialTees);

  // Parallel-array til teeBoxes som styrer om dame/junior-rating-blokken
  // står åpen. Initialiseres åpen hvis tee har lagrede tall for det kjønnet
  // (edit-flyten), ellers kollapset.
  const [expandedLadies, setExpandedLadies] = useState<boolean[]>(
    initialTees.map((tee) => hasGenderData(tee, 'ladies')),
  );
  const [expandedJuniors, setExpandedJuniors] = useState<boolean[]>(
    initialTees.map((tee) => hasGenderData(tee, 'juniors')),
  );

  // Per-kjønn-par-overstyring: kollapset som standard. Åpen ved mount på
  // edit-flyt hvis banen faktisk har avvik fra hovedparet (par_mens).
  const [expandedLadiesPar, setExpandedLadiesPar] = useState<boolean>(
    initialData?.holes
      ? hasGenderParOverride(initialData.holes, 'ladies')
      : false,
  );
  const [expandedJuniorsPar, setExpandedJuniorsPar] = useState<boolean>(
    initialData?.holes
      ? hasGenderParOverride(initialData.holes, 'juniors')
      : false,
  );

  const parTotalMens = useMemo(() => sumHolePars(holes, 'mens'), [holes]);
  const parTotalLadies = useMemo(() => sumHolePars(holes, 'ladies'), [holes]);
  const parTotalJuniors = useMemo(
    () => sumHolePars(holes, 'juniors'),
    [holes],
  );

  // "Lagre bane" stays disabled until the indices and tee ratings would pass
  // the server (#2279) — a server bounce reloads an empty form, so 18 typed
  // indices would be lost. A duplicate always leaves a number missing, so
  // `missing` alone gates the indices.
  const siGaps = useMemo(
    () => findStrokeIndexGaps(holes.map((h) => h.stroke_index)),
    [holes],
  );
  const teeProblems = useMemo(
    () =>
      teeBoxes.map((tee) =>
        teeRatingProblem([
          { slope: tee.slope_mens, cr: tee.course_rating_mens },
          { slope: tee.slope_ladies, cr: tee.course_rating_ladies },
          { slope: tee.slope_juniors, cr: tee.course_rating_juniors },
        ]),
      ),
    [teeBoxes],
  );
  const firstTeeProblem = teeProblems.findIndex((p) => p !== null);
  const blocked = siGaps.missing.length > 0 || firstTeeProblem !== -1;

  function updateHole(index: number, patch: Partial<HoleData>) {
    setHoles((prev) =>
      prev.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    );
  }

  function updateTee(index: number, patch: Partial<TeeBoxData>) {
    setTeeBoxes((prev) =>
      prev.map((tee, i) => (i === index ? { ...tee, ...patch } : tee)),
    );
  }

  function addTee() {
    if (teeBoxes.length >= MAX_TEE_BOXES) return;
    setTeeBoxes((prev) => [...prev, { ...DEFAULT_TEE }]);
    setExpandedLadies((prev) => [...prev, false]);
    setExpandedJuniors((prev) => [...prev, false]);
  }

  function duplicateTee(index: number) {
    if (teeBoxes.length >= MAX_TEE_BOXES) return;
    const source = teeBoxes[index];
    // Kopier alle numre, tøm navn + drop id (ny rad i DB). Beholder også
    // dame/junior-data uavhengig av om blokken er åpen — admin har valgt
    // hva som ligger der, dupliser bør bevare det selv om blokken er
    // kollapset visuelt.
    const copy: TeeBoxData = {
      ...source,
      id: undefined,
      name: '',
    };
    setTeeBoxes((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setExpandedLadies((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, hasGenderData(copy, 'ladies'));
      return next;
    });
    setExpandedJuniors((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, hasGenderData(copy, 'juniors'));
      return next;
    });
  }

  function removeTee(index: number) {
    if (teeBoxes.length <= 1) return;
    setTeeBoxes((prev) => prev.filter((_, i) => i !== index));
    setExpandedLadies((prev) => prev.filter((_, i) => i !== index));
    setExpandedJuniors((prev) => prev.filter((_, i) => i !== index));
  }

  function expandGender(index: number, gender: 'ladies' | 'juniors') {
    const setter = gender === 'ladies' ? setExpandedLadies : setExpandedJuniors;
    setter((prev) => prev.map((v, i) => (i === index ? true : v)));
  }

  // Nullstiller slope+CR for ett kjønn på én tee. Endrer ikke expand-state
  // — damer/junior-blokker forblir åpne etter Tøm så admin kan fylle på
  // nytt manuelt. Tom slope + tom CR for et kjønn er gyldig submit-state
  // (= ingen rating for det kjønnet), så ingen partial-rating-feil.
  function clearGender(
    index: number,
    gender: 'mens' | 'ladies' | 'juniors',
  ) {
    updateTee(index, {
      [`slope_${gender}`]: '',
      [`course_rating_${gender}`]: '',
    } as Partial<TeeBoxData>);
  }

  function copyMensToAllGenders(index: number) {
    const source = teeBoxes[index];
    if (!source) return;
    updateTee(index, {
      slope_ladies: source.slope_mens,
      course_rating_ladies: source.course_rating_mens,
      slope_juniors: source.slope_mens,
      course_rating_juniors: source.course_rating_mens,
    });
    setExpandedLadies((prev) => prev.map((v, i) => (i === index ? true : v)));
    setExpandedJuniors((prev) => prev.map((v, i) => (i === index ? true : v)));
  }

  // Fjern per-kjønn-par-overstyring: tilbakestill alle 18 hull til par_mens
  // og skjul raden i kortet. Brukes når admin trykker «Fjern dame/junior-
  // overstyring» under kortet.
  function removeGenderParOverride(gender: 'ladies' | 'juniors') {
    const key = `par_${gender}` as 'par_ladies' | 'par_juniors';
    setHoles((prev) => prev.map((h) => ({ ...h, [key]: h.par_mens })));
    if (gender === 'ladies') {
      setExpandedLadiesPar(false);
    } else {
      setExpandedJuniorsPar(false);
    }
  }

  // Når admin endrer par_mens på hovedraden, og en av per-kjønn-seksjonene
  // er kollapset, må vi speile endringen ned til det kjønnet slik at
  // hidden-inputene som server-action leser holder seg synkrone med
  // hovedraden. Når seksjonen er åpen lar vi admin styre per-kjønn-verdien
  // direkte.
  function updateMensPar(index: number, par: 3 | 4 | 5) {
    const next = String(par);
    setHoles((prev) =>
      prev.map((h, i) => {
        if (i !== index) return h;
        return {
          ...h,
          par_mens: next,
          par_ladies: expandedLadiesPar ? h.par_ladies : next,
          par_juniors: expandedJuniorsPar ? h.par_juniors : next,
        };
      }),
    );
  }

  function buildConfirmMessage(count: number): string {
    const games =
      count === 1 ? t('confirmGames1') : t('confirmGamesN', { count });
    return t('confirmChanges', { games });
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          affectedGamesCount > 0 &&
          hasHoleChanges(initialData?.holes, holes)
        ) {
          const ok = window.confirm(buildConfirmMessage(affectedGamesCount));
          if (!ok) event.preventDefault();
        }
      }}
    >
      {redirectBase !== undefined && (
        <input type="hidden" name="redirect_base" value={redirectBase} />
      )}
      {successRedirect !== undefined && (
        <input type="hidden" name="success_redirect" value={successRedirect} />
      )}
      <div className="-mx-1">
        <Input
          id="name"
          name="name"
          type="text"
          variant="card"
          inputClassName="h-[52px]!"
          label={t('nameLabel')}
          placeholder={t('namePlaceholder')}
          defaultValue={initialData?.name ?? ''}
          required
        />
      </div>

      <div className="-mx-2 mt-3.5">
        <HoleGridEditor
          holes={holes}
          showLadies={expandedLadiesPar}
          showJuniors={expandedJuniorsPar}
          parTotal={parTotalMens}
          gaps={siGaps}
          onPar={(index, gender, par) =>
            gender === 'mens'
              ? updateMensPar(index, par)
              : updateHole(index, { [`par_${gender}`]: String(par) })
          }
          onSi={(index, value) => updateHole(index, { stroke_index: value })}
        />
      </div>

      {/* A deviating par for ladies or juniors adds its own row to the card. */}
      <section className="mt-6 space-y-3">
        <GenderParToggle
          shown={expandedLadiesPar}
          addLabel={t('addLadiesParButton')}
          removeLabel={t('ladiesParRemoveLabel')}
          onAdd={() => setExpandedLadiesPar(true)}
          onRemove={() => removeGenderParOverride('ladies')}
        />
        <GenderParToggle
          shown={expandedJuniorsPar}
          addLabel={t('addJuniorsParButton')}
          removeLabel={t('juniorsParRemoveLabel')}
          onAdd={() => setExpandedJuniorsPar(true)}
          onRemove={() => removeGenderParOverride('juniors')}
        />
      </section>

      {/* Hidden mirror-inputs for kjønn som ikke har egen rad i kortet.
          Server-action leser hole_${i}_par_ladies / _juniors fra FormData;
          når raden er skjult må vi fortsatt sende verdien (= par_mens)
          slik at INSERT setter alle tre kolonner. Når raden vises, bærer
          HoleGridEditor samme name og tar over. */}
      {!expandedLadiesPar &&
        holes.map((h) => (
          <input
            key={`mirror-ladies-${h.hole_number}`}
            type="hidden"
            name={`hole_${h.hole_number}_par_ladies`}
            value={h.par_ladies}
          />
        ))}
      {!expandedJuniorsPar &&
        holes.map((h) => (
          <input
            key={`mirror-juniors-${h.hole_number}`}
            type="hidden"
            name={`hole_${h.hole_number}_par_juniors`}
            value={h.par_juniors}
          />
        ))}

      <section className="-mx-1 mt-6">
        <h2 className="text-sm font-medium text-text mb-3">
          {t('teeBoxesHeading', { count: teeBoxes.length, max: MAX_TEE_BOXES })}
        </h2>
        <div className="space-y-4">
          {teeBoxes.map((tee, index) => (
            <div
              key={index}
              className="border border-border rounded-xl bg-surface p-4 space-y-4"
            >
              {tee.id && (
                <input type="hidden" name={`tee_${index}_id`} value={tee.id} />
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-text">
                  {t('teeBoxLabel', { number: index + 1 })}
                </span>
                {/* Both text buttons draw 16px and hit 44px (#2240); sideways
                    each takes half of the 12px gap, «Fjern» also takes the
                    card padding on its right. */}
                <div className="flex items-center gap-3">
                  {teeBoxes.length < MAX_TEE_BOXES && (
                    <button
                      type="button"
                      onClick={() => duplicateTee(index)}
                      aria-label={t('duplicateTeeAria', { number: index + 1 })}
                      className="tap-extend text-xs font-medium text-muted hover:text-text transition-colors [--tap-extend:-14px_-6px]"
                    >
                      {t('duplicateButton')}
                    </button>
                  )}
                  {teeBoxes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTee(index)}
                      aria-label={t('removeTeeAria', { number: index + 1 })}
                      className="tap-extend text-xs font-medium text-danger hover:opacity-80 transition-opacity [--tap-extend:-14px_-14px_-14px_-6px]"
                    >
                      {t('removeTeeButton')}
                    </button>
                  )}
                </div>
              </div>

              <Input
                id={`tee_${index}_name`}
                name={`tee_${index}_name`}
                type="text"
                label={t('teeNameLabel')}
                placeholder={t('teeNamePlaceholder')}
                value={tee.name}
                onChange={(e) => updateTee(index, { name: e.target.value })}
                required
              />

              <Input
                id={`tee_${index}_length_meters`}
                name={`tee_${index}_length_meters`}
                type="number"
                inputMode="numeric"
                min={1000}
                max={12000}
                step={1}
                label={t('teeLengthLabel')}
                hint={t('teeLengthHint')}
                warning={getTeeLengthWarning(tee)}
                placeholder="6124"
                value={tee.length_meters}
                onChange={(e) =>
                  updateTee(index, { length_meters: e.target.value })
                }
              />

              <div className="space-y-3">
                <p className="text-xs text-muted">{t('genderRatingHint')}</p>

                <GenderRatingBlock
                  teeIndex={index}
                  gender="mens"
                  label={t('genderMens')}
                  clearLabel={t('clearGenderButton')}
                  parTotalLabel={t('parTotalLabel')}
                  parTotalSuffix={t('parTotalSuffix')}
                  slopeLabel={t('slopeLabel')}
                  crLabel={t('crLabel')}
                  slopeHint={t('typicalHintMensSlope')}
                  crHint={t('typicalHintMensCr')}
                  slope={tee.slope_mens}
                  cr={tee.course_rating_mens}
                  parTotal={parTotalMens}
                  showParTotal={
                    tee.slope_mens !== '' && tee.course_rating_mens !== ''
                  }
                  showClear={
                    tee.slope_mens !== '' || tee.course_rating_mens !== ''
                  }
                  onClear={() => clearGender(index, 'mens')}
                  onChange={(patch) => updateTee(index, patch)}
                />

                {tee.slope_mens !== '' &&
                  tee.course_rating_mens !== '' &&
                  (tee.slope_ladies === '' ||
                    tee.course_rating_ladies === '' ||
                    tee.slope_juniors === '' ||
                    tee.course_rating_juniors === '') && (
                    <button
                      type="button"
                      onClick={() => copyMensToAllGenders(index)}
                      className="tap-extend block w-full text-center text-[11px] font-medium text-muted hover:text-text transition-colors py-1.5 [--tap-extend:-8px_0]"
                    >
                      {t('copyToAllGendersButton')}
                    </button>
                  )}

                {expandedLadies[index] ? (
                  <GenderRatingBlock
                    teeIndex={index}
                    gender="ladies"
                    label={t('genderLadies')}
                    clearLabel={t('clearGenderButton')}
                    parTotalLabel={t('parTotalLabel')}
                    parTotalSuffix={t('parTotalSuffix')}
                    slopeLabel={t('slopeLabel')}
                    crLabel={t('crLabel')}
                    slopeHint={t('typicalHintLadiesSlope')}
                    crHint={t('typicalHintLadiesCr')}
                    slope={tee.slope_ladies}
                    cr={tee.course_rating_ladies}
                    parTotal={parTotalLadies}
                    showParTotal={
                      tee.slope_ladies !== '' &&
                      tee.course_rating_ladies !== ''
                    }
                    showClear={
                      tee.slope_ladies !== '' ||
                      tee.course_rating_ladies !== ''
                    }
                    onClear={() => clearGender(index, 'ladies')}
                    onChange={(patch) => updateTee(index, patch)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => expandGender(index, 'ladies')}
                    className="block w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted hover:text-text hover:border-border transition-colors"
                  >
                    {t('addLadiesRatingButton')}
                  </button>
                )}

                {expandedJuniors[index] ? (
                  <GenderRatingBlock
                    teeIndex={index}
                    gender="juniors"
                    label={t('genderJuniors')}
                    clearLabel={t('clearGenderButton')}
                    parTotalLabel={t('parTotalLabel')}
                    parTotalSuffix={t('parTotalSuffix')}
                    slopeLabel={t('slopeLabel')}
                    crLabel={t('crLabel')}
                    slopeHint={t('typicalHintJuniorsSlope')}
                    crHint={t('typicalHintJuniorsCr')}
                    slope={tee.slope_juniors}
                    cr={tee.course_rating_juniors}
                    parTotal={parTotalJuniors}
                    showParTotal={
                      tee.slope_juniors !== '' &&
                      tee.course_rating_juniors !== ''
                    }
                    showClear={
                      tee.slope_juniors !== '' ||
                      tee.course_rating_juniors !== ''
                    }
                    onClear={() => clearGender(index, 'juniors')}
                    onChange={(patch) => updateTee(index, patch)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => expandGender(index, 'juniors')}
                    className="block w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted hover:text-text hover:border-border transition-colors"
                  >
                    {t('addJuniorsRatingButton')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {teeBoxes.length < MAX_TEE_BOXES && (
          <Button
            type="button"
            variant="secondary"
            onClick={addTee}
            className="mt-3 w-full text-sm"
          >
            {t('addTeeBoxButton')}
          </Button>
        )}
      </section>

      {/* Always in view, just above the bottom nav (59.5 px at 390: 58.5 px
          link plus its 1 px top border; the nav pads the safe area itself).
          Chromium paints the stuck bar half a pixel above its box, so a strip
          of the page colour hangs under it (as in EndGameBar) and nothing
          shows through between the bar and the nav. `data-course-save-bar`
          gives the page scroll padding (globals.css), so a tabbed-to field
          never ends up behind the bar. */}
      <div
        data-course-save-bar
        className={`sticky bottom-[calc(59.5px+env(safe-area-inset-bottom,0px))] z-20 -mx-5 mt-6 flex flex-col gap-1 border-t border-border px-4 pt-3 pb-5 leading-[normal] after:absolute after:inset-x-0 after:top-full after:h-1 ${SAVE_BAR_TONE[tone]}`}
      >
        <SubmitButton
          size="large"
          className="w-full"
          pendingLabel={t('pendingLabel')}
          disabled={blocked}
          aria-describedby={blocked ? 'course-save-status' : undefined}
        >
          {submitLabel}
        </SubmitButton>

        {blocked && (
          <SaveStatus
            siGaps={siGaps}
            teeIndex={firstTeeProblem}
            teeProblem={teeProblems[firstTeeProblem] ?? null}
          />
        )}
      </div>

      {footer}
    </form>
  );
}

// What still blocks "Lagre bane" (#2279): one line for the indices (a typed
// value outside 1–18 first, then duplicates, then the count still missing), one
// for the first tee box with a rating problem. Wired to the button through
// aria-describedby; no aria-live, since it changes on every keystroke.
function SaveStatus({
  siGaps,
  teeIndex,
  teeProblem,
}: {
  siGaps: { missing: number[]; duplicates: number[]; invalid: number[] };
  teeIndex: number;
  teeProblem: 'partial' | 'missing' | null;
}) {
  const t = useTranslations('courseForm.form');
  const locale = useLocale() as AppLocale;
  const { missing, duplicates, invalid } = siGaps;
  const list = (numbers: number[]) => formatListLocale(numbers.map(String), locale);
  return (
    <div id="course-save-status" className="space-y-1 text-center text-xs leading-[normal] text-muted">
      {missing.length > 0 && (
        <p>
          {invalid.length > 0
            ? t('siInvalid', { count: invalid.length, holes: list(invalid) })
            : duplicates.length > 0
              ? t('siDuplicates', { count: duplicates.length, numbers: list(duplicates) })
              : t('siMissingCount', { count: missing.length })}
        </p>
      )}
      {teeProblem !== null && (
        <p>
          {teeProblem === 'partial'
            ? t('teeRatingPartial', { number: teeIndex + 1 })
            : t('teeRatingMissing', { number: teeIndex + 1 })}
        </p>
      )}
    </div>
  );
}

// «+ Legg til avvikende par for damer» while the card has no ladies' row,
// «Fjern dame-overstyring» once it has one (the same for juniors).
function GenderParToggle({
  shown,
  addLabel,
  removeLabel,
  onAdd,
  onRemove,
}: {
  shown: boolean;
  addLabel: string;
  removeLabel: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={shown ? onRemove : onAdd}
      className="block w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted hover:text-text hover:border-border transition-colors"
    >
      {shown ? removeLabel : addLabel}
    </button>
  );
}

function GenderRatingBlock({
  teeIndex,
  gender,
  label,
  clearLabel,
  parTotalLabel,
  parTotalSuffix,
  slopeLabel,
  crLabel,
  slopeHint,
  crHint,
  slope,
  cr,
  parTotal,
  showParTotal,
  showClear,
  onClear,
  onChange,
}: {
  teeIndex: number;
  gender: 'mens' | 'ladies' | 'juniors';
  label: string;
  clearLabel: string;
  parTotalLabel: string;
  parTotalSuffix: string;
  slopeLabel: string;
  crLabel: string;
  slopeHint: string;
  crHint: string;
  slope: string;
  cr: string;
  parTotal: number;
  showParTotal: boolean;
  showClear: boolean;
  onClear: () => void;
  onChange: (patch: Partial<TeeBoxData>) => void;
}) {
  return (
    <fieldset className="border border-border/60 rounded-lg p-3 space-y-3">
      {/* Legend first, floated — see GenderParBlock (#2240). */}
      <legend className="float-left px-0 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {label}
      </legend>
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          className="tap-extend float-right text-[11px] font-medium text-muted hover:text-danger transition-colors [--tap-extend:-16px_0_-12px]"
        >
          {clearLabel}
        </button>
      )}
      <div className="clear-both grid grid-cols-2 gap-2">
        <Input
          id={`tee_${teeIndex}_slope_${gender}`}
          name={`tee_${teeIndex}_slope_${gender}`}
          type="number"
          inputMode="numeric"
          min={55}
          max={165}
          step={1}
          label={slopeLabel}
          hint={slopeHint}
          value={slope}
          onChange={(e) =>
            onChange({ [`slope_${gender}`]: e.target.value } as Partial<TeeBoxData>)
          }
        />
        <Input
          id={`tee_${teeIndex}_cr_${gender}`}
          name={`tee_${teeIndex}_cr_${gender}`}
          type="number"
          inputMode="decimal"
          min={50}
          max={90}
          step={0.1}
          label={crLabel}
          hint={crHint}
          value={cr}
          onChange={(e) =>
            onChange({ [`course_rating_${gender}`]: e.target.value } as Partial<TeeBoxData>)
          }
        />
      </div>
      <p className="font-sans text-[11.5px] tabular-nums text-muted">
        {parTotalLabel}{' '}
        <span className="text-text font-medium">
          {showParTotal ? parTotal : '—'}
        </span>{' '}
        <span className="text-muted">{parTotalSuffix}</span>
      </p>
    </fieldset>
  );
}
