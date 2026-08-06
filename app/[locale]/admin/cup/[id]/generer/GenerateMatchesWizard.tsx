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
  generateSplitDayPlan,
  type PlannedMatch,
  type PlannedBundleMatch,
  type CupBundleFormat,
  type CupPlayer,
  type PairingStrategy,
} from '@/lib/cup/cupPairing';
import {
  groupBundleMatchesByFlight,
  swapFlightSinglesPairing,
  splitDayFlightCount,
  splitDayTotalMatches,
} from '@/lib/cup/splitDayLineup';
import { createCupMatchesFromPlan, type CupBatchMatch } from './actions';
import {
  MAX_PERSONAL_CUP_MATCHES,
  MAX_PERSONAL_CUP_PLAYERS,
} from '@/lib/cup/limits';
// #1441 (F3c): regnehjelp for greensomens manuelle lag-slag (D10) — samme
// rating-oppslag + CH-formel som resten av appen bruker, ikke en ny formel.
// Ren lesing (ingen skriving) fra to lib/games/-filer utenfor F3c sitt
// skrive-forbud (lib/games/** er off-limits å ENDRE, ikke å importere fra).
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { teeGenderOf } from '@/lib/games/teeGender';
import { calculateCourseHandicap } from '@/lib/scoring/courseHandicap';
import type { WizardPlayer, WizardCourse, WizardTeeBox } from './GenerateMatches';

// #1441 (F3c): matchen wizarden holder i steg 4 er enten en av de tre eldre
// presetenes `PlannedMatch` eller splittet-cup-dagens `PlannedBundleMatch` —
// aldri en blanding innen samme genererte plan (styrt av `presetId`).
// `teamStrokesOverride` (D10) lever IKKE på denne typen — se
// `teamStrokesInputs`-state i hovedkomponenten for hvorfor.
type WizardMatch = PlannedMatch | PlannedBundleMatch;

/** Bygger `TeeBoxRatings` (lib/games/teeRating) fra en `WizardTeeBox` — feltene
 * er valgfrie på wizard-typen (kun splittet-cup-dagen bryr seg), men
 * `getRatingForGender` vil ha dem som `number | null` (ikke `undefined`). */
function teeRatingsFrom(tee: WizardTeeBox): TeeBoxRatings {
  return {
    slope_mens: tee.slope_mens ?? null,
    course_rating_mens: tee.course_rating_mens ?? null,
    par_total_mens: tee.par_total_mens ?? null,
    slope_ladies: tee.slope_ladies ?? null,
    course_rating_ladies: tee.course_rating_ladies ?? null,
    par_total_ladies: tee.par_total_ladies ?? null,
    slope_juniors: tee.slope_juniors ?? null,
    course_rating_juniors: tee.course_rating_juniors ?? null,
    par_total_juniors: tee.par_total_juniors ?? null,
  };
}

/**
 * Spillehandicap-regnehjelp for greensomens manuelle lag-slag (#1441, D10):
 * arrangørens egen formel (40 % av høyeste spillers spillehandicap) trenger
 * hver spillers FULLE spillehandicap på valgt tee som utgangspunkt — ikke en
 * allowance-redusert versjon (allowance-feltet er irrelevant når
 * team_strokes_override erstatter formelen helt). Returnerer `null` når
 * valgt tee mangler ratingsett for spillerens kjønn — kalleren faller da
 * tilbake til å vise rå HCP-indeks i stedet.
 */
function computeSpillehandicap(player: WizardPlayer, tee: WizardTeeBox | undefined): number | null {
  if (!tee) return null;
  const gender = teeGenderOf(player.gender ?? null);
  const rating = getRatingForGender(teeRatingsFrom(tee), gender);
  if (!rating) return null;
  return calculateCourseHandicap({
    hcpIndex: player.hcpIndex,
    slope: rating.slope,
    courseRating: rating.courseRating,
    par: rating.par,
  });
}

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

type Step = 1 | 2 | 3 | 4;

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
    <div data-testid="cup-wizard-step1">
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
                      data-testid={`cup-wizard-assign-${p.id}-${opt}`}
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
    <div className="space-y-5" data-testid="cup-wizard-step2">
      <div>
        <SectionHeading>{t('generate.step2BaneHeading')}</SectionHeading>
        <label htmlFor="generer-course" className="block text-sm font-medium text-text mb-1.5">
          {t('generate.step2CourseLabel')}
        </label>
        <select
          id="generer-course"
          data-testid="cup-wizard-course"
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
            data-testid="cup-wizard-tee"
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
  bestBallAllowancePct,
  onBestBallAllowancePctChange,
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
  // #1441 (D4/D11): kun brukt av «Splittet cup-dag»-presetet — cup-dag-bredt,
  // ikke per match, derfor state på wizard-nivå og bare rendret her.
  bestBallAllowancePct: number;
  onBestBallAllowancePctChange: (pct: number) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const teamSize = Math.min(team1Count, team2Count);
  const isSplitDay = presetId === 'splittet-cup-dag';

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

  // #1441 (D4): splittet-cup-dag genereres IKKE via buildSessions/
  // generateCupPlan (se cupTemplates.ts sin docstring på presetet) — dens
  // `sessions`-felt er ren dokumentasjon, ikke mat for `buildSessions`.
  const currentSessions = isSplitDay ? [] : getSessionsForId(presetId);
  const plan = buildSessions(currentSessions, teamSize);
  const splitDayFlights = splitDayFlightCount(team1Count, team2Count);
  const splitDayTotal = splitDayTotalMatches(team1Count, team2Count);
  const totalMatches = isSplitDay
    ? splitDayTotal
    : plan.reduce((sum, s) => sum + s.matchCount, 0);
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
    <div className="space-y-6" data-testid="cup-wizard-step3">
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
                data-testid={`cup-wizard-preset-${preset.id}`}
                checked={presetId === preset.id}
                onChange={() => onPresetChange(preset.id)}
                className="mt-0.5 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-sm font-semibold text-text">
                  {t(
                    `presets.${preset.id as 'klassisk' | 'fourball-singler' | 'singler' | 'splittet-cup-dag'}.name`,
                  )}
                </p>
                <p className="font-sans text-xs text-muted mt-0.5">
                  {t(
                    `presets.${preset.id as 'klassisk' | 'fourball-singler' | 'singler' | 'splittet-cup-dag'}.description`,
                  )}
                </p>
                {presetId === preset.id && preset.id !== 'splittet-cup-dag' && plan.length > 0 && (
                  <p className="font-sans text-xs text-primary mt-1.5">
                    {plan.map((s) => `${s.matchCount} ${FORMAT_LABELS[s.format]}`).join(' · ')}
                    {' '}= {totalMatches} {t('generate.matchesLabel').toLowerCase()}
                  </p>
                )}
                {presetId === preset.id && preset.id === 'splittet-cup-dag' && splitDayFlights > 0 && (
                  <p className="font-sans text-xs text-primary mt-1.5">
                    {t('generate.splitDayPlanSummary', {
                      flights: splitDayFlights,
                      total: splitDayTotal,
                    })}
                  </p>
                )}
              </div>
            </label>
          ))}

          {/* Splittet cup-dag: «Handicap best ball (%)»-feltet ligger UTENFOR
              preset-<label>-en over — nøstet inni ville fått testing-library
              (og skjermlesere) til å knytte HELE label-teksten til radio-
              inputen, siden alt inni et <label> teller som dets tilknyttede
              tekst uansett hvor dypt nøstet et eget skjema-felt er. */}
          {presetId === 'splittet-cup-dag' && (
            <div
              className="rounded-xl border border-border bg-surface p-4"
              data-testid="cup-wizard-splitday-setup"
            >
              <label
                htmlFor="generer-best-ball-allowance"
                className="block text-xs font-medium text-text mb-1.5"
              >
                {t('generate.bestBallAllowanceLabel')}
              </label>
              <input
                id="generer-best-ball-allowance"
                type="number"
                min={0}
                max={100}
                value={bestBallAllowancePct}
                onChange={(e) => onBestBallAllowancePctChange(Number(e.target.value))}
                className="w-24 rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <p className="font-sans text-xs text-muted mt-1">
                {t('generate.bestBallAllowanceHint')}
              </p>
            </div>
          )}

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
              data-testid="cup-wizard-preset-tilpasset"
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
                data-testid={`cup-wizard-strategy-${val}`}
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
  t,
}: {
  matches: PlannedMatch[];
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  onRegenerate: () => void;
  onMatchChange: (matchId: string, side: 'side1' | 'side2', idx: number, userId: string) => void;
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
    <div data-testid="cup-wizard-step4">
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

// ─── Step 4: Confirm (recap + generate) ───────────────────────────────────────
//
// #1142: dette var et eget steg 5. Det hadde ingen input — bare bane·tee-recap
// og generer-knappen — så det bor nå nederst på steg 4, under den redigerbare
// oppstillingen.

function Step4Confirm({
  matches,
  courseId,
  teeBoxId,
  courses,
  tournamentId,
  bestBallAllowancePct,
  onError,
  t,
}: {
  matches: CupBatchMatch[];
  courseId: string;
  teeBoxId: string;
  courses: WizardCourse[];
  tournamentId: string;
  // #1441 (D4/D11): kun sendt for splittet-cup-dag — actions.ts defaulter
  // fraværet til cupens fourball-allowance (bestBall-gjenbruket, se
  // cupMatchModeConfig sin JSDoc i ./actions.ts).
  bestBallAllowancePct?: number;
  onError: (msg: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const [isPending, startTransition] = useTransition();
  const course = courses.find((c) => c.id === courseId);
  const tee = course?.teeBoxes.find((tb) => tb.id === teeBoxId);

  const FORMAT_LABELS: Record<CupBundleFormat, string> = {
    foursomes_matchplay: t('generate.formatFoursomes'),
    fourball_matchplay: t('generate.formatFourball'),
    singles_matchplay: t('generate.formatSingles'),
    greensome_matchplay: t('generate.formatGreensome'),
    chapman_matchplay: t('generate.formatChapman'),
    gruesome_matchplay: t('generate.formatGruesome'),
    best_ball: t('generate.formatBestBall'),
  };

  function handleConfirm() {
    startTransition(async () => {
      const result = await createCupMatchesFromPlan({
        tournamentId,
        courseId,
        teeBoxId,
        matches,
        bestBallAllowancePct,
      });
      if (result?.error) {
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
  const byFormat = new Map<CupBundleFormat, number>();
  for (const m of matches) {
    byFormat.set(m.format, (byFormat.get(m.format) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>{t('generate.step4RecapHeading')}</SectionHeading>
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
        data-testid="cup-wizard-generate"
        onClick={handleConfirm}
        pending={isPending}
        pendingLabel={t('generate.confirmPending')}
      >
        {t('generate.confirmButton', { count: matches.length })}
      </Button>
    </div>
  );
}

// ─── Step 4 (bundle): splittet-cup-dag lineup-editor ──────────────────────────
//
// #1441 (F3c): egen preview-komponent for splittet-cup-dag-bunten i stedet
// for å utvide `Step4Preview` — bunten har en fundamentalt annen redigerings-
// modell (flight-grupperte kort, singles-bytte begrenset til flightens egne
// fire spillere, greensomens manuelle lag-slag) enn den frie per-slot-
// dropdownen `Step4Preview` tilbyr på tvers av HELE laget. Gjenbruker
// `groupBundleMatchesByFlight`/`swapFlightSinglesPairing` (lib/cup/
// splitDayLineup.ts) for gruppering/bytte — «extend, don't rebuild» gjelder
// disse rene hjelperne, ikke UI-komponenten selv (som IKKE fantes før F3c).

function playerLookup(team1Players: WizardPlayer[], team2Players: WizardPlayer[]) {
  const byId = new Map<string, WizardPlayer>();
  for (const p of [...team1Players, ...team2Players]) byId.set(p.id, p);
  return (userId: string) => byId.get(userId);
}

/** Regnehjelp-tekst for én spiller: spillehandicap når valgt tee har
 * ratingsett for spillerens kjønn, ellers rå HCP-indeks (#1441, D10). */
function regnehjelpText(
  player: WizardPlayer,
  tee: WizardTeeBox | undefined,
  t: ReturnType<typeof useTranslations<'cup'>>,
): string {
  const sh = computeSpillehandicap(player, tee);
  return sh !== null
    ? t('generate.spillehandicapShort', { n: sh })
    : t('generate.hcpIndexShort', { n: player.hcpIndex.toFixed(1) });
}

function GreensomeCard({
  match,
  team1Name,
  team2Name,
  players,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
  t,
}: {
  match: PlannedBundleMatch;
  team1Name: string;
  team2Name: string;
  players: (userId: string) => WizardPlayer | undefined;
  selectedTee: WizardTeeBox | undefined;
  teamStrokesInputs: Record<string, { team1: string; team2: string }>;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const raw = teamStrokesInputs[match.id] ?? { team1: '', team2: '' };
  const side1Players = match.side1.map(players).filter((p): p is WizardPlayer => Boolean(p));
  const side2Players = match.side2.map(players).filter((p): p is WizardPlayer => Boolean(p));

  return (
    <Card className="!p-4">
      <p className="font-sans text-xs font-semibold text-muted mb-1">
        {t('generate.formatGreensome')} · {t('generate.segmentFront9')}
      </p>
      <p className="font-serif text-sm text-text mb-3">
        {side1Players.map((p) => p.displayName).join(' / ')}{' '}
        <span className="text-muted">{t('generate.mot')}</span>{' '}
        {side2Players.map((p) => p.displayName).join(' / ')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`strokes-${match.id}-team1`}
            className="block text-xs font-medium text-text mb-1"
          >
            {t('generate.teamStrokesLabel', { team: team1Name })}
          </label>
          <input
            id={`strokes-${match.id}-team1`}
            type="number"
            min={0}
            value={raw.team1}
            onChange={(e) => onTeamStrokesChange(match.id, 'team1', e.target.value)}
            className="w-full rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-[11px] text-muted mt-1 tabular-nums">
            {side1Players.map((p) => `${p.displayName}: ${regnehjelpText(p, selectedTee, t)}`).join(' · ')}
          </p>
        </div>
        <div>
          <label
            htmlFor={`strokes-${match.id}-team2`}
            className="block text-xs font-medium text-text mb-1"
          >
            {t('generate.teamStrokesLabel', { team: team2Name })}
          </label>
          <input
            id={`strokes-${match.id}-team2`}
            type="number"
            min={0}
            value={raw.team2}
            onChange={(e) => onTeamStrokesChange(match.id, 'team2', e.target.value)}
            className="w-full rounded-lg border border-border px-2.5 py-2 bg-surface text-text text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-[11px] text-muted mt-1 tabular-nums">
            {side2Players.map((p) => `${p.displayName}: ${regnehjelpText(p, selectedTee, t)}`).join(' · ')}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Step4BundlePreview({
  matches,
  team1Players,
  team2Players,
  team1Name,
  team2Name,
  selectedTee,
  teamStrokesInputs,
  onTeamStrokesChange,
  onSwapSingles,
  onRegenerate,
  t,
}: {
  matches: PlannedBundleMatch[];
  team1Players: WizardPlayer[];
  team2Players: WizardPlayer[];
  team1Name: string;
  team2Name: string;
  selectedTee: WizardTeeBox | undefined;
  teamStrokesInputs: Record<string, { team1: string; team2: string }>;
  onTeamStrokesChange: (matchId: string, side: 'team1' | 'team2', value: string) => void;
  onSwapSingles: (flightIndex: number) => void;
  onRegenerate: () => void;
  t: ReturnType<typeof useTranslations<'cup'>>;
}) {
  const players = playerLookup(team1Players, team2Players);
  const flights = groupBundleMatchesByFlight(matches);

  return (
    <div data-testid="cup-wizard-step4-bundle">
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
        {flights.map((flight) => {
          const [singles1, singles2] = flight.singles;
          const singles1Player1 = players(singles1.side1[0]);
          const singles1Player2 = players(singles1.side2[0]);
          const singles2Player1 = players(singles2.side1[0]);
          const singles2Player2 = players(singles2.side2[0]);
          const bestBallSide1 = flight.bestBall.side1.map(players).filter((p): p is WizardPlayer => Boolean(p));
          const bestBallSide2 = flight.bestBall.side2.map(players).filter((p): p is WizardPlayer => Boolean(p));

          return (
            <div key={flight.flightIndex}>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
                {t('generate.flightHeading', { n: flight.flightIndex })}
              </p>
              <div className="space-y-3">
                <GreensomeCard
                  match={flight.greensome}
                  team1Name={team1Name}
                  team2Name={team2Name}
                  players={players}
                  selectedTee={selectedTee}
                  teamStrokesInputs={teamStrokesInputs}
                  onTeamStrokesChange={onTeamStrokesChange}
                  t={t}
                />

                <Card className="!p-4">
                  <p className="font-sans text-xs font-semibold text-muted mb-1">
                    {t('generate.formatBestBall')} · {t('generate.segmentBack9')}
                  </p>
                  <p className="font-serif text-sm text-text">
                    {bestBallSide1.map((p) => p.displayName).join(' / ')}{' '}
                    <span className="text-muted">{t('generate.mot')}</span>{' '}
                    {bestBallSide2.map((p) => p.displayName).join(' / ')}
                  </p>
                </Card>

                <Card className="!p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-sans text-xs font-semibold text-muted">
                      {t('generate.formatSingles')} · {t('generate.segmentBack9')}
                    </p>
                    <button
                      type="button"
                      data-testid={`cup-wizard-swap-singles-${flight.flightIndex}`}
                      onClick={() => onSwapSingles(flight.flightIndex)}
                      className="font-sans text-xs text-primary underline-offset-2 hover:underline min-h-[36px] px-1"
                    >
                      {t('generate.swapSinglesButton')}
                    </button>
                  </div>
                  <p className="font-serif text-sm text-text">
                    {singles1Player1?.displayName ?? '—'}{' '}
                    <span className="text-muted">{t('generate.mot')}</span>{' '}
                    {singles1Player2?.displayName ?? '—'}
                  </p>
                  <p className="font-serif text-sm text-text mt-1">
                    {singles2Player1?.displayName ?? '—'}{' '}
                    <span className="text-muted">{t('generate.mot')}</span>{' '}
                    {singles2Player2?.displayName ?? '—'}
                  </p>
                  <p className="text-[11px] text-muted mt-2">
                    {t('generate.singlesReadsFromBestBall')}
                  </p>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
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
  const TOTAL_STEPS = 4;

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
  // #1441 (D4/D11): cup-dag-bred handicap-andel for best-ball-hosten. Kun
  // relevant/synlig for splittet-cup-dag-presetet (Step3Setup gater visning).
  const [bestBallAllowancePct, setBestBallAllowancePct] = useState(85);

  // Step 4: generated matches
  const [matches, setMatches] = useState<WizardMatch[]>([]);
  // #1441 (D10): greensomens manuelle lag-slag holdes som RÅ tekst-input per
  // match-id, adskilt fra `matches` — inputfeltene tillater at organisatoren
  // fyller ut ett felt om gangen uten at en halvferdig verdi (kun team1 satt)
  // noensinne havner i `CupBatchMatch`-formen actions.ts forventer («begge
  // felt satt eller ingen», jf. `createCupMatchesFromPlan`s egen validering).
  // Slås sammen til `teamStrokesOverride` først ved innsending
  // (`buildSubmissionMatches`).
  const [teamStrokesInputs, setTeamStrokesInputs] = useState<
    Record<string, { team1: string; team2: string }>
  >({});

  // Feil fra createCupMatchesFromPlan (steg 4)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSplitDay = presetId === 'splittet-cup-dag';

  // Derived
  const team1Players = players.filter((p) => assignments[p.id] === 'team1');
  const team2Players = players.filter((p) => assignments[p.id] === 'team2');
  const team1Count = team1Players.length;
  const team2Count = team2Players.length;
  const selectedCourse = courses.find((c) => c.id === courseId);
  const selectedTee = selectedCourse?.teeBoxes.find((tb) => tb.id === teeBoxId);

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
    // Regenerering nullstiller manuelt tastede lag-slag — de var tastet mot
    // FORRIGE spiller-oppstilling, som ikke lenger stemmer etter regenerering.
    setTeamStrokesInputs({});
    if (isSplitDay) {
      setMatches(generateSplitDayPlan({ team1: cupTeam1, team2: cupTeam2, strategy }));
      return;
    }
    setMatches(
      generateCupPlan({
        team1: cupTeam1,
        team2: cupTeam2,
        sessions: getSessionPlan(),
        strategy,
      }),
    );
  }

  /**
   * Bygger den faktiske innsendings-payload-en (#1441, D10): matchene fra
   * `matches` (rene struktur — side1/side2/segment/sourceId) pluss
   * `teamStrokesOverride` slått sammen inn på greensome-matchene FRA
   * `teamStrokesInputs`, kun når BEGGE felt er gyldige ikke-negative heltall
   * (speiler `createCupMatchesFromPlan`s egen «begge eller ingen»-validering
   * — en ufullstendig rad sendes uten override, ikke med en halv én).
   */
  function buildSubmissionMatches(): CupBatchMatch[] {
    if (!isSplitDay) return matches as CupBatchMatch[];
    return (matches as PlannedBundleMatch[]).map((m) => {
      if (m.format !== 'greensome_matchplay') return m;
      const raw = teamStrokesInputs[m.id];
      if (!raw) return m;
      const n1 = Number(raw.team1);
      const n2 = Number(raw.team2);
      if (
        raw.team1.trim() === '' ||
        raw.team2.trim() === '' ||
        !Number.isInteger(n1) ||
        !Number.isInteger(n2) ||
        n1 < 0 ||
        n2 < 0
      ) {
        return m;
      }
      return { ...m, teamStrokesOverride: { team1: n1, team2: n2 } };
    });
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
      if (isSplitDay) {
        const total = splitDayTotalMatches(team1Count, team2Count);
        if (total === 0) return false;
        if (matchCap !== undefined && total > matchCap) return false;
        return true;
      }
      const plan = getSessionPlan();
      if (plan.length === 0 || !plan.some((s) => s.matchCount > 0)) return false;
      // #526: blokker «Neste» når personlig-cup-taket er overskredet.
      if (matchCap !== undefined) {
        const total = plan.reduce((sum, s) => sum + s.matchCount, 0);
        if (total > matchCap) return false;
      }
      return true;
    }
    // Steg 4 er terminalt (ingen «Neste»), så det trenger ingen gate her.
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

  // #1441 (D4): bytter singles-paringen innad i én flight (rank1-vs-rank2 i
  // stedet for rank1-vs-rank1) — se swapFlightSinglesPairing sin docstring
  // for hvorfor det er et fast bytte og ikke en fri spiller-velger.
  function handleSwapSingles(flightIndex: number) {
    setMatches((prev) => swapFlightSinglesPairing(prev as PlannedBundleMatch[], flightIndex));
  }

  function handleTeamStrokesChange(matchId: string, side: 'team1' | 'team2', value: string) {
    setTeamStrokesInputs((prev) => ({
      ...prev,
      [matchId]: { team1: prev[matchId]?.team1 ?? '', team2: prev[matchId]?.team2 ?? '', [side]: value },
    }));
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
    const total = isSplitDay
      ? splitDayTotalMatches(team1Count, team2Count)
      : getSessionPlan().reduce((sum, s) => sum + s.matchCount, 0);
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
            bestBallAllowancePct={bestBallAllowancePct}
            onBestBallAllowancePctChange={setBestBallAllowancePct}
            t={t}
          />
        )}
        {step === 4 && (
          <div className="space-y-6">
            {isSplitDay ? (
              <Step4BundlePreview
                matches={matches as PlannedBundleMatch[]}
                team1Players={team1Players}
                team2Players={team2Players}
                team1Name={team1Name}
                team2Name={team2Name}
                selectedTee={selectedTee}
                teamStrokesInputs={teamStrokesInputs}
                onTeamStrokesChange={handleTeamStrokesChange}
                onSwapSingles={handleSwapSingles}
                onRegenerate={runGenerate}
                t={t}
              />
            ) : (
              <Step4Preview
                matches={matches as PlannedMatch[]}
                team1Players={team1Players}
                team2Players={team2Players}
                team1Name={team1Name}
                team2Name={team2Name}
                onRegenerate={runGenerate}
                onMatchChange={handleMatchChange}
                t={t}
              />
            )}
            <Step4Confirm
              matches={buildSubmissionMatches()}
              courseId={courseId}
              teeBoxId={teeBoxId}
              courses={courses}
              tournamentId={tournamentId}
              bestBallAllowancePct={isSplitDay ? bestBallAllowancePct : undefined}
              t={t}
              onError={setErrorMsg}
            />
          </div>
        )}

        {/* Navigation. Steg 4 er terminalt — generer-knappen i Step4Confirm er
            primær-handlingen der, så bare «Tilbake» blir med videre. */}
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
              data-testid="cup-wizard-prev"
              onClick={handleBack}
              disabled={step === 1}
            >
              {t('generate.prevButton')}
            </Button>
            {step < 4 && (
              <Button
                type="button"
                className="flex-1"
                data-testid="cup-wizard-next"
                onClick={handleNext}
                disabled={!canAdvance()}
              >
                {t('generate.nextButton')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
