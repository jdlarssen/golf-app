'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getTeeLengthWarning } from '@/lib/courses/teeLengthWarning';
import { MAX_TEE_BOXES } from './constants';

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
};

const DEFAULT_HOLES: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: '4',
  par_ladies: '4',
  par_juniors: '4',
  stroke_index: String(i + 1),
}));

const DEFAULT_TEE: TeeBoxData = {
  name: '',
  length_meters: '',
  slope_mens: '113',
  course_rating_mens: '70.0',
  slope_ladies: '',
  course_rating_ladies: '',
  slope_juniors: '',
  course_rating_juniors: '',
};

// Par-valg per hull er begrenset til 3/4/5 — tre tap-knapper i stedet for
// number-input fjerner 18 tastatur-popups på telefon. Par 6 finnes på
// enkelte par-6-hull i verden, men ikke på norske baner Tørny støtter i dag.
const PAR_OPTIONS = [3, 4, 5] as const;
type ParOption = (typeof PAR_OPTIONS)[number];

function isParOption(v: number): v is ParOption {
  return v === 3 || v === 4 || v === 5;
}

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

// Brukes til å avgjøre om Tøm-knappen skal vises på herrer-blokken på
// new-flyten: så lenge herrer er identisk med default (113/70.0), holder
// vi knappen skjult for å hindre at admin utilsiktet tømmer prefylte
// defaults før de har lagt til noe eget.
function isMensAtDefault(tee: TeeBoxData): boolean {
  return (
    tee.slope_mens === DEFAULT_TEE.slope_mens &&
    tee.course_rating_mens === DEFAULT_TEE.course_rating_mens
  );
}

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
}: Props) {
  const t = useTranslations('courseForm.form');

  // Skiller new-flyten (defaults i herrer-blokken) fra edit-flyten (lagrede
  // tall): Tøm-knappen på herrer-blokken skjules på new-flyten så lenge
  // verdiene er identiske med default, men vises alltid på edit-flyten når
  // minst ett felt har innhold.
  const loadedFromInitialData = initialData !== undefined;
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
  // og kollaps seksjonen. Brukes når admin trykker «Fjern dame/junior-
  // overstyring» i avvikende-par-seksjonen.
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
  function updateMensPar(index: number, par: ParOption) {
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
      className="space-y-6"
    >
      {redirectBase !== undefined && (
        <input type="hidden" name="redirect_base" value={redirectBase} />
      )}
      {successRedirect !== undefined && (
        <input type="hidden" name="success_redirect" value={successRedirect} />
      )}
      <Input
        id="name"
        name="name"
        type="text"
        label={t('nameLabel')}
        placeholder={t('namePlaceholder')}
        defaultValue={initialData?.name ?? ''}
        required
      />

      <section>
        <h2 className="text-sm font-medium text-text mb-1">{t('holesHeading')}</h2>
        <p className="text-xs text-muted mb-3">{t('holesHint')}</p>
        <div className="space-y-3">
          {holes.map((hole, index) => (
            <div
              key={hole.hole_number}
              className="grid grid-cols-[3.5rem_1fr_5.5rem] gap-3 items-end"
            >
              <div className="text-sm font-medium text-text pb-2">
                {t('holeLabel', { number: hole.hole_number })}
              </div>
              <ParTapButtons
                holeNumber={hole.hole_number}
                name={`hole_${hole.hole_number}_par_mens`}
                value={hole.par_mens}
                ariaLabel={t('parGroupAriaLabel', { number: hole.hole_number })}
                onChange={(next) => updateMensPar(index, next)}
              />
              <Input
                id={`hole_${hole.hole_number}_si`}
                name={`hole_${hole.hole_number}_si`}
                type="number"
                inputMode="numeric"
                min={1}
                max={18}
                step={1}
                label={t('siLabel')}
                value={hole.stroke_index}
                onChange={(e) =>
                  updateHole(index, { stroke_index: e.target.value })
                }
                required
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {expandedLadiesPar ? (
          <GenderParOverrideSection
            gender="ladies"
            label={t('ladiesParLabel')}
            removeLabel={t('ladiesParRemoveLabel')}
            genderParLabel={t('genderParLadies')}
            holes={holes}
            parTotal={parTotalLadies}
            parTotalGenderLabel={t('parTotalGenderLabel', { gender: t('genderParLadies') })}
            parTotalSuffix={t('parTotalSuffix')}
            genderParHint={t('genderParHint')}
            holeLabel={(n) => t('holeLabel', { number: n })}
            parAriaLabel={(n) =>
              t('parAriaLabelWithGender', { number: n, genderLabel: t('ladiesParLabel').toLowerCase() })
            }
            onChange={(holeIndex, par) =>
              updateHole(holeIndex, { par_ladies: String(par) })
            }
            onRemove={() => removeGenderParOverride('ladies')}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpandedLadiesPar(true)}
            className="block w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted hover:text-text hover:border-border transition-colors"
          >
            {t('addLadiesParButton')}
          </button>
        )}

        {expandedJuniorsPar ? (
          <GenderParOverrideSection
            gender="juniors"
            label={t('juniorsParLabel')}
            removeLabel={t('juniorsParRemoveLabel')}
            genderParLabel={t('genderParJuniors')}
            holes={holes}
            parTotal={parTotalJuniors}
            parTotalGenderLabel={t('parTotalGenderLabel', { gender: t('genderParJuniors') })}
            parTotalSuffix={t('parTotalSuffix')}
            genderParHint={t('genderParHint')}
            holeLabel={(n) => t('holeLabel', { number: n })}
            parAriaLabel={(n) =>
              t('parAriaLabelWithGender', { number: n, genderLabel: t('juniorsParLabel').toLowerCase() })
            }
            onChange={(holeIndex, par) =>
              updateHole(holeIndex, { par_juniors: String(par) })
            }
            onRemove={() => removeGenderParOverride('juniors')}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpandedJuniorsPar(true)}
            className="block w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted hover:text-text hover:border-border transition-colors"
          >
            {t('addJuniorsParButton')}
          </button>
        )}
      </section>

      {/* Hidden mirror-inputs for kjønn som ikke har egen seksjon åpen.
          Server-action leser hole_${i}_par_ladies / _juniors fra FormData;
          når seksjonen er kollapset må vi fortsatt sende verdien (= par_mens)
          slik at INSERT setter alle tre kolonner. Når seksjonen er åpen
          rendres ParTapButtons med samme name og tar over. */}
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

      <section>
        <h2 className="text-sm font-medium text-text mb-3">
          {t('teeBoxesHeading', { count: teeBoxes.length, max: MAX_TEE_BOXES })}
        </h2>
        <div className="space-y-4">
          {teeBoxes.map((tee, index) => (
            <div
              key={index}
              className="border border-border rounded-xl p-4 space-y-4"
            >
              {tee.id && (
                <input type="hidden" name={`tee_${index}_id`} value={tee.id} />
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-text">
                  {t('teeBoxLabel', { number: index + 1 })}
                </span>
                <div className="flex items-center gap-3">
                  {teeBoxes.length < MAX_TEE_BOXES && (
                    <button
                      type="button"
                      onClick={() => duplicateTee(index)}
                      className="text-xs font-medium text-muted hover:text-text transition-colors"
                    >
                      {t('duplicateButton')}
                    </button>
                  )}
                  {teeBoxes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTee(index)}
                      className="text-xs font-medium text-danger hover:opacity-80 transition-opacity"
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
                    (loadedFromInitialData || !isMensAtDefault(tee)) &&
                    (tee.slope_mens !== '' || tee.course_rating_mens !== '')
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
                      className="block w-full text-center text-[11px] font-medium text-muted hover:text-text transition-colors py-1.5"
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

      <SubmitButton
        className="w-full"
        pendingLabel={t('pendingLabel')}
      >
        {submitLabel}
      </SubmitButton>

      {footer}
    </form>
  );
}

// Tre-knapps tap-radio for par-valg. Eksponert som radio-group til
// screen-readers via role+aria-checked. Hidden-input bærer verdien videre
// til FormData under name-et som consumeren oppgir (varierer per kjønn:
// hole_${n}_par_mens / _ladies / _juniors).
function ParTapButtons({
  holeNumber,
  name,
  value,
  onChange,
  ariaLabel,
}: {
  holeNumber: number;
  name: string;
  value: string;
  onChange: (par: ParOption) => void;
  ariaLabel?: string;
}) {
  const t = useTranslations('courseForm.form');
  const current = Number(value);
  return (
    <div>
      <div className="block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-1.5">
        Par
      </div>
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? t('parGroupAriaLabel', { number: holeNumber })}
        className="flex gap-1.5"
      >
        {PAR_OPTIONS.map((p) => {
          const selected = isParOption(current) && current === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(p)}
              className={`flex-1 min-h-[44px] rounded-lg border text-base font-medium tabular-nums transition-colors ${
                selected
                  ? 'border-primary bg-primary text-bg'
                  : 'border-border bg-surface text-text hover:border-text/40'
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

function GenderParOverrideSection({
  gender,
  label,
  removeLabel,
  holes,
  parTotal,
  parTotalGenderLabel,
  parTotalSuffix,
  genderParHint,
  holeLabel,
  parAriaLabel,
  onChange,
  onRemove,
}: {
  gender: 'ladies' | 'juniors';
  label: string;
  removeLabel: string;
  genderParLabel: string;
  holes: HoleData[];
  parTotal: number;
  parTotalGenderLabel: string;
  parTotalSuffix: string;
  genderParHint: string;
  holeLabel: (n: number) => string;
  parAriaLabel: (n: number) => string;
  onChange: (holeIndex: number, par: ParOption) => void;
  onRemove: () => void;
}) {
  const key = `par_${gender}` as 'par_ladies' | 'par_juniors';
  return (
    <fieldset className="border border-border/60 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <legend className="px-0 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {label}
        </legend>
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] font-medium text-muted hover:text-danger transition-colors"
        >
          {removeLabel}
        </button>
      </div>
      <p className="text-xs text-muted">{genderParHint}</p>
      <div className="space-y-3">
        {holes.map((hole, index) => (
          <div
            key={hole.hole_number}
            className="grid grid-cols-[3.5rem_1fr] gap-3 items-end"
          >
            <div className="text-sm font-medium text-text pb-2">
              {holeLabel(hole.hole_number)}
            </div>
            <ParTapButtons
              holeNumber={hole.hole_number}
              name={`hole_${hole.hole_number}_par_${gender}`}
              value={hole[key]}
              ariaLabel={parAriaLabel(hole.hole_number)}
              onChange={(next) => onChange(index, next)}
            />
          </div>
        ))}
      </div>
      <p className="font-sans text-[11.5px] tabular-nums text-muted">
        {parTotalGenderLabel}{' '}
        <span className="text-text font-medium">{parTotal}</span>{' '}
        <span className="text-muted/80">{parTotalSuffix}</span>
      </p>
    </fieldset>
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
  const slopePlaceholder = gender === 'mens' ? '113' : '';
  const crPlaceholder = gender === 'mens' ? '70.0' : '';
  return (
    <fieldset className="border border-border/60 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <legend className="px-0 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {label}
        </legend>
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-muted hover:text-danger transition-colors"
          >
            {clearLabel}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          id={`tee_${teeIndex}_slope_${gender}`}
          name={`tee_${teeIndex}_slope_${gender}`}
          type="number"
          inputMode="numeric"
          min={55}
          max={155}
          step={1}
          label={slopeLabel}
          placeholder={slopePlaceholder}
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
          max={80}
          step={0.1}
          label={crLabel}
          placeholder={crPlaceholder}
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
        <span className="text-muted/80">{parTotalSuffix}</span>
      </p>
    </fieldset>
  );
}
