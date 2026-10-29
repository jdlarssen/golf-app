'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { findStrokeIndexGaps, teeRatingProblem } from '@/lib/courses/coursePayload';
import {
  canSplitSingleIndices,
  expandNineHoles,
  foldToNine,
  splitSingleIndices,
} from '@/lib/courses/nineHoles';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';
import { formatListLocale } from '@/lib/i18n/format';
import type { TeeBoxData, TeeRows } from '@/lib/courses/teeChips';
import type { SimilarCourseTarget } from '@/lib/courses/similarCoursesPanel';
import type { AppLocale } from '@/i18n/routing';
import { MAX_TEE_BOXES } from './constants';
import { HoleGridEditor } from './HoleGridEditor';
import { TeeTableEditor } from './TeeTableEditor';
import { SimilarCoursesPanel } from './SimilarCoursesPanel';

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

export type { TeeBoxData };

export type CourseFormInitialData = {
  name: string;
  /** A 9-hole course played twice (#2484); `holes` still holds all 18. */
  nineHoles?: boolean;
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
  // Rounds of any status on the course (#2484). Above 0 the hole count is
  // locked: switching would rewrite par 10–18 under a played round, and
  // update_course_with_layout refuses it anyway.
  usedInGamesCount?: number;
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
  // #2485: «Finnes banen alt?» under the name, and where its «Bruk denne»
  // goes. Left out on the edit page, which then shows no list.
  similarCourses?: SimilarCourseTarget;
};

const DEFAULT_HOLES: HoleData[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: '4',
  par_ladies: '4',
  par_juniors: '4',
  stroke_index: '',
}));

// Sum av hull-par per kjønn. Brukes både i UI (par-totalen på banekortet) og
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

const SAVE_BAR_TONE = {
  app: 'bg-bg after:bg-bg',
  admin: 'bg-admin-bg after:bg-admin-bg',
} as const;

// Sjekker om hullene har avvikende par for et gitt kjønn — brukes for å
// avgjøre om per-kjønn-par-seksjonen skal stå åpen ved mount på edit-flyten.
// In 9-hole mode holes 10–18 are 1–9 again with the second round's index
// (#2484): folding and expanding copies the par of 1–9 onto 10–18 and keeps
// every index where it is. A course without 18 holes is left as it is.
function mirrorNine(holes: HoleData[]): HoleData[] {
  if (holes.length !== 18) return holes;
  const { holes: nine, secondRound } = foldToNine(holes);
  return expandNineHoles(nine, secondRound);
}

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
  usedInGamesCount = 0,
  footer,
  redirectBase,
  successRedirect,
  tone = 'app',
  similarCourses,
}: Props) {
  const t = useTranslations('courseForm.form');

  // Controlled so the similar-courses panel can read it; `name="name"` keeps
  // the FormData the server action reads unchanged.
  const [name, setName] = useState(initialData?.name ?? '');
  const courseCardRef = useRef<HTMLDivElement>(null);

  const [holes, setHoles] = useState<HoleData[]>(
    initialData?.holes ?? DEFAULT_HOLES,
  );
  const [holeCount, setHoleCount] = useState<'18' | '9'>(
    initialData?.nineHoles ? '9' : '18',
  );
  const nine = holeCount === '9';
  const holeCountLocked = usedInGamesCount > 0;
  // «Fordelt …» stays under the card until an index changes.
  const [splitDone, setSplitDone] = useState(false);
  // The tees as the slope table's rows (#2486); `removed` keeps saved rows a
  // chip took off, so tapping it on again brings back the same tee.
  const [tees, setTees] = useState<TeeRows>({
    rows: initialData?.teeBoxes ?? [],
    removed: [],
  });
  // The juniors' column and the length card open on the edit page when a tee
  // already has numbers there, so a saved value is never sent as empty.
  const [juniorsOpen, setJuniorsOpen] = useState(() =>
    tees.rows.some((tee) => tee.slope_juniors !== '' || tee.course_rating_juniors !== ''),
  );
  const [lengthOpen, setLengthOpen] = useState(() =>
    tees.rows.some((tee) => tee.length_meters !== ''),
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
  const parNineMens = useMemo(() => sumHolePars(holes.slice(0, 9), 'mens'), [holes]);

  // "Lagre bane" stays disabled until the indices and tee ratings would pass
  // the server (#2279) — a server bounce reloads an empty form, so 18 typed
  // indices would be lost. A duplicate always leaves a number missing, so
  // `missing` alone gates the indices. In 9-hole mode holes 10–18 hold the
  // second round, so the 18 values are the server's expanded ones (#2484).
  const siGaps = useMemo(
    () => findStrokeIndexGaps(holes.map((h) => h.stroke_index)),
    [holes],
  );
  const teeProblems = useMemo(
    () =>
      tees.rows.map((tee) =>
        teeRatingProblem([
          { slope: tee.slope_mens, cr: tee.course_rating_mens },
          { slope: tee.slope_ladies, cr: tee.course_rating_ladies },
          { slope: tee.slope_juniors, cr: tee.course_rating_juniors },
        ]),
      ),
    [tees.rows],
  );
  const firstTeeProblem = teeProblems.findIndex((p) => p !== null);
  const noTees = tees.rows.length === 0;
  const blocked = siGaps.missing.length > 0 || firstTeeProblem !== -1 || noTees;

  function updateHole(index: number, patch: Partial<HoleData>) {
    setHoles((prev) => {
      const next = prev.map((h, i) => (i === index ? { ...h, ...patch } : h));
      return nine ? mirrorNine(next) : next;
    });
  }

  function updateSi(index: number, value: string) {
    setSplitDone(false);
    updateHole(index, { stroke_index: value });
  }

  // 18 → 9 keeps holes 1–9 and their par, and makes the index of 10–18 the
  // second round; 9 → 18 leaves the 18 holes as they stand, now each its own.
  function changeHoleCount(next: '18' | '9') {
    setHoleCount(next);
    setSplitDone(false);
    if (next === '9') setHoles(mirrorNine);
  }

  const canSplit =
    nine &&
    canSplitSingleIndices(
      holes.slice(0, 9).map((h) => h.stroke_index),
      holes.slice(9).map((h) => h.stroke_index),
    );

  // «Fordel»: one index per hole on the scorecard → odd for round 1, even for
  // round 2. The fields stay editable; saving is the confirmation (owner 29.10).
  function splitIndices() {
    const { round1, round2 } = splitSingleIndices(
      holes.slice(0, 9).map((h) => Number(h.stroke_index.trim())),
    );
    setHoles((prev) =>
      prev.map((h, i) => ({
        ...h,
        stroke_index: String(i < 9 ? round1[i] : round2[i - 9]),
      })),
    );
    setSplitDone(true);
  }

  // «Fjern junior-kolonnen» empties the juniors' numbers on every tee, the
  // remembered ones too, so a tee tapped back on never brings back numbers the
  // closed column would not send.
  function setJuniors(open: boolean) {
    setJuniorsOpen(open);
    if (open) return;
    const clear = (tee: TeeBoxData) => ({ ...tee, slope_juniors: '', course_rating_juniors: '' });
    setTees((prev) => ({ rows: prev.rows.map(clear), removed: prev.removed.map(clear) }));
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
    setHoles((prev) => {
      const updated = prev.map((h, i) => {
        if (i !== index) return h;
        return {
          ...h,
          par_mens: next,
          par_ladies: expandedLadiesPar ? h.par_ladies : next,
          par_juniors: expandedJuniorsPar ? h.par_juniors : next,
        };
      });
      return nine ? mirrorNine(updated) : updated;
    });
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {similarCourses && (
        <SimilarCoursesPanel
          query={name}
          target={similarCourses}
          // «Nei, legg til … som ny bane»: on to the course card, its first par cell.
          onAddAnyway={() =>
            courseCardRef.current?.querySelector<HTMLButtonElement>('tbody button')?.focus()
          }
        />
      )}

      {/* «Hvor mange hull?» (#2484). The radios carry no field name the
          server reads: a locked (disabled) radio is left out of FormData, so
          the hidden input always sends the choice. */}
      <input type="hidden" name="hole_count" value={holeCount} />
      <p
        aria-hidden
        className="mt-[18px] mb-2 font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted"
      >
        {t('holeCountLegend')}
      </p>
      <div className="-mx-1">
        <ChoiceCardGrid columns={2} label={t('holeCountLegend')}>
          {(['18', '9'] as const).map((value) => (
            <RadioChoiceCard
              key={value}
              name="hole_count_choice"
              value={value}
              checked={holeCount === value}
              onChange={() => changeHoleCount(value)}
              disabled={holeCountLocked}
              height={52}
              layout="centered"
              titleSize={15}
              // The artboard sets these two in Inter, not Fraunces.
              title={
                <span className="font-sans">
                  {value === '18' ? t('holeCount18') : t('holeCount9')}
                </span>
              }
            />
          ))}
        </ChoiceCardGrid>
        {holeCountLocked && (
          <p className="mt-2 px-1 text-xs leading-[normal] text-muted">
            {t('holeCountLocked')}
          </p>
        )}
      </div>

      <div ref={courseCardRef} className="-mx-2 mt-3">
        <HoleGridEditor
          holes={holes}
          mode={nine ? 'nine' : 'eighteen'}
          showLadies={expandedLadiesPar}
          showJuniors={expandedJuniorsPar}
          parTotal={parTotalMens}
          parNine={parNineMens}
          gaps={siGaps}
          onPar={(index, gender, par) =>
            gender === 'mens'
              ? updateMensPar(index, par)
              : updateHole(index, { [`par_${gender}`]: String(par) })
          }
          onSi={updateSi}
        />
      </div>

      {nine && (
        <div className="mt-2.5 space-y-2">
          <p className="text-xs leading-[1.45] text-muted">{t('nineHint')}</p>
          {canSplit && (
            <button
              type="button"
              data-testid="nine-split"
              onClick={splitIndices}
              className="block min-h-11 w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted hover:text-text hover:border-border transition-colors"
            >
              {t('splitButton')}
            </button>
          )}
          {splitDone && (
            <p role="status" data-testid="nine-split-done" className="text-xs font-semibold leading-[normal] text-text">
              {t('splitDone')}
            </p>
          )}
        </div>
      )}

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
        (nine ? holes.slice(0, 9) : holes).map((h) => (
          <input
            key={`mirror-ladies-${h.hole_number}`}
            type="hidden"
            name={`hole_${h.hole_number}_par_ladies`}
            value={h.par_ladies}
          />
        ))}
      {!expandedJuniorsPar &&
        (nine ? holes.slice(0, 9) : holes).map((h) => (
          <input
            key={`mirror-juniors-${h.hole_number}`}
            type="hidden"
            name={`hole_${h.hole_number}_par_juniors`}
            value={h.par_juniors}
          />
        ))}

      <TeeTableEditor
        tees={tees}
        nine={nine}
        onTees={setTees}
        juniorsOpen={juniorsOpen}
        onJuniorsOpen={setJuniors}
        lengthOpen={lengthOpen}
        onLengthOpen={() => setLengthOpen(true)}
      />

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
          // The artboard's grey text on the disabled button, here only
          // (owner 05.10); `!` beats the large button's own disabled colour.
          className="w-full disabled:text-save-disabled-fg!"
          pendingLabel={t('pendingLabel')}
          disabled={blocked}
          aria-describedby={blocked ? 'course-save-status' : undefined}
        >
          {submitLabel}
        </SubmitButton>

        {blocked && (
          <SaveStatus
            siGaps={siGaps}
            nine={nine}
            noTees={noTees}
            teeName={tees.rows[firstTeeProblem]?.name ?? ''}
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
// for the tees: none picked, or the first with a rating problem, by name
// (#2486). Wired to the button through aria-describedby; no aria-live, since it
// changes on every keystroke.
function SaveStatus({
  siGaps,
  nine,
  noTees,
  teeName,
  teeProblem,
}: {
  siGaps: { missing: number[]; duplicates: number[]; invalid: number[] };
  /** 9-hole mode: positions 10–18 are round 2 of holes 1–9 (#2484). */
  nine: boolean;
  noTees: boolean;
  teeName: string;
  teeProblem: 'partial' | 'missing' | null;
}) {
  const t = useTranslations('courseForm.form');
  const locale = useLocale() as AppLocale;
  const { missing, duplicates } = siGaps;
  const invalid = nine
    ? [...new Set(siGaps.invalid.map((n) => (n > 9 ? n - 9 : n)))].sort((a, b) => a - b)
    : siGaps.invalid;
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
      {noTees && <p>{t('teeNoneSelected')}</p>}
      {teeProblem !== null && (
        <p>
          {teeProblem === 'partial'
            ? t('teeRatingPartial', { name: teeName })
            : t('teeRatingMissing', { name: teeName })}
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
