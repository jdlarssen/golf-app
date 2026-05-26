'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { MAX_TEE_BOXES } from './constants';

export { MAX_TEE_BOXES };

// Numeric fields are stored as strings so React's controlled inputs preserve
// in-progress decimal entry like "72." before the user types the next digit.
// The server action converts them via Number() when reading FormData.
export type HoleData = {
  hole_number: number;
  par: string;
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
};

const DEFAULT_HOLES: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par: '4',
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

// Typisk slope/CR-range per kjønn for norske 18-hulls baner. Vises som
// muted hint-tekst under hvert felt så admin har et anker mot inntastings-feil
// (f.eks. CR-tall i slope-feltet). Hint-en er statisk — den endrer ikke
// farge eller blokkerer lagring ved verdier utenfor typisk range.
const TYPICAL_HINTS: Record<
  'mens' | 'ladies' | 'juniors',
  { slope: string; cr: string }
> = {
  mens: { slope: 'Typisk 110–135', cr: 'Typisk 67–72' },
  ladies: { slope: 'Typisk 115–140', cr: 'Typisk 68–73' },
  juniors: { slope: 'Typisk 95–125', cr: 'Typisk 60–68' },
};

// MAX_TEE_BOXES re-eksporteres øverst fra ./constants. Server-actions må
// importere det fra ./constants direkte (ikke fra denne 'use client'-modulen
// — Next.js 16 wrapper client-exports som throw-funksjoner på serveren).

// Par-valg per hull er begrenset til 3/4/5 — tre tap-knapper i stedet for
// number-input fjerner 18 tastatur-popups på telefon. Par 6 finnes på
// enkelte par-6-hull i verden, men ikke på norske baner Tørny støtter i dag.
const PAR_OPTIONS = [3, 4, 5] as const;
type ParOption = (typeof PAR_OPTIONS)[number];

function isParOption(v: number): v is ParOption {
  return v === 3 || v === 4 || v === 5;
}

// Sum av hull-par. Brukes både i UI (read-only par-total per tee) og er
// kilde-til-sannhet på server-siden — par_total_<gender> regnes ut fra
// hullene istedenfor å tastes per kjønn.
export function sumHolePars(holes: HoleData[]): number {
  return holes.reduce((sum, h) => {
    const n = Number(h.par);
    return Number.isInteger(n) ? sum + n : sum;
  }, 0);
}

// Sjekker om par eller stroke-indeks er endret på minst ett hull. Tee-data
// + bane-navn ignoreres bevisst — kun per-hull-felter som leses live av
// scoring-laget kan skape mid-runde-uforutsigbarhet. Returnerer false når
// initial-listen er undefined (create-flyten har ingen baseline).
export function hasHoleChanges(
  initial: HoleData[] | undefined,
  current: HoleData[],
): boolean {
  if (!initial) return false;
  return current.some((curr, i) => {
    const init = initial[i];
    if (!init) return true;
    return curr.par !== init.par || curr.stroke_index !== init.stroke_index;
  });
}

function buildHoleChangeConfirmMessage(count: number): string {
  const games = count === 1 ? 'ett spill' : `${count} spill`;
  return (
    `Banen brukes i ${games} som pågår eller er planlagt. ` +
    `Endring av par eller stroke-indeks vil endre score-beregningen ` +
    `mid-runde for spillere som allerede har levert scorekort. ` +
    `Er du sikker på at du vil fortsette?`
  );
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

export function CourseForm({
  action,
  submitLabel,
  initialData,
  affectedGamesCount = 0,
  footer,
}: Props) {
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
    initialTees.map((t) => hasGenderData(t, 'ladies')),
  );
  const [expandedJuniors, setExpandedJuniors] = useState<boolean[]>(
    initialTees.map((t) => hasGenderData(t, 'juniors')),
  );

  const parTotal = useMemo(() => sumHolePars(holes), [holes]);

  function updateHole(index: number, patch: Partial<HoleData>) {
    setHoles((prev) =>
      prev.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    );
  }

  function updateTee(index: number, patch: Partial<TeeBoxData>) {
    setTeeBoxes((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
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

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          affectedGamesCount > 0 &&
          hasHoleChanges(initialData?.holes, holes)
        ) {
          const ok = window.confirm(
            buildHoleChangeConfirmMessage(affectedGamesCount),
          );
          if (!ok) event.preventDefault();
        }
      }}
      className="space-y-6"
    >
      <Input
        id="name"
        name="name"
        type="text"
        label="Navn på banen"
        placeholder="f.eks. Stiklestad Golfbane"
        defaultValue={initialData?.name ?? ''}
        required
      />

      <section>
        <h2 className="text-sm font-medium text-text mb-1">Hull 1–18</h2>
        <p className="text-xs text-muted mb-3">
          Velg par 3, 4 eller 5 per hull. Stroke-indeks 1–18 må brukes
          nøyaktig én gang hver.
        </p>
        <div className="space-y-3">
          {holes.map((hole, index) => (
            <div
              key={hole.hole_number}
              className="grid grid-cols-[3.5rem_1fr_5.5rem] gap-3 items-end"
            >
              <div className="text-sm font-medium text-text pb-2">
                Hull {hole.hole_number}
              </div>
              <ParTapButtons
                holeNumber={hole.hole_number}
                value={hole.par}
                onChange={(next) => updateHole(index, { par: String(next) })}
              />
              <Input
                id={`hole_${hole.hole_number}_si`}
                name={`hole_${hole.hole_number}_si`}
                type="number"
                inputMode="numeric"
                min={1}
                max={18}
                step={1}
                label="SI"
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

      <section>
        <h2 className="text-sm font-medium text-text mb-3">
          Tee-bokser ({teeBoxes.length}/{MAX_TEE_BOXES})
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
                  Tee-boks {index + 1}
                </span>
                <div className="flex items-center gap-3">
                  {teeBoxes.length < MAX_TEE_BOXES && (
                    <button
                      type="button"
                      onClick={() => duplicateTee(index)}
                      className="text-xs font-medium text-muted hover:text-text transition-colors"
                    >
                      Dupliser
                    </button>
                  )}
                  {teeBoxes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTee(index)}
                      className="text-xs font-medium text-danger hover:opacity-80 transition-opacity"
                    >
                      Fjern
                    </button>
                  )}
                </div>
              </div>

              <Input
                id={`tee_${index}_name`}
                name={`tee_${index}_name`}
                type="text"
                label="Navn"
                placeholder="f.eks. Gul eller 57"
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
                label="Banelengde (m)"
                hint="Valgfritt. Total bane-lengde fra denne tee-boksen."
                placeholder="6124"
                value={tee.length_meters}
                onChange={(e) =>
                  updateTee(index, { length_meters: e.target.value })
                }
              />

              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Fyll inn slope og CR for hvert kjønn som spiller fra denne
                  teen. Par-total regnes ut fra hullene.
                </p>

                <GenderRatingBlock
                  teeIndex={index}
                  gender="mens"
                  label="Herrer"
                  slope={tee.slope_mens}
                  cr={tee.course_rating_mens}
                  parTotal={parTotal}
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
                      Kopier til alle kjønn
                    </button>
                  )}

                {expandedLadies[index] ? (
                  <GenderRatingBlock
                    teeIndex={index}
                    gender="ladies"
                    label="Damer"
                    slope={tee.slope_ladies}
                    cr={tee.course_rating_ladies}
                    parTotal={parTotal}
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
                    + Legg til dame-rating
                  </button>
                )}

                {expandedJuniors[index] ? (
                  <GenderRatingBlock
                    teeIndex={index}
                    gender="juniors"
                    label="Junior"
                    slope={tee.slope_juniors}
                    cr={tee.course_rating_juniors}
                    parTotal={parTotal}
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
                    + Legg til junior-rating
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
            + Legg til tee-boks
          </Button>
        )}
      </section>

      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>

      {footer}
    </form>
  );
}

// Tre-knapps tap-radio for par-valg. Eksponert som radio-group til
// screen-readers via role+aria-checked. Hidden-input bærer verdien videre
// til FormData under det samme name-et som det gamle number-input-feltet.
function ParTapButtons({
  holeNumber,
  value,
  onChange,
}: {
  holeNumber: number;
  value: string;
  onChange: (par: ParOption) => void;
}) {
  const current = Number(value);
  return (
    <div>
      <div className="block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-1.5">
        Par
      </div>
      <div role="radiogroup" aria-label={`Par for hull ${holeNumber}`} className="flex gap-1.5">
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
      <input
        type="hidden"
        name={`hole_${holeNumber}_par`}
        value={value}
      />
    </div>
  );
}

function GenderRatingBlock({
  teeIndex,
  gender,
  label,
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
            Tøm dette kjønnet
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
          label="Slope"
          placeholder={slopePlaceholder}
          hint={TYPICAL_HINTS[gender].slope}
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
          label="CR"
          placeholder={crPlaceholder}
          hint={TYPICAL_HINTS[gender].cr}
          value={cr}
          onChange={(e) =>
            onChange({ [`course_rating_${gender}`]: e.target.value } as Partial<TeeBoxData>)
          }
        />
      </div>
      <p className="font-sans text-[11.5px] tabular-nums text-muted">
        Par-total:{' '}
        <span className="text-text font-medium">
          {showParTotal ? parTotal : '—'}
        </span>{' '}
        <span className="text-muted/80">(sum av hullene)</span>
      </p>
    </fieldset>
  );
}
