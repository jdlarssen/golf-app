'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  CUP_PRESETS,
  buildSessions,
  type CupSessionFormat,
  type CupPreset,
  type SessionPlan,
} from '@/lib/cup/cupTemplates';
import {
  generateCupPlan,
  type PlannedMatch,
  type CupPlayer,
  type PairingStrategy,
} from '@/lib/cup/cupPairing';
import { createCupMatchesFromPlan } from './actions';
import {
  MAX_PERSONAL_CUP_MATCHES,
  MAX_PERSONAL_CUP_PLAYERS,
} from '@/lib/cup/limits';
import type { WizardPlayer, WizardCourse } from './GenerateMatches';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamAssignment = 'team1' | 'team2' | 'unassigned';

type CustomSession = {
  format: CupSessionFormat;
};

type WizardProps = {
  tournamentId: string;
  team1Name: string;
  team2Name: string;
  players: WizardPlayer[];
  courses: WizardCourse[];
  // #526: maks antall matcher for personlig cup (ikke-admin). undefined =
  // uncapped (admin/klubb-cup).
  matchCap?: number;
};

type Step = 1 | 2 | 3 | 4 | 5;

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  current,
  total,
  t,
}: {
  current: number;
  total: number;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <p className="font-sans text-xs text-muted">
        {t('generate.stepIndicator', { current, total })}
      </p>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              i + 1 <= current ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
      {children}
    </h2>
  );
}

// ─── Step 1: Roster assignment ────────────────────────────────────────────────

function Step1Roster({
  players,
  team1Name,
  team2Name,
  assignments,
  onChange,
  t,
}: {
  players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  assignments: Record<string, TeamAssignment>;
  onChange: (id: string, val: TeamAssignment) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const team1Count = Object.values(assignments).filter((v) => v === 'team1').length;
  const team2Count = Object.values(assignments).filter((v) => v === 'team2').length;
  const diff = Math.abs(team1Count - team2Count);

  return (
    <div>
      <SectionHeading>{t('generate.step1Heading')}</SectionHeading>
      {diff >= 2 && team1Count > 0 && team2Count > 0 && (
        <div className="mb-4">
          <Banner tone="warning">
            {t('generate.unevenTeamsWarning', { count1: team1Count, count2: team2Count })}
          </Banner>
        </div>
      )}
      <div className="space-y-2">
        {players.map((p) => {
          const val = assignments[p.id] ?? 'unassigned';
          return (
            <Card key={p.id} className="!p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-medium text-text truncate">
                    {p.displayName}
                  </p>
                  <p className="font-sans text-xs text-muted tabular-nums">
                    HCP {p.hcpIndex.toFixed(1)}
                  </p>
                </div>
                <div className="flex shrink-0 rounded-lg border border-border overflow-hidden text-xs font-medium">
                  {([
                    ['team1', team1Name],
                    ['unassigned', '—'],
                    ['team2', team2Name],
                  ] as [TeamAssignment, string][]).map(([opt, label]) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChange(p.id, opt)}
                      className={`min-h-[36px] px-2.5 py-1 transition-colors ${
                        val === opt
                          ? 'bg-primary text-white'
                          : 'bg-surface text-text hover:bg-primary-soft'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl border border-border p-3">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {team1Name}
          </p>
          <p className="font-serif text-3xl tabular-nums text-primary mt-1">{team1Count}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {team2Name}
          </p>
          <p className="font-serif text-3xl tabular-nums text-primary mt-1">{team2Count}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Course + tee ─────────────────────────────────────────────────────

function Step2Course({
  courses,
  courseId,
  teeBoxId,
  onCourseChange,
  onTeeChange,
  t,
}: {
  courses: WizardCourse[];
  courseId: string;
  teeBoxId: string;
  onCourseChange: (id: string) => void;
  onTeeChange: (id: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const selectedCourse = courses.find((c) => c.id === courseId);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{t('generate.step2BaneHeading')}</SectionHeading>
        <label htmlFor="generer-course" className="block text-sm font-medium text-text mb-1.5">
          {t('generate.step2CourseLabel')}
        </label>
        <select
          id="generer-course"
          value={courseId}
          onChange={(e) => onCourseChange(e.target.value)}
          className="w-full rounded-xl border border-border px-3.5 py-3 bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
        >
          <option value="">{t('generate.step2CoursePlaceholder')}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {selectedCourse && (
        <div>
          <SectionHeading>{t('generate.step2TeeHeading')}</SectionHeading>
          <label htmlFor="generer-tee" className="block text-sm font-medium text-text mb-1.5">
            {t('generate.step2TeeLabel')}
          </label>
          <select
            id="generer-tee"
            value={teeBoxId}
            onChange={(e) => onTeeChange(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
          >
            <option value="">{t('generate.step2TeePlaceholder')}</option>
            {selectedCourse.teeBoxes.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {tb.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Preset + pairing ─────────────────────────────────────────────────

function Step3Setup({
  team1Count,
  team2Count,
  presetId,
  onPresetChange,
  customSessions,
  onCustomSessionsChange,
  strategy,
  onStrategyChange,
  matchCap,
  t,
}: {
  team1Count: number;
  team2Count: number;
  presetId: string;
  onPresetChange: (id: string) => void;
  customSessions: CustomSession[];
  onCustomSessionsChange: (sessions: CustomSession[]) => void;
  strategy: PairingStrategy;
  onStrategyChange: (s: PairingStrategy) => void;
  matchCap?: number;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const teamSize = Math.min(team1Count, team2Count);

  const FORMAT_LABELS: Record<CupSessionFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
  };

  function getSessionsForId(id: string): CupSessionFormat[] {
    if (id === 'tilpasset') return customSessions.map((s) => s.format);
    const preset = CUP_PRESETS.find((p) => p.id === id);
    return preset?.sessions ?? [];
  }

  const currentSessions = getSessionsForId(presetId);
  const plan = buildSessions(currentSessions, teamSize);
  const totalMatches = plan.reduce((sum, s) => sum + s.matchCount, 0);
  const overCap = matchCap !== undefined && totalMatches > matchCap;

  function addCustomSession() {
    onCustomSessionsChange([...customSessions, { format: 'singles_matchplay' }]);
  }

  function removeCustomSession(i: number) {
    const next = [...customSessions];
    next.splice(i, 1);
    onCustomSessionsChange(next);
  }

  function updateCustomSession(i: number, format: CupSessionFormat) {
    const next = [...customSessions];
    next[i] = { format };
    onCustomSessionsChange(next);
  }

  return (
    <div className="space-y-6">
      {matchCap !== undefined && (
        <Banner tone={overCap ? 'warning' : 'info'}>
          {overCap
            ? t('generate.overCapWarning', { totalMatches, matchCap })
            : t('generate.capInfoBanner', { matchCap })}
        </Banner>
      )}
      <div>
        <SectionHeading>{t('generate.step3FormatHeading')}</SectionHeading>
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
                name="preset"
                value={preset.id}
                checked={presetId === preset.id}
                onChange={() => onPresetChange(preset.id)}
                className="mt-0.5 accent-primary"
              />
              <div className="min-w-0">
                <p className="font-sans text-sm font-semibold text-text">
                  {t(`presets.${preset.id as 'klassisk' | 'fourball-singler' | 'singler'}.name`)}
                </p>
                <p className="font-sans text-xs text-muted mt-0.5">
                  {t(`presets.${preset.id as 'klassisk' | 'fourball-singler' | 'singler'}.description`)}
                </p>
                {presetId === preset.id && plan.length > 0 && (
                  <p className="font-sans text-xs text-primary mt-1.5">
                    {plan.map((s) => `${s.matchCount} ${FORMAT_LABELS[s.format]}`).join(' · ')}
                    {' '}= {totalMatches} {t('generate.matchesLabel').toLowerCase()}
                  </p>
                )}
              </div>
            </label>
          ))}

          {/* Custom */}
          <label
            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
              presetId === 'tilpasset'
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="preset"
              value="tilpasset"
              checked={presetId === 'tilpasset'}
              onChange={() => onPresetChange('tilpasset')}
              className="mt-0.5 accent-primary"
            />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-sm font-semibold text-text">
                {t('generate.customPresetName')}
              </p>
              <p className="font-sans text-xs text-muted mt-0.5">
                {t('generate.customPresetDescription')}
              </p>
              {presetId === 'tilpasset' && (
                <div className="mt-3 space-y-2">
                  {customSessions.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={s.format}
                        onChange={(e) =>
                          updateCustomSession(i, e.target.value as CupSessionFormat)
                        }
                        className="flex-1 rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                      >
                        <option value="singles_matchplay">{t('generate.formatSingles')}</option>
                        <option value="fourball_matchplay">{t('generate.formatFourball')}</option>
                        <option value="foursomes_matchplay">{t('generate.formatFoursomes')}</option>
                        <option value="greensome_matchplay">{t('generate.formatGreensome')}</option>
                        <option value="chapman_matchplay">{t('generate.formatChapman')}</option>
                        <option value="gruesome_matchplay">{t('generate.formatGruesome')}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeCustomSession(i)}
                        className="min-h-[36px] px-2 py-1 rounded-lg border border-border text-danger text-sm hover:bg-danger/10"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addCustomSession}
                    className="min-h-[36px] w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:border-primary hover:text-primary transition-colors"
                  >
                    {t('generate.addSessionButton')}
                  </button>
                  {presetId === 'tilpasset' && plan.length > 0 && (
                    <p className="font-sans text-xs text-primary">
                      {plan.map((s) => `${s.matchCount} ${FORMAT_LABELS[s.format]}`).join(' · ')}
                      {' '}= {totalMatches} {t('generate.matchesLabel').toLowerCase()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      <div>
        <SectionHeading>{t('generate.step3StrategyHeading')}</SectionHeading>
        <div className="space-y-2">
          {([
            ['handicap', t('generate.strategyHandicapLabel'), t('generate.strategyHandicapDescription')],
            ['random', t('generate.strategyRandomLabel'), t('generate.strategyRandomDescription')],
          ] as [PairingStrategy, string, string][]).map(([val, label, desc]) => (
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
                checked={strategy === val}
                onChange={() => onStrategyChange(val)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="font-sans text-sm font-semibold text-text">{label}</p>
                <p className="font-sans text-xs text-muted mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Preview + adjust ─────────────────────────────────────────────────

function Step4Preview({
  matches,
  team1Players,
  team2Players,
  team1Name,
  team2Name,
  onRegenerate,
  onMatchChange,
  playerById,
  t,
}: {
  matches: PlannedMatch[];
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  onRegenerate: () => void;
  onMatchChange: (matchId: string, side: 'side1' | 'side2', idx: number, userId: string) => void;
  playerById: Map<string, WizardPlayer>;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  // Group by format for display
  const byFormat = new Map<CupSessionFormat, PlannedMatch[]>();
  for (const m of matches) {
    const arr = byFormat.get(m.format) ?? [];
    arr.push(m);
    byFormat.set(m.format, arr);
  }

  const FORMAT_LABELS: Record<CupSessionFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
  };

  function usedIdsInSide(match: PlannedMatch, side: 'side1' | 'side2'): Set<string> {
    const arr = side === 'side1' ? match.side1 : match.side2;
    return new Set(arr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionHeading>{t('generate.step4Heading')}</SectionHeading>
        <button
          type="button"
          onClick={onRegenerate}
          className="font-sans text-xs text-primary underline-offset-2 hover:underline min-h-[36px] px-1"
        >
          {t('generate.regenerateButton')}
        </button>
      </div>

      <div className="space-y-5">
        {Array.from(byFormat.entries()).map(([format, formatMatches]) => (
          <div key={format}>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
              {FORMAT_LABELS[format]}
            </p>
            <div className="space-y-3">
              {formatMatches.map((match) => {
                return (
                  <Card key={match.id} className="!p-4">
                    <p className="font-sans text-xs font-semibold text-muted mb-2">
                      {match.label}
                    </p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      {/* Side 1 */}
                      <div className="space-y-1.5">
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {team1Name}
                        </p>
                        {match.side1.map((uid, idx) => (
                          <select
                            key={idx}
                            value={uid}
                            onChange={(e) =>
                              onMatchChange(match.id, 'side1', idx, e.target.value)
                            }
                            className="w-full rounded-lg border border-border px-2 py-1.5 bg-surface text-text text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                          >
                            {team1Players.map((p) => {
                              const usedIds = usedIdsInSide(match, 'side1');
                              const isCurrentSlot = p.id === uid;
                              const isUsedElsewhere = !isCurrentSlot && usedIds.has(p.id);
                              return (
                                <option key={p.id} value={p.id} disabled={isUsedElsewhere}>
                                  {p.displayName}
                                </option>
                              );
                            })}
                          </select>
                        ))}
                      </div>

                      <span className="font-sans text-xs font-bold text-muted">
                        {t('generate.mot')}
                      </span>

                      {/* Side 2 */}
                      <div className="space-y-1.5">
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {team2Name}
                        </p>
                        {match.side2.map((uid, idx) => (
                          <select
                            key={idx}
                            value={uid}
                            onChange={(e) =>
                              onMatchChange(match.id, 'side2', idx, e.target.value)
                            }
                            className="w-full rounded-lg border border-border px-2 py-1.5 bg-surface text-text text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                          >
                            {team2Players.map((p) => {
                              const usedIds = usedIdsInSide(match, 'side2');
                              const isCurrentSlot = p.id === uid;
                              const isUsedElsewhere = !isCurrentSlot && usedIds.has(p.id);
                              return (
                                <option key={p.id} value={p.id} disabled={isUsedElsewhere}>
                                  {p.displayName}
                                </option>
                              );
                            })}
                          </select>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 5: Confirm ──────────────────────────────────────────────────────────

function Step5Confirm({
  matches,
  courseId,
  teeBoxId,
  courses,
  tournamentId,
  onError,
  t,
}: {
  matches: PlannedMatch[];
  courseId: string;
  teeBoxId: string;
  courses: WizardCourse[];
  tournamentId: string;
  onError: (msg: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const [isPending, startTransition] = useTransition();
  const course = courses.find((c) => c.id === courseId);
  const tee = course?.teeBoxes.find((tb) => tb.id === teeBoxId);

  const FORMAT_LABELS: Record<CupSessionFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
  };

  function handleConfirm() {
    startTransition(async () => {
      const result = await createCupMatchesFromPlan({
        tournamentId,
        courseId,
        teeBoxId,
        matches,
      });
      if (result?.error) {
        const key = result.error as keyof typeof result.error;
        const errorMap: Record<string, string> = {
          not_draft: t('generate.errors.not_draft'),
          missing_course: t('generate.errors.missing_course'),
          no_matches: t('generate.errors.no_matches'),
          insert_failed: t('generate.errors.insert_failed'),
          too_many_matches: t('generate.errors.too_many_matches', { max: MAX_PERSONAL_CUP_MATCHES }),
          too_many_players: t('generate.errors.too_many_players', { max: MAX_PERSONAL_CUP_PLAYERS }),
        };
        onError(errorMap[result.error] ?? t('generate.errors.insert_failed'));
      }
      // On success, the action redirects automatically (NEXT_REDIRECT)
    });
  }

  // Group by format for summary
  const byFormat = new Map<CupSessionFormat, number>();
  for (const m of matches) {
    byFormat.set(m.format, (byFormat.get(m.format) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{t('generate.step5Heading')}</SectionHeading>
        <Card>
          <div className="space-y-3">
            <div>
              <p className="font-sans text-xs text-muted">{t('generate.courseTeeLabel')}</p>
              <p className="font-sans text-sm font-medium text-text mt-0.5">
                {course?.name ?? '—'} · {tee?.name ?? '—'}
              </p>
            </div>
            <div>
              <p className="font-sans text-xs text-muted">{t('generate.matchesLabel')}</p>
              <div className="mt-1 space-y-0.5">
                {Array.from(byFormat.entries()).map(([format, count]) => (
                  <p key={format} className="font-sans text-sm text-text">
                    {count} {FORMAT_LABELS[format]}
                  </p>
                ))}
                <p className="font-serif text-base font-medium text-primary mt-1">
                  {t('generate.matchesTotalLabel', { count: matches.length })}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={handleConfirm}
        pending={isPending}
        pendingLabel={t('generate.confirmPending')}
      >
        {t('generate.confirmButton', { count: matches.length })}
      </Button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function GenerateMatchesWizard({
  tournamentId,
  team1Name,
  team2Name,
  players,
  courses,
  matchCap,
}: WizardProps) {
  const t = useTranslations('cup');
  const TOTAL_STEPS = 5;

  // Step
  const [step, setStep] = useState<Step>(1);

  // Step 1: roster assignments
  const [assignments, setAssignments] = useState<Record<string, TeamAssignment>>(() => {
    const init: Record<string, TeamAssignment> = {};
    for (const p of players) init[p.id] = 'unassigned';
    return init;
  });

  // Step 2: course + tee
  const [courseId, setCourseId] = useState('');
  const [teeBoxId, setTeeBoxId] = useState('');

  // Step 3: preset + strategy
  const [presetId, setPresetId] = useState<string>('klassisk');
  const [customSessions, setCustomSessions] = useState<CustomSession[]>([
    { format: 'singles_matchplay' },
  ]);
  const [strategy, setStrategy] = useState<PairingStrategy>('handicap');

  // Step 4: generated matches
  const [matches, setMatches] = useState<PlannedMatch[]>([]);

  // Step 5: error
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Derived
  const team1Players = players.filter((p) => assignments[p.id] === 'team1');
  const team2Players = players.filter((p) => assignments[p.id] === 'team2');
  const team1Count = team1Players.length;
  const team2Count = team2Players.length;

  const playerById = new Map<string, WizardPlayer>(players.map((p) => [p.id, p]));

  function getSelectedPreset(): CupPreset | null {
    return CUP_PRESETS.find((p) => p.id === presetId) ?? null;
  }

  function getEffectiveSessions(): CupSessionFormat[] {
    if (presetId === 'tilpasset') return customSessions.map((s) => s.format);
    return getSelectedPreset()?.sessions ?? [];
  }

  function getSessionPlan(): SessionPlan[] {
    const teamSize = Math.min(team1Count, team2Count);
    return buildSessions(getEffectiveSessions(), teamSize);
  }

  function runGenerate() {
    const cupTeam1: CupPlayer[] = team1Players.map((p) => ({
      userId: p.id,
      name: p.displayName,
      hcpIndex: p.hcpIndex,
    }));
    const cupTeam2: CupPlayer[] = team2Players.map((p) => ({
      userId: p.id,
      name: p.displayName,
      hcpIndex: p.hcpIndex,
    }));
    const plan = generateCupPlan({
      team1: cupTeam1,
      team2: cupTeam2,
      sessions: getSessionPlan(),
      strategy,
    });
    setMatches(plan);
  }

  // Validation per step
  function canAdvance(): boolean {
    if (step === 1) {
      const preset = getSelectedPreset();
      const minPerTeam = preset?.minPerTeam ?? 1;
      return team1Count >= minPerTeam && team2Count >= minPerTeam;
    }
    if (step === 2) return courseId !== '' && teeBoxId !== '';
    if (step === 3) {
      const plan = getSessionPlan();
      if (plan.length === 0 || !plan.some((s) => s.matchCount > 0)) return false;
      // #526: blokker «Neste» når personlig-cup-taket er overskredet.
      if (matchCap !== undefined) {
        const total = plan.reduce((sum, s) => sum + s.matchCount, 0);
        if (total > matchCap) return false;
      }
      return true;
    }
    if (step === 4) return matches.length > 0;
    return true;
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (step === 3) {
      // Generate matches when entering step 4
      runGenerate();
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS) as Step);
  }

  function handleBack() {
    if (step === 1) return;
    setStep((s) => Math.max(s - 1, 1) as Step);
  }

  function handleAssignmentChange(id: string, val: TeamAssignment) {
    setAssignments((prev) => ({ ...prev, [id]: val }));
  }

  function handleCourseChange(id: string) {
    setCourseId(id);
    setTeeBoxId('');
  }

  function handleMatchChange(
    matchId: string,
    side: 'side1' | 'side2',
    idx: number,
    userId: string,
  ) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const arr = side === 'side1' ? [...m.side1] : [...m.side2];
        arr[idx] = userId;
        return side === 'side1' ? { ...m, side1: arr } : { ...m, side2: arr };
      }),
    );
  }

  // Validation message for step 1
  const step1ValidationMsg: string | null = (() => {
    if (step !== 1) return null;
    const preset = CUP_PRESETS.find((p) => p.id === presetId);
    const minPerTeam = preset?.minPerTeam ?? 1;
    if (team1Count < minPerTeam)
      return t('generate.step1ValidationMin', { team: team1Name, minPerTeam });
    if (team2Count < minPerTeam)
      return t('generate.step1ValidationMin', { team: team2Name, minPerTeam });
    return null;
  })();

  // Validation message for step 3: show why "Neste" is disabled instead of
  // leaving users with a silently-greyed button (#663).
  const step3ValidationMsg: string | null = (() => {
    if (step !== 3) return null;
    const plan = getSessionPlan();
    const total = plan.reduce((sum, s) => sum + s.matchCount, 0);
    if (total === 0) return t('generate.step3ZeroMatchesMsg');
    if (matchCap !== undefined && total > matchCap) return null; // overCap already shown by Banner
    return null;
  })();

  return (
    <div className="space-y-6">
      {errorMsg && (
        <Banner tone="error">{errorMsg}</Banner>
      )}

      <Card>
        <StepIndicator current={step} total={TOTAL_STEPS} t={t} />

        {step === 1 && (
          <Step1Roster
            players={players}
            team1Name={team1Name}
            team2Name={team2Name}
            assignments={assignments}
            onChange={handleAssignmentChange}
            t={t}
          />
        )}
        {step === 2 && (
          <Step2Course
            courses={courses}
            courseId={courseId}
            teeBoxId={teeBoxId}
            onCourseChange={handleCourseChange}
            onTeeChange={setTeeBoxId}
            t={t}
          />
        )}
        {step === 3 && (
          <Step3Setup
            team1Count={team1Count}
            team2Count={team2Count}
            presetId={presetId}
            onPresetChange={setPresetId}
            customSessions={customSessions}
            onCustomSessionsChange={setCustomSessions}
            strategy={strategy}
            onStrategyChange={setStrategy}
            matchCap={matchCap}
            t={t}
          />
        )}
        {step === 4 && (
          <Step4Preview
            matches={matches}
            team1Players={team1Players}
            team2Players={team2Players}
            team1Name={team1Name}
            team2Name={team2Name}
            onRegenerate={runGenerate}
            onMatchChange={handleMatchChange}
            playerById={playerById}
            t={t}
          />
        )}
        {step === 5 && (
          <Step5Confirm
            matches={matches}
            courseId={courseId}
            teeBoxId={teeBoxId}
            courses={courses}
            tournamentId={tournamentId}
            onError={setErrorMsg}
            t={t}
          />
        )}

        {/* Navigation */}
        {step < 5 && (
          <div className="mt-6 space-y-3">
            {step1ValidationMsg && (
              <p className="text-xs text-warning text-center">{step1ValidationMsg}</p>
            )}
            {step3ValidationMsg && (
              <p className="text-xs text-warning text-center">{step3ValidationMsg}</p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={handleBack}
                disabled={step === 1}
              >
                {t('generate.prevButton')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleNext}
                disabled={!canAdvance()}
              >
                {t('generate.nextButton')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
