'use client';

import { startTransition, useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  CUP_PRESETS,
  type CupSessionFormat,
  type CupPreset,
} from '@/lib/cup/cupTemplates';
import { saveCupPlan, type CupPlanActionError } from '@/lib/cup/planActions';

// Slim course/tee shape for Oppsett-rommet: her finnes ingen lag, så vi trenger
// hverken slope/rating (greensome-regnehjelp) eller lag-teller. Bevisst IKKE
// importert fra GenerateMatches (den bygges om i en senere chunk) — rommet
// eier sin egen minimale form-type.
type PlanTeeBox = { id: string; name: string };
type PlanCourse = { id: string; name: string; teeBoxes: PlanTeeBox[] };

type BuiltinPresetId =
  | 'klassisk'
  | 'fourball-singler'
  | 'singler'
  | 'splittet-cup-dag';

type PlanStrategy = 'handicap' | 'random';

// Rekkefølgen på formatene i tilpasset-editorens select. Singel først (default
// for en ny rad), så 2v2-familien.
const SESSION_FORMATS: CupSessionFormat[] = [
  'singles_matchplay',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
];

type Props = {
  tournamentId: string;
  courses: PlanCourse[];
  initial: {
    courseId: string;
    teeBoxId: string;
    /** Oslo-veggklokke ('YYYY-MM-DDTHH:mm') eller '' — allerede konvertert fra plan-ISO server-side. */
    teeOffLocal: string;
    presetId: string;
    customSessions: CupSessionFormat[];
    strategy: PlanStrategy;
    bestBallAllowancePct: number;
  };
  /**
   * Antall allerede genererte matcher som ennå ikke er startet (#1523). Disse
   * arver bane/tee/starttid når planen lagres, så arrangøren får beskjed før
   * hun trykker. 0 → ingen melding (ingenting å oppdatere).
   */
  scheduledMatchCount: number;
};

const INITIAL_STATE: CupPlanActionError = { error: '' };

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
      {children}
    </h2>
  );
}

/**
 * Oppsett-rommets form (#1472, Rom 1). Bane→tee (avhengig), tee-off, format-
 * preset/tilpasset-sesjoner, strategi og best-ball-%. Server-persisteres via
 * `saveCupPlan` (upsert på cupen). Ingen lag-teller/match-preview her — de
 * tilhører Fordel-rommet der spillerne faktisk finnes.
 *
 * #1397: `saveCupPlan` gis via en klient-closure så signaturen forblir
 * `(formData)`, og innsendingen går gjennom `preventDefault` +
 * `startTransition(dispatch)` — React 19 ville ellers auto-resette de
 * ukontrollerte feltene når en feil returneres og slette arrangørens input.
 */
export function CupPlanForm({
  tournamentId,
  courses,
  initial,
  scheduledMatchCount,
}: Props) {
  const t = useTranslations('cup.plan');
  // Preset-navn/-beskrivelser deler hjem med resten av cup-flaten (stabil
  // `cup.presets`-nøkkel); tilpasset-varianten bor i `cup.plan`.
  const tPresets = useTranslations('cup.presets');

  const [state, formAction, isPending] = useActionState(
    async (_prev: CupPlanActionError, formData: FormData) =>
      saveCupPlan(formData),
    INITIAL_STATE,
  );

  // Kode → melding med `t.has`-guard (samme mønster som CupSetup): en umappet
  // kode faller til `unexpected` med rå kode i stedet for en tom banner.
  const errorMessage = (() => {
    if (!state.error) return null;
    const key = `errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('errors.unexpected', { code: state.error });
  })();

  const [courseId, setCourseId] = useState(initial.courseId);
  const [teeBoxId, setTeeBoxId] = useState(initial.teeBoxId);
  const [teeOffAt, setTeeOffAt] = useState(initial.teeOffLocal);
  const [presetId, setPresetId] = useState(initial.presetId);
  const [customSessions, setCustomSessions] = useState<CupSessionFormat[]>(
    initial.customSessions,
  );
  const [strategy, setStrategy] = useState<PlanStrategy>(initial.strategy);
  const [bestBall, setBestBall] = useState<number>(initial.bestBallAllowancePct);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const isSplitDay = presetId === 'splittet-cup-dag';
  const isCustom = presetId === 'tilpasset';

  function handleCourseChange(id: string) {
    setCourseId(id);
    // Bytte bane nullstiller tee — den gamle teen hører til en annen bane.
    setTeeBoxId('');
  }

  function addCustomSession() {
    setCustomSessions((prev) => [...prev, 'singles_matchplay']);
  }
  function removeCustomSession(i: number) {
    setCustomSessions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateCustomSession(i: number, format: CupSessionFormat) {
    setCustomSessions((prev) => prev.map((s, idx) => (idx === i ? format : s)));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={tournamentId} />
      {/* Kun lest server-side for 'tilpasset'; harmløst for de innebygde presetene. */}
      <input
        type="hidden"
        name="custom_sessions"
        value={JSON.stringify(customSessions)}
      />

      <p className="text-sm text-muted">{t('intro')}</p>

      {/* Bane */}
      <div>
        <SectionHeading>{t('courseHeading')}</SectionHeading>
        <label
          htmlFor="cup-plan-course"
          className="block text-sm font-medium text-text mb-1.5"
        >
          {t('courseLabel')}
        </label>
        <select
          id="cup-plan-course"
          name="course_id"
          data-testid="cup-plan-course"
          value={courseId}
          onChange={(e) => handleCourseChange(e.target.value)}
          className="w-full rounded-xl border border-border px-3.5 py-3 bg-surface text-text focus:border-accent transition-[border-color,box-shadow] duration-150"
        >
          <option value="">{t('coursePlaceholder')}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tee (avhengig av bane) */}
      {selectedCourse && (
        <div>
          <SectionHeading>{t('teeHeading')}</SectionHeading>
          <label
            htmlFor="cup-plan-tee"
            className="block text-sm font-medium text-text mb-1.5"
          >
            {t('teeLabel')}
          </label>
          <select
            id="cup-plan-tee"
            name="tee_box_id"
            data-testid="cup-plan-tee"
            value={teeBoxId}
            onChange={(e) => setTeeBoxId(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 bg-surface text-text focus:border-accent transition-[border-color,box-shadow] duration-150"
          >
            <option value="">{t('teePlaceholder')}</option>
            {selectedCourse.teeBoxes.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {tb.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tee-off (valgfri) */}
      <div>
        <SectionHeading>{t('teeOffHeading')}</SectionHeading>
        <label
          htmlFor="cup-plan-teeoff"
          className="block text-sm font-medium text-text mb-1.5"
        >
          {t('teeOffLabel')}
        </label>
        <input
          id="cup-plan-teeoff"
          name="tee_off_at"
          data-testid="cup-plan-teeoff"
          type="datetime-local"
          value={teeOffAt}
          onChange={(e) => setTeeOffAt(e.target.value)}
          className="w-full rounded-xl border border-border px-3.5 py-3 bg-surface text-text focus:border-accent transition-[border-color,box-shadow] duration-150"
        />
        <p className="font-sans text-xs text-muted mt-1.5">{t('teeOffHint')}</p>
      </div>

      {/* Format */}
      <div>
        <SectionHeading>{t('formatHeading')}</SectionHeading>
        <div className="space-y-2">
          {CUP_PRESETS.map((preset: CupPreset) => (
            <label
              key={preset.id}
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                presetId === preset.id
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface hover:border-primary/40'
              }`}
            >
              <input
                type="radio"
                name="preset_id"
                value={preset.id}
                data-testid={`cup-plan-preset-${preset.id}`}
                checked={presetId === preset.id}
                onChange={() => setPresetId(preset.id)}
                className="mt-0.5 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-sm font-semibold text-text">
                  {tPresets(`${preset.id as BuiltinPresetId}.name`)}
                </p>
                <p className="font-sans text-xs text-muted mt-0.5">
                  {tPresets(`${preset.id as BuiltinPresetId}.description`)}
                </p>
              </div>
            </label>
          ))}

          {/* Tilpasset */}
          <label
            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
              isCustom
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="preset_id"
              value="tilpasset"
              data-testid="cup-plan-preset-tilpasset"
              checked={isCustom}
              onChange={() => setPresetId('tilpasset')}
              className="mt-0.5 accent-primary"
            />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-sm font-semibold text-text">
                {t('customPresetName')}
              </p>
              <p className="font-sans text-xs text-muted mt-0.5">
                {t('customPresetDescription')}
              </p>
            </div>
          </label>
        </div>

        {/* Splittet cup-dag: best-ball-andel. Utenfor preset-<label>-en så
            hele label-teksten ikke bindes til dette feltet av skjermlesere. */}
        {isSplitDay && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-4">
            <label
              htmlFor="cup-plan-bestball"
              className="block text-xs font-medium text-text mb-1.5"
            >
              {t('bestBallLabel')}
            </label>
            <input
              id="cup-plan-bestball"
              name="best_ball_allowance_pct"
              data-testid="cup-plan-bestball"
              type="number"
              min={0}
              max={100}
              value={bestBall}
              onChange={(e) => setBestBall(Number(e.target.value))}
              className="w-24 rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm tabular-nums"
            />
            <p className="font-sans text-xs text-muted mt-1">
              {t('bestBallHint')}
            </p>
          </div>
        )}

        {/* Tilpasset: fri sesjon-liste. */}
        {isCustom && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-4 space-y-2">
            {customSessions.map((format, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={format}
                  onChange={(e) =>
                    updateCustomSession(i, e.target.value as CupSessionFormat)
                  }
                  className="flex-1 rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm"
                >
                  {SESSION_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {t(`formats.${f}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeCustomSession(i)}
                  className="min-h-[44px] px-3 py-1 rounded-lg border border-border text-danger text-sm hover:bg-danger/10"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addCustomSession}
              className="min-h-[44px] w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:border-primary hover:text-primary transition-colors"
            >
              {t('addSessionButton')}
            </button>
          </div>
        )}
      </div>

      {/* Strategi */}
      <div>
        <SectionHeading>{t('strategyHeading')}</SectionHeading>
        <div className="space-y-2">
          {(
            [
              [
                'handicap',
                t('strategyHandicapLabel'),
                t('strategyHandicapDescription'),
              ],
              [
                'random',
                t('strategyRandomLabel'),
                t('strategyRandomDescription'),
              ],
            ] as [PlanStrategy, string, string][]
          ).map(([val, label, desc]) => (
            <label
              key={val}
              className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                strategy === val
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface hover:border-primary/40'
              }`}
            >
              <input
                type="radio"
                name="strategy"
                value={val}
                data-testid={`cup-plan-strategy-${val}`}
                checked={strategy === val}
                onChange={() => setStrategy(val)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="font-sans text-sm font-semibold text-text">
                  {label}
                </p>
                <p className="font-sans text-xs text-muted mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {errorMessage && (
        <Banner tone="error" testId="cup-plan-error">
          {errorMessage}
        </Banner>
      )}

      <div className="space-y-2">
        <Button
          type="submit"
          className="w-full"
          data-testid="cup-plan-save"
          pending={isPending}
          pendingLabel={t('savePending')}
        >
          {t('saveButton')}
        </Button>
        {/* #1523: matchene er allerede laget — si hva lagringen gjør med dem. */}
        {scheduledMatchCount > 0 && (
          <p
            className="font-sans text-xs text-muted text-center"
            data-testid="cup-plan-propagation-notice"
          >
            {t('propagationNotice', { count: scheduledMatchCount })}
          </p>
        )}
      </div>
    </form>
  );
}
